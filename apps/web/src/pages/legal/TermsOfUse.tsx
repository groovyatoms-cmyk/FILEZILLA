import { Link } from "react-router-dom";
import { LegalLayout, LegalSection } from "./LegalLayout";

export function TermsOfUse() {
  return (
    <LegalLayout title="Terms of Use" updated="September 2026">
      <LegalSection heading="1. What FILEZILLA v2 is">
        <p>
          FILEZILLA v2 ("the app") is a client-side, peer-to-peer file transfer tool. It runs entirely in your
          browser: files are encrypted on the sending device and decrypted on the receiving device, and are
          transferred directly between the two devices over a WebRTC connection. A small signaling server helps two
          devices find each other and exchange connection details, but never receives file contents, file names, or
          encryption keys — see the <Link to="/legal/privacy">Privacy Policy</Link> for exactly what it does see.
        </p>
      </LegalSection>

      <LegalSection heading="2. Acceptance of these terms">
        <p>
          By using the app, you agree to these Terms of Use. If you do not agree, do not use the app. These terms
          apply whether you are sending or receiving files.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <ul>
          <li>You will not use the app to send content you do not have the right to send.</li>
          <li>You will not use the app to distribute malware, or to circumvent the app's own safeguards.</li>
          <li>
            You are solely responsible for the files you send and receive, and for verifying the identity of the
            person on the other end of a pairing session before transferring anything sensitive.
          </li>
        </ul>
        <p>
          The app blocks a defined list of executable and installer file types at the sender's side (see
          `apps/web/src/utils/file-filter.ts` in the project source) as a defense-in-depth measure. This is not a
          content-moderation system and does not guarantee a file is safe — always verify files from people you
          don't fully trust before opening them.
        </p>
      </LegalSection>

      <LegalSection heading="4. No accounts, no guarantee of availability">
        <p>
          The app does not require an account and does not authenticate who you are. Pairing sessions are temporary
          and expire automatically. The signaling server that helps establish a connection is provided on a
          best-effort basis and may be unavailable, rate-limited, or discontinued at any time; if you need guaranteed
          availability, the project is open source and the signaling server can be self-hosted.
        </p>
      </LegalSection>

      <LegalSection heading="5. No warranty">
        <p>
          The app is provided "as is" and "as available," without warranties of any kind, express or implied,
          including but not limited to fitness for a particular purpose, non-infringement, or that transfers will be
          uninterrupted, error-free, or successful. Encryption and integrity checks are described precisely in the
          project's SECURITY.md, including their limits — no software can guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="6. Limitation of liability">
        <p>
          To the maximum extent permitted by law, the developers of this app are not liable for any indirect,
          incidental, or consequential damages arising from your use of the app, including lost files, failed
          transfers, or exposure resulting from sending files to the wrong recipient or an untrusted device.
        </p>
      </LegalSection>

      <LegalSection heading="7. Changes to these terms">
        <p>
          These terms may be updated from time to time. Material changes will be reflected by an updated "Last
          updated" date at the top of this page. Continuing to use the app after a change means you accept the
          revised terms.
        </p>
      </LegalSection>

      <LegalSection heading="8. Related documents">
        <p>
          See the <Link to="/legal/privacy">Privacy Policy</Link> for what data is (and is not) collected, and the{" "}
          <Link to="/legal/cookies">Cookie Policy</Link> for exactly what is stored on your device and how to control
          it.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
