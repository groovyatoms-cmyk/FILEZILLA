import { describe, expect, it } from "vitest";
import {
  QrPartsCollector,
  decodeQrFragment,
  encodeQrFragment,
  splitPayloadIntoQrFragments,
} from "../src/qr";

async function makeFragments(text: string, maxFragmentBytes = 16) {
  const payload = new TextEncoder().encode(text);
  return splitPayloadIntoQrFragments(payload, "session-abc", maxFragmentBytes);
}

describe("splitPayloadIntoQrFragments", () => {
  it("splits a payload into multiple fragments and every fragment shares the same whole-payload hash", async () => {
    const fragments = await makeFragments("x".repeat(100));
    expect(fragments.length).toBeGreaterThan(1);
    const hashes = new Set(fragments.map((f) => f.h));
    expect(hashes.size).toBe(1);
    expect(fragments.every((f) => f.n === fragments.length)).toBe(true);
  });

  it("produces a single fragment for small payloads", async () => {
    const fragments = await makeFragments("small", 700);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.i).toBe(1);
    expect(fragments[0]!.n).toBe(1);
  });
});

describe("QrPartsCollector reconstruction", () => {
  it("reconstructs the original payload from fragments scanned out of order", async () => {
    const original = "The quick brown fox jumps over the lazy dog. ".repeat(5);
    const fragments = await makeFragments(original, 24);
    const shuffled = [...fragments].reverse();

    const collector = new QrPartsCollector();
    for (const fragment of shuffled) {
      const outcome = await collector.addFragment(fragment);
      expect(outcome.status).toBe("accepted");
    }
    expect(collector.isComplete()).toBe(true);
    const reconstructed = await collector.reconstruct();
    expect(new TextDecoder().decode(reconstructed)).toBe(original);
  });

  it("handles duplicate scans of the same fragment idempotently", async () => {
    const fragments = await makeFragments("duplicate-part-test-payload", 10);
    const collector = new QrPartsCollector();
    await collector.addFragment(fragments[0]!);
    const dup = await collector.addFragment(fragments[0]!);
    expect(dup.status).toBe("duplicate");
    expect(collector.receivedIndexes).toHaveLength(1);
  });

  it("refuses to reconstruct while a fragment is missing", async () => {
    const fragments = await makeFragments("missing-part-test-payload-needs-several-fragments", 8);
    expect(fragments.length).toBeGreaterThan(2);
    const collector = new QrPartsCollector();
    for (const fragment of fragments.slice(0, -1)) {
      await collector.addFragment(fragment);
    }
    expect(collector.isComplete()).toBe(false);
    await expect(collector.reconstruct()).rejects.toThrow();
  });

  it("rejects a fragment whose checksum does not match its data (corrupted scan)", async () => {
    const fragments = await makeFragments("corruption-test-payload", 10);
    const tampered = { ...fragments[0]!, d: fragments[0]!.d.slice(0, -2) + "zz" };
    const collector = new QrPartsCollector();
    const outcome = await collector.addFragment(tampered);
    expect(outcome.status).toBe("corrupt-fragment");
  });

  it("rejects fragments from a different session id", async () => {
    const fragmentsA = await makeFragments("payload-a", 10);
    const fragmentsB = await splitPayloadIntoQrFragments(new TextEncoder().encode("payload-b"), "session-xyz", 10);
    const collector = new QrPartsCollector();
    await collector.addFragment(fragmentsA[0]!);
    const outcome = await collector.addFragment(fragmentsB[0]!);
    expect(outcome.status).toBe("conflicting-session");
  });

  it("rejects fragments from a regenerated QR sequence (same session id, different payload hash)", async () => {
    const fragmentsGen1 = await makeFragments("generation-one-payload", 10);
    const fragmentsGen2 = await splitPayloadIntoQrFragments(
      new TextEncoder().encode("generation-two-payload-different"),
      "session-abc",
      10,
    );
    const collector = new QrPartsCollector();
    await collector.addFragment(fragmentsGen1[0]!);
    const outcome = await collector.addFragment(fragmentsGen2[0]!);
    expect(outcome.status).toBe("different-generation");
  });

  it("rejects malformed / non-protocol QR text", async () => {
    const collector = new QrPartsCollector();
    const outcome = await collector.addFragmentText("not json at all");
    expect(outcome.status).toBe("corrupt-fragment");
    const outcome2 = await collector.addFragmentText(JSON.stringify({ hello: "world" }));
    expect(outcome2.status).toBe("corrupt-fragment");
  });

  it("round-trips encode/decode of a single fragment", async () => {
    const fragments = await makeFragments("encode-decode-roundtrip", 700);
    const text = encodeQrFragment(fragments[0]!);
    const decoded = decodeQrFragment(text);
    expect(decoded).toEqual(fragments[0]);
  });
});
