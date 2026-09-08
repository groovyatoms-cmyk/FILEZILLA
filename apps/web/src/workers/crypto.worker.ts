/// <reference lib="webworker" />
import { decryptChunk, encryptChunk, sha256Hex } from "@securetransfer/crypto";
import type { WorkerRequest, WorkerResponse } from "./crypto-worker-protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
};

async function handle(request: WorkerRequest): Promise<void> {
  try {
    if (request.type === "encrypt") {
      const plaintextBytes = new Uint8Array(request.plaintext);
      const [{ iv, ciphertext }, plaintextSha256] = await Promise.all([
        encryptChunk(request.key, plaintextBytes, new Uint8Array(request.sessionSalt), request.counter, new Uint8Array(request.aad)),
        sha256Hex(plaintextBytes),
      ]);
      const response: WorkerResponse = {
        id: request.id,
        type: "encrypt-result",
        iv: iv.buffer as ArrayBuffer,
        ciphertext: ciphertext.buffer as ArrayBuffer,
        plaintextSha256,
      };
      ctx.postMessage(response, [response.iv, response.ciphertext]);
    } else if (request.type === "decrypt") {
      const plaintext = await decryptChunk(
        request.key,
        new Uint8Array(request.ciphertext),
        new Uint8Array(request.iv),
        new Uint8Array(request.aad),
      );
      const response: WorkerResponse = { id: request.id, type: "decrypt-result", plaintext: plaintext.buffer as ArrayBuffer };
      ctx.postMessage(response, [response.plaintext]);
    } else if (request.type === "hash") {
      const hex = await sha256Hex(new Uint8Array(request.data));
      const response: WorkerResponse = { id: request.id, type: "hash-result", hex };
      ctx.postMessage(response);
    }
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : "Unknown worker error",
    };
    ctx.postMessage(response);
  }
}
