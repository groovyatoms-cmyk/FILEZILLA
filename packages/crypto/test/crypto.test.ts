import { describe, expect, it } from "vitest";
import {
  buildIv,
  computeKeyConfirmationTag,
  constantTimeEqual,
  decryptChunk,
  deriveSessionKeys,
  encryptChunk,
  exportPublicKeyRaw,
  fromBase64Url,
  fromHex,
  generateEphemeralKeyPair,
  importPeerPublicKey,
  randomSessionSalt,
  sha256Hex,
  toBase64Url,
  toHex,
} from "../src/index";

describe("ECDH session key agreement", () => {
  it("derives identical session keys on both sides from an exchanged public key", async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();

    const aliceRaw = await exportPublicKeyRaw(alice.publicKey);
    const bobRaw = await exportPublicKeyRaw(bob.publicKey);

    const alicePeer = await importPeerPublicKey(bobRaw);
    const bobPeer = await importPeerPublicKey(aliceRaw);

    const sessionId = "session-123";
    const aliceKeys = await deriveSessionKeys(alice.privateKey, alicePeer, sessionId);
    const bobKeys = await deriveSessionKeys(bob.privateKey, bobPeer, sessionId);

    const aliceTag = await computeKeyConfirmationTag(aliceKeys.confirmationKey, sessionId);
    const bobTag = await computeKeyConfirmationTag(bobKeys.confirmationKey, sessionId);
    expect(constantTimeEqual(aliceTag, bobTag)).toBe(true);

    // encrypt with alice's key, decrypt with bob's independently-derived key
    const plaintext = new TextEncoder().encode("hello secure world");
    const salt = randomSessionSalt();
    const aad = new TextEncoder().encode("file-1:0");
    const encrypted = await encryptChunk(aliceKeys.encryptionKey, plaintext, salt, 0, aad);
    const decrypted = await decryptChunk(bobKeys.encryptionKey, encrypted.ciphertext, encrypted.iv, aad);
    expect(new TextDecoder().decode(decrypted)).toBe("hello secure world");
  });

  it("produces different key-confirmation tags when peers used mismatched key material", async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();
    const mallory = await generateEphemeralKeyPair();

    const bobRaw = await exportPublicKeyRaw(bob.publicKey);
    const malloryRaw = await exportPublicKeyRaw(mallory.publicKey);

    const sessionId = "session-456";
    const aliceKeys = await deriveSessionKeys(alice.privateKey, await importPeerPublicKey(bobRaw), sessionId);
    // Bob actually talked to Mallory instead of Alice (impersonation attempt)
    const wrongKeys = await deriveSessionKeys(bob.privateKey, await importPeerPublicKey(malloryRaw), sessionId);

    const aliceTag = await computeKeyConfirmationTag(aliceKeys.confirmationKey, sessionId);
    const wrongTag = await computeKeyConfirmationTag(wrongKeys.confirmationKey, sessionId);
    expect(constantTimeEqual(aliceTag, wrongTag)).toBe(false);
  });
});

describe("AES-256-GCM chunk encryption", () => {
  it("rejects tampered ciphertext (authentication failure)", async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();
    const keys = await deriveSessionKeys(
      alice.privateKey,
      await importPeerPublicKey(await exportPublicKeyRaw(bob.publicKey)),
      "s1",
    );
    const salt = randomSessionSalt();
    const aad = new TextEncoder().encode("file-1:0");
    const encrypted = await encryptChunk(keys.encryptionKey, new TextEncoder().encode("payload"), salt, 0, aad);
    encrypted.ciphertext[0] = encrypted.ciphertext[0]! ^ 0xff;

    await expect(decryptChunk(keys.encryptionKey, encrypted.ciphertext, encrypted.iv, aad)).rejects.toThrow();
  });

  it("rejects a chunk replayed under the wrong AAD (position binding)", async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();
    const keys = await deriveSessionKeys(
      alice.privateKey,
      await importPeerPublicKey(await exportPublicKeyRaw(bob.publicKey)),
      "s1",
    );
    const salt = randomSessionSalt();
    const encrypted = await encryptChunk(
      keys.encryptionKey,
      new TextEncoder().encode("payload"),
      salt,
      0,
      new TextEncoder().encode("file-1:0"),
    );
    await expect(
      decryptChunk(keys.encryptionKey, encrypted.ciphertext, encrypted.iv, new TextEncoder().encode("file-1:1")),
    ).rejects.toThrow();
  });

  it("builds unique IVs across a large counter range", () => {
    const salt = new Uint8Array([1, 2, 3, 4]);
    const seen = new Set<string>();
    for (const counter of [0, 1, 2, 2 ** 32 - 1, 2 ** 32, 2 ** 40]) {
      const iv = toHex(buildIv(salt, counter));
      expect(seen.has(iv)).toBe(false);
      seen.add(iv);
    }
  });
});

describe("hashing and encoding helpers", () => {
  it("computes a stable SHA-256 hex digest", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("abc"));
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("round-trips hex and base64url encodings", () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(37));
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
});
