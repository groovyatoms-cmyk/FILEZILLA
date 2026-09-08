import { DEFAULT_SETTINGS, type AppSettings } from "@securetransfer/shared";
import { STORES, dbGet, dbPut } from "./db";

const SETTINGS_KEY = "app";

export async function loadSettings(): Promise<AppSettings> {
  const stored = await dbGet<AppSettings>(STORES.settings, SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await dbPut(STORES.settings, settings, SETTINGS_KEY);
}
