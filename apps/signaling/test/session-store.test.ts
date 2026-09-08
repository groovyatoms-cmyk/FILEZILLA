import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/session-store";

describe("SessionStore", () => {
  it("allows exactly two participants and rejects a third", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    expect(store.join("s1", "conn-b")).toBe("joined");
    expect(store.join("s1", "conn-c")).toBe("session-full");
  });

  it("treats re-joining with the same connection id as idempotent", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    store.join("s1", "conn-b");
    expect(store.join("s1", "conn-a")).toBe("joined");
    expect(store.get("s1")!.participants.size).toBe(2);
  });

  it("reports session-not-found for an unknown session id", () => {
    const store = new SessionStore();
    expect(store.join("does-not-exist", "conn-a")).toBe("session-not-found");
  });

  it("expires sessions after their TTL and removes them on join attempts", () => {
    const store = new SessionStore();
    const now = 1_000_000;
    store.create("s1", "conn-a", 1000, now);
    expect(store.join("s1", "conn-b", now + 500)).toBe("joined");
    const store2 = new SessionStore();
    store2.create("s1", "conn-a", 1000, now);
    expect(store2.join("s1", "conn-b", now + 2000)).toBe("session-expired");
    expect(store2.get("s1")).toBeUndefined();
  });

  it("rejects creating a session id that already exists", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    expect(store.create("s1", "conn-b", 60_000)).toBe("already-exists");
  });

  it("removes a session once its last participant leaves", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    store.leave("s1", "conn-a");
    expect(store.get("s1")).toBeUndefined();
  });

  it("leaveAll removes a connection from every session it was part of", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    store.create("s2", "conn-a", 60_000);
    const affected = store.leaveAll("conn-a");
    expect(affected.sort()).toEqual(["s1", "s2"]);
  });

  it("sweepExpired removes only sessions past their expiry and reports former participants", () => {
    const store = new SessionStore();
    const now = 1_000_000;
    store.create("s1", "conn-a", 1000, now);
    store.create("s2", "conn-b", 60_000, now);
    const removed = store.sweepExpired(now + 2000);
    expect(removed).toEqual([{ sessionId: "s1", connectionIds: ["conn-a"] }]);
    expect(store.get("s2")).toBeDefined();
  });

  it("peersOf excludes the requesting connection id", () => {
    const store = new SessionStore();
    store.create("s1", "conn-a", 60_000);
    store.join("s1", "conn-b");
    expect(store.peersOf("s1", "conn-a")).toEqual(["conn-b"]);
    expect(store.peersOf("s1", "conn-b")).toEqual(["conn-a"]);
  });
});
