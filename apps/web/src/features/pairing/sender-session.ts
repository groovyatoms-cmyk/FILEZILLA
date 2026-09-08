import {
  computeKeyConfirmationTag,
  constantTimeEqual,
  deriveSessionKeys,
  exportPublicKeyRaw,
  fromBase64Url,
  generateEphemeralKeyPair,
  importPeerPublicKey,
  randomSessionSalt,
  toBase64Url,
} from "@securetransfer/crypto";
import {
  generateSessionId,
  serializePairingPayload,
  splitPayloadIntoQrFragments,
  type ControlFrame,
  type PairingPayload,
  type QrFragment,
} from "@securetransfer/protocol";
import type { ConnectionDiagnostics, TransferManifest } from "@securetransfer/shared";
import { SignalingClient } from "../webrtc/signaling-client";
import { PeerTransport } from "../webrtc/peer-connection";
import { CryptoWorkerClient } from "../../workers/crypto-worker-client";
import { SenderTransferEngine } from "../transfer/sender-engine";
import { buildManifest, type SelectedFile } from "../transfer/manifest";
import type { ProgressListener } from "../transfer/types";

export interface SenderSessionCallbacks {
  onDiagnostics: (d: ConnectionDiagnostics) => void;
  onDisconnected: () => void;
  onAuthenticated: () => void;
  onAuthenticationFailed: () => void;
  onManifestAccepted: () => void;
  onManifestDeclined: (reason: string) => void;
  onProgress: ProgressListener;
  onFileVerified: (fileId: string) => void;
  onVerificationFailed: (fileId: string, expected: string, actual: string) => void;
  onComplete: () => void;
}

export class SenderPairingSession {
  private signaling: SignalingClient;
  private transport: PeerTransport | null = null;
  private cryptoWorker = new CryptoWorkerClient();
  private engine: SenderTransferEngine | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private ivSalt: Uint8Array;
  private sessionId: string;
  private manifest: TransferManifest | null = null;
  private filesByFileId = new Map<string, File>();
  private handshakeComplete = false;

  constructor(
    signalingUrl: string,
    private readonly senderDeviceId: string,
    private readonly senderLabel: string,
    private readonly sessionTtlMs: number,
  ) {
    this.sessionId = generateSessionId();
    this.ivSalt = randomSessionSalt();
    this.signaling = new SignalingClient(signalingUrl);
  }

  get id(): string {
    return this.sessionId;
  }

  async prepare(
    selected: SelectedFile[],
    label: string,
    chunkSize: number,
    onFileHashed?: (fileName: string, index: number, total: number) => void,
  ): Promise<{ fragments: QrFragment[]; expiresAt: number }> {
    this.keyPair = await generateEphemeralKeyPair();
    const transferId = `t-${this.sessionId}`;
    this.manifest = await buildManifest(transferId, this.sessionId, label, selected, chunkSize, onFileHashed);
    for (let i = 0; i < selected.length; i++) {
      this.filesByFileId.set(this.manifest.files[i]!.fileId, selected[i]!.file);
    }

    const now = Date.now();
    const expiresAt = now + this.sessionTtlMs;
    const publicKeyRaw = await exportPublicKeyRaw(this.keyPair.publicKey);
    const payload: PairingPayload = {
      v: 1,
      sessionId: this.sessionId,
      senderDeviceId: this.senderDeviceId,
      senderLabel: this.senderLabel,
      publicKey: toBase64Url(publicKeyRaw),
      ivSalt: toBase64Url(this.ivSalt),
      transfer: { label, totalSize: this.manifest.totalSize, fileCount: this.manifest.files.length },
      createdAt: now,
      expiresAt,
    };
    const bytes = serializePairingPayload(payload);
    const fragments = await splitPayloadIntoQrFragments(bytes, this.sessionId);

    await this.signaling.connect();
    this.signaling.send({ type: "create-session", v: 1, sessionId: this.sessionId, ttlMs: this.sessionTtlMs });

    return { fragments, expiresAt };
  }

  connect(callbacks: SenderSessionCallbacks, allowTurnFallback: boolean): void {
    this.transport = new PeerTransport(this.signaling, this.sessionId, "offerer", allowTurnFallback, {
      onChannelOpen: () => {},
      onMessage: (data) => this.handleMessage(data, callbacks),
      onDisconnected: callbacks.onDisconnected,
      onDiagnostics: callbacks.onDiagnostics,
    });
  }

  private async handleMessage(data: string | ArrayBuffer, callbacks: SenderSessionCallbacks): Promise<void> {
    if (this.handshakeComplete) {
      this.engine?.handleMessage(data);
      return;
    }
    if (typeof data !== "string") return;
    let frame: ControlFrame;
    try {
      frame = JSON.parse(data) as ControlFrame;
    } catch {
      return;
    }
    if (frame.type === "receiver-hello" && frame.sessionId === this.sessionId && this.keyPair) {
      const peerPublicKey = await importPeerPublicKey(fromBase64Url(frame.publicKey));
      const sessionKeys = await deriveSessionKeys(this.keyPair.privateKey, peerPublicKey, this.sessionId);
      const myTag = await computeKeyConfirmationTag(sessionKeys.confirmationKey, this.sessionId);
      this.transport!.send(JSON.stringify({ type: "key-confirmation", sessionId: this.sessionId, tag: myTag } satisfies ControlFrame));
      this.pendingKeys = sessionKeys;
    } else if (frame.type === "key-confirmation" && this.pendingKeys) {
      const myTag = await computeKeyConfirmationTag(this.pendingKeys.confirmationKey, this.sessionId);
      if (!constantTimeEqual(myTag, frame.tag)) {
        callbacks.onAuthenticationFailed();
        return;
      }
      this.handshakeComplete = true;
      callbacks.onAuthenticated();
      this.sendManifestAndStart(callbacks);
    } else if (frame.type === "accept-transfer") {
      callbacks.onManifestAccepted();
      this.startSending();
    } else if (frame.type === "decline-transfer") {
      callbacks.onManifestDeclined(frame.reason);
    }
  }

  private pendingKeys: Awaited<ReturnType<typeof deriveSessionKeys>> | null = null;

  private sendManifestAndStart(callbacks: SenderSessionCallbacks): void {
    if (!this.manifest || !this.transport || !this.pendingKeys) return;
    this.transport.send(
      JSON.stringify({
        type: "manifest",
        transferId: this.manifest.transferId,
        label: this.manifest.label,
        totalSize: this.manifest.totalSize,
        files: this.manifest.files,
      } satisfies ControlFrame),
    );
    this.engine = new SenderTransferEngine({
      transport: this.transport,
      cryptoWorker: this.cryptoWorker,
      encryptionKey: this.pendingKeys.encryptionKey,
      sessionSalt: this.ivSalt,
      manifest: this.manifest,
      filesByFileId: this.filesByFileId,
      onProgress: callbacks.onProgress,
      onFileVerified: callbacks.onFileVerified,
      onVerificationFailed: callbacks.onVerificationFailed,
      onComplete: callbacks.onComplete,
    });
  }

  startSending(): void {
    void this.engine?.start();
  }

  pause(): void {
    this.engine?.pause();
  }

  resume(): void {
    this.engine?.resume();
  }

  cancel(): void {
    this.engine?.cancel();
  }

  close(): void {
    this.transport?.close();
    this.signaling.close();
    this.cryptoWorker.terminate();
  }
}
