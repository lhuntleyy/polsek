import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InboundQueue, isPermanentApiError, type QueueJob } from "./inbound-queue.js";

const silent = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => silent
} as never;

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sigap-queue-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fast = { baseBackoffMs: 5, maxBackoffMs: 20 };
const job = (chatKey: string, n: number): QueueJob => ({ kind: "inbound", chatKey, payload: { n } });
const jsonFiles = (dir: string) => readdirSync(dir).filter((file) => file.endsWith(".json"));

describe("InboundQueue", () => {
  it("retries until the API accepts the message (no message loss during API restart)", async () => {
    const dir = tempDir();
    let calls = 0;
    const delivered: unknown[] = [];
    const queue = new InboundQueue(
      dir,
      async (item) => {
        calls += 1;
        if (calls < 3) throw new Error("fetch failed: ECONNREFUSED");
        delivered.push(item.payload);
      },
      silent,
      fast
    );
    await queue.enqueue("chat-a", async () => job("chat-a", 1));
    expect(calls).toBe(3);
    expect(delivered).toEqual([{ n: 1 }]);
    expect(jsonFiles(dir)).toHaveLength(0);
  });

  it("keeps per-chat order even when an earlier message is slow (photo then SELESAI)", async () => {
    const dir = tempDir();
    const order: number[] = [];
    const queue = new InboundQueue(dir, async (item) => {
      order.push((item.payload as { n: number }).n);
    }, silent, fast);
    const slowPhoto = queue.enqueue("chat-b", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return job("chat-b", 1);
    });
    const selesai = queue.enqueue("chat-b", async () => job("chat-b", 2));
    await Promise.all([slowPhoto, selesai]);
    expect(order).toEqual([1, 2]);
  });

  it("moves permanently rejected messages to dead/ instead of retrying forever", async () => {
    const dir = tempDir();
    const queue = new InboundQueue(dir, async () => {
      throw new Error("API 400: validation_error");
    }, silent, fast);
    await queue.enqueue("chat-c", async () => job("chat-c", 1));
    expect(jsonFiles(dir)).toHaveLength(0);
    expect(jsonFiles(join(dir, "dead"))).toHaveLength(1);
  });

  it("recovers messages left on disk by a previous process", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "000000000000001-left.json"),
      JSON.stringify({ ...job("chat-d", 9), id: "left", createdAt: new Date().toISOString(), attempts: 2 })
    );
    const delivered: unknown[] = [];
    const queue = new InboundQueue(dir, async (item) => {
      delivered.push(item.payload);
    }, silent, fast);
    expect(queue.recover()).toBe(1);
    await queue.drain();
    expect(delivered).toEqual([{ n: 9 }]);
    expect(existsSync(join(dir, "000000000000001-left.json"))).toBe(false);
  });

  it("classifies retryable vs permanent API errors", () => {
    expect(isPermanentApiError(new Error("API 400: bad"))).toBe(true);
    expect(isPermanentApiError(new Error("API 401: token"))).toBe(true);
    expect(isPermanentApiError(new Error("API 429: slow down"))).toBe(false);
    expect(isPermanentApiError(new Error("API 503: restarting"))).toBe(false);
    expect(isPermanentApiError(new Error("fetch failed"))).toBe(false);
  });
});
