import { describe, expect, it } from "vitest";
import {
  QrPartsCollector,
  generateSessionId,
  parsePairingPayload,
  serializePairingPayload,
  splitPayloadIntoQrFragments,
  type PairingPayload,
} from "@securetransfer/protocol";
import { exportPublicKeyRaw, generateEphemeralKeyPair, randomSessionSalt, toBase64Url } from "@securetransfer/crypto";

/** End-to-end check of the sender-side QR generation -> receiver-side scan/reconstruct path used by Send.tsx and Receive.tsx. */
describe("pairing payload over multipart QR (integration)", () => {
  it("reconstructs a full pairing payload from fragments scanned out of order", async () => {
    const keyPair = await generateEphemeralKeyPair();
    const now = Date.now();
    const payload: PairingPayload = {
      v: 1,
      sessionId: generateSessionId(),
      senderDeviceId: "device-abc",
      senderLabel: "Studio Machine",
      publicKey: toBase64Url(await exportPublicKeyRaw(keyPair.publicKey)),
      ivSalt: toBase64Url(randomSessionSalt()),
      transfer: { label: "Design Assets", totalSize: 3_670_016_000, fileCount: 86 },
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    };

    const bytes = serializePairingPayload(payload);
    const fragments = await splitPayloadIntoQrFragments(bytes, payload.sessionId, 96);
    expect(fragments.length).toBeGreaterThan(1);

    const collector = new QrPartsCollector();
    for (const fragment of [...fragments].sort(() => Math.random() - 0.5)) {
      const outcome = await collector.addFragment(fragment);
      expect(outcome.status).toBe("accepted");
    }

    const reconstructedBytes = await collector.reconstruct();
    const reconstructed = parsePairingPayload(reconstructedBytes);
    expect(reconstructed).toEqual(payload);
  });
});
