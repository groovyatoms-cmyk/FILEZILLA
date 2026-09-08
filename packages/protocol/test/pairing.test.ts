import { describe, expect, it } from "vitest";
import { generateEphemeralKeyPair, exportPublicKeyRaw, randomSessionSalt, toBase64Url } from "@securetransfer/crypto";
import {
  PairingExpiredError,
  PairingValidationError,
  generateSessionId,
  parsePairingPayload,
  serializePairingPayload,
  type PairingPayload,
} from "../src/pairing";

async function buildPayload(overrides: Partial<PairingPayload> = {}): Promise<PairingPayload> {
  const keyPair = await generateEphemeralKeyPair();
  const publicKey = toBase64Url(await exportPublicKeyRaw(keyPair.publicKey));
  const now = Date.now();
  return {
    v: 1,
    sessionId: generateSessionId(),
    senderDeviceId: "device-1",
    senderLabel: "Studio Machine",
    publicKey,
    ivSalt: toBase64Url(randomSessionSalt()),
    transfer: { label: "Design Assets", totalSize: 1024, fileCount: 3 },
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
    ...overrides,
  };
}

describe("pairing payload", () => {
  it("round-trips serialize/parse", async () => {
    const payload = await buildPayload();
    const bytes = serializePairingPayload(payload);
    const parsed = parsePairingPayload(bytes);
    expect(parsed).toEqual(payload);
  });

  it("rejects an expired session", async () => {
    const payload = await buildPayload({ expiresAt: Date.now() - 1000 });
    const bytes = serializePairingPayload(payload);
    expect(() => parsePairingPayload(bytes)).toThrow(PairingExpiredError);
  });

  it("rejects an unsupported protocol version", async () => {
    const payload = await buildPayload();
    const bytes = serializePairingPayload({ ...payload, v: 99 as 1 });
    expect(() => parsePairingPayload(bytes)).toThrow(PairingValidationError);
  });

  it("rejects a malformed public key", async () => {
    const payload = await buildPayload({ publicKey: "not-base64url-!!!" });
    const bytes = serializePairingPayload(payload);
    expect(() => parsePairingPayload(bytes)).toThrow(PairingValidationError);
  });

  it("rejects payloads missing required fields", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1 }));
    expect(() => parsePairingPayload(bytes)).toThrow(PairingValidationError);
  });

  it("rejects non-JSON bytes", () => {
    const bytes = new TextEncoder().encode("not json");
    expect(() => parsePairingPayload(bytes)).toThrow(PairingValidationError);
  });

  it("generates unique session ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});
