import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  encodeQrFragment,
  generateSessionId,
  serializePairingPayload,
  splitPayloadIntoQrFragments,
  type PairingPayload,
} from "@securetransfer/protocol";
import { exportPublicKeyRaw, generateEphemeralKeyPair, randomSessionSalt, toBase64Url } from "@securetransfer/crypto";

/**
 * Regression guard: a fragment size that's cheap to *generate* can still be unreliable to
 * *scan* if the rendered QR ends up too dense (too many modules) for a phone camera to
 * resolve, especially screen-to-screen. This was the root cause of a real "QR scan isn't
 * working" report — DEFAULT_MAX_FRAGMENT_BYTES was 700, producing version-23 (109x109
 * module) codes. Keep every fragment well under a version that stays reliably scannable.
 */
const MAX_RELIABLE_QR_VERSION = 15; // version 15 = 77x77 modules, a widely-cited comfortable ceiling for camera scanning

describe("QR fragment scannability", () => {
  it("keeps each fragment's rendered QR at a reliably scannable version for a realistic pairing payload", async () => {
    const keyPair = await generateEphemeralKeyPair();
    const now = Date.now();
    const payload: PairingPayload = {
      v: 1,
      sessionId: generateSessionId(),
      senderDeviceId: "AABBCCDDEEFF0011",
      senderLabel: "Studio Machine",
      publicKey: toBase64Url(await exportPublicKeyRaw(keyPair.publicKey)),
      ivSalt: toBase64Url(randomSessionSalt()),
      transfer: { label: "Project_Assets Design Files Bundle", totalSize: 3_670_016_000, fileCount: 148 },
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    };

    const bytes = serializePairingPayload(payload);
    const fragments = await splitPayloadIntoQrFragments(bytes, payload.sessionId);

    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      const text = encodeQrFragment(fragment);
      const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
      expect(qr.version).toBeLessThanOrEqual(MAX_RELIABLE_QR_VERSION);
    }
  });
});
