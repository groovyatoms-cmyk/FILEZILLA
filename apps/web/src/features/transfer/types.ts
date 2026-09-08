import type { TransferStatus } from "@securetransfer/shared";

export interface TransferProgress {
  status: TransferStatus;
  bytesTransferred: number;
  totalBytes: number;
  currentFileName: string | null;
  filesCompleted: number;
  totalFiles: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  errorMessage?: string;
}

export type ProgressListener = (progress: TransferProgress) => void;
