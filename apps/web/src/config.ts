/** Runtime configuration, sourced from Vite env vars. See .env.example for the full list. */

function parseStunUrls(raw: string | undefined): string[] {
  if (!raw) return ["stun:stun.l.google.com:19302"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  signalingUrl: import.meta.env["VITE_SIGNALING_URL"] ?? "ws://localhost:8787",
  stunUrls: parseStunUrls(import.meta.env["VITE_STUN_URLS"]),
  turnUrl: import.meta.env["VITE_TURN_URL"] as string | undefined,
  turnUsername: import.meta.env["VITE_TURN_USERNAME"] as string | undefined,
  turnCredential: import.meta.env["VITE_TURN_CREDENTIAL"] as string | undefined,
};

export function buildIceServers(allowTurnFallback: boolean): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: config.stunUrls }];
  if (allowTurnFallback && config.turnUrl) {
    servers.push({
      urls: config.turnUrl,
      username: config.turnUsername,
      credential: config.turnCredential,
    });
  }
  return servers;
}
