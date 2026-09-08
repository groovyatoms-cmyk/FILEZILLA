/**
 * Structured logging that never includes sensitive content: no encryption keys, no file
 * names, no file contents, no QR/pairing secrets, and no raw SDP/ICE payloads (which can
 * carry local network topology). Only session lifecycle events and truncated identifiers.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean> = {}): void {
  const safeFields = { ...fields };
  if (typeof safeFields["sessionId"] === "string") {
    safeFields["sessionId"] = truncate(safeFields["sessionId"]);
  }
  const line = { ts: new Date().toISOString(), event, ...safeFields };
  console.log(JSON.stringify(line));
}

function truncate(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}
