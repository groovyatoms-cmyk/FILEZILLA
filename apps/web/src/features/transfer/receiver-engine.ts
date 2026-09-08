import { StreamingSha256, fromHex } from "@securetransfer/crypto";
import type { ChunkHeader, ControlFrame } from "@securetransfer/protocol";
import type { FileManifestEntry, TransferManifest } from "@securetransfer/shared";
import type { PeerTransport } from "../webrtc/peer-connection";
import type { CryptoWorkerClient } from "../../workers/crypto-worker-client";
import type { FileSink } from "./file-sink";
import type { ProgressListener, TransferProgress } from "./types";

const ACK_INTERVAL_CHUNKS = 8;
const MAX_CHUNK_RETRIES = 3;

export interface ReceiverDeps {
  transport: PeerTransport;
  cryptoWorker: CryptoWorkerClient;
  encryptionKey: CryptoKey;
  createSink: (entry: FileManifestEntry) => FileSink;
  onManifest: (manifest: TransferManifest) => void;
  onProgress: ProgressListener;
  onFileVerified: (entry: FileManifestEntry) => void;
  onVerificationFailed: (entry: FileManifestEntry, expected: string, actual: string) => void;
  onComplete: () => void;
  onFatalError: (message: string) => void;
}

interface FileReceiveState {
  entry: FileManifestEntry;
  sink: FileSink;
  hasher: StreamingSha256;
  nextExpectedChunk: number;
  retries: Map<number, number>;
}

export class ReceiverTransferEngine {
  private manifest: TransferManifest | null = null;
  private pendingHeader: ChunkHeader | null = null;
  private readonly fileStates = new Map<string, FileReceiveState>();
  private bytesReceived = 0;
  private lastSampleTime = 0;
  private lastSampleBytes = 0;

  constructor(private readonly deps: ReceiverDeps) {}

  handleMessage(data: string | ArrayBuffer): void {
    if (typeof data === "string") {
      this.handleControlFrame(data);
    } else {
      void this.handleBinaryFrame(data);
    }
  }

  private handleControlFrame(text: string): void {
    let frame: ControlFrame | ChunkHeader;
    try {
      frame = JSON.parse(text) as ControlFrame | ChunkHeader;
    } catch {
      return;
    }
    if (frame.type === "chunk") {
      this.pendingHeader = frame;
      return;
    }
    if (frame.type === "manifest") {
      this.manifest = {
        transferId: frame.transferId,
        sessionId: this.manifest?.sessionId ?? "",
        label: frame.label,
        totalSize: frame.totalSize,
        files: frame.files,
        createdAt: Date.now(),
      };
      this.lastSampleTime = performance.now();
      for (const entry of frame.files) {
        this.fileStates.set(entry.fileId, {
          entry,
          sink: this.deps.createSink(entry),
          hasher: new StreamingSha256(),
          nextExpectedChunk: 0,
          retries: new Map(),
        });
      }
      this.deps.onManifest(this.manifest);
    } else if (frame.type === "transfer-complete") {
      this.deps.onComplete();
    } else if (frame.type === "transfer-cancelled") {
      this.deps.onFatalError(frame.reason);
    }
  }

  private async handleBinaryFrame(data: ArrayBuffer): Promise<void> {
    const header = this.pendingHeader;
    this.pendingHeader = null;
    if (!header) return;
    const state = this.fileStates.get(header.fileId);
    if (!state) return;

    const ciphertext = new Uint8Array(data);
    let plaintext: Uint8Array;
    try {
      plaintext = await this.deps.cryptoWorker.decrypt(
        this.deps.encryptionKey,
        ciphertext,
        fromHex(header.iv),
        new TextEncoder().encode(`${header.fileId}:${header.chunkIndex}`),
      );
    } catch {
      this.requestRetry(state, header.chunkIndex, "Chunk failed authentication (corrupted or tampered in transit).");
      return;
    }

    const actualHash = await hashPlaintext(plaintext);
    if (actualHash !== header.plaintextSha256) {
      this.requestRetry(state, header.chunkIndex, "Chunk hash mismatch after decryption.");
      return;
    }

    await state.sink.write(plaintext);
    state.hasher.update(plaintext);
    state.nextExpectedChunk = header.chunkIndex + 1;
    this.bytesReceived += plaintext.byteLength;

    if (header.chunkIndex % ACK_INTERVAL_CHUNKS === 0) {
      this.deps.transport.send(
        JSON.stringify({ type: "chunk-ack", transferId: header.transferId, fileId: header.fileId, chunkIndex: header.chunkIndex } satisfies ControlFrame),
      );
    }

    this.emitProgress(state.entry.name);

    if (header.chunkIndex === state.entry.chunkCount - 1) {
      await this.finalizeFile(state);
    }
  }

  private requestRetry(state: FileReceiveState, chunkIndex: number, reason: string): void {
    const attempts = (state.retries.get(chunkIndex) ?? 0) + 1;
    state.retries.set(chunkIndex, attempts);
    if (attempts > MAX_CHUNK_RETRIES) {
      this.deps.onFatalError(`${reason} Chunk ${chunkIndex} of ${state.entry.name} failed after ${MAX_CHUNK_RETRIES} retries.`);
      return;
    }
    this.deps.transport.send(
      JSON.stringify({
        type: "resume-request",
        transferId: this.manifest?.transferId ?? "",
        fileId: state.entry.fileId,
        fromChunkIndex: chunkIndex,
      } satisfies ControlFrame),
    );
  }

  private async finalizeFile(state: FileReceiveState): Promise<void> {
    await state.sink.finalize(state.entry.name);
    const actual = state.hasher.digestHex();
    if (actual === state.entry.sha256) {
      this.deps.transport.send(
        JSON.stringify({ type: "file-verified", transferId: this.manifest?.transferId ?? "", fileId: state.entry.fileId, sha256: actual } satisfies ControlFrame),
      );
      this.deps.onFileVerified(state.entry);
    } else {
      this.deps.transport.send(
        JSON.stringify({
          type: "file-verification-failed",
          transferId: this.manifest?.transferId ?? "",
          fileId: state.entry.fileId,
          expected: state.entry.sha256,
          actual,
        } satisfies ControlFrame),
      );
      this.deps.onVerificationFailed(state.entry, state.entry.sha256, actual);
    }
  }

  private emitProgress(currentFileName: string): void {
    if (!this.manifest) return;
    const now = performance.now();
    const elapsed = (now - this.lastSampleTime) / 1000;
    let bytesPerSecond = 0;
    if (elapsed > 0.25) {
      bytesPerSecond = (this.bytesReceived - this.lastSampleBytes) / elapsed;
      this.lastSampleTime = now;
      this.lastSampleBytes = this.bytesReceived;
    }
    const filesCompleted = Array.from(this.fileStates.values()).filter((s) => s.nextExpectedChunk >= s.entry.chunkCount).length;
    const remaining = this.manifest.totalSize - this.bytesReceived;
    const etaSeconds = bytesPerSecond > 0 ? remaining / bytesPerSecond : null;
    const progress: TransferProgress = {
      status: "transferring",
      bytesTransferred: this.bytesReceived,
      totalBytes: this.manifest.totalSize,
      currentFileName,
      filesCompleted,
      totalFiles: this.manifest.files.length,
      bytesPerSecond,
      etaSeconds,
    };
    this.deps.onProgress(progress);
  }
}

async function hashPlaintext(bytes: Uint8Array): Promise<string> {
  const hasher = new StreamingSha256();
  hasher.update(bytes);
  return hasher.digestHex();
}
