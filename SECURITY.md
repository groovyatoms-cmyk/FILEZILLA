# Security Model & Threat Model — Tarang

This document describes, precisely, what Tarang protects against, what it does
not, and why. It intentionally avoids marketing language ("military-grade", "100%
secure", "unhackable") — every claim below is meant to be checkable against the code in
`packages/crypto`, `packages/protocol`, `apps/signaling`, and `apps/web/src/features`.

## 1. What is protected, and how

| Property | Mechanism | Where |
|---|---|---|
| Confidentiality of file contents | AES-256-GCM, key derived via ECDH (P-256) + HKDF-SHA256 | `packages/crypto` |
| Key exchange without a trusted third party | Ephemeral ECDH key pair generated per session; public key carried out-of-band in the QR sequence, never sent to the signaling server | `features/pairing` |
| Mutual authentication that both sides hold the same key | HMAC-SHA256 key-confirmation tag exchanged and compared *before* any file data is sent | `features/pairing/*-session.ts` |
| Integrity of each chunk | SHA-256 of the plaintext chunk, checked immediately after decryption; AES-GCM's authentication tag also detects ciphertext tampering | `features/transfer/receiver-engine.ts` |
| Integrity of the whole file | SHA-256 computed over the full plaintext (streamed, see §8), verified after every chunk of a file has been written | `features/transfer/manifest.ts`, `receiver-engine.ts` |
| Replay / cross-session confusion | Session id is single-use, random 128 bits; the signaling server enforces at most two participants and deletes the session once both leave or it expires; QR fragments carry a hash of the full payload so fragments from a regenerated QR sequence are rejected rather than mixed in | `apps/signaling/src/session-store.ts`, `packages/protocol/src/qr.ts` |
| Session freshness | Sessions expire after a configurable TTL (default 10 minutes); expired sessions are rejected by both the signaling server and the client-side payload parser | `packages/protocol/src/pairing.ts`, `session-store.ts` |
| Chunk position binding | Each chunk's AES-GCM additional authenticated data (AAD) is `fileId:chunkIndex`; a chunk decrypted successfully under the wrong position's AAD will fail authentication | `packages/crypto` `encryptChunk`/`decryptChunk` |

**"End-to-end encrypted" is accurate for this architecture** because: the file is
chunked and encrypted on the sender's device before any chunk leaves it, decrypted only
on the receiver's device, and the AES key is derived from an ECDH exchange whose public
half is transmitted only through the QR channel (never through the signaling server or
any relay). Two independent layers protect the data in transit: WebRTC's mandatory
DTLS on the DataChannel, and the application-layer AES-256-GCM described above.

## 2. What the signaling server can and cannot see

The signaling server (`apps/signaling`) is intentionally minimal. Its job is limited to:

- Creating/joining a session record (`sessionId`, expiry, participant count).
- Relaying WebRTC `offer`/`answer`/ICE-candidate messages between exactly two connections
  in a session.
- Enforcing the two-participant cap, session expiry, and basic rate limiting.

It **can see**: session ids (random, meaningless without the QR-exchanged key material),
connection timing, and the raw SDP/ICE payloads it relays (these contain network
addresses/ports used for connection setup — see §6).

It **cannot see** (because they are never sent to it): file names, file contents, file
sizes beyond the coarse metadata put in the pairing QR (label/total size/file count —
only visible to whoever reads the QR itself, not the server), the AES encryption key,
the ECDH private keys, or the key-confirmation tags (those are exchanged over the
DataChannel after it's established, not through the signaling path). Logs
(`apps/signaling/src/logger.ts`) additionally never include full session ids, file
metadata, or SDP/ICE contents.

## 3. Threat model

For each threat: **Impact**, **Mitigation**, **Residual risk**.

### Malicious or malformed QR codes
- **Impact:** A crafted QR fragment could attempt to corrupt session reconstruction, or
  point a victim at an attacker-controlled session.
- **Mitigation:** Every fragment carries a version, session id, index/total, a whole-payload
  hash, and a per-fragment checksum; the receiver rejects fragments with mismatched hashes,
  wrong checksums, or an out-of-range index (`packages/protocol/src/qr.ts`). Reconstructed
  payloads are schema-validated and expiry-checked before use (`pairing.ts`).
- **Residual risk:** A user could be socially engineered into scanning a QR sequence from
  an unexpected/untrusted display. Out-of-band QR exchange assumes the physical act of
  scanning is intentional — the app cannot verify the human intent behind a scan.

### Session hijacking / joining someone else's session
- **Impact:** A third party guesses or observes a session id and attempts to join.
- **Mitigation:** Session ids are 128 bits of CSPRNG output (`generateSessionId`);
  the signaling server enforces a hard cap of two participants and rejects further joins
  with `session-full`. Even a successful join without the QR-derived key material cannot
  decrypt anything, because the AES key requires the sender's ECDH public key, which never
  passes through the signaling server.
- **Residual risk:** A third party who joins before the legitimate receiver occupies the
  session's second slot, causing a denial of service for that session (the legitimate
  receiver sees `session-full`). The legitimate parties can create a new session immediately
  — session ids are single-use and cheap to regenerate.

### Replay attacks
- **Impact:** Re-sending a previously captured signaling message or chunk to disrupt or
  spoof a transfer.
- **Mitigation:** Sessions are single-use and expire quickly. AES-GCM chunk IVs are unique
  per session (per-session random salt + monotonic counter, see `buildIv`), so no
  ciphertext is ever encrypted twice under the same key+IV. Chunk AAD binds ciphertext to
  a specific file+index.
- **Residual risk:** None identified within a session's lifetime beyond the signaling
  server's own message relay being best-effort (WebSocket delivery is not itself
  authenticated beyond TLS/WSS in production — see §6).

