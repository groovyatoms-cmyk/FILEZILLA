import { describe, expect, it } from "vitest";
import { chunkCount, getChunkBlob } from "./chunker";

describe("chunkCount", () => {
  it("computes an exact number of chunks", () => {
    expect(chunkCount(1024, 256)).toBe(4);
  });

  it("rounds up for a partial final chunk", () => {
    expect(chunkCount(1000, 256)).toBe(4);
  });

  it("returns at least 1 for an empty file", () => {
    expect(chunkCount(0, 256)).toBe(1);
  });
});

// jsdom's Blob implementation doesn't expose arrayBuffer()/text()/stream() (only slice/size/type),
// so read test blobs via FileReader, which jsdom does implement correctly.
async function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("getChunkBlob", () => {
  it("slices a file into the expected byte ranges", async () => {
    const bytes = new Uint8Array(10).map((_, i) => i);
    const file = new File([bytes], "test.bin");
    expect(await readBlob(getChunkBlob(file, 0, 4))).toEqual(new Uint8Array([0, 1, 2, 3]));
    expect(await readBlob(getChunkBlob(file, 1, 4))).toEqual(new Uint8Array([4, 5, 6, 7]));
    expect(await readBlob(getChunkBlob(file, 2, 4))).toEqual(new Uint8Array([8, 9]));
  });
});
