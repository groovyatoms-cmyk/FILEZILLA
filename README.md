# SecureTransfer

A privacy-first, end-to-end encrypted peer-to-peer file transfer application. Pair two
devices by scanning a multi-part QR code, then transfer files directly between them —
**Scan. Connect. Transfer.**

SecureTransfer is not a cloud storage product. Files are chunked, encrypted on the
sender's device, sent over a direct WebRTC connection (falling back to a TURN relay only
when a direct path isn't possible), decrypted on the receiver's device, and verified
end-to-end. The signaling server that helps the two devices find each other never sees
file contents, file names beyond a short summary in the pairing QR, or encryption keys.

See [SECURITY.md](./SECURITY.md) for the full threat model and precise security claims,
[HOW_TO_USE.md](./HOW_TO_USE.md) for a walkthrough of the app itself, and
[CHANGELOG.md](./CHANGELOG.md) for release history.

## 1. Product overview

| | |
|---|---|
| **Primary flow** | Sender selects files → app hashes & prepares them → generates a multi-part QR pairing sequence → receiver scans it → devices authenticate via a key-confirmation handshake → an encrypted WebRTC DataChannel opens → transfer starts automatically (configurable) → integrity is verified → done. |
| **Architecture priorities** | P2P transfer, end-to-end encryption, minimal server trust, chunked/resumable transfer, integrity verification, secure pairing, privacy, responsiveness under large transfers. |
| **Explicitly not** | A cloud upload/storage service. No file ever needs to be stored server-side for the transfer to complete. |

## 2. Architecture

```
SENDER DEVICE                                          RECEIVER DEVICE
     |                                                        |
  Select files                                                |
     |                                                        |
  Hash (SHA-256, streamed) + build manifest                   |
     |                                                        |
  Generate ephemeral ECDH keypair + session id                |
     |                                                        |
  Encode pairing payload → split into QR fragments            |
     |                                                        |
  Display QR sequence  ───────────visual channel────────►  Scan QR sequence
     |                                                        |
     |                                          Reconstruct + validate payload
     |                                                        |
     └───────────────┐                          ┌─────────────┘
                      ▼                          ▼
              Both connect to the SIGNALING SERVER (session id only)
                      |                          |
                      └────── WebRTC offer/answer/ICE relay ──────┘
                      |                          |
              Direct P2P DataChannel opens (TURN relay only if direct fails)
                      |                          |
        Exchange receiver's ECDH public key, derive shared session key (HKDF)
                      |                          |
              Mutual key-confirmation (HMAC) — abort if mismatched
                      |                          |
     Send manifest ──────────────────────────►  Accept / decline (per Settings)
                      |                          |
     Chunk → encrypt (AES-256-GCM) → send  ───►  Receive → decrypt → verify chunk hash → write
                      |                          |
                      |                    Verify whole-file SHA-256
                      |                          |
                      └──── transfer-complete ───┘
```

