/**
 * In-memory session registry for the signaling server. Deliberately not backed by a
 * database: sessions are short-lived (minutes), and persisting pairing metadata beyond
 * the process lifetime would only widen the server's exposure for no benefit — see
 * SECURITY.md, "Compromised signaling server."
 */

export type ParticipantRole = "creator" | "joiner";

export interface SessionRecord {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  participants: Map<string, ParticipantRole>;
}

export type JoinResult = "joined" | "session-full" | "session-not-found" | "session-expired";

const MAX_PARTICIPANTS = 2;

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  create(sessionId: string, connectionId: string, ttlMs: number, now = Date.now()): SessionRecord | "already-exists" {
    if (this.sessions.has(sessionId)) return "already-exists";
    const record: SessionRecord = {
      sessionId,
      createdAt: now,
      expiresAt: now + ttlMs,
      participants: new Map([[connectionId, "creator"]]),
    };
    this.sessions.set(sessionId, record);
    return record;
  }

  join(sessionId: string, connectionId: string, now = Date.now()): JoinResult {
    const record = this.sessions.get(sessionId);
    if (!record) return "session-not-found";
    if (now >= record.expiresAt) {
      this.sessions.delete(sessionId);
      return "session-expired";
    }
    if (record.participants.has(connectionId)) return "joined";
    if (record.participants.size >= MAX_PARTICIPANTS) return "session-full";
    record.participants.set(connectionId, "joiner");
    return "joined";
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  /** Other participant connection ids in the session, excluding `connectionId`. */
  peersOf(sessionId: string, connectionId: string): string[] {
    const record = this.sessions.get(sessionId);
    if (!record) return [];
    return Array.from(record.participants.keys()).filter((id) => id !== connectionId);
  }

  leave(sessionId: string, connectionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.participants.delete(connectionId);
    if (record.participants.size === 0) {
      this.sessions.delete(sessionId);
    }
  }

  /** Removes every connection id from any session it belongs to (e.g. on socket close). Returns affected session ids. */
  leaveAll(connectionId: string): string[] {
    const affected: string[] = [];
    for (const [sessionId, record] of this.sessions) {
      if (record.participants.delete(connectionId)) {
        affected.push(sessionId);
        if (record.participants.size === 0) this.sessions.delete(sessionId);
      }
    }
    return affected;
  }

  /** Sweeps and removes expired sessions. Returns the ids removed, each with the connection ids that were still in it. */
  sweepExpired(now = Date.now()): Array<{ sessionId: string; connectionIds: string[] }> {
    const removed: Array<{ sessionId: string; connectionIds: string[] }> = [];
    for (const [sessionId, record] of this.sessions) {
      if (now >= record.expiresAt) {
        removed.push({ sessionId, connectionIds: Array.from(record.participants.keys()) });
        this.sessions.delete(sessionId);
      }
    }
    return removed;
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }
}
