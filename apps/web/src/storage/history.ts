import type { TransferHistoryEntry } from "@securetransfer/shared";
import { isOptionalStorageAllowed } from "../utils/consent";
import { STORES, dbClear, dbGetAll, dbPut } from "./db";

export async function listHistory(): Promise<TransferHistoryEntry[]> {
  const entries = await dbGetAll<TransferHistoryEntry>(STORES.history);
  return entries.sort((a, b) => b.startedAt - a.startedAt);
}

export async function upsertHistoryEntry(entry: TransferHistoryEntry): Promise<void> {
  if (!isOptionalStorageAllowed()) return;
  await dbPut(STORES.history, entry);
}

export async function clearHistory(): Promise<void> {
  await dbClear(STORES.history);
}
