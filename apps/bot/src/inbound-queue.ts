import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import type { BotLogger } from "./logger.js";

/**
 * Antrean pesan masuk yang persisten.
 *
 * Masalah lama: kalau API sedang restart/deploy, `postInbound` gagal dan pesan
 * warga (bisa laporan darurat) hilang tanpa jejak. Sekarang setiap pesan
 * ditulis ke disk dulu, lalu dikirim ke API dengan retry + backoff sampai API
 * menjawab 2xx. API sudah idempoten per `waMessageId`, jadi pengiriman ulang
 * aman. Saat bot start, file yang tertinggal dikirim ulang.
 *
 * Urutan dijaga per chat: pesan dari chat yang sama diproses berurutan,
 * sehingga "foto lalu SELESAI" tidak tertukar menjadi "SELESAI lalu foto".
 */

export type QueueJob =
  | { kind: "inbound"; chatKey: string; payload: unknown }
  | { kind: "group"; chatKey: string; payload: unknown };

type StoredJob = QueueJob & {
  id: string;
  createdAt: string;
  attempts: number;
};

export type Deliver = (job: QueueJob) => Promise<void>;

/** Error yang tidak akan sembuh dengan retry (mis. 400 validasi). */
export class PermanentDeliveryError extends Error {}

export function isPermanentApiError(error: unknown): boolean {
  if (error instanceof PermanentDeliveryError) return true;
  const message = error instanceof Error ? error.message : String(error);
  const match = /^API (\d{3})/.exec(message);
  if (!match) return false;
  const status = Number(match[1]);
  // 408/429 dan 5xx layak dicoba ulang; 4xx lain berarti payload ditolak.
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InboundQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly deadDir: string;
  private stopped = false;
  private pendingCount = 0;

  constructor(
    private readonly dir: string,
    private readonly deliver: Deliver,
    private readonly logger: BotLogger,
    private readonly options: { maxBackoffMs?: number; baseBackoffMs?: number } = {}
  ) {
    this.deadDir = join(dir, "dead");
    mkdirSync(this.deadDir, { recursive: true, mode: 0o700 });
  }

  get pending(): number {
    return this.pendingCount;
  }

  /** Kirim ulang job yang tertinggal dari proses sebelumnya (urut waktu). */
  recover(): number {
    const files = readdirSync(this.dir)
      .filter((file) => file.endsWith(".json"))
      .sort();
    for (const file of files) {
      try {
        const job = JSON.parse(readFileSync(join(this.dir, file), "utf8")) as StoredJob;
        this.schedule(job, file);
      } catch (error) {
        this.logger.error({ err: error, file }, "Job antrean rusak, dipindah ke dead/");
        this.moveToDead(file);
      }
    }
    if (files.length > 0) this.logger.warn({ count: files.length }, "Memulihkan pesan yang belum terkirim ke API");
    return files.length;
  }

  /**
   * Jalankan `prepare` (mis. unduh+unggah media) secara berurutan per chat,
   * lalu simpan job hasilnya ke disk dan kirim dengan retry.
   */
  enqueue(chatKey: string, prepare: () => Promise<QueueJob | null>): Promise<void> {
    return this.chain(chatKey, async () => {
      const job = await prepare();
      if (!job) return;
      const stored: StoredJob = {
        ...job,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        attempts: 0
      };
      const file = `${Date.now().toString().padStart(15, "0")}-${stored.id}.json`;
      writeFileSync(join(this.dir, file), JSON.stringify(stored), { mode: 0o600 });
      await this.deliverWithRetry(stored, file);
    });
  }

  stop(): void {
    this.stopped = true;
  }

  /** Tunggu semua chain selesai (dipakai di test & shutdown). */
  async drain(): Promise<void> {
    await Promise.all([...this.chains.values()]);
  }

  private schedule(job: StoredJob, file: string): void {
    void this.chain(job.chatKey, () => this.deliverWithRetry(job, file));
  }

  private chain(chatKey: string, task: () => Promise<void>): Promise<void> {
    this.pendingCount += 1;
    const previous = this.chains.get(chatKey) ?? Promise.resolve();
    const next = previous
      .then(task)
      .catch((error) => {
        this.logger.error({ err: error, chatKey }, "Gagal memproses pesan masuk");
      })
      .finally(() => {
        this.pendingCount -= 1;
        if (this.chains.get(chatKey) === next) this.chains.delete(chatKey);
      });
    this.chains.set(chatKey, next);
    return next;
  }

  private async deliverWithRetry(job: StoredJob, file: string): Promise<void> {
    const base = this.options.baseBackoffMs ?? 1_000;
    const max = this.options.maxBackoffMs ?? 30_000;
    while (!this.stopped) {
      try {
        await this.deliver(job);
        rmSync(join(this.dir, file), { force: true });
        return;
      } catch (error) {
        job.attempts += 1;
        if (isPermanentApiError(error)) {
          this.logger.error(
            { err: error, id: job.id, kind: job.kind },
            "API menolak pesan secara permanen; disimpan di dead/ untuk diperiksa"
          );
          this.moveToDead(file);
          return;
        }
        const wait = Math.min(max, base * 2 ** Math.min(job.attempts - 1, 10));
        if (job.attempts === 1 || job.attempts % 10 === 0) {
          this.logger.warn(
            { err: error instanceof Error ? error.message : String(error), attempts: job.attempts, waitMs: wait },
            "API belum bisa menerima pesan; akan dicoba ulang"
          );
        }
        try {
          writeFileSync(join(this.dir, file), JSON.stringify(job), { mode: 0o600 });
        } catch {
          // best effort: file tetap ada dengan attempts lama
        }
        await sleep(wait);
      }
    }
  }

  private moveToDead(file: string): void {
    try {
      renameSync(join(this.dir, file), join(this.deadDir, file));
    } catch {
      rmSync(join(this.dir, file), { force: true });
    }
  }
}
