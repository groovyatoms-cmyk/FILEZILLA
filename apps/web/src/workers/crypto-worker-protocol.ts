export type WorkerRequest =
  | { id: number; type: "encrypt"; key: CryptoKey; plaintext: ArrayBuffer; sessionSalt: ArrayBuffer; counter: number; aad: ArrayBuffer }
  | { id: number; type: "decrypt"; key: CryptoKey; ciphertext: ArrayBuffer; iv: ArrayBuffer; aad: ArrayBuffer }
  | { id: number; type: "hash"; data: ArrayBuffer };

export type WorkerResponse =
  | { id: number; type: "encrypt-result"; iv: ArrayBuffer; ciphertext: ArrayBuffer; plaintextSha256: string }
  | { id: number; type: "decrypt-result"; plaintext: ArrayBuffer }
  | { id: number; type: "hash-result"; hex: string }
  | { id: number; type: "error"; message: string };
