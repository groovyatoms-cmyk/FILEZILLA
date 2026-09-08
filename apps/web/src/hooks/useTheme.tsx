import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppSettings } from "@securetransfer/shared";

const THEME_STORAGE_KEY = "securetransfer:theme";
const DEFAULT_THEME: ThemePreference = "dark";

export type ThemePreference = AppSettings["theme"];

function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = preference === "dark" || (preference === "system" && systemDark);
  root.classList.toggle("dark", isDark);
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // ignore — falls back to the default below
  }
  return DEFAULT_THEME;
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Mount exactly once, at the app root, so the theme is applied to every page from first
 * paint — not just whichever page happens to read the setting. `index.html` also carries
 * an inline script that applies the same stored preference synchronously before React
 * even loads, so there is no flash of the wrong theme on refresh; this effect keeps it in
 * sync afterward and reacts to OS-level theme changes when the preference is "system".
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // best-effort only; theme still applies for this session
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
