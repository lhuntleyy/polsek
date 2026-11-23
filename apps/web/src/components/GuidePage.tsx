import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Map as MapIcon,
  MessageSquare,
  Radio,
  ShieldCheck,
  Smartphone,
  Sun,
  Users
} from "lucide-react";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="guide-step">
      <span className="guide-step-n">{n}</span>
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function GuidePage() {
  return (
    <section className="view is-active guide-page" data-view-panel="guide">
      <div className="page-head">
        <div>
          <div className="eyebrow">PANDUAN CEPAT</div>
          <h2>Cara pakai SIGAP</h2>
          <p>Alur warga, piket, URC, admin, dan cara menambahkan WhatsApp bot.</p>
        </div>
        <div className="page-actions">
          <span className="badge blue">
            <BookOpen size={11} /> v1.0
          </span>
        </div>
      </div>

      <div className="guide-grid">
        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">WARGA</div>
              <h3>Alur melapor lewat WhatsApp</h3>
            </div>
            <Smartphone size={18} className="muted" />
          </header>
          <Step n={1} title="Simpan nomor / scan QR">Warga scan poster atau simpan nomor WhatsApp Polsek.</Step>
          <Step n={2} title="Ketik LAPOR">Bot meminta nama lengkap, kategori, kronologi, dan lokasi kejadian.</Step>
          <Step n={3} title="Kirim lokasi TKP">Lokasi kejadian, bukan lokasi rumah. Foto/video/voice note opsional.</Step>
          <Step n={4} title="Ketik SELESAI">Warga menerima nomor tiket dan bisa kirim <code>STATUS</code> kapan saja.</Step>
          <p className="guide-note">
            Darurat: ketik <b>DARURAT</b> atau langsung share location. Untuk nyawa terancam tetap
            telepon <b>110/112</b>.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">PIKET</div>
              <h3>Menangani tiket</h3>
            </div>
            <ShieldCheck size={18} className="muted" />
          </header>
          <Step n={1} title="Buka tiket">Cek nama, nomor masked, lokasi, deskripsi, dan media.</Step>
          <Step n={2} title="Terima Laporan">Status berubah ke <code>diterima</code> dan pelapor mendapat update.</Step>
          <Step n={3} title="OTW → Tiba di TKP">Klik saat berangkat dan saat tiba.</Step>
          <Step n={4} title="Selesaikan">Isi catatan penanganan, lalu klik Selesaikan.</Step>
          <p className="guide-note">
            P1: ack ≤ 2 menit, OTW ≤ 5 menit. Eskalasi Pawas 3 menit, Kapolsek 10 menit.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">URC</div>
              <h3>Command dari grup</h3>
            </div>
            <MessageSquare size={18} className="muted" />
          </header>
          <div className="guide-cmds">
            <code>/otw 014</code><span>Berangkat ke TKP</span>
            <code>/tiba 014</code><span>Tiba di TKP</span>
            <code>/selesai 014 catatan</code><span>Selesai + catatan</span>
            <code>/tunda 014 alasan</code><span>Tunda</span>
            <code>/status 014</code><span>Cek status</span>
            <code>/id</code><span>Tampilkan ID grup ini</span>
          </div>
          <p className="guide-note">
            Foto bukti: kirim foto dengan caption <code>/selesai 014 catatan</code>. Hanya nomor
            petugas terdaftar dan grup aktif yang diterima.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">PETUGAS</div>
              <h3>Role dan fungsinya</h3>
            </div>
            <Users size={18} className="muted" />
          </header>
          <div className="guide-roles">
            <div><b>piket</b><span>Terima, OTW, tiba, selesai, tiket manual, reveal nomor</span></div>
            <div><b>urc</b><span>OTW/tiba/selesai, catatan, command grup</span></div>
            <div><b>bhabin</b><span>Lihat tiket wilayahnya, catatan internal</span></div>
            <div><b>pawas</b><span>Audit, export, digest, blokir, eskalasi P1</span></div>
            <div><b>kapolsek</b><span>Pantau, export, digest, keputusan</span></div>
            <div><b>admin</b><span>Semua + pengaturan unit, wilayah, petugas, grup</span></div>
          </div>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">JID</div>
              <h3>Nomor dan grup otomatis</h3>
            </div>
            <CircleHelp size={18} className="muted" />
          </header>
          <p className="guide-note" style={{ marginTop: 0 }}>
            Petugas tidak perlu mengetik <code>@s.whatsapp.net</code> atau <code>@g.us</code>.
            Cukup masukkan nomor atau ID grup.
          </p>
          <div className="guide-jid">
            <span>0812-3456-7890</span><ArrowRight size={12} /><code>6281234567890@s.whatsapp.net</code>
            <span>120363012345678901</span><ArrowRight size={12} /><code>120363012345678901@g.us</code>
          </div>
          <p className="guide-note">
            Link invite grup tidak bisa dipakai. Ambil ID grup berupa deretan angka dari info grup.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">WHATSAPP BOT</div>
              <h3>Menambahkan nomor bot</h3>
            </div>
            <Radio size={18} className="muted" />
          </header>
          <Step n={1} title="Isi .env">Nomor WA, folder sesi, URL API, dan internal token.</Step>
          <Step n={2} title="Jalankan bot">QR muncul di terminal dan di <code>data/baileys-qr.png</code>.</Step>
          <Step n={3} title="Scan dari HP">WhatsApp → Perangkat tertaut → Tautkan perangkat.</Step>
          <Step n={4} title="Daftarkan URC">Isi ID grup URC di Sistem. Petugas diisi nomor WA-nya.</Step>
          <p className="guide-note">
            Jangan kirim QR ke publik. Sesi di <code>data/baileys/</code> setara akses akun.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">PETA & TAMPILAN</div>
              <h3>Membaca peta dan tema</h3>
            </div>
            <MapIcon size={18} className="muted" />
          </header>
          <p className="guide-note" style={{ marginTop: 0 }}>
            <b>Polygon berwarna</b> = batas wilayah hukum. <b>Pin</b> = lokasi kejadian (TKP).
            Klik wilayah di panel kiri untuk memfilter.
          </p>
          <p className="guide-note">
            Tile memakai OpenStreetMap terang, tanpa API key. Default tema <b>terang</b>; ganti
            lewat ikon <Sun size={12} /> di topbar atau Sistem → Tampilan.
          </p>
        </section>

        <section className="panel guide-card">
          <header className="card-head">
            <div>
              <div className="eyebrow">BANTUAN</div>
              <h3>Jika ada masalah</h3>
            </div>
            <CircleHelp size={18} className="muted" />
          </header>
          <div className="guide-roles">
            <div><b>WA OFFLINE</b><span>Cek HP, jaringan, lalu scan ulang QR.</span></div>
            <div><b>Command ditolak</b><span>Cek grup aktif, nomor petugas terdaftar, dan status tiket.</span></div>
            <div><b>Peta kosong</b><span>Cek internet/firewall; polygon dan pin tetap tampil.</span></div>
            <div><b>Push tidak muncul</b><span>Izinkan notifikasi; butuh HTTPS atau localhost.</span></div>
          </div>
          <p className="guide-note">
            Panduan lengkap ada di <code>docs/24-PANDUAN-PENGGUNAAN.md</code>.
          </p>
        </section>
      </div>
    </section>
  );
}
