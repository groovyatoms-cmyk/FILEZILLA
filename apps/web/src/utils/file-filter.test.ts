import { describe, expect, it } from "vitest";
import { filterAllowedFiles, isBlockedFile } from "./file-filter";

function makeFile(name: string, type = ""): File {
  return new File(["content"], name, { type });
}

describe("file-filter", () => {
  it("blocks common executable/installer formats by extension", () => {
    expect(isBlockedFile(makeFile("setup.exe"))).toBe(true);
    expect(isBlockedFile(makeFile("app.apk"))).toBe(true);
    expect(isBlockedFile(makeFile("installer.dmg"))).toBe(true);
    expect(isBlockedFile(makeFile("script.bat"))).toBe(true);
    expect(isBlockedFile(makeFile("package.deb"))).toBe(true);
  });

  it("blocks by MIME type even with a misleading extension", () => {
    expect(isBlockedFile(makeFile("photo.jpg", "application/x-msdownload"))).toBe(true);
  });

  it("allows ordinary document, media, and archive formats", () => {
    for (const name of ["report.pdf", "photo.jpg", "notes.txt", "archive.zip", "video.mp4", "song.mp3", "code.ts", "data.csv"]) {
      expect(isBlockedFile(makeFile(name))).toBe(false);
    }
  });

  it("is case-insensitive on extension", () => {
    expect(isBlockedFile(makeFile("SETUP.EXE"))).toBe(true);
  });

  it("partitions a mixed file list into allowed and blocked", () => {
    const files = [makeFile("doc.pdf"), makeFile("virus.exe"), makeFile("photo.png")];
    const { allowed, blocked } = filterAllowedFiles(files);
    expect(allowed.map((f) => f.name)).toEqual(["doc.pdf", "photo.png"]);
    expect(blocked.map((f) => f.name)).toEqual(["virus.exe"]);
  });
});
