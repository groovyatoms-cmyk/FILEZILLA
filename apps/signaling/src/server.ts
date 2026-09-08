import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { isClientToServerMessage, type ServerToClientMessage } from "@securetransfer/protocol";
import { SESSION_TTL_MS } from "@securetransfer/shared";
import { SessionStore } from "./session-store.js";
import { TokenBucketRateLimiter } from "./rate-limiter.js";
import { logEvent } from "./logger.js";

const PORT = Number(process.env["PORT"] ?? 8787);
const MAX_TTL_MS = Number(process.env["SIGNALING_MAX_TTL_MS"] ?? SESSION_TTL_MS);
const SWEEP_INTERVAL_MS = 30_000;

const store = new SessionStore();
// 5 session creations per minute per IP; 30 signaling messages per 10s per connection.
const createLimiter = new TokenBucketRateLimiter(5, 5 / 60_000);
const messageLimiter = new TokenBucketRateLimiter(30, 30 / 10_000);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const httpServer = createServer((req, res) => {
  void handleHttp(req, res);
});

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && parts.length === 0) {
    sendJson(res, 200, { service: "securetransfer-signaling", activeSessions: store.activeSessionCount });
    return;
  }

  if (req.method === "POST" && parts.length === 1 && parts[0] === "session") {
    const ip = clientIp(req);
    if (!createLimiter.allow(ip)) {
      sendJson(res, 429, { error: "rate_limited" });
      return;
    }
    let body: { sessionId?: unknown; ttlMs?: unknown };
    try {
      body = JSON.parse(await readBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    if (typeof body.sessionId !== "string" || body.sessionId.length < 8) {
      sendJson(res, 400, { error: "invalid_session_id" });
      return;
    }
    const ttlMs = typeof body.ttlMs === "number" ? Math.min(body.ttlMs, MAX_TTL_MS) : MAX_TTL_MS;
    const connectionId = `http:${randomUUID()}`;
    const result = store.create(body.sessionId, connectionId, ttlMs);
    if (result === "already-exists") {
      sendJson(res, 409, { error: "session_exists" });
      return;
    }
    logEvent("session-created-http", { sessionId: body.sessionId });
    sendJson(res, 201, { sessionId: result.sessionId, expiresAt: result.expiresAt });
    return;
  }

  if (req.method === "GET" && parts.length === 2 && parts[0] === "session" && parts[1] === "status") {
    sendJson(res, 400, { error: "missing_session_id" });
    return;
  }

  if (req.method === "GET" && parts.length === 2 && parts[0] === "session") {
    const record = store.get(parts[1]!);
    if (!record) {
      sendJson(res, 404, { error: "session_not_found" });
      return;
    }
    sendJson(res, 200, {
      sessionId: record.sessionId,
      participantCount: record.participants.size,
      expiresAt: record.expiresAt,
    });
    return;
  }

  if (req.method === "DELETE" && parts.length === 2 && parts[0] === "session") {
    const sessionId = parts[1]!;
    const record = store.get(sessionId);
    if (!record) {
      sendJson(res, 404, { error: "session_not_found" });
      return;
    }
    for (const connectionId of Array.from(record.participants.keys())) {
      notify(connectionId, { type: "session-expired" });
      store.leave(sessionId, connectionId);
    }
    logEvent("session-revoked-http", { sessionId });
    sendJson(res, 204, null);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

const wss = new WebSocketServer({ server: httpServer });
const sockets = new Map<string, WebSocket>();

function notify(connectionId: string, message: ServerToClientMessage): void {
  const socket = sockets.get(connectionId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

wss.on("connection", (socket, req) => {
  const connectionId = randomUUID();
  sockets.set(connectionId, socket);
  const ip = clientIp(req);
  logEvent("connection-open", { connectionId });

  socket.on("message", (raw) => {
    if (!messageLimiter.allow(connectionId)) {
      notify(connectionId, { type: "rate-limited", retryAfterMs: 10_000 });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      notify(connectionId, { type: "error", code: "invalid_json", message: "Message was not valid JSON." });
      return;
    }
    if (!isClientToServerMessage(parsed)) {
      notify(connectionId, { type: "error", code: "invalid_message", message: "Unrecognized message shape." });
      return;
    }

    switch (parsed.type) {
      case "create-session": {
        if (!createLimiter.allow(ip)) {
          notify(connectionId, { type: "rate-limited", retryAfterMs: 60_000 });
          return;
        }
        const ttlMs = Math.min(parsed.ttlMs, MAX_TTL_MS);
        const result = store.create(parsed.sessionId, connectionId, ttlMs);
        if (result === "already-exists") {
          notify(connectionId, { type: "error", code: "session_exists", message: "Session id already in use." });
          return;
        }
        logEvent("session-created-ws", { sessionId: parsed.sessionId });
        notify(connectionId, { type: "session-created", sessionId: result.sessionId, expiresAt: result.expiresAt });
        return;
      }
      case "join-session": {
        const result = store.join(parsed.sessionId, connectionId);
        if (result === "session-not-found") {
          notify(connectionId, { type: "session-not-found" });
          return;
        }
        if (result === "session-expired") {
          notify(connectionId, { type: "session-expired" });
          return;
        }
        if (result === "session-full") {
          notify(connectionId, { type: "session-full" });
          return;
        }
        logEvent("session-joined", { sessionId: parsed.sessionId });
        for (const peerId of store.peersOf(parsed.sessionId, connectionId)) {
          notify(peerId, { type: "peer-joined" });
        }
        notify(connectionId, { type: "peer-joined" });
        return;
      }
      case "signal": {
        const peers = store.peersOf(parsed.sessionId, connectionId);
        for (const peerId of peers) {
          notify(peerId, { type: "signal", signal: parsed.signal });
        }
        return;
      }
      case "leave-session": {
        store.leave(parsed.sessionId, connectionId);
        for (const peerId of store.peersOf(parsed.sessionId, connectionId)) {
          notify(peerId, { type: "peer-left" });
        }
        logEvent("session-left", { sessionId: parsed.sessionId });
        return;
      }
    }
  });

  socket.on("close", () => {
    sockets.delete(connectionId);
    const affectedSessions = store.leaveAll(connectionId);
    for (const sessionId of affectedSessions) {
      for (const peerId of store.peersOf(sessionId, connectionId)) {
        notify(peerId, { type: "peer-left" });
      }
    }
    logEvent("connection-close", { connectionId });
  });
});

setInterval(() => {
  const expired = store.sweepExpired();
  for (const { sessionId, connectionIds } of expired) {
    for (const connectionId of connectionIds) {
      notify(connectionId, { type: "session-expired" });
    }
    logEvent("session-expired-sweep", { sessionId });
  }
  createLimiter.sweep(10 * 60_000);
  messageLimiter.sweep(10 * 60_000);
}, SWEEP_INTERVAL_MS);

httpServer.listen(PORT, () => {
  logEvent("server-listening", { port: PORT });
});
