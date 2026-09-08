import type { WorkerRequest, WorkerResponse } from "./crypto-worker-protocol";

/** Distributes `Omit` over each union member individually (plain `Omit<Union, K>` collapses to shared keys only). */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Main-thread handle to the crypto worker, offloading AES-GCM encrypt/decrypt and SHA-256 hashing off the UI thread. */
export class CryptoWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const entry = this.pending.get(event.data.id);
      if (!entry) return;
      this.pending.delete(event.data.id);
      if (event.data.type === "error") entry.reject(new Error(event.data.message));
      else entry.resolve(event.data);
    };
  }

  private call(request: WithoutId<WorkerRequest>, transfer: Transferable[]): Promise<WorkerResponse> {
    const id = this.nextId++;
    const full = { ...request, id } as WorkerRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(full, transfer);
    });
  }

  async encrypt(
    key: CryptoKey,
    plaintext: Uint8Array,
    sessionSalt: Uint8Array,
    counter: number,
    aad: Uint8Array,
  ): Promise<{ iv: Uint8Array; ciphertext: Uint8Array; plaintextSha256: string }> {
    const plaintextBuf = plaintext.slice().buffer;
    const response = await this.call(
      { type: "encrypt", key, plaintext: plaintextBuf, sessionSalt: sessionSalt.buffer as ArrayBuffer, counter, aad: aad.buffer as ArrayBuffer },
      [plaintextBuf],
    );
    if (response.type !== "encrypt-result") throw new Error("Unexpected worker response");
    return { iv: new Uint8Array(response.iv), ciphertext: new Uint8Array(response.ciphertext), plaintextSha256: response.plaintextSha256 };
  }

  async decrypt(key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
    const ciphertextBuf = ciphertext.slice().buffer;
    const response = await this.call(
      { type: "decrypt", key, ciphertext: ciphertextBuf, iv: iv.buffer as ArrayBuffer, aad: aad.buffer as ArrayBuffer },
      [ciphertextBuf],
    );
    if (response.type !== "decrypt-result") throw new Error("Unexpected worker response");
    return new Uint8Array(response.plaintext);
  }

  async hash(data: Uint8Array): Promise<string> {
    const dataBuf = data.slice().buffer;
    const response = await this.call({ type: "hash", data: dataBuf }, [dataBuf]);
    if (response.type !== "hash-result") throw new Error("Unexpected worker response");
    return response.hex;
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
