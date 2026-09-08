import { PROTOCOL_VERSION } from "@securetransfer/shared";

/**
 * Messages exchanged with the signaling server. The signaling server only ever sees
 * these shapes: it relays WebRTC session descriptions and ICE candidates, and manages
 * session lifecycle (create/join/expire/full). It never sees a pairing payload, an
 * encryption key, file contents, or file names. See SECURITY.md for the full data
 * exposure statement.
 */

export interface RtcSignalPayload {
  kind: "offer" | "answer" | "ice-candidate";
  data: unknown;
}

export type ClientToServerMessage =
  | { type: "create-session"; v: typeof PROTOCOL_VERSION; sessionId: string; ttlMs: number }
  | { type: "join-session"; v: typeof PROTOCOL_VERSION; sessionId: string }
  | { type: "signal"; v: typeof PROTOCOL_VERSION; sessionId: string; signal: RtcSignalPayload }
  | { type: "leave-session"; v: typeof PROTOCOL_VERSION; sessionId: string };

export type ServerToClientMessage =
  | { type: "session-created"; sessionId: string; expiresAt: number }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "signal"; signal: RtcSignalPayload }
  | { type: "session-full" }
  | { type: "session-not-found" }
  | { type: "session-expired" }
  | { type: "rate-limited"; retryAfterMs: number }
  | { type: "error"; code: string; message: string };

export function isClientToServerMessage(raw: unknown): raw is ClientToServerMessage {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (typeof r["type"] !== "string") return false;
  switch (r["type"]) {
    case "create-session":
      return typeof r["sessionId"] === "string" && typeof r["ttlMs"] === "number";
    case "join-session":
    case "leave-session":
      return typeof r["sessionId"] === "string";
    case "signal":
      return typeof r["sessionId"] === "string" && typeof r["signal"] === "object" && r["signal"] !== null;
    default:
      return false;
  }
}
