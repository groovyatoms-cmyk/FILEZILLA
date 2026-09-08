/** Splits a File into fixed-size Blob chunks without ever materializing the whole file in memory. */
export function chunkCount(fileSize: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(fileSize / chunkSize));
}

export function getChunkBlob(file: File, chunkIndex: number, chunkSize: number): Blob {
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  return file.slice(start, end);
}
