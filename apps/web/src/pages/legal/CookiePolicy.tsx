import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { acceptStorageConsent, getStorageConsent, rejectStorageConsent, type ConsentChoice } from "../../utils/consent";
import { LegalLayout, LegalSection } from "./LegalLayout";

function ConsentStatus({ choice }: { choice: ConsentChoice | null }) {
  if (choice === "accepted") return <Badge tone="success">Currently allowed</Badge>;
  if (choice === "rejected") return <Badge tone="danger">Currently rejected</Badge>;
  return <Badge tone="warning">Not yet decided</Badge>;
}

export function CookiePolicy() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  useEffect(() => {
    setChoice(getStorageConsent());
  }, []);

  const handleAccept = () => {
    acceptStorageConsent();
    setChoice("accepted");
    setSavedJustNow(true);
  };

  const handleReject = () => {
    void rejectStorageConsent().then(() => {
      setChoice("rejected");
      setSavedJustNow(true);
    });
  };

  return (
    <LegalLayout title="Cookie Policy" updated="September 2026">
      <LegalSection heading="Your current choice">
        <div className="flex flex-wrap items-center gap-3">
          <ConsentStatus choice={choice} />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleReject}>
              Reject
            </Button>
            <Button size="sm" onClick={handleAccept}>
              Accept
            </Button>
          </div>
        </div>
        {savedJustNow && (
          <p className="text-xs font-medium text-success">
            Saved. {choice === "rejected" ? "Preference storage has been cleared." : "Thanks!"}
          </p>
        )}
      </LegalSection>

      <LegalSection heading="1. FILEZILLA v2 does not use cookies">
        <p>
          The app sets no HTTP cookies at all. There is no server-side session, no login, and nothing to track you
          across sites. What it does use — and what the choice above controls — is your browser's own local storage
          (localStorage and IndexedDB), which stays on your device and is never transmitted anywhere.
        </p>
      </LegalSection>

      <LegalSection heading="2. Strictly necessary storage (always on)">
        <p>These are required for the app's core peer-to-peer transfer feature to work at all, so they aren't affected by the choice above:</p>
        <ul>
          <li>A randomly generated local device id and label, shown to the other device during pairing.</li>
          <li>
            Progress data for an in-progress, resumable transfer (which chunks have been verified) — needed so a
            transfer can resume after an accidental reload.
          </li>
          <li>Your choice on this page itself, so we don't ask again every visit.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Optional preference storage (controlled above)">
        <p>These make the app more convenient across visits, but the app works fine without them. Choosing "Reject" clears them immediately and stops writing new data to them:</p>
        <ul>
          <li>Your theme (light/dark/system) and other Settings preferences.</li>
          <li>Your transfer history (a local log of past sends/receives — file contents are never stored).</li>
          <li>A list of devices you've previously paired with, so they're easier to recognize next time.</li>
        </ul>
        <p>
          If you choose "Reject," the app keeps working normally for the current session — it just won't remember
          these across visits, and any existing local records for them are cleared right away.
        </p>
      </LegalSection>

      <LegalSection heading="4. Changing your mind">
        <p>
          You can come back to this page at any time (it's also linked from Settings) to switch between Accept and
          Reject. Switching to "Reject" clears the optional data described above; switching to "Accept" simply lets
          the app start remembering it again going forward.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
