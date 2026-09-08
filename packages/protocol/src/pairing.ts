import { PROTOCOL_VERSION, type DeviceId, type SessionId } from "@securetransfer/shared";
import { fromBase64Url, toBase64Url } from "@securetransfer/crypto";

/**
 * The pairing payload is the secret carried by the QR sequence. It is never sent through
 * the signaling server. It carries the sender's ephemeral ECDH public key (see
 * packages/crypto) so both devices can derive a shared secret without any network round trip.
 */
export interface PairingPayload {
  v: typeof PROTOCOL_VERSION;
  sessionId: SessionId;
  senderDeviceId: DeviceId;
  senderLabel: string;
  /** Raw ECDH public key point, base64url-encoded. */
  publicKey: string;
  transfer: {
    label: string;
    totalSize: number;
    fileCount: number;
  };
  createdAt: number;
  expiresAt: number;
}

export class PairingValidationError extends Error {}
export class PairingExpiredError extends PairingValidationError {}

export function generateSessionId(): SessionId {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return toBase64Url(bytes);
}

export function isPairingPayloadExpired(payload: PairingPayload, now = Date.now()): boolean {
  return now >= payload.expiresAt;
}

export function serializePairingPayload(payload: PairingPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function parsePairingPayload(bytes: Uint8Array, now = Date.now()): PairingPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PairingValidationError("Pairing payload is not valid JSON.");
  }
  const payload = validatePairingShape(raw);
  if (isPairingPayloadExpired(payload, now)) {
    throw new PairingExpiredError("Pairing session has expired.");
  }
  return payload;
}

function validatePairingShape(raw: unknown): PairingPayload {
  if (typeof raw !== "object" || raw === null) {
    throw new PairingValidationError("Pairing payload must be an object.");
  }
  const r = raw as Record<string, unknown>;
  if (r["v"] !== PROTOCOL_VERSION) {
    throw new PairingValidationError(`Unsupported protocol version: ${String(r["v"])}`);
  }
  requireString(r, "sessionId");
  requireString(r, "senderDeviceId");
  requireString(r, "senderLabel");
  requireString(r, "publicKey");
  requireNumber(r, "createdAt");
  requireNumber(r, "expiresAt");
  const transfer = r["transfer"];
  if (typeof transfer !== "object" || transfer === null) {
    throw new PairingValidationError("Pairing payload missing transfer metadata.");
  }
  const t = transfer as Record<string, unknown>;
  requireString(t, "label");
  requireNumber(t, "totalSize");
  requireNumber(t, "fileCount");

  try {
    fromBase64Url(r["publicKey"] as string);
  } catch {
    throw new PairingValidationError("Pairing payload has a malformed public key.");
  }

  return raw as PairingPayload;
}

function requireString(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "string" || obj[key] === "") {
    throw new PairingValidationError(`Pairing payload field "${key}" must be a non-empty string.`);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    throw new PairingValidationError(`Pairing payload field "${key}" must be a number.`);
  }
}
