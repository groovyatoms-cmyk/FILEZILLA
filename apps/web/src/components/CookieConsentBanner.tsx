import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Button } from "./ui/Button";
import { acceptStorageConsent, getStorageConsent, rejectStorageConsent } from "../utils/consent";

/**
 * Shown once, on first visit, until the user makes a choice. See the Cookie Policy page
 * (also linked from Settings) to change the choice afterward — suppressed there since that
 * page already has its own Accept/Reject controls; showing both would just be confusing.
 *
 * Rendered in normal document flow (between the header and the scrollable content in
 * AppLayout), not as a `position: fixed` overlay. A fixed banner previously overlapped the
 * app's own fixed chrome — the bottom tab bar on mobile, or the header's menu button once
 * moved to the top — leaving Accept/Reject unreachable on some screens. In-flow placement
 * can't occlude anything, on any screen size, without breakpoint-specific positioning.
 */
export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getStorageConsent() === null);
  }, []);

  if (!visible || pathname === "/legal/cookies") return null;

  return (
    <div
      role="dialog"
      aria-label={t("cookieBanner.title")}
      className="flex flex-col gap-3 border-b-2 border-ink bg-surface-raised px-4 py-3 animate-slide-up sm:flex-row sm:items-center sm:justify-between md:px-6"
    >
      <p className="text-sm text-ink">
        {t("cookieBanner.message")}{" "}
        <Link to="/legal/cookies" className="font-semibold underline underline-offset-2">
          {t("cookieBanner.learnMore")}
        </Link>
      </p>
      <div className="flex shrink-0 justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void rejectStorageConsent();
            setVisible(false);
          }}
        >
          {t("cookieBanner.reject")}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            acceptStorageConsent();
            setVisible(false);
          }}
        >
          {t("cookieBanner.accept")}
        </Button>
      </div>
    </div>
  );
}
