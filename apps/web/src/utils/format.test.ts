import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatSpeed } from "./format";

describe("formatBytes", () => {
  it("formats bytes across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(3.42 * 1024 * 1024 * 1024)).toBe("3.42 GB");
  });
});

describe("formatSpeed", () => {
  it("appends /s", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.00 MB/s");
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("handles invalid input", () => {
    expect(formatDuration(-1)).toBe("--:--");
    expect(formatDuration(NaN)).toBe("--:--");
  });
});
