import type { ClientToServerMessage, ServerToClientMessage } from "@securetransfer/protocol";

type Listener = (message: ServerToClientMessage) => void;

/**
 * Thin WebSocket wrapper around the signaling protocol. Reconnects are intentionally
 * NOT automatic here: a dropped signaling connection during an active P2P transfer does
 * not interrupt the transfer (the DataChannel is independent of the signaling socket
 * once established) — see features/transfer for the interruption/resume path that
 * actually matters to the user.
 */
export class SignalingClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private openPromise: Promise<void> | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Unable to reach the signaling server."));
      socket.onmessage = (event) => {
        let parsed: ServerToClientMessage;
        try {
          parsed = JSON.parse(String(event.data)) as ServerToClientMessage;
        } catch {
          return;
        }
        for (const listener of this.listeners) listener(parsed);
      };
      socket.onclose = () => {
        this.openPromise = null;
      };
    });
    return this.openPromise;
  }

  send(message: ClientToServerMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Signaling connection is not open.");
    }
    this.socket.send(JSON.stringify(message));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.openPromise = null;
  }
}
