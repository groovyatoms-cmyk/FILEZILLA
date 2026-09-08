import type { ControlFrame } from "@securetransfer/protocol";
import type { TransferManifest } from "@securetransfer/shared";
import { toHex } from "@securetransfer/crypto";
import type { PeerTransport } from "../webrtc/peer-connection";
import type { CryptoWorkerClient } from "../../workers/crypto-worker-client";
import { getChunkBlob } from "./chunker";
import type { ProgressListener, TransferProgress } from "./types";

export interface SenderDeps {
  transport: PeerTransport;
  cryptoWorker: CryptoWorkerClient;
  encryptionKey: CryptoKey;
  sessionSalt: Uint8Array;
  manifest: TransferManifest;
  filesByFileId: Map<string, File>;
  onProgress: ProgressListener;
  onFileVerified: (fileId: string) => void;
  onVerificationFailed: (fileId: string, expected: string, actual: string) => void;
  onComplete: () => void;
}

/**
 * Sends every file in the manifest as an ordered sequence of encrypted chunk frames.
 * A single monotonically increasing counter (shared across every chunk sent under this
 * session's key) feeds the AES-GCM IV construction, guaranteeing IV uniqueness for the
 * lifetime of the session — see packages/crypto's buildIv.
 */
export class SenderTransferEngine {
  private cancelled = false;
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private globalCounter = 0;
  private bytesTransferred = 0;
  private startedAt = 0;
  private lastSampleTime = 0;
  private lastSampleBytes = 0;

  constructor(private readonly deps: SenderDeps) {}

  async start(resumeFromChunkIndex: Record<string, number> = {}): Promise<void> {
    this.startedAt = performance.now();
    this.lastSampleTime = this.startedAt;
    const { manifest, filesByFileId } = this.deps;

    this.emitProgress("transferring", null, 0);

    for (let fileIndex = 0; fileIndex < manifest.files.length; fileIndex++) {
      if (this.cancelled) return;
      const entry = manifest.files[fileIndex]!;
      const file = filesByFileId.get(entry.fileId);
      if (!file) throw new Error(`Missing file data for ${entry.name}`);
      const startChunk = resumeFromChunkIndex[entry.fileId] ?? 0;

      for (let chunkIndex = startChunk; chunkIndex < entry.chunkCount; chunkIndex++) {
        if (this.cancelled) return;
        await this.waitWhilePaused();
        if (this.cancelled) return;
        await this.sendChunk(entry.fileId, entry.chunkSize, file, chunkIndex);
        this.emitProgress("transferring", entry.name, fileIndex);
      }
    }

    this.deps.transport.send(JSON.stringify({ type: "transfer-complete", transferId: manifest.transferId } satisfies ControlFrame));
    this.emitProgress("verifying", null, manifest.files.length);
  }

  handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") return;
    let frame: ControlFrame;
    try {
      frame = JSON.parse(data) as ControlFrame;
    } catch {
      return;
    }
    if (frame.type === "file-verified") {
      this.deps.onFileVerified(frame.fileId);
      if (this.isLastFile(frame.fileId)) this.deps.onComplete();
    } else if (frame.type === "file-verification-failed") {
      this.deps.onVerificationFailed(frame.fileId, frame.expected, frame.actual);
    } else if (frame.type === "resume-request") {
      // Receiver is asking to resume a specific file from a specific chunk after a reconnect.
      const entry = this.deps.manifest.files.find((f) => f.fileId === frame.fileId);
      const file = this.deps.filesByFileId.get(frame.fileId);
      if (entry && file) {
        void this.resendFrom(entry.fileId, frame.fromChunkIndex);
      }
    } else if (frame.type === "pause") {
      this.paused = true;
    } else if (frame.type === "resume") {
      this.resume();
    } else if (frame.type === "transfer-cancelled") {
      this.cancel();
    }
  }

  private async sendChunk(fileId: string, chunkSize: number, file: File, chunkIndex: number): Promise<void> {
    await this.deps.transport.waitForDrain();
    const blob = getChunkBlob(file, chunkIndex, chunkSize);
    const plaintext = new Uint8Array(await blob.arrayBuffer());
    const aad = new TextEncoder().encode(`${fileId}:${chunkIndex}`);
    const counter = this.globalCounter++;
    const { iv, ciphertext, plaintextSha256 } = await this.deps.cryptoWorker.encrypt(
      this.deps.encryptionKey,
      plaintext,
      this.deps.sessionSalt,
      counter,
      aad,
    );

    this.deps.transport.send(
      JSON.stringify({
        type: "chunk",
        transferId: this.deps.manifest.transferId,
        fileId,
        chunkIndex,
        iv: toHex(iv),
        plaintextSha256,
        byteLength: ciphertext.byteLength,
      }),
    );
    this.deps.transport.send(ciphertext.buffer as ArrayBuffer);
    this.bytesTransferred += plaintext.byteLength;
  }

  private isLastFile(fileId: string): boolean {
    const idx = this.deps.manifest.files.findIndex((f) => f.fileId === fileId);
    return idx === this.deps.manifest.files.length - 1;
  }

  /** Resends only the requested file's remaining chunks (e.g. after a corrupted-chunk retry request). */
  private async resendFrom(fileId: string, fromChunkIndex: number): Promise<void> {
    const entry = this.deps.manifest.files.find((f) => f.fileId === fileId);
    const file = this.deps.filesByFileId.get(fileId);
    if (!entry || !file) return;
    for (let chunkIndex = fromChunkIndex; chunkIndex < entry.chunkCount; chunkIndex++) {
      if (this.cancelled) return;
      await this.waitWhilePaused();
      if (this.cancelled) return;
      await this.sendChunk(entry.fileId, entry.chunkSize, file, chunkIndex);
      this.emitProgress("transferring", entry.name, this.deps.manifest.files.indexOf(entry));
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    waiters.forEach((w) => w());
  }

  cancel(reason = "Cancelled by user"): void {
    this.cancelled = true;
    this.resume();
    try {
      this.deps.transport.send(JSON.stringify({ type: "transfer-cancelled", transferId: this.deps.manifest.transferId, reason } satisfies ControlFrame));
    } catch {
      // transport may already be closed
    }
  }

  private waitWhilePaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    this.emitProgress("paused", null, 0);
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  private emitProgress(status: TransferProgress["status"], currentFileName: string | null, filesCompleted: number): void {
    const now = performance.now();
    const elapsedSinceSample = (now - this.lastSampleTime) / 1000;
    let bytesPerSecond = 0;
    if (elapsedSinceSample > 0.25) {
      bytesPerSecond = (this.bytesTransferred - this.lastSampleBytes) / elapsedSinceSample;
      this.lastSampleTime = now;
      this.lastSampleBytes = this.bytesTransferred;
    }
    const remaining = this.deps.manifest.totalSize - this.bytesTransferred;
    const etaSeconds = bytesPerSecond > 0 ? remaining / bytesPerSecond : null;
    this.deps.onProgress({
      status,
      bytesTransferred: this.bytesTransferred,
      totalBytes: this.deps.manifest.totalSize,
      currentFileName,
      filesCompleted,
      totalFiles: this.deps.manifest.files.length,
      bytesPerSecond,
      etaSeconds,
    });
  }
}
