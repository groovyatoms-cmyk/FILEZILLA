import {
  computeKeyConfirmationTag,
  constantTimeEqual,
  deriveSessionKeys,
  exportPublicKeyRaw,
  fromBase64Url,
  generateEphemeralKeyPair,
  importPeerPublicKey,
  toBase64Url,
} from "@securetransfer/crypto";
import type { ControlFrame, PairingPayload } from "@securetransfer/protocol";
import type { ConnectionDiagnostics, FileManifestEntry, TransferManifest } from "@securetransfer/shared";
import { SignalingClient } from "../webrtc/signaling-client";
import { PeerTransport } from "../webrtc/peer-connection";
import { CryptoWorkerClient } from "../../workers/crypto-worker-client";
import { ReceiverTransferEngine } from "../transfer/receiver-engine";
import type { FileSink } from "../transfer/file-sink";
import type { ProgressListener } from "../transfer/types";

export interface ReceiverSessionCallbacks {
  onDiagnostics: (d: ConnectionDiagnostics) => void;
  onDisconnected: () => void;
  onAuthenticated: () => void;
  onAuthenticationFailed: () => void;
  onManifest: (manifest: TransferManifest) => void;
  onProgress: ProgressListener;
  onFileVerified: (entry: FileManifestEntry) => void;
  onVerificationFailed: (entry: FileManifestEntry, expected: string, actual: string) => void;
  onComplete: () => void;
  onFatalError: (message: string) => void;
}

export class ReceiverPairingSession {
  private signaling: SignalingClient;
  private transport: PeerTransport | null = null;
  private cryptoWorker = new CryptoWorkerClient();
  private engine: ReceiverTransferEngine | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private handshakeComplete = false;

  constructor(
    signalingUrl: string,
    private readonly pairingPayload: PairingPayload,
  ) {
    this.signaling = new SignalingClient(signalingUrl);
  }

  async connect(
    callbacks: ReceiverSessionCallbacks,
    allowTurnFallback: boolean,
    createSink: (entry: FileManifestEntry) => FileSink,
  ): Promise<void> {
    this.keyPair = await generateEphemeralKeyPair();
    await this.signaling.connect();
    this.signaling.send({ type: "join-session", v: 1, sessionId: this.pairingPayload.sessionId });

    this.transport = new PeerTransport(this.signaling, this.pairingPayload.sessionId, "answerer", allowTurnFallback, {
      onChannelOpen: () => void this.sendHello(),
      onMessage: (data) => this.handleMessage(data, callbacks, createSink),
      onDisconnected: callbacks.onDisconnected,
      onDiagnostics: callbacks.onDiagnostics,
    });
  }

  private async sendHello(): Promise<void> {
    if (!this.keyPair || !this.transport) return;
    const publicKeyRaw = await exportPublicKeyRaw(this.keyPair.publicKey);
    this.transport.send(
      JSON.stringify({
        type: "receiver-hello",
        sessionId: this.pairingPayload.sessionId,
        publicKey: toBase64Url(publicKeyRaw),
      } satisfies ControlFrame),
    );
  }

  private async handleMessage(
    data: string | ArrayBuffer,
    callbacks: ReceiverSessionCallbacks,
    createSink: (entry: FileManifestEntry) => FileSink,
  ): Promise<void> {
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
    if (frame.type === "key-confirmation" && this.keyPair) {
      const peerPublicKey = await importPeerPublicKey(fromBase64Url(this.pairingPayload.publicKey));
      const sessionKeys = await deriveSessionKeys(this.keyPair.privateKey, peerPublicKey, this.pairingPayload.sessionId);
      const myTag = await computeKeyConfirmationTag(sessionKeys.confirmationKey, this.pairingPayload.sessionId);
      if (!constantTimeEqual(myTag, frame.tag)) {
        callbacks.onAuthenticationFailed();
        return;
      }
      this.transport!.send(JSON.stringify({ type: "key-confirmation", sessionId: this.pairingPayload.sessionId, tag: myTag } satisfies ControlFrame));
      this.handshakeComplete = true;
      callbacks.onAuthenticated();

      this.engine = new ReceiverTransferEngine({
        transport: this.transport!,
        cryptoWorker: this.cryptoWorker,
        encryptionKey: sessionKeys.encryptionKey,
        createSink,
        onManifest: callbacks.onManifest,
        onProgress: callbacks.onProgress,
        onFileVerified: callbacks.onFileVerified,
        onVerificationFailed: callbacks.onVerificationFailed,
        onComplete: callbacks.onComplete,
        onFatalError: callbacks.onFatalError,
      });
    }
  }

  acceptTransfer(transferId: string): void {
    this.transport?.send(JSON.stringify({ type: "accept-transfer", transferId } satisfies ControlFrame));
  }

  declineTransfer(transferId: string, reason: string): void {
    this.transport?.send(JSON.stringify({ type: "decline-transfer", transferId, reason } satisfies ControlFrame));
  }

  cancel(transferId: string): void {
    this.transport?.send(JSON.stringify({ type: "transfer-cancelled", transferId, reason: "Cancelled by user" } satisfies ControlFrame));
  }

  close(): void {
    this.transport?.close();
    this.signaling.close();
    this.cryptoWorker.terminate();
  }
}
