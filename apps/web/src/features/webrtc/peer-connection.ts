import type { RtcSignalPayload } from "@securetransfer/protocol";
import type { ConnectionDiagnostics, ConnectionKind } from "@securetransfer/shared";
import { buildIceServers } from "../../config";
import type { SignalingClient } from "./signaling-client";

export type PeerRole = "offerer" | "answerer";

export interface TransportEvents {
  onChannelOpen: () => void;
  onMessage: (data: string | ArrayBuffer) => void;
  onDisconnected: () => void;
  onDiagnostics: (diagnostics: ConnectionDiagnostics) => void;
}

const BUFFERED_AMOUNT_LOW_THRESHOLD = 4 * 1024 * 1024;
const DIAGNOSTICS_INTERVAL_MS = 2000;

/**
 * Wraps one RTCPeerConnection + a single reliable, ordered DataChannel for a pairing
 * session. The signaling channel only ever carries SDP/ICE (see SECURITY.md) — once the
 * DataChannel is open, all file data flows peer-to-peer (or via TURN relay if direct
 * connectivity fails) and is additionally encrypted at the application layer.
 */
export class PeerTransport {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSignaling: () => void;
  private retries = 0;
  private lastBytesReceived = 0;
  private lastStatsTime = 0;
  private readonly channelOpenPromise: Promise<void>;
  private resolveChannelOpen!: () => void;

  constructor(
    private readonly signaling: SignalingClient,
    private readonly sessionId: string,
    private readonly role: PeerRole,
    allowTurnFallback: boolean,
    private readonly events: TransportEvents,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: buildIceServers(allowTurnFallback) });
    this.channelOpenPromise = new Promise((resolve) => {
      this.resolveChannelOpen = resolve;
    });
    this.wirePeerConnection();
    this.unsubscribeSignaling = signaling.on((msg) => {
      if (msg.type === "signal") void this.handleSignal(msg.signal);
      if (msg.type === "peer-joined" && this.role === "offerer") void this.startOffer();
      if (msg.type === "peer-left") this.events.onDisconnected();
    });
  }

  private wirePeerConnection(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ kind: "ice-candidate", data: event.candidate.toJSON() });
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        this.retries += 1;
        this.events.onDisconnected();
      }
      if (this.pc.connectionState === "connected") {
        this.startDiagnostics();
      }
    };
    if (this.role === "offerer") {
      this.channel = this.pc.createDataChannel("transfer", { ordered: true });
      this.wireChannel(this.channel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.channel = event.channel;
        this.wireChannel(this.channel);
      };
    }
  }

  private wireChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    channel.onopen = () => {
      this.resolveChannelOpen();
      this.events.onChannelOpen();
    };
    channel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => this.events.onMessage(event.data);
    channel.onclose = () => this.events.onDisconnected();
  }

  private async startOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ kind: "offer", data: offer });
  }

  private async handleSignal(signal: RtcSignalPayload): Promise<void> {
    if (signal.kind === "offer") {
      await this.pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sendSignal({ kind: "answer", data: answer });
    } else if (signal.kind === "answer") {
      await this.pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
    } else if (signal.kind === "ice-candidate") {
      try {
        await this.pc.addIceCandidate(signal.data as RTCIceCandidateInit);
      } catch {
        // Benign: candidates that arrive before setRemoteDescription completes are dropped.
      }
    }
  }

  private sendSignal(signal: RtcSignalPayload): void {
    this.signaling.send({ type: "signal", v: 1, sessionId: this.sessionId, signal });
  }

  /** Resolves once the DataChannel is open and ready to carry framed control/chunk messages. */
  waitUntilOpen(): Promise<void> {
    return this.channelOpenPromise;
  }

  send(data: string | ArrayBufferView | ArrayBuffer): void {
    if (!this.channel || this.channel.readyState !== "open") {
      throw new Error("Data channel is not open.");
    }
    if (typeof data === "string") this.channel.send(data);
    // Cast needed: TS's DOM lib now types RTCDataChannel.send generically over `ArrayBuffer`
    // while ArrayBufferView.buffer is typed `ArrayBufferLike`; never a SharedArrayBuffer here.
    else this.channel.send(data as unknown as ArrayBuffer);
  }

  get bufferedAmount(): number {
    return this.channel?.bufferedAmount ?? 0;
  }

  /** Backpressure: resolves once the channel's send buffer has drained below the low-water mark. */
  waitForDrain(): Promise<void> {
    if (!this.channel || this.channel.bufferedAmount < BUFFERED_AMOUNT_LOW_THRESHOLD) return Promise.resolve();
    return new Promise((resolve) => {
      const channel = this.channel!;
      const onLow = () => {
        channel.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      channel.addEventListener("bufferedamountlow", onLow);
    });
  }

  private startDiagnostics(): void {
    if (this.diagnosticsTimer) return;
    this.diagnosticsTimer = setInterval(() => {
      void this.reportDiagnostics();
    }, DIAGNOSTICS_INTERVAL_MS);
    void this.reportDiagnostics();
  }

  private async reportDiagnostics(): Promise<void> {
    const stats = await this.pc.getStats();
    let kind: ConnectionKind = "unknown";
    let rttMs: number | undefined;
    let bytesReceived = 0;
    let candidatePairFound = false;

    for (const report of stats.values()) {
      if (report.type === "candidate-pair" && (report as RTCIceCandidatePairStats).state === "succeeded") {
        const pair = report as RTCIceCandidatePairStats & { selected?: boolean };
        if (pair.nominated === false && pair.selected === false) continue;
        candidatePairFound = true;
        rttMs = pair.currentRoundTripTime !== undefined ? pair.currentRoundTripTime * 1000 : undefined;
        bytesReceived = pair.bytesReceived ?? 0;
        const localId = pair.localCandidateId;
        const remoteId = pair.remoteCandidateId;
        const local = localId ? stats.get(localId) : undefined;
        const remote = remoteId ? stats.get(remoteId) : undefined;
        const localType = (local as RTCIceCandidate & { candidateType?: string })?.candidateType;
        const remoteType = (remote as RTCIceCandidate & { candidateType?: string })?.candidateType;
        kind = localType === "relay" || remoteType === "relay" ? "relay" : "direct";
      }
    }

    const now = performance.now();
    let throughputBytesPerSec = 0;
    if (candidatePairFound && this.lastStatsTime > 0) {
      const elapsedSec = (now - this.lastStatsTime) / 1000;
      if (elapsedSec > 0) throughputBytesPerSec = Math.max(0, (bytesReceived - this.lastBytesReceived) / elapsedSec);
    }
    this.lastBytesReceived = bytesReceived;
    this.lastStatsTime = now;

    this.events.onDiagnostics({ kind, rttMs, throughputBytesPerSec, retries: this.retries });
  }

  close(): void {
    if (this.diagnosticsTimer) clearInterval(this.diagnosticsTimer);
    this.unsubscribeSignaling();
    this.channel?.close();
    this.pc.close();
  }
}
