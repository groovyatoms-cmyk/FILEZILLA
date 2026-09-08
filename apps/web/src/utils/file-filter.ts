/**
 * Blocks executable/installer file formats from being sent. SecureTransfer is a file
 * transfer tool, not a software distribution channel — allowing installers/executables
 * through would make it a convenient vector for delivering malware to a paired device,
 * and disguising that risk behind "it's just a file transfer app" would be misleading.
 * Every other file type/format is allowed.
 */
const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "msi",
  "msix",
  "msp",
  "bat",
  "cmd",
  "com",
  "scr",
  "ps1",
  "vbs",
  "vbe",
  "wsf",
  "jar",
  "apk",
  "aab",
  "ipa",
  "dmg",
  "pkg",
  "app",
  "deb",
  "rpm",
  "appimage",
  "run",
  "bin",
  "gadget",
  "action",
  "command",
]);

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
  "application/x-apple-diskimage",
  "application/vnd.android.package-archive",
  "application/x-debian-package",
  "application/x-redhat-package-manager",
]);

export interface FileFilterResult {
  allowed: File[];
  blocked: File[];
}

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}

export function isBlockedFile(file: File): boolean {
  return BLOCKED_EXTENSIONS.has(extensionOf(file.name)) || BLOCKED_MIME_TYPES.has(file.type);
}

export function filterAllowedFiles(files: File[]): FileFilterResult {
  const allowed: File[] = [];
  const blocked: File[] = [];
  for (const file of files) {
    (isBlockedFile(file) ? blocked : allowed).push(file);
  }
  return { allowed, blocked };
}
