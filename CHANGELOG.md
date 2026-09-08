# Changelog

All notable changes to SecureTransfer are documented in this file.

## [0.1.0] — Initial release

### Added

**Security & protocol**
- `packages/crypto`: ECDH (P-256) key agreement, HKDF-SHA256 key derivation, AES-256-GCM
  authenticated chunk encryption with unique per-chunk IVs, HMAC-based key confirmation,
  native `SubtleCrypto` SHA-256 hashing plus an incremental SHA-256 (`@noble/hashes`) for
  whole-file hashing without buffering entire files.
- `packages/protocol`: pairing payload schema and validation (with expiry), the
  multipart QR pairing protocol (split/reconstruct, out-of-order and duplicate-fragment
  handling, corruption and cross-session/cross-generation detection), signaling message
  types, and DataChannel wire-frame definitions.
- `packages/shared`: shared TypeScript types and default app settings.

**Signaling server** (`apps/signaling`)
- Minimal Node.js + WebSocket service: session create/join/expire, a hard two-participant
  cap per session, per-IP/per-connection rate limiting, and REST session-lifecycle
  endpoints. Logs only lifecycle events and truncated ids — never keys, file data, or SDP.

**Web app** (`apps/web`)
- Pairing flow: sender-side multipart QR generation with auto-rotate/manual controls and
  a live session-expiry countdown; receiver-side camera QR scanning with per-fragment
  progress and error feedback.
- WebRTC transport: offer/answer/ICE relay via the signaling client, a single reliable
  DataChannel, live connection diagnostics (Direct P2P vs. Relay, RTT, throughput) via
  `RTCPeerConnection.getStats()`.
- Chunked, resumable, integrity-verified transfer engine: streaming chunk read/encrypt/
  send on the sender, chunk-level decrypt/verify/write plus whole-file verification on
  the receiver, DataChannel backpressure handling, and a Web Worker offloading
  encryption/decryption/hashing from the UI thread.
- File System Access API integration for direct-to-disk writes on the receiving side,
  with an in-memory/download fallback for browsers that don't support it.
- Screens: Dashboard, Send, Receive, Devices, History, Settings, plus shared active-
  transfer, completion, and error-state views.
- A defined block-list for executable/installer file formats (`.exe`, `.apk`, `.dmg`,
  `.msi`, `.deb`, `.rpm`, and similar) rejected at file-selection time.
- Design system: comic-inspired visual language (bold ink outlines, hard offset shadows,
  Poppins typography) with full light/dark theme support.
- Multi-language UI (English, Spanish, French, German, Japanese) via `i18next`.
- Local-only storage (IndexedDB): app settings, device identity, paired-device list,
  transfer history, and resumable-transfer checkpoints — no plaintext file content or
  encryption keys ever persisted.

**Documentation**
- `README.md`, `SECURITY.md` (full threat model), `HOW_TO_USE.md`, and per-app
  `.env.example` files.

**Testing**
- 55 automated tests across all workspaces: crypto correctness and tamper detection, QR
  protocol edge cases (missing/duplicate/reordered/corrupt/regenerated fragments),
  pairing payload validation and expiry, signaling session-store and rate-limiter
  behavior, and web app utilities/components.
