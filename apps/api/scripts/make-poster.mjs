import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const rawNumber = process.env.SIGAP_WA_NUMBER ?? "";
const digits = rawNumber.replace(/\D/g, "").replace(/^0/, "62");
const number = digits.length >= 10 ? digits : "628000000000";
const template = digits.length < 10;
const display = `+${number.replace(/^62/, "62 ").replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3")}`;
const url = `https://wa.me/${number}?text=${encodeURIComponent("LAPOR")}`;
const qr = await QRCode.toBuffer(url, {
  width: 420,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#071018", light: "#ffffff" }
});
const qrBase64 = qr.toString("base64");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071018"/>
      <stop offset="0.55" stop-color="#0c1821"/>
      <stop offset="1" stop-color="#08131b"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffb020"/>
      <stop offset="1" stop-color="#ffd36a"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#bg)"/>
  <rect x="54" y="54" width="972" height="1332" rx="28" fill="none" stroke="#1d2b36" stroke-width="2"/>
  <circle cx="900" cy="160" r="220" fill="#ffb020" opacity="0.06"/>
  <circle cx="140" cy="1260" r="260" fill="#2dd4bf" opacity="0.05"/>

  <g transform="translate(92 100)">
    <rect width="88" height="88" rx="20" fill="#ffb020" opacity="0.12" stroke="#ffb020" stroke-width="2"/>
    <path d="M44 16 L70 26 V46 C70 60 58 72 44 78 C30 72 18 60 18 46 V26 Z"
          fill="none" stroke="#ffb020" stroke-width="5" stroke-linejoin="round"/>
    <path d="M32 46 L41 55 L58 36" fill="none" stroke="#ffb020" stroke-width="5"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="198" y="140" font-family="Segoe UI, Arial, sans-serif" font-size="52"
        font-weight="700" letter-spacing="9" fill="#e8eef4">SIGAP</text>
  <text x="198" y="178" font-family="Segoe UI, Arial, sans-serif" font-size="20"
        letter-spacing="4" fill="#8496a6">SISTEM INFORMASI GANGGUAN &amp; ADUAN PUBLIK</text>

  <text x="92" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="76"
        font-weight="800" fill="#ffffff">LAPOR POLISI</text>
  <text x="92" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="76"
        font-weight="800" fill="url(#amber)">LEWAT WHATSAPP</text>
  <text x="92" y="486" font-family="Segoe UI, Arial, sans-serif" font-size="28"
        fill="#b8c6d3">Tanpa instal aplikasi. Langsung diterima piket Polsek.</text>

  <g font-family="Segoe UI, Arial, sans-serif">
    <circle cx="122" cy="588" r="24" fill="#ffb020"/>
    <text x="122" y="597" text-anchor="middle" font-size="24" font-weight="700" fill="#071018">1</text>
    <text x="168" y="597" font-size="30" fill="#dbe6ef">Scan QR atau simpan nomor WhatsApp Polsek.</text>

    <circle cx="122" cy="672" r="24" fill="#ffb020"/>
    <text x="122" y="681" text-anchor="middle" font-size="24" font-weight="700" fill="#071018">2</text>
    <text x="168" y="681" font-size="30" fill="#dbe6ef">Ketik <tspan font-weight="700" fill="#ffd36a">LAPOR</tspan> dan kirim nama lengkap.</text>

    <circle cx="122" cy="756" r="24" fill="#ffb020"/>
    <text x="122" y="765" text-anchor="middle" font-size="24" font-weight="700" fill="#071018">3</text>
    <text x="168" y="765" font-size="30" fill="#dbe6ef">Pilih jenis, ceritakan kejadian, kirim lokasi.</text>

    <circle cx="122" cy="840" r="24" fill="#ffb020"/>
    <text x="122" y="849" text-anchor="middle" font-size="24" font-weight="700" fill="#071018">4</text>
    <text x="168" y="849" font-size="30" fill="#dbe6ef">Foto/video/voice note opsional. Simpan nomor tiket.</text>
  </g>

  <rect x="92" y="930" width="896" height="330" rx="24" fill="#ffffff"/>
  <image href="data:image/png;base64,${qrBase64}" x="128" y="966" width="258" height="258"/>
  <text x="420" y="1010" font-family="Segoe UI, Arial, sans-serif" font-size="30"
        font-weight="700" fill="#071018">Scan untuk mulai lapor</text>
  <text x="420" y="1062" font-family="Segoe UI, Arial, sans-serif" font-size="22"
        fill="#41525f">atau simpan nomor:</text>
  <text x="420" y="1122" font-family="Consolas, monospace" font-size="40"
        font-weight="700" fill="#0b6f66">${display}</text>
  <text x="420" y="1180" font-family="Segoe UI, Arial, sans-serif" font-size="19"
        fill="#6b7c89">Klik: wa.me/${number}?text=LAPOR</text>
  <text x="420" y="1218" font-family="Segoe UI, Arial, sans-serif" font-size="18"
        fill="#6b7c89">${template ? "TEMPLATE: ganti SIGAP_WA_NUMBER sebelum cetak." : "Nomor resmi Polsek."}</text>

  <rect x="92" y="1300" width="896" height="1" fill="#1d2b36"/>
  <text x="92" y="1350" font-family="Segoe UI, Arial, sans-serif" font-size="21"
        fill="#8496a6">Darurat nyawa: telepon <tspan font-weight="700" fill="#ff5a5f">110</tspan> atau 112.</text>
  <text x="92" y="1388" font-family="Segoe UI, Arial, sans-serif" font-size="18"
        fill="#5d7080">Data pelapor hanya dipakai untuk penanganan laporan. Nomor dimasker di dashboard.</text>
  <text x="988" y="1388" text-anchor="end" font-family="Consolas, monospace" font-size="16"
        fill="#5d7080">SIGAP · v1</text>
</svg>`;

const targetDir = resolve("../../docs/assets");
mkdirSync(targetDir, { recursive: true });
writeFileSync(resolve(targetDir, "poster-warga.svg"), svg, "utf8");
await sharp(Buffer.from(svg)).png().toFile(resolve(targetDir, "poster-warga.png"));
console.log({
  poster: resolve(targetDir, "poster-warga.png"),
  number,
  template,
  url
});
