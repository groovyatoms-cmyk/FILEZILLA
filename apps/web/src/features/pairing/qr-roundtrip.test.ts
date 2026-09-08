import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  QrPartsCollector,
  encodeQrFragment,
  generateSessionId,
  parsePairingPayload,
  serializePairingPayload,
  splitPayloadIntoQrFragments,
  type PairingPayload,
} from "@securetransfer/protocol";
import { exportPublicKeyRaw, generateEphemeralKeyPair, randomSessionSalt, toBase64Url } from "@securetransfer/crypto";

/**
 * Proves the QR fragment size we choose actually survives being scanned, not just that
 * generating/splitting the data succeeds. This is the check that would have caught a real
 * "QR scan isn't working" bug: DEFAULT_MAX_FRAGMENT_BYTES was previously 700, which
 * produces a version-23 (109x109 module) QR. Rendered at QRCodeDisplay's actual on-screen
 * size, that's already too dense to decode via jsQR (the same decoder QRScanner.tsx runs
 * against live camera frames) — confirmed below to fail even with zero simulated camera
 * blur. The current default must keep decoding after a mild blur, standing in for the
 * softness/moire/motion any real camera-scanning-a-screen capture has at least a little of.
 *
 * `rasterizeAtDisplaySize` intentionally mirrors the real constraint: a *fixed* physical
 * render size (matching QRCodeDisplay's canvas), so a larger payload doesn't just get
 * "more pixels" — it gets thinner modules, fractionally sampled the way a real capture at
 * that size would be. `boxBlur` is a stand-in for real-world camera softness.
 */
const DISPLAY_SIZE_PX = 320; // matches QRCodeDisplay's default `size`
const REALISTIC_BLUR_RADIUS = 1;

function rasterizeAtDisplaySize(text: string, targetSize: number): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const moduleCount = qr.modules.size;
  const quietZoneModules = 3; // matches the `margin` option used by QRCodeDisplay
  const totalModules = moduleCount + quietZoneModules * 2;
  const pixelsPerModule = targetSize / totalModules;
  const size = Math.round(targetSize);
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let y = 0; y < size; y++) {
    const moduleRow = Math.floor(y / pixelsPerModule) - quietZoneModules;
    for (let x = 0; x < size; x++) {
      const moduleCol = Math.floor(x / pixelsPerModule) - quietZoneModules;
      if (moduleRow < 0 || moduleRow >= moduleCount || moduleCol < 0 || moduleCol >= moduleCount) continue;
      if (!qr.modules.get(moduleRow, moduleCol)) continue;
      const idx = (y * size + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    }
  }
  return { data, width: size, height: size };
}

function boxBlur(image: { data: Uint8ClampedArray; width: number; height: number }, radius: number) {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sum += data[(ny * width + nx) * 4]!;
          count++;
        }
      }
      const v = sum / count;
      const idx = (y * width + x) * 4;
      out[idx] = out[idx + 1] = out[idx + 2] = v;
      out[idx + 3] = 255;
    }
  }
  return { data: out, width, height };
}

describe("QR encode -> camera-style decode round trip", () => {
  it("jsQR decodes every fragment at display size, even after mild simulated camera blur", async () => {
    const keyPair = await generateEphemeralKeyPair();
    const now = Date.now();
    const payload: PairingPayload = {
      v: 1,
      sessionId: generateSessionId(),
      senderDeviceId: "AABBCCDDEEFF0011",
      senderLabel: "Studio Machine",
      publicKey: toBase64Url(await exportPublicKeyRaw(keyPair.publicKey)),
      ivSalt: toBase64Url(randomSessionSalt()),
      transfer: { label: "Vacation Photos", totalSize: 250_000_000, fileCount: 42 },
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    };
    const bytes = serializePairingPayload(payload);
    const fragments = await splitPayloadIntoQrFragments(bytes, payload.sessionId);
    expect(fragments.length).toBeGreaterThan(0);

    const collector = new QrPartsCollector();
    for (const fragment of fragments) {
      const text = encodeQrFragment(fragment);
      const blurred = boxBlur(rasterizeAtDisplaySize(text, DISPLAY_SIZE_PX), REALISTIC_BLUR_RADIUS);
      const decoded = jsQR(blurred.data, blurred.width, blurred.height, { inversionAttempts: "dontInvert" });
      expect(decoded, `fragment ${fragment.i}/${fragment.n} failed to decode after mild blur — QR is too dense`).not.toBeNull();
      expect(decoded!.data).toBe(text);

      const outcome = await collector.addFragmentText(decoded!.data);
      expect(outcome.status).toBe("accepted");
    }

    expect(collector.isComplete()).toBe(true);
    const reconstructed = await collector.reconstruct();
    expect(parsePairingPayload(reconstructed)).toEqual(payload);
  });

  it("documents the regression: the old 700-byte fragment size fails to decode at display size even with zero blur", () => {
    const oversizedFragmentText = JSON.stringify({
      v: 1,
      sid: "x".repeat(22),
      i: 1,
      n: 1,
      h: "a".repeat(64),
      d: "A".repeat(Math.ceil((700 * 4) / 3)),
      c: "a".repeat(16),
    });
    const image = rasterizeAtDisplaySize(oversizedFragmentText, DISPLAY_SIZE_PX);
    const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
    expect(decoded).toBeNull();
  });
});
