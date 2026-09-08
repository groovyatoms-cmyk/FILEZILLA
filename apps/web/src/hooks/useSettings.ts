import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "@securetransfer/shared";
import { loadSettings, saveSettings } from "../storage/settings";

export function useSettings(): { settings: AppSettings; updateSettings: (patch: Partial<AppSettings>) => void; loaded: boolean } {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings, loaded };
}
