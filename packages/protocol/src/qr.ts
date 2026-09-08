import { PROTOCOL_VERSION } from "@securetransfer/shared";
import { fromBase64Url, sha256Hex, toBase64Url } from "@securetransfer/crypto";

/**
 * Multipart QR fragment protocol. A pairing payload is usually larger than what a single
 * QR code can hold at a reliably-scannable density, so it is split into fragments that are
 * displayed one at a time (with rotation) and scanned in any order by the receiver.
 *
 * Every fragment independently carries: the protocol version, the session id it belongs to,
 * its position and the total count, a whole-payload hash (so the receiver can tell fragments
 * from a stale/regenerated QR sequence apart), and a per-fragment checksum (so a single
 * misread frame is rejected immediately instead of silently corrupting the reconstruction).
 */
export interface QrFragment {
  v: typeof PROTOCOL_VERSION;
  sid: string;
  i: number;
  n: number;
  /** hex sha256 of the complete reconstructed payload */
  h: string;
  /** base64url-encoded byte slice for this fragment */
  d: string;
  /** first 16 hex chars of sha256 over the raw slice bytes, for cheap per-fragment corruption detection */
  c: string;
}

/**
 * Conservative default: at error-correction level M, 700 bytes/fragment (the original
 * value here) produces a version-23 QR (109x109 modules) — at typical on-screen render
 * sizes that's under 3px per module, which is unreliably dense for a phone camera to
 * scan, especially screen-to-screen (moire, focus hunting, motion blur). 150 bytes keeps
 * fragments at version ~13 (69x69 modules), which stays comfortably scannable while
 * still keeping the total fragment count reasonable for typical pairing payload sizes.
 */
export const DEFAULT_MAX_FRAGMENT_BYTES = 150;

export async function splitPayloadIntoQrFragments(
  payload: Uint8Array,
  sessionId: string,
  maxFragmentBytes = DEFAULT_MAX_FRAGMENT_BYTES,
): Promise<QrFragment[]> {
  if (maxFragmentBytes < 8) throw new Error("maxFragmentBytes too small");
  const wholeHash = await sha256Hex(payload);
  const totalParts = Math.max(1, Math.ceil(payload.length / maxFragmentBytes));
  const fragments: QrFragment[] = [];
  for (let i = 0; i < totalParts; i++) {
    const slice = payload.slice(i * maxFragmentBytes, (i + 1) * maxFragmentBytes);
    const checksum = (await sha256Hex(slice)).slice(0, 16);
    fragments.push({
      v: PROTOCOL_VERSION,
      sid: sessionId,
      i: i + 1,
      n: totalParts,
      h: wholeHash,
      d: toBase64Url(slice),
      c: checksum,
    });
  }
  return fragments;
}

export function encodeQrFragment(fragment: QrFragment): string {
  return JSON.stringify(fragment);
}

export class QrFragmentError extends Error {}

export function decodeQrFragment(text: string): QrFragment {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new QrFragmentError("This QR code does not contain a SecureTransfer pairing fragment.");
  }
  if (typeof raw !== "object" || raw === null) throw new QrFragmentError("Malformed QR fragment.");
  const r = raw as Record<string, unknown>;
  if (r["v"] !== PROTOCOL_VERSION) throw new QrFragmentError("This QR code uses an unsupported protocol version.");
  for (const key of ["sid", "h", "d", "c"]) {
    if (typeof r[key] !== "string" || r[key] === "") throw new QrFragmentError("Malformed QR fragment.");
  }
  for (const key of ["i", "n"]) {
    if (typeof r[key] !== "number" || !Number.isInteger(r[key]) || (r[key] as number) < 1) {
      throw new QrFragmentError("Malformed QR fragment.");
    }
  }
  const fragment = raw as QrFragment;
  if (fragment.i > fragment.n) throw new QrFragmentError("QR fragment index exceeds its declared total.");
  return fragment;
}

export type QrScanOutcome =
  | { status: "accepted"; index: number; total: number }
  | { status: "duplicate"; index: number }
  | { status: "conflicting-total"; expected: number; got: number }
  | { status: "conflicting-session"; expected: string; got: string }
  | { status: "different-generation" }
  | { status: "corrupt-fragment" };

/**
 * Accumulates fragments scanned in arbitrary order (out-of-order and duplicate scans are
 * expected — the receiver just points a camera at whichever QR is currently on screen).
 */
export class QrPartsCollector {
  private sessionId: string | null = null;
  private total: number | null = null;
  private wholeHash: string | null = null;
  private readonly parts = new Map<number, Uint8Array>();

  get receivedIndexes(): number[] {
    return Array.from(this.parts.keys()).sort((a, b) => a - b);
  }

  get totalParts(): number | null {
    return this.total;
  }

  isComplete(): boolean {
    return this.total !== null && this.parts.size === this.total;
  }

  async addFragmentText(text: string): Promise<QrScanOutcome> {
    let fragment: QrFragment;
    try {
      fragment = decodeQrFragment(text);
    } catch {
      return { status: "corrupt-fragment" };
    }
    return this.addFragment(fragment);
  }

  async addFragment(fragment: QrFragment): Promise<QrScanOutcome> {
    if (this.sessionId === null) {
      this.sessionId = fragment.sid;
      this.total = fragment.n;
      this.wholeHash = fragment.h;
    }
    if (fragment.sid !== this.sessionId) {
      return { status: "conflicting-session", expected: this.sessionId, got: fragment.sid };
    }
    if (fragment.h !== this.wholeHash) {
      // Same session id but a different payload hash: sender must have regenerated the QR
      // sequence (e.g. after expiry). Refuse to mix fragments across generations.
      return { status: "different-generation" };
    }
    const expectedTotal = this.total;
    if (expectedTotal === null || fragment.n !== expectedTotal) {
      return { status: "conflicting-total", expected: expectedTotal ?? fragment.n, got: fragment.n };
    }

    let bytes: Uint8Array;
    try {
      bytes = fromBase64Url(fragment.d);
    } catch {
      return { status: "corrupt-fragment" };
    }
    const checksum = (await sha256Hex(bytes)).slice(0, 16);
    if (checksum !== fragment.c) {
      return { status: "corrupt-fragment" };
    }

    if (this.parts.has(fragment.i)) {
      return { status: "duplicate", index: fragment.i };
    }
    this.parts.set(fragment.i, bytes);
    return { status: "accepted", index: fragment.i, total: fragment.n };
  }

  /** Concatenates fragments and verifies the result against the whole-payload hash every fragment carried. */
  async reconstruct(): Promise<Uint8Array> {
    if (!this.isComplete() || this.total === null || this.wholeHash === null) {
      throw new QrFragmentError("Cannot reconstruct: not all fragments have been scanned.");
    }
    let totalLength = 0;
    for (let i = 1; i <= this.total; i++) {
      const part = this.parts.get(i);
      if (!part) throw new QrFragmentError(`Missing fragment ${i}.`);
      totalLength += part.length;
    }
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 1; i <= this.total; i++) {
      const part = this.parts.get(i)!;
      combined.set(part, offset);
      offset += part.length;
    }
    const digest = await sha256Hex(combined);
    if (digest !== this.wholeHash) {
      throw new QrFragmentError("Reconstructed payload failed integrity verification.");
    }
    return combined;
  }

  reset(): void {
    this.sessionId = null;
    this.total = null;
    this.wholeHash = null;
    this.parts.clear();
  }
}
