import { randomUUID } from "node:crypto";

const baseUrl = process.env.SIGAP_API_URL ?? "http://127.0.0.1:4000";
const token = process.env.SIGAP_INTERNAL_TOKEN ?? "";
const reports = Number(process.env.SIGAP_LOAD_REPORTS ?? 20);

if ((process.env.SIGAP_ENV ?? "development") === "production") {
  console.error("Load test menolak berjalan saat SIGAP_ENV=production.");
  process.exit(1);
}
if (!Number.isInteger(reports) || reports < 1 || reports > 500) {
  console.error("SIGAP_LOAD_REPORTS harus 1..500.");
  process.exit(1);
}

if (!token) {
  console.error("SIGAP_INTERNAL_TOKEN wajib diisi.");
  process.exit(1);
}

const latencies = [];

async function post(path, body) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sigap-internal-token": token
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const elapsed = performance.now() - started;
  latencies.push(elapsed);
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  }
}

function inbound(sender, type, payload = {}) {
  return {
    waMessageId: randomUUID(),
    chatJid: sender,
    senderJid: sender,
    isGroup: false,
    type,
    timestamp: new Date().toISOString(),
    ...payload
  };
}

const startedAt = Date.now();
for (let index = 0; index < reports; index += 1) {
  const sender = `62877${String(1000000 + index).slice(-7)}@s.whatsapp.net`;
  const steps = [
    inbound(sender, "text", { text: "LAPOR" }),
    inbound(sender, "text", { text: `Warga Uji ${index + 1}` }),
    inbound(sender, "text", { text: "1" }),
    inbound(sender, "text", { text: `Uji beban laporan nomor ${index + 1} di depan pasar.` }),
    inbound(sender, "location", { location: { lat: -6.26, lng: 106.982 } }),
    inbound(sender, "text", { text: "SELESAI" }),
    inbound(sender, "text", { text: "1" })
  ];
  for (const step of steps) {
    await post("/internal/wa/inbound", step);
  }
}

latencies.sort((a, b) => a - b);
const p = (value) => latencies[Math.min(latencies.length - 1, Math.floor((value / 100) * latencies.length))] ?? 0;
console.log({
  reports,
  requests: latencies.length,
  durationSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
  p50Ms: Math.round(p(50)),
  p95Ms: Math.round(p(95)),
  maxMs: Math.round(latencies.at(-1) ?? 0)
});
