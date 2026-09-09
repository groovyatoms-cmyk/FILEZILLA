import { STORES, dbClear } from "../storage/db";

export type ConsentChoice = "accepted" | "rejected";

const CONSENT_KEY = "securetransfer:storage-consent";
// Duplicated from hooks/useTheme.tsx's THEME_STORAGE_KEY rather than imported, to avoid a
// circular import between this module and the theme hook (which reads consent on write).
const THEME_KEY = "securetransfer:theme";

export function getStorageConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw === "accepted" || raw === "rejected") return raw;
  } catch {
    // localStorage unavailable (private mode, etc.) — treat as undecided
  }
  return null;
}

/**
 * Local storage for preferences (theme, settings, transfer history, remembered paired
 * devices) is written by default so the app works fully without an upfront prompt, and is
 * only turned off once the user explicitly rejects it here or on the Cookie Policy page.
 * None of it is ever sent to the signaling server or anywhere else — see that page for the
 * full breakdown, including what stays on regardless (device identity, in-progress
 * transfer resume state) because the app cannot function without it.
 */
export function isOptionalStorageAllowed(): boolean {
  return getStorageConsent() !== "rejected";
}

export function acceptStorageConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "accepted");
  } catch {
    // best-effort only
  }
}

export async function rejectStorageConsent(): Promise<void> {
  try {
    localStorage.setItem(CONSENT_KEY, "rejected");
    localStorage.removeItem(THEME_KEY);
  } catch {
    // best-effort only
  }
  await Promise.all([dbClear(STORES.settings), dbClear(STORES.history), dbClear(STORES.pairedDevices)]);
}
