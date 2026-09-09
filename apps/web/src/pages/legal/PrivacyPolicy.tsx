import { Link } from "react-router-dom";
import { LegalLayout, LegalSection } from "./LegalLayout";

export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 2026">
      <LegalSection heading="1. Summary">
        <p>
          FILEZILLA v2 does not have user accounts, does not run analytics or advertising trackers, and does not
          upload your files or their contents to any server. File transfers happen directly between your device and
          the recipient's device (peer-to-peer), encrypted end-to-end. What follows is a precise, checkable breakdown
          of the small amount of data the app's signaling server does handle, and what stays on your device — see{" "}
          <a href="https://github.com/groovyatoms-cmyk/filezilla/blob/main/SECURITY.md" target="_blank" rel="noreferrer">
            SECURITY.md
          </a>{" "}
          for the full technical threat model this is drawn from.
        </p>
      </LegalSection>

      <LegalSection heading="2. What the signaling server sees">
        <p>The signaling server's only job is to help two devices find each other and set up a direct connection. It sees:</p>
        <ul>
          <li>A randomly generated session id (meaningless without the key material exchanged via QR code).</li>
          <li>Connection timing (when a session was created and joined).</li>
          <li>
            The raw WebRTC offer/answer/ICE messages it relays between the two devices, which contain network
            addresses and ports needed to set up the connection.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. What the signaling server never sees">
        <p>Because these are never sent to it, the signaling server cannot see:</p>
        <ul>
          <li>File names, file contents, or file sizes (beyond a coarse label/total-size summary visible only in the QR code itself).</li>
          <li>The AES encryption key, the ECDH private keys, or the key-confirmation values exchanged between devices.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Local, on-device storage">
        <p>
          The app stores a few things only in your browser, on your device — never on a server. This includes your
          theme and app preferences, a locally generated device label used during pairing, a list of previously
          paired devices, transfer history, and progress data for resuming an in-progress transfer. None of this
          leaves your device. See the <Link to="/legal/cookies">Cookie Policy</Link> for the full list and how to
          clear or opt out of the parts that aren't strictly required for the app to work.
        </p>
      </LegalSection>

      <LegalSection heading="5. Camera access">
        <p>
          When you scan a pairing QR code, the app requests camera access to decode the code locally, in your
          browser. Camera frames are processed on-device and are never uploaded, recorded, or stored — the app has
          no server-side component that could receive them.
        </p>
      </LegalSection>

      <LegalSection heading="6. Third parties">
        <p>
          The app does not embed analytics, advertising, or third-party tracking scripts. If a transfer cannot
          establish a direct peer-to-peer connection and TURN relay fallback is enabled in Settings, encrypted
          traffic (not plaintext) may pass through a TURN relay solely to forward packets — the relay cannot decrypt
          it.
        </p>
      </LegalSection>

      <LegalSection heading="7. Children's privacy">
        <p>
          The app is not directed at children and does not knowingly collect personal information from anyone,
          regardless of age, because it does not collect personal information at all in the ordinary sense — see
          above.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to this policy">
        <p>
          This policy may be updated as the app changes. Material changes will be reflected by an updated "Last
          updated" date at the top of this page.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