### Man-in-the-middle on the signaling channel
- **Impact:** An attacker who can intercept and modify signaling traffic could try to
  substitute their own SDP/ICE candidates to redirect the WebRTC connection to themselves.
- **Mitigation:** Deploy the signaling server behind WSS (TLS) in production (see §6) to
  prevent network-level tampering/eavesdropping on the signaling channel itself. Even if an
  attacker fully controlled the signaling relay, WebRTC's mandatory DTLS-SRTP still
  requires matching DTLS fingerprints from the real offer/answer, and the application-layer
  key confirmation (§1) would fail if the attacker tried to insert themselves as a
  "man-in-the-middle" peer, because they do not hold the receiver's or sender's ECDH
  private key.
- **Residual risk:** A compromised signaling server that also had a way to intercept and
  replace the QR pairing payload before it reaches the receiver (i.e., compromising the
  out-of-band channel too) could mount a full MITM. This is a fundamentally different, much
  harder attack than compromising signaling alone, since it requires compromising the
  physical/visual QR exchange as well.

### Compromised signaling server
- **Impact:** An attacker with full control of the signaling server.
- **Mitigation:** See §2 — the server's design deliberately starves it of anything useful
  to an attacker (no keys, no file data, no plaintext filenames beyond the QR-only summary).
  At worst, a compromised server can perform denial-of-service (refuse to relay, or falsely
  report `session-full`/`session-expired`) or the MITM scenario described above (which still
  requires compromising the QR exchange).
- **Residual risk:** Denial of service is not fully mitigable by a client-side design; this
  is an accepted tradeoff of using a third-party rendezvous point at all. Users needing
  guaranteed availability should self-host the signaling server (it is a small, auditable
  Node service — see `apps/signaling`).

### Malicious files sent through the app
- **Impact:** A sender could deliberately send malware or an executable to trick a
  receiver into running it.
- **Mitigation:** Tarang blocks a defined set of executable/installer file
  extensions and MIME types outright (`apps/web/src/utils/file-filter.ts`) — `.exe`,
  `.msi`, `.apk`, `.dmg`, `.pkg`, `.deb`, `.rpm`, `.jar`, shell/batch/VBScript files, and
  similar — so the app cannot be used to hand a receiver a directly-executable payload.
- **Residual risk:** This is a content-type filter, not malware scanning. Non-executable
  file types (documents, archives, media) can still carry malicious payloads exploitable
  by vulnerabilities in whatever application later opens them. Tarang does not
  scan file contents for malware — treat any received file with the same caution you would
  apply to an email attachment from the same sender.

### Corrupted chunks / bit flips in transit
- **Impact:** Network or hardware-level corruption produces a chunk that doesn't match
  what was sent.
- **Mitigation:** AES-GCM's authentication tag will fail to verify for almost any
  corruption; the independent plaintext SHA-256 sent per chunk is checked again after
  decryption. Either failure triggers a `resume-request` for that chunk rather than
  silently accepting corrupted data (`receiver-engine.ts`).
