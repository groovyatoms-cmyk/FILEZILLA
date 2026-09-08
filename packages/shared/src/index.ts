/** Protocol version for pairing payloads and QR fragments. Bump on any breaking wire-format change. */
export const PROTOCOL_VERSION = 1 as const;

/** Default lifetime of a pairing session before it must be recreated. */
export const SESSION_TTL_MS = 10 * 60 * 1000;

/** Chunk size presets offered in Settings, in bytes. */
export const CHUNK_SIZE_PRESETS = [1, 2, 4, 8, 16, 32, 64].map((mb) => mb * 1024 * 1024);

/** Default chunk size: balances per-chunk crypto/framing overhead against memory footprint and resume granularity. */
export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

export type DeviceId = string;
export type SessionId = string;
export type TransferId = string;
export type FileId = string;

export interface DeviceIdentity {
  /** Random, non-PII device identifier generated on first launch. */
  id: DeviceId;
  /** User-editable label; defaults to a generic platform guess, never raw hardware info. */
  label: string;
  createdAt: number;
}

export interface FileManifestEntry {
  fileId: FileId;
  /** Relative path within the selected folder, if any (POSIX-style separators). */
  relativePath: string;
  name: string;
  size: number;
  mimeType: string;
  chunkSize: number;
  chunkCount: number;
  /** Hex-encoded SHA-256 of the complete plaintext file. */
  sha256: string;
}

export interface TransferManifest {
  transferId: TransferId;
  sessionId: SessionId;
  label: string;
  totalSize: number;
  files: FileManifestEntry[];
  createdAt: number;
}

export type TransferDirection = "sent" | "received";

export type TransferStatus =
  | "queued"
  | "preparing"
  | "hashing"
  | "encrypting"
  | "transferring"
  | "paused"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface TransferHistoryEntry {
  transferId: TransferId;
  direction: TransferDirection;
  label: string;
  totalSize: number;
  fileCount: number;
  status: TransferStatus;
  peerLabel: string;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
}

export type ConnectionKind = "direct" | "relay" | "unknown";

export interface ConnectionDiagnostics {
  kind: ConnectionKind;
  rttMs?: number;
  throughputBytesPerSec?: number;
  retries: number;
}

export interface AppSettings {
  autoStartTransfers: boolean;
  askBeforeReceiving: boolean;
  chunkSize: number;
  parallelChunks: number;
  bandwidthLimitBytesPerSec: number | null;
  sessionTtlMs: number;
  autoDeleteExpiredSessions: boolean;
  preferDirectP2P: boolean;
  allowTurnFallback: boolean;
  connectionTimeoutMs: number;
  theme: "light" | "dark" | "system";
  downloadDirectoryLabel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStartTransfers: true,
  askBeforeReceiving: false,
  chunkSize: DEFAULT_CHUNK_SIZE,
  parallelChunks: 4,
  bandwidthLimitBytesPerSec: null,
  sessionTtlMs: SESSION_TTL_MS,
  autoDeleteExpiredSessions: true,
  preferDirectP2P: true,
  allowTurnFallback: true,
  connectionTimeoutMs: 20_000,
  theme: "dark",
  downloadDirectoryLabel: "Downloads / SecureTransfer",
};
