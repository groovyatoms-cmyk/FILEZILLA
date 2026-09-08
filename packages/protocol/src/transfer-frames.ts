/**
 * Framing for messages sent over the encrypted WebRTC DataChannel, once the pairing
 * handshake and key confirmation have completed. JSON control frames are sent as strings;
 * chunk data is sent as binary frames prefixed with a small fixed JSON header line.
 */
import type { FileManifestEntry } from "@securetransfer/shared";

export type ControlFrame =
  | { type: "receiver-hello"; sessionId: string; publicKey: string }
  | { type: "manifest"; transferId: string; label: string; totalSize: number; files: FileManifestEntry[] }
  | { type: "key-confirmation"; sessionId: string; tag: string }
  | { type: "accept-transfer"; transferId: string }
  | { type: "decline-transfer"; transferId: string; reason: string }
  | { type: "resume-request"; transferId: string; fileId: string; fromChunkIndex: number }
  | { type: "chunk-ack"; transferId: string; fileId: string; chunkIndex: number }
  | { type: "file-verified"; transferId: string; fileId: string; sha256: string }
  | { type: "file-verification-failed"; transferId: string; fileId: string; expected: string; actual: string }
  | { type: "transfer-complete"; transferId: string }
  | { type: "transfer-cancelled"; transferId: string; reason: string }
  | { type: "pause"; transferId: string }
  | { type: "resume"; transferId: string };

/** Fixed-shape header that precedes every binary chunk frame (sent as one JSON text frame immediately before the binary frame). */
export interface ChunkHeader {
  type: "chunk";
  transferId: string;
  fileId: string;
  chunkIndex: number;
  /** hex-encoded 12-byte AES-GCM IV used for this chunk */
  iv: string;
  /** hex-encoded per-chunk SHA-256 of the plaintext, checked immediately after decryption */
  plaintextSha256: string;
  byteLength: number;
}

export function isControlFrame(raw: unknown): raw is ControlFrame {
  return typeof raw === "object" && raw !== null && typeof (raw as { type?: unknown }).type === "string";
}