The signaling server (`apps/signaling`) only ever relays the WebRTC offer/answer/ICE
messages and manages session lifecycle (create/join/expire, two-participant cap, rate
limiting). It never receives the pairing payload, the derived encryption key, or file
data — see [SECURITY.md §2](./SECURITY.md#2-what-the-signaling-server-can-and-cannot-see)
for the exact data-exposure statement.

## 3. Project structure

```
secure-transfer/
├── apps/
│   ├── web/                  Vite + React + TypeScript app
│   │   └── src/
│   │       ├── components/   Design-system + feature components (QR, device cards, ...)
│   │       ├── pages/        Dashboard, Send, Receive, Devices, History, Settings
│   │       ├── features/
│   │       │   ├── pairing/      Pairing state, sender/receiver session orchestration
│   │       │   ├── transfer/     Chunker, manifest builder, sender/receiver engines
│   │       │   └── webrtc/       Signaling client, RTCPeerConnection wrapper
│   │       ├── workers/      Crypto Web Worker (encrypt/decrypt/hash off the UI thread)
│   │       ├── storage/      IndexedDB (settings, device identity, history, resume state)
│   │       ├── i18n/         Multi-language UI strings (en, es, fr, de, ja)
│   │       └── hooks/, utils/, components/ui/
│   └── signaling/            Minimal Node.js + WebSocket signaling service
│       └── src/
├── packages/
│   ├── crypto/                Web Crypto wrappers: ECDH, HKDF, AES-256-GCM, SHA-256
│   ├── protocol/               Pairing payload schema, multipart QR protocol, wire frames
│   └── shared/                 Shared TypeScript types and defaults
├── README.md
├── SECURITY.md
├── CHANGELOG.md
└── HOW_TO_USE.md
```

`packages/*` are consumed directly as TypeScript source (via each package's
`package.json` `main`/`types` pointing at `src/index.ts`) by both the Vite dev server/
bundler and, for the signaling server, an esbuild bundle step — there is no separate
build step for the packages themselves.

## 4. Local development

Requirements: Node.js ≥ 18.18 (repo developed against Node 22), npm ≥ 10.

```bash
npm install               # installs all workspaces
npm run dev               # starts BOTH the signaling server (ws://localhost:8787) and the
                           # web app (http://localhost:5173) together, in one terminal
```

The web app needs the signaling server to be reachable for any Send/Receive pairing to
work — without it you'll see `ERR_CONNECTION_REFUSED` in the console and an "Unable to
establish a secure connection" screen in the app. `npm run dev` starts both together for
exactly this reason. To run them in separate terminals instead (e.g. for isolated
debugging), use `npm run server` and `npm run dev:web`.

Other scripts (run from the repo root, applied across all workspaces where applicable):

```bash
npm run build              # builds apps/web (static site) and apps/signaling (bundled server)
npm run test                # runs all unit/integration tests (vitest, all workspaces)
npm run lint                 # ESLint (apps/web)
npm run typecheck            # TypeScript project-wide, no emit
npm run test:e2e --workspace=apps/web   # Playwright browser tests (see §13)
```

To try a full two-device pairing locally: run the signaling server, run the web app,
open it in two browser windows/tabs (or two devices on the same network pointed at your
machine's LAN IP instead of `localhost`, since camera access and cross-device QR
scanning need two separate cameras/screens), pick **New Transfer** in one and **Receive**
in the other.

## 5. Environment setup

Copy the example env files and adjust as needed:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/signaling/.env.example apps/signaling/.env
```

| Variable | App | Purpose |
|---|---|---|
| `VITE_SIGNALING_URL` | web | WebSocket URL of the signaling server |
| `VITE_STUN_URLS` | web | Comma-separated STUN server URLs |
| `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | web | Optional TURN fallback server |
| `PORT` | signaling | Port the signaling server listens on |
| `SIGNALING_MAX_TTL_MS` | signaling | Hard cap on session TTL, regardless of client request |

Never commit a real `.env`/`.env.local` file; both are git-ignored.

## 6. Signaling server

`apps/signaling` is a small Node.js service built on the `ws` library plus Node's
built-in `http` module (no framework dependency). Responsibilities:

- `POST /session`, `GET /session/:id`, `DELETE /session/:id` — informational/lifecycle
  REST endpoints (create/inspect/revoke a session record).
- WebSocket messages `create-session` / `join-session` / `signal` / `leave-session` —
  the actual real-time path used for pairing and WebRTC signaling relay (the REST
  `join`/`signal` "endpoints" implied by a purely RESTful API design aren't real-time
  capable over plain HTTP, so those two operations are WebSocket-only in this
  implementation; see the code comments in `apps/signaling/src/server.ts`).
- Enforces a hard two-participant cap per session, session expiry (sweep every 30s),
  and per-IP/per-connection rate limiting.
- Logs only lifecycle events and truncated session ids — never SDP/ICE contents, file
  metadata, or keys (`apps/signaling/src/logger.ts`).

Run it standalone: `npm run server` (dev, via `tsx`) or `npm run build --workspace=apps/signaling && npm run start --workspace=apps/signaling` (production; bundles to a single `dist/server.js` via esbuild since Node cannot execute the TypeScript workspace packages directly at runtime).

## 7. WebRTC architecture

- One `RTCPeerConnection` per pairing session; the sender is always the WebRTC offerer,
  the receiver the answerer.
- A single ordered, reliable `RTCDataChannel` named `"transfer"` carries both JSON
  control frames (as text messages) and binary chunk payloads.
- STUN is used for NAT traversal by default; TURN is used only as a fallback (governed by
  the **Allow TURN fallback** setting) when a direct candidate pair can't be established.
- The UI's connection indicator reflects the *actual* selected ICE candidate pair type
  (via `RTCPeerConnection.getStats()`), so "Direct P2P" vs "Relay" is never a guess or a
  static claim — see `apps/web/src/features/webrtc/peer-connection.ts`.
- Backpressure is handled via `RTCDataChannel.bufferedAmount` / the
  `bufferedamountlow` event, so the sender never queues unbounded data into the channel
  buffer regardless of file size.

## 8. Encryption architecture

See [SECURITY.md §1](./SECURITY.md#1-what-is-protected-and-how) for the full breakdown.
In short: ephemeral ECDH (P-256) key exchange (public key carried via the QR sequence),
HKDF-SHA256 key derivation into a session AES-256-GCM key and a separate HMAC
key-confirmation key, per-chunk unique IVs (session-random salt + monotonic counter),
and AAD binding each ciphertext to its exact file+chunk position. All primitives are
native Web Crypto API calls — no custom cryptography.

## 9. QR pairing protocol

The pairing payload (session id, sender's device id/label, ECDH public key, IV salt,
transfer summary, expiry) is JSON-serialized and split into fixed-size fragments, each
carrying: protocol version, session id, its index/total, a hash of the *complete*
payload, a fragment-level checksum, and its base64url-encoded byte slice. The receiver
can scan fragments in any order, tolerates duplicate scans, rejects corrupted or
foreign-session fragments, and detects a QR sequence that was regenerated mid-scan
(same session id, different payload hash) rather than silently mixing generations. See
`packages/protocol/src/qr.ts` and its tests for the exact behavior under every failure
mode (missing/duplicate/reordered/corrupt fragments).

## 10. File transfer protocol

- **Chunk size:** configurable (1/2/4/8/16 MB), default **4 MB** — small enough to keep
  memory bounded and give fine-grained resume/backpressure granularity, large enough to
  amortize per-chunk framing and encryption overhead. See `packages/shared/src/index.ts`.
- **Streaming:** files are read via `Blob.slice()`/`arrayBuffer()` chunk-by-chunk; the
  whole file is never buffered in memory on the sending side, and (when the File System
  Access API is available) never buffered in memory on the receiving side either — bytes
  are written to disk as they're verified.
- **Integrity:** every chunk carries its own plaintext SHA-256 (checked immediately after
  decryption, before writing) and the manifest carries a whole-file SHA-256 (computed via
  an incremental hasher — see SECURITY.md §8 for why). A mismatch never results in a
  silently "completed" file — it surfaces as a verification-failed state with the
  expected/actual hashes shown, and a retry path.
- **Resume:** the receiver periodically acknowledges chunks; on reconnect, or when a
  chunk fails integrity/authentication, the receiver issues a `resume-request` naming the
  exact chunk index to resend, so already-verified chunks are never retransmitted.
- **Backpressure/concurrency:** the sender waits on DataChannel buffer drain before
  reading/encrypting the next chunk, keeping memory and channel buffering bounded even
  for 50 GB+ transfers.

## 11. Browser compatibility

| Feature | Behavior when unsupported |
|---|---|
| File System Access API (`showDirectoryPicker`, incremental file writes) | Falls back to buffering the file in memory and triggering a standard browser download when complete. This means very large files can be memory-intensive in this fallback path — Chromium-based desktop browsers currently offer the best experience for large transfers. |
| `getUserMedia` (camera) | The Receive screen shows a clear "camera access was denied" state with instructions; there is no way to scan a QR sequence without camera access. |
| WebRTC DataChannel | Required — there is no fallback transport. All evergreen browsers support it. |
| Web Workers | Required for off-main-thread crypto; supported everywhere WebRTC is. |

SecureTransfer cannot provide true OS-level background transfers, persistent
background camera access, or guaranteed large-file writes on browsers/platforms that
don't implement the File System Access API (notably Safari and Firefox as of this
writing) — these are browser platform limits, not something a web app can work around.
If a true desktop, OS-integrated experience (background transfers, no browser tab
required) is needed, the transfer engine and UI in `apps/web` are structured so they can
be packaged with **Tauri** (preferred for its smaller footprint) or Electron without
rewriting the encryption/transfer/pairing logic — that logic has no direct DOM
dependency beyond the Web Crypto, WebRTC, and File APIs, all of which Tauri's webview
also provides.

## 12. Security model & threat model

See [SECURITY.md](./SECURITY.md) — a full breakdown of what is protected, the exact data
the signaling server can and cannot see, and a threat-by-threat table (impact,
mitigation, residual risk) covering malicious QR codes, session hijacking, replay,
MITM, a compromised signaling server, malicious files, corrupted chunks, brute-force
session guessing, QR interception, device impersonation, XSS, CSRF, WebSocket abuse,
DoS, malicious TURN relays, and local browser compromise.

## 13. Testing

```bash
npm run test                                     # all unit/integration tests, every workspace
npm run test --workspace=packages/crypto          # ECDH/AES-GCM/SHA-256 correctness + tamper detection
npm run test --workspace=packages/protocol        # pairing payload validation, QR split/reconstruct
npm run test --workspace=apps/signaling            # session store (2-device cap, expiry), rate limiter
npm run test --workspace=apps/web                  # utils, chunker, a component test, a pairing/QR integration test
npm run test:e2e --workspace=apps/web              # Playwright browser tests (auto-starts the dev server)
```

If Playwright can't find your Chromium install in a locked-down/sandboxed environment, set
`PLAYWRIGHT_CHROMIUM_PATH` to the binary's path before running `test:e2e`.

Test coverage specifically includes the required failure-mode matrix: missing QR
fragments, duplicate fragments, reordered fragments, invalid checksums, a regenerated QR
sequence, expired sessions, a mismatched-key confirmation handshake, and a two-device
session cap. Full two-device, camera-driven, live WebRTC transfer is inherently hard to
capture in an automated test (it needs two real cameras/screens); the protocol, crypto,
and session-management logic that flow underpins it are covered directly instead, and the
UI has been manually verified end-to-end against a running signaling server (file
selection → hashing → QR generation renders correctly; connection-error states render
correctly when signaling is unreachable).

## 14. Deployment

**Web app:** static build (`npm run build --workspace=apps/web` → `apps/web/dist`),
deployable to any static host/CDN. Set `VITE_SIGNALING_URL` (and TURN vars, if used) at
build time.

**Signaling server:** `npm run build --workspace=apps/signaling` produces a single
bundled `dist/server.js` (via esbuild; only the `ws` runtime dependency stays external).
Run behind a reverse proxy terminating **WSS/HTTPS** — see
[SECURITY.md §6](./SECURITY.md#6-deployment-responsibilities) for operator
responsibilities (TLS, not logging sensitive proxy-layer data, TURN credential
management).

Recommended secure headers (already partially set by the server itself —
`X-Content-Type-Options: nosniff`, `Cache-Control: no-store` on API responses): terminate
TLS at the proxy, set `Strict-Transport-Security`, and avoid caching any `/session/*`
response.

## 15. Limitations

- No malware scanning of file contents (a defined list of executable/installer formats
  is blocked outright — see `apps/web/src/utils/file-filter.ts` — but this is not a
  substitute for scanning).
- No strong device attestation; "paired devices" are a local, editable-label convenience
  list, not a security boundary.
- The signaling server holds session state in a single process's memory (no built-in
  horizontal scaling/shared session store across instances).
- The in-memory download fallback (browsers without the File System Access API) is
  memory-bound by file size.
- Not every UI string in every supported language has been translated in this initial
  pass (English, Spanish, French, German, and Japanese are wired up via `i18next`, with
  full navigation/dashboard/send/receive/transfer/settings coverage); the i18n
  infrastructure supports adding remaining strings incrementally.
- True background transfer (continuing while the browser tab/device is backgrounded) is
  subject to normal browser tab lifecycle limits; see §11.

## 16. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Console shows `WebSocket connection to 'ws://localhost:8787/' failed: ERR_CONNECTION_REFUSED`, or the app shows "Unable to establish a secure connection" right after generating a QR | The signaling server isn't running, or `VITE_SIGNALING_URL` doesn't point at it. Use `npm run dev` (starts both together) rather than only `npm run dev:web`, or start it on its own with `npm run server`. |
| Camera screen shows "camera access was denied" | Grant camera permission in the browser's site settings and reload; HTTPS (or `localhost`) is required for camera access in all browsers. |
| Transfer stays on "Relay" instead of "Direct P2P" | Expected on restrictive NATs/networks; if no TURN server is configured (`VITE_TURN_URL` unset) and a direct path can't be found, the transfer will fail to connect at all rather than silently using a relay that doesn't exist — configure a TURN server for reliable connectivity across arbitrary networks. |
| Large received file didn't prompt a save location | Your browser lacks the File System Access API; the file is buffered and offered as a normal browser download instead — see §11. |
| "Executable/installer files aren't allowed for transfer" | Intentional — see `apps/web/src/utils/file-filter.ts` and SECURITY.md's "Malicious files" section. |

## Dependencies and why

Every runtime dependency exists to fill a gap the Web platform doesn't cover natively:

- `react`, `react-dom`, `react-router-dom` — UI and routing.
- `i18next`, `react-i18next` — multi-language UI support.
- `qrcode` — QR code rendering (generation).
- `jsqr` — QR code decoding from camera frames (small, pure-JS, no native deps).
- `lucide-react` — consistent icon set for the design system.
- `@noble/hashes` — incremental SHA-256, filling the one gap in the native
  `SubtleCrypto` API (no streaming digest) — see SECURITY.md §8. Everything else
  cryptographic (ECDH, HKDF, AES-256-GCM) uses the native Web Crypto API directly.
- `ws` (signaling server) — WebSocket server implementation for Node.
- `esbuild` (signaling server, dev-only) — bundles the signaling server's workspace
  package imports into a single runnable file for production (Node cannot resolve
  TypeScript-source workspace packages at runtime on its own).

## License

See [LICENSE](./LICENSE).