- **Residual risk:** None for detection. A very unlucky partner failing repeatedly (network
  actively corrupting data on every retry) will surface a fatal error after
  `MAX_CHUNK_RETRIES` (3) rather than retry forever.

### Brute-force session guessing
- **Impact:** Guessing a valid, still-open session id.
- **Mitigation:** 128 bits of randomness makes brute force computationally infeasible
  within a session's short TTL. The signaling server also rate-limits join/create requests
  per IP (`apps/signaling/src/rate-limiter.ts`).
- **Residual risk:** None beyond the inherent tradeoff of any random-token scheme; TTLs
  are kept short specifically to bound the guessing window.

### QR interception (someone else sees/photographs the QR)
- **Impact:** Anyone who can see the sender's screen can potentially scan the QR
  sequence too.
- **Mitigation:** The signaling server enforces exactly two participants; a second scanner
  attempting to join after the legitimate receiver is rejected. If the second scanner joins
  *before* the legitimate receiver, they occupy the slot and the legitimate receiver is
  rejected instead — visibly, so the sender/receiver can notice and cancel/regenerate the
  session.
- **Residual risk:** Fundamental to any visual out-of-band exchange: if someone else can
  see your screen, treat the session as compromised and cancel it. This is a physical/
  operational-security concern the software cannot fully solve, and is inherent to any
  "scan a code" pairing mechanism (also true of similar mechanisms in other products).

### Device impersonation
- **Impact:** A device claims to be a previously-paired device it isn't.
- **Mitigation:** Device identities are locally generated random IDs, not attested
  identities — Tarang does not claim strong device attestation. Each transfer's
  security rests entirely on the fresh ECDH exchange for that session, not on a
  long-lived device identity, so impersonating a device label has no cryptographic effect.
- **Residual risk:** The "paired devices" list (Devices screen) is a convenience/audit
  trail based on self-reported labels, not a security boundary. Do not rely on the
  displayed device name alone to establish trust in an unfamiliar transfer.

### XSS
- **Impact:** Injected script in the web app could exfiltrate data or hijack a session.
- **Mitigation:** React's default JSX escaping is used throughout — no `dangerouslySetInnerHTML`
  is used anywhere in the codebase. File names and other user-controlled strings are only
  ever rendered as text content, never as HTML or in attribute contexts that could execute
  script. Signaling server responses set `X-Content-Type-Options: nosniff`.
- **Residual risk:** Standard supply-chain risk of any dependency (see §9).

### CSRF
- **Impact:** A malicious page tricks a user's browser into making unwanted requests to
  the signaling server.
- **Mitigation:** The signaling server's REST endpoints are idempotent/informational
  (session creation requires a client-generated random session id; there is no
  cookie-based session or ambient authority a CSRF attack could ride on). The
  WebSocket protocol requires an explicit `create-session`/`join-session` message with a
  specific session id the attacker cannot predict.
- **Residual risk:** None significant given the absence of ambient/cookie auth.

### WebSocket abuse (flooding, malformed frames)
- **Impact:** Resource exhaustion or crash via a malicious/broken client.
- **Mitigation:** Per-IP and per-connection rate limiting (`TokenBucketRateLimiter`);
  malformed JSON or unrecognized message shapes are rejected with an `error` response
  rather than crashing the connection handler; sessions and rate-limit buckets are
  swept periodically to bound memory.
- **Residual risk:** A sufficiently large distributed flood is a general DoS concern for
  any public service; deploy behind a reverse proxy/CDN with its own rate limiting for
  production-scale exposure.

### Denial of service
- **Impact:** Preventing legitimate pairing/transfers.
- **Mitigation:** Rate limiting, session TTLs, and the two-participant cap all bound the
  blast radius of a single bad actor. Because file data never flows through the signaling
  server, a DoS against it cannot corrupt or leak in-flight file data — at worst it
  prevents *new* connections from being established.
- **Residual risk:** As with any network service, a sufficiently resourced attacker can
  degrade availability of the signaling server itself.

### Malicious TURN relay
- **Impact:** A TURN operator (whether run by you or a third party) relays your WebRTC
  traffic and could, in principle, attempt to inspect or tamper with it.
- **Mitigation:** WebRTC's DTLS-SRTP is end-to-end between the two peers even across a
  TURN relay — a TURN server forwards encrypted datagrams without terminating DTLS.
  Tarang's application-layer AES-256-GCM (§1) adds a second layer that a TURN
  operator cannot decrypt even if DTLS were somehow bypassed, since it never has the
  ECDH-derived key.
  The UI always discloses when a connection is relayed via the connection-kind indicator
  (`ConnectionStatus` — "Direct P2P" vs "Relay"), so this is never misrepresented to the user.
