import type { DeviceIdentity } from "@securetransfer/shared";
import { isOptionalStorageAllowed } from "../utils/consent";
import { STORES, dbGet, dbGetAll, dbPut, dbDelete } from "./db";

const DEVICE_KEY = "this";

/** A coarse, non-identifying platform guess — never raw user-agent strings or hardware identifiers. */
function guessPlatformLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "This Device";
}

function randomDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await dbGet<DeviceIdentity>(STORES.device, DEVICE_KEY);
  if (existing) return existing;
  const identity: DeviceIdentity = {
    id: randomDeviceId(),
    label: guessPlatformLabel(),
    createdAt: Date.now(),
  };
  await dbPut(STORES.device, identity, DEVICE_KEY);
  return identity;
}

export async function renameDevice(label: string): Promise<DeviceIdentity> {
  const identity = await getOrCreateDeviceIdentity();
  const updated = { ...identity, label };
  await dbPut(STORES.device, updated, DEVICE_KEY);
  return updated;
}

export interface PairedDeviceRecord {
  id: string;
  label: string;
  lastConnectedAt: number;
}

export async function listPairedDevices(): Promise<PairedDeviceRecord[]> {
  return dbGetAll<PairedDeviceRecord>(STORES.pairedDevices);
}

export async function recordPairedDevice(device: PairedDeviceRecord): Promise<void> {
  if (!isOptionalStorageAllowed()) return;
  await dbPut(STORES.pairedDevices, device);
}

export async function removePairedDevice(id: string): Promise<void> {
  await dbDelete(STORES.pairedDevices, id);
}

/** Formats a device id for display without exposing it in full, per the "Device ID: A7F2••••92D1" pattern. */
export function formatDeviceIdForDisplay(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}••••${id.slice(-4)}`;
}
