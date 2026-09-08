/**
 * Cryptographic primitives for SecureTransfer, built entirely on the browser/platform
 * Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`). No custom cryptography.
 *
 * Key agreement: ECDH (P-256), ephemeral per session, exchanged out-of-band via the
 *   QR pairing sequence (not through the signaling server).
 * Key derivation: HKDF-SHA256, domain-separated by `info` label.
 * Bulk encryption: AES-256-GCM (authenticated encryption) with a per-session random
 *   4-byte salt and a monotonically increasing 8-byte counter forming a unique 96-bit
 *   IV for every chunk under a given key, guaranteeing IV uniqueness without needing
 *   a CSPRNG call per chunk.
 * Integrity: SHA-256 for whole-file and per-chunk hashing (one-shot digests via the
 *   native Web Crypto API; the incremental whole-file digest uses @noble/hashes, see
 *   StreamingSha256 below).
 */
import { sha256 } from "@noble/hashes/sha256";

const subtle = () => globalThis.crypto.subtle;

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;

export interface EphemeralKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/** Generates a fresh ECDH key pair. A new pair must be generated for every pairing session; never reused. */
export async function generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
  const pair = await subtle().generateKey(ECDH_PARAMS, true, ["deriveBits"]);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey };
}

/** Exports the raw uncompressed public key point (65 bytes for P-256) for embedding in a QR payload. */
export async function exportPublicKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const raw = await subtle().exportKey("raw", key);
  return new Uint8Array(raw);
}

/** Imports a peer's raw public key bytes received via the QR sequence. */
export async function importPeerPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", toArrayBuffer(raw), ECDH_PARAMS, false, []);
}

/**
 * Runs ECDH and HKDF to derive two domain-separated secrets from the shared point:
 * an AES-256-GCM key for chunk encryption, and an HMAC key used only for the
 * post-pairing key-confirmation handshake (proves both sides derived the same secret
 * before any file bytes are sent).
 */
export interface SessionKeys {
  encryptionKey: CryptoKey;
  confirmationKey: CryptoKey;
}

export async function deriveSessionKeys(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  sessionId: string,
): Promise<SessionKeys> {
  const sharedBits = await subtle().deriveBits({ name: "ECDH", public: peerPublicKey } as EcdhKeyDeriveParams, privateKey, 256);
  const hkdfKey = await subtle().importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const salt = new TextEncoder().encode(sessionId);

  const encryptionKey = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("securetransfer/chunk-encryption") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  const confirmationKey = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("securetransfer/key-confirmation") },
    hkdfKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );

  return { encryptionKey, confirmationKey };
}

/** Proves both peers derived the identical session secret, without revealing it. Compare via constant-time equality. */
export async function computeKeyConfirmationTag(confirmationKey: CryptoKey, sessionId: string): Promise<string> {
  const sig = await subtle().sign("HMAC", confirmationKey, new TextEncoder().encode(`confirm:${sessionId}`));
  return toHex(new Uint8Array(sig));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 12-byte IV = 4-byte random session salt + 8-byte big-endian chunk counter. Unique per key for up to 2^64 chunks. */
export function buildIv(sessionSalt: Uint8Array, counter: number): Uint8Array {
  if (sessionSalt.length !== 4) throw new Error("sessionSalt must be 4 bytes");
  const iv = new Uint8Array(12);
  iv.set(sessionSalt, 0);
  const view = new DataView(iv.buffer);
  // Split the 53-bit-safe JS number into high/low 32-bit halves for the 64-bit counter field.
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;
  view.setUint32(4, high, false);
  view.setUint32(8, low, false);
  return iv;
}

export function randomSessionSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(4));
}

export interface EncryptedChunk {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/** AEAD-encrypts one chunk. `aad` (e.g. fileId + chunkIndex) is authenticated but not encrypted, binding ciphertext to its position. */
export async function encryptChunk(
  key: CryptoKey,
  plaintext: Uint8Array,
  sessionSalt: Uint8Array,
  counter: number,
  aad: Uint8Array,
): Promise<EncryptedChunk> {
  const iv = buildIv(sessionSalt, counter);
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
    key,
    toArrayBuffer(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/** Decrypts and authenticates one chunk. Throws if the ciphertext, IV, or AAD were tampered with. */
export async function decryptChunk(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await subtle().decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
    key,
    toArrayBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await subtle().digest("SHA-256", toArrayBuffer(data));
  return toHex(new Uint8Array(digest));
}

/**
 * Streaming SHA-256 accumulator for hashing a file chunk-by-chunk without buffering the
 * whole file in memory. `crypto.subtle.digest` has no incremental/update API, so this
 * uses @noble/hashes — a minimal, widely-audited, dependency-free hash implementation —
 * for this one gap. Key agreement (ECDH) and bulk encryption (AES-GCM) above still go
 * through the native Web Crypto API.
 */
export class StreamingSha256 {
  private readonly hash = sha256.create();

  update(chunk: Uint8Array): void {
    this.hash.update(chunk);
  }

  digestHex(): string {
    return toHex(this.hash.digest());
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