- **Residual risk:** A malicious TURN operator can perform traffic analysis (timing, volume)
  and can deny/degrade service, but cannot read file contents without the session's
  ECDH-derived key.

### Local browser compromise
- **Impact:** Malware or a malicious browser extension on either device with access to
  page memory, IndexedDB, or the filesystem.
- **Mitigation:** Out of scope for any in-browser application — a compromised endpoint can
  read data before encryption or after decryption regardless of transport security. No
  encryption key is persisted to `localStorage`; the ECDH private key exists only in
  memory (as a non-extractable `CryptoKey` where applicable) for the lifetime of the
  session and is discarded when the tab/session ends.
- **Residual risk:** Full endpoint compromise defeats essentially any client-side security
  model; keep your OS/browser updated and free of untrusted extensions.

## 4. Storage

IndexedDB (`apps/web/src/storage`) holds only: app settings, a random local device
identity, paired-device labels/timestamps, transfer history metadata (names, sizes,
status, timestamps — not file contents), and resumable-transfer checkpoints (a file
manifest plus the index of the last chunk verified for each file). No encryption key,
plaintext file content, or encrypted file content is ever written to IndexedDB or
`localStorage`.

Of the above, only the local device identity and resumable-transfer checkpoints are
strictly required for the app to function; app settings, transfer history, and
paired-device labels are gated behind `apps/web/src/utils/consent.ts`
(`isOptionalStorageAllowed`) and are cleared immediately if the user rejects them via
the first-visit consent banner or the in-app Cookie Policy (`/legal/cookies`) — see that
page, or `HOW_TO_USE.md`'s "Privacy, cookies, and legal" section, for the user-facing
behavior.

## 5. What "auto-accept" means for security

With **Auto-start transfers** on (default) and **Ask before receiving** off, a receiver
that completes the pairing handshake (mutual key confirmation succeeded) will begin
receiving files without an extra manual confirmation step. This is safe from a
confidentiality/integrity standpoint — the handshake already proved both sides hold the
matching session key — but it does mean the receiving device commits to accepting
whatever manifest the sender declares. Enable **Ask before receiving** if you want a
manual review step (sender label, transfer name, size, file count) before any bytes are
written to disk.

## 6. Deployment responsibilities

This repository ships a *reference* signaling server. Operators are responsible for:

- Serving it over **WSS** (TLS), not plain `ws://`, in any non-local deployment.
- Not logging request bodies at the reverse-proxy/load-balancer layer (the app's own
  logging already avoids sensitive content — see `apps/signaling/src/logger.ts`).
- Configuring their own TURN credentials if TURN fallback is desired; Tarang does
  not ship or endorse a specific TURN provider.

## 7. Known limitations (see also README "Limitations")

- No malware scanning of transferred file contents.
- No strong device attestation — device identity is a local, user-editable label.
- The in-memory fallback download path (browsers without the File System Access API)
  buffers the whole file in memory before triggering a download; very large files may be
  impractical there. See README "Browser compatibility."
- The signaling server keeps session state in-process memory; it does not currently
  support horizontal scaling across multiple instances (a single process is expected to
  be sufficient for the session volumes this design targets — see README for real-world
  usage guidance if this changes).

## 8. Notes on the SHA-256 file hash

Whole-file SHA-256 is computed incrementally, chunk-by-chunk, using `@noble/hashes` (a
minimal, widely-audited, dependency-free hash implementation), because the Web Crypto
API's `SubtleCrypto.digest()` has no incremental/streaming interface — it can only hash a
complete buffer in one call, which would require buffering an entire file in memory
before hashing, defeating the goal of handling arbitrarily large files. Key agreement
(ECDH) and bulk authenticated encryption (AES-256-GCM) still go through the native Web
Crypto API in every case; no custom encryption or key-agreement primitive is used
anywhere in this codebase.

## 9. Supply chain

Dependencies are kept deliberately minimal (see README "Dependencies and why"). Run
`npm audit` before deploying and keep dependencies current. This project does not vendor
or bundle any closed-source or unaudited cryptographic code.

## 10. Reporting a vulnerability

If you find a security issue in this codebase, please open a private security advisory
or issue on the repository rather than a public discussion, and include enough detail
(affected file/function, reproduction steps) to verify and fix it quickly.
