# How to Use Tarang

A quick walkthrough of pairing two devices and sending files. For setup/development
instructions see [README.md](./README.md); for what's actually protected and how, see
[SECURITY.md](./SECURITY.md).

## Before you start

You need two devices (or two browser windows/tabs for local testing), each with:

- A modern browser (Chrome, Edge, or another Chromium-based browser gives the fullest
  experience, including direct-to-disk writes — see README §11 for details on other
  browsers).
- Camera access on the **receiving** device, to scan the pairing QR code.
- Both devices reachable by the signaling server you've configured (see README §5 for
  `VITE_SIGNALING_URL`).

## Sending a file

1. Open Tarang and choose **New Transfer** (or drop files straight onto the
   Dashboard).
2. Select the files or folder you want to send, then **Continue**.
   - Executable/installer file types (`.exe`, `.apk`, `.dmg`, `.msi`, and similar) are
     blocked automatically — you'll see a notice naming which files were skipped.
3. The app prepares your transfer: it indexes the files, generates integrity hashes, and
   creates an encryption session. This all happens on your device before anything is
   sent anywhere.
4. A QR code appears under **Scan to Connect**. If your files' pairing data doesn't fit
   in a single QR code, it automatically rotates through multiple parts (**PART 1 / N**);
   you can also step through them manually or toggle auto-rotate off.
5. On the **receiving** device, scan every part of that sequence (order doesn't matter).
6. Once both devices finish authenticating each other, the transfer starts automatically
   (unless the receiver has **Ask before receiving** turned on, in which case they'll see
   a summary to accept or decline first).
7. Watch progress on the **Transfer in Progress** screen: percentage, speed, ETA, current
   file, and whether the connection is direct peer-to-peer or going through a relay.
   You can **Pause**/**Resume** or **Cancel** at any time.
8. When it finishes, you'll see **Transfer Complete** with the file count, total size,
   and confirmation that integrity was verified.

A pairing session expires a few minutes after it's created (shown as a countdown on the
QR screen) — if it expires before the receiver finishes scanning, just start over.

## Receiving a file

1. Open Tarang and choose **Receive**.
2. Grant camera access when prompted.
3. Point your camera at the sender's QR code and hold it steady. Scanned parts are
   checked off live (✓ 1, ✓ 2, ○ 3, …) — you can scan them in any order, and re-scanning
   the same part again is harmless.
4. Once every part is in, the app reconstructs and verifies the pairing session, then
   authenticates the connection to the sender.
5. If **Ask before receiving** is on, you'll see the sender's name, the transfer's label,
   size, and file count, with the option to accept or decline before anything is
   downloaded.
6. The transfer then proceeds automatically, showing the same live progress view as the
   sender.
7. If your browser supports it, you'll be asked to pick a save location up front and
   files are written directly there as they arrive. Otherwise, each file is offered as a
   normal browser download once complete.
8. **Transfer Complete** confirms integrity was verified and shows where files were
   saved.

## If something goes wrong

- **"Unable to establish a secure connection"** — the other device likely went offline,
  or the pairing session expired. Retry with a fresh session.
- **Camera access denied** — check your browser's site permissions for the page and
  reload; camera access requires either `https://` or `localhost`.
- **Connection shows "Relay" instead of "Direct P2P"** — this happens automatically when
  a direct path between the two devices can't be found (e.g. restrictive networks/NATs).
  Files still transfer, and are still end-to-end encrypted; a TURN relay only forwards
  encrypted traffic (see [SECURITY.md](./SECURITY.md) for exactly what it can and can't
  see).
- **"Transfer Verification Failed"** — the app detected the received data didn't match
  what was sent and refused to save it silently. Use **Retry** — already-verified data is
  not re-sent.
- **Connection interrupted mid-transfer** — reconnect (rescan the same QR sequence if it
  hasn't expired, or have the sender regenerate one); the transfer resumes from the last
  verified chunk rather than starting over.

## Managing devices, history, and settings

- **Devices** shows this device's identity (a random, non-identifying label you can
  rename) and any devices you've paired with before. Only two devices can be in one
  active transfer session at a time.
- **History** lists past transfers with filters for sent/received/completed/failed.
- **Settings** covers transfer behavior (auto-start, chunk size, bandwidth limit),
  security (ask-before-receiving, session expiration, clearing history), network
  (prefer direct P2P, allow TURN fallback, connection timeout), appearance (light/
  dark/system theme, language), and a **Legal** section linking to the Terms of Use,
  Privacy Policy, and Cookie Policy.

On phone/tablet widths, all five sections are reachable from a menu opened by the
six-dot button next to the logo, in addition to New Transfer/Receive/Scan on the bottom
tab bar.

## Installing it as an app

On browsers that support it (Chromium-based desktop/Android, or Safari on iOS via Share
→ Add to Home Screen), Tarang can be installed and launches without browser
chrome, like a native app. This doesn't change what the app can do — it's still the same
in-browser, peer-to-peer transfer described above — it just gives it its own icon and
window.

## Privacy, cookies, and legal

The first time you open the app, a small banner asks whether it's okay to remember
things like your theme and transfer history in your browser's local storage — not
tracking cookies, just on-device preferences. **Reject** clears that data immediately
and the app keeps working normally; it just won't remember those preferences on your
next visit. You can change your mind at any time from the Cookie Policy page (linked
from Settings and the footer), which also explains exactly what's stored and why.

Settings → Privacy spells out exactly what Tarang does and doesn't do with your
data, and the footer links to the Terms of Use, Privacy Policy, and Cookie Policy pages.
In short: files are encrypted on your device before they ever leave it, the signaling
server never sees file contents or your encryption key, and pairing sessions expire
automatically. See [SECURITY.md](./SECURITY.md) for the full technical detail behind
every one of those statements.
