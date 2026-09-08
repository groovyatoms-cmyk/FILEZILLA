/**
 * Destination for decrypted file bytes as they arrive. Prefers the File System Access API
 * (writes incrementally straight to disk, so memory use stays bounded regardless of file
 * size). Falls back to buffering in memory and triggering a browser download when that API
 * is unavailable (Safari, Firefox as of this writing) — see README "Browser compatibility"
 * for the memory implication on very large files in that fallback path.
 */
export interface FileSink {
  write(bytes: Uint8Array): Promise<void>;
  finalize(fileName: string): Promise<void>;
  abort(): void;
}

export class FileSystemAccessSink implements FileSink {
  private writable: FileSystemWritableFileStream | null = null;

  constructor(private readonly directoryHandle: FileSystemDirectoryHandle, private readonly relativePath: string) {}

  private async ensureOpen(): Promise<FileSystemWritableFileStream> {
    if (this.writable) return this.writable;
    const segments = this.relativePath.split("/").filter(Boolean);
    let dir = this.directoryHandle;
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1]!, { create: true });
    this.writable = await fileHandle.createWritable();
    return this.writable;
  }

  async write(bytes: Uint8Array): Promise<void> {
    const writable = await this.ensureOpen();
    // Cast needed: TS's DOM lib types this generically over `ArrayBuffer` while Uint8Array.buffer is
    // typed `ArrayBufferLike` (which also covers SharedArrayBuffer); these are never SharedArrayBuffers here.
    await writable.write(bytes as unknown as BufferSource);
  }

  async finalize(): Promise<void> {
    await this.writable?.close();
  }

  abort(): void {
    void this.writable?.abort();
  }
}

export class MemoryDownloadSink implements FileSink {
  private readonly parts: Uint8Array[] = [];

  async write(bytes: Uint8Array): Promise<void> {
    this.parts.push(bytes);
    await Promise.resolve();
  }

  async finalize(fileName: string): Promise<void> {
    const blob = new Blob(this.parts as BlobPart[]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    await Promise.resolve();
  }

  abort(): void {
    this.parts.length = 0;
  }
}
