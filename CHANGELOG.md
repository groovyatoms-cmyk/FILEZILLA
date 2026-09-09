# Changelog

All notable changes to Tarang are documented in this file.

## [Unreleased] — UI redesign, reliability fixes, PWA support, legal/consent

### Added
- Mobile/tablet navigation: the sidebar becomes a slide-in drawer opened from a six-dot
  menu button next to the logo, carrying the full nav (including Devices/History/
  Settings, which the bottom tab bar has no room for). Closes on backdrop click or on
  navigating (`apps/web/src/components/Sidebar.tsx`).
- PWA installability: web app manifest, a best-effort stale-while-revalidate service
  worker (excludes `/session` and cross-origin requests), generated icons (192/512/
  maskable/apple-touch), and supporting meta tags — the app can be added to the home
  screen/app list on supporting browsers and launches without browser chrome.
- Legal pages: Terms of Use, Privacy Policy, and Cookie Policy
  (`apps/web/src/pages/legal/`), linked from the footer on every page and a "Legal"
  section in Settings.
- A first-visit cookie/local-storage consent banner (Accept/Reject). Reject immediately
  clears and stops writing non-essential local data (theme, settings, transfer history,
  remembered paired devices) via `utils/consent.ts`, while strictly-necessary data
  (device identity, in-progress transfer resume state) is unaffected either way.
- A Receive card on the Dashboard, presenting Send and Receive as equal, side-by-side
  entry points instead of Send-only.
- `apps/web/public/_redirects` for Netlify (and equivalent guidance in README for other
  static hosts) so client-side routes resolve on a hard reload or a direct link, not just
  when navigated to from within the app.
- A single `npm run dev` now starts the signaling server and the web app together (via
  `concurrently`); `npm run dev:web` and `npm run server` remain available standalone.

### Changed
- Rebranded the app header/title from "SecureTransfer" to "FILEZILLA v2"; comic-style
  visual redesign using the Ink Black / Prussian Blue / Oxford Navy / School Bus Yellow /
  Gold palette and Poppins throughout, plus a footer credit.
- Renamed again, from "FILEZILLA v2" to **Tarang** (Hindi for "wave" — a nod to the
  wireless connection carrying the transfer, and to the app's roots) — "FILEZILLA v2"
  was too close to FileZilla, an established, unrelated FTP client. Updated everywhere
  the name is user-visible: page title, PWA manifest, all five locales' `app.name`, and
  every doc. Internal `@securetransfer/*` package names are unchanged.
- Default theme changed to dark; Settings' toggle switch visuals were corrected.
- Widened the Settings dropdown ranges for chunk size, parallel chunks, and bandwidth
  limit.
- Redesigned the Send, Receive, and Devices screens; Receive now lets the user choose
  their own save location/folder instead of always falling back to a browser download.
- The QR scanner's corner-bracket guide is now a true square (sized off the shorter
  side of the camera preview) instead of stretching to the video's 16:9 aspect ratio.
- Mobile polish: safe-area insets for notched devices, larger touch targets, and a
  footer layout fix (previously could float mid-page on short-content screens).

### Fixed
- **QR pairing scan reliability**, root-caused to two separate bugs:
  `DEFAULT_MAX_FRAGMENT_BYTES` was 700, producing a version-23 (109×109 module) QR
  that's too dense to reliably scan at typical on-screen sizes — reduced to 150 bytes
  (~version 13).
  Separately, the scanner used `facingMode: "environment"` as a hard constraint, which
  throws on any device without a rear camera and was misreported as "permission denied"
  — replaced with a soft constraint and proper error classification (denied/not-found/
  in-use/unsupported), each with distinct, localized messaging.
- Theme previously only applied when the Settings page had been visited, and flashed
  the wrong theme briefly on every reload; both are fixed via a `ThemeProvider` mounted
  once at the app root plus a blocking inline script in `index.html`.
- The cookie consent banner is now rendered in normal document flow (between the header
  and the scrollable content) instead of as a `position: fixed` overlay. Fixed
  positioning had it overlapping the app's own fixed bottom tab bar on mobile — and, in
  an earlier attempt to fix that, the header's menu button instead — leaving one of its
  own buttons unreachable depending on screen size.

### Testing
- 61 unit/integration tests across all workspaces (up from 55), including a rasterize +
  simulated-camera-blur + jsQR-decode round trip proving the QR fragment-size fix
  actually survives being scanned (and that the old default didn't), and coverage for
  the new consent-storage gating logic.
- 13 Playwright end-to-end tests covering navigation, theme, the executable-file guard,
  the mobile navigation drawer, and the cookie consent/legal-pages flow (including a
  mobile-viewport check that the banner never overlaps the app's own fixed chrome).

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
