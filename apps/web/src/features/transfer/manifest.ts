import { StreamingSha256, toHex } from "@securetransfer/crypto";
import type { FileManifestEntry, TransferManifest } from "@securetransfer/shared";
import { chunkCount, getChunkBlob } from "./chunker";

export interface SelectedFile {
  file: File;
  relativePath: string;
}

/** Reads every selected file once, chunk-by-chunk, to compute its whole-file SHA-256 without buffering it in memory. */
export async function buildManifest(
  transferId: string,
  sessionId: string,
  label: string,
  selected: SelectedFile[],
  chunkSize: number,
  onFileHashed?: (fileName: string, fileIndex: number, totalFiles: number) => void,
): Promise<TransferManifest> {
  const files: FileManifestEntry[] = [];
  let totalSize = 0;

  for (let index = 0; index < selected.length; index++) {
    const { file, relativePath } = selected[index]!;
    const hasher = new StreamingSha256();
    const count = chunkCount(file.size, chunkSize);
    for (let c = 0; c < count; c++) {
      const blob = getChunkBlob(file, c, chunkSize);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      hasher.update(bytes);
    }
    files.push({
      fileId: `f${index}-${toHex(crypto.getRandomValues(new Uint8Array(4)))}`,
      relativePath,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      chunkSize,
      chunkCount: count,
      sha256: hasher.digestHex(),
    });
    totalSize += file.size;
    onFileHashed?.(file.name, index + 1, selected.length);
  }

  return { transferId, sessionId, label, totalSize, files, createdAt: Date.now() };
}
