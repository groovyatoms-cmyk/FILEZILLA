import type { TransferManifest } from "@securetransfer/shared";
import { STORES, dbDelete, dbGet, dbGetAll, dbPut } from "./db";

/**
 * Persists just enough to resume an interrupted transfer: the manifest and, per file, the
 * index of the last chunk that was verified end-to-end (decrypted, hash-checked, and
 * durably written). Never the chunk bytes themselves — those are already on disk (sender)
 * or written out via the File System Access API / final Blob (receiver) by the time they
 * are marked verified.
 */
export interface ResumeState {
  transferId: string;
  sessionId: string;
  manifest: TransferManifest;
  /** fileId -> next chunk index to send/expect (0 means nothing verified yet) */
  verifiedChunkIndex: Record<string, number>;
  updatedAt: number;
}

export async function loadResumeState(transferId: string): Promise<ResumeState | undefined> {
  return dbGet<ResumeState>(STORES.resumeState, transferId);
}

export async function saveResumeState(state: ResumeState): Promise<void> {
  await dbPut(STORES.resumeState, { ...state, updatedAt: Date.now() });
}

export async function deleteResumeState(transferId: string): Promise<void> {
  await dbDelete(STORES.resumeState, transferId);
}

export async function listResumeStates(): Promise<ResumeState[]> {
  return dbGetAll<ResumeState>(STORES.resumeState);
}
