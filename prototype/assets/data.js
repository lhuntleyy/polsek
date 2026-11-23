/* SIGAP prototype — mock data. Semua nama, nomor, dan kejadian adalah fiktif. */
(function () {
  "use strict";

  var NOW = Date.now();

  function iso(minutesAgo) {
    return new Date(NOW - minutesAgo * 60000).toISOString();
  }

  function at(baseIso, minutesAfter) {
    return new Date(new Date(baseIso).getTime() + minutesAfter * 60000).toISOString();
  }

  function wibDateCode() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(NOW));
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return map.year + map.month + map.day;
  }

  var DATE_CODE = wibDateCode();

  var CATEGORIES = {
    tawuran:   { label: "Kamtibmas",     short: "Tawuran",      icon: "i-fight",   color: "#FFB020" },
    pidana:    { label: "Tindak Pidana", short: "Curanmor",     icon: "i-shield",  color: "#FF7A45" },
    bencana:   { label: "Bencana",       short: "Banjir",       icon: "i-disaster",color: "#4D9FFF" },
    laka:      { label: "Laka & Macet",  short: "Laka Lantas",  icon: "i-traffic", color: "#B18CFF" },
    kebakaran: { label: "Kebakaran",     short: "Kebakaran",    icon: "i-fire",    color: "#FF5A5F" },
    lain:      { label: "Lainnya",       short: "Lainnya",      icon: "i-alert",   color: "#8A9BAA" }
  };

  var STATUSES = {
    baru:     { label: "BARU",     color: "#FFB020" },
    diterima: { label: "DITERIMA", color: "#4D9FFF" },
    otw:      { label: "OTW",      color: "#8B8CFF" },
    ditkp:    { label: "DI TKP",   color: "#2DD4BF" },
    selesai:  { label: "SELESAI",  color: "#36D399" },
    ditunda:  { label: "DITUNDA",  color: "#94A3B8" },
    ditolak:  { label: "DITOLAK",  color: "#64748B" }
  };

  var PRIORITIES = {
    P1: { label: "DARURAT", color: "#FF5A5F" },
    P2: { label: "TINGGI",  color: "#FFB020" },
    P3: { label: "NORMAL",  color: "#8A9BAA" }
  };

  function polygon(lat, lng, rLat, rLng) {
    rLat = rLat || 0.0062;
    rLng = rLng || 0.0068;
    return [
      [lat + rLat * 0.95, lng - rLng * 0.30],
      [lat + rLat * 0.55, lng + rLng * 0.72],
      [lat - rLat * 0.10, lng + rLng * 1.00],
      [lat - rLat * 0.78, lng + rLng * 0.55],
      [lat - rLat * 1.00, lng - rLng * 0.35],
      [lat - rLat * 0.45, lng - rLng * 0.92],
      [lat + rLat * 0.35, lng - rLng * 0.80]
    ];
  }

  var REGIONS = [
    {
      id: "pekyon",
      name: "Pekayon Jaya",
      center: [-6.2600, 106.9820],
      polygon: polygon(-6.2600, 106.9820, 0.0070, 0.0074),
      bhabin: "Bripka Dedi Kurniawan",
      tickets30d: 54
    },
    {
      id: "jakasetia",
      name: "Jakasetia",
      center: [-6.2400, 106.9770],
      polygon: polygon(-6.2400, 106.9770, 0.0062, 0.0066),
      bhabin: "Bripka Sari Wulandari",
      tickets30d: 38
    },
    {
      id: "margajaya",
      name: "Marga Jaya",
      center: [-6.2670, 106.9730],
      polygon: polygon(-6.2670, 106.9730, 0.0060, 0.0064),
      bhabin: "Bripka Agus Salim",
      tickets30d: 31
    },
    {
      id: "kayuringin",
      name: "Kayuringin Jaya",
      center: [-6.2440, 106.9930],
      polygon: polygon(-6.2440, 106.9930, 0.0068, 0.0070),
      bhabin: "Brigadir Rudi Hartono",
      tickets30d: 42
    },
    {
      id: "jakamulya",
      name: "Jakamulya",
      center: [-6.2550, 106.9970],
      polygon: polygon(-6.2550, 106.9970, 0.0058, 0.0062),
      bhabin: "Bripka Nita Rahmawati",
      tickets30d: 27
    }
  ];

  var REPORTERS = [
    { name: "Rizky Maulana",      phone: "081234567134", reports: 3, valid: 3, verified: true,  region: "Pekayon Jaya",     last: iso(2) },
    { name: "Siti Aminah",        phone: "081298765432", reports: 2, valid: 2, verified: true,  region: "Jakasetia",        last: iso(6) },
    { name: "Ahmad Fauzi",        phone: "085712345678", reports: 5, valid: 4, verified: true,  region: "Marga Jaya",       last: iso(9) },
    { name: "Dewi Lestari",       phone: "081377788899", reports: 1, valid: 1, verified: false, region: "Kayuringin Jaya",  last: iso(12) },
    { name: "Bagas Pratama",      phone: "082112223333", reports: 4, valid: 3, verified: true,  region: "Marga Jaya",       last: iso(18) },
    { name: "Nur Hidayah",        phone: "081399900011", reports: 1, valid: 1, verified: false, region: "Jakamulya",        last: iso(22) },
    { name: "Hendra Gunawan",     phone: "081255566677", reports: 2, valid: 1, verified: true,  region: "Kayuringin Jaya",  last: iso(34) },
    { name: "Maya Sari",          phone: "085800011122", reports: 3, valid: 1, verified: false, region: "Jakasetia",        last: iso(48) },
    { name: "Bayu Setiawan",      phone: "081700022233", reports: 1, valid: 0, verified: false, region: "Jakamulya",        last: iso(125) }
  ];

  function rep(name) {
    for (var i = 0; i < REPORTERS.length; i++) {
      if (REPORTERS[i].name === name) return REPORTERS[i];
    }
    return { name: name, phone: "081200000000", reports: 1, valid: 1, verified: false, region: "-", last: iso(5) };
  }

  function media(kind, name, size, duration) {
    return { kind: kind, name: name, size: size, duration: duration || null };
  }

  var OFFICERS = [
    { name: "AKP Hendra Wijaya",       rank: "AKP",   role: "Kapolsek",  region: "Semua",           jid: "62812•••••001", active: true },
    { name: "Ipda Fajar Nugroho",      rank: "Ipda",  role: "Pawas",     region: "Semua",           jid: "62812•••••014", active: true },
    { name: "Bripka Andi Saputra",     rank: "Bripka",role: "Piket",     region: "SPKT",            jid: "62812•••••027", active: true },
    { name: "Brigadir Siti Nurhaliza", rank: "Brigadir", role: "Piket",  region: "SPKT",            jid: "62812•••••031", active: true },
    { name: "Aiptu Rina Marlina",      rank: "Aiptu", role: "URC",       region: "Semua",           jid: "62812•••••044", active: true },
    { name: "Aipda Bayu Pratama",      rank: "Aipda", role: "URC",       region: "Semua",           jid: "62812•••••052", active: true },
    { name: "Bripka Dedi Kurniawan",   rank: "Bripka",role: "Bhabin",    region: "Pekayon Jaya",    jid: "62812•••••063", active: true },
    { name: "Bripka Sari Wulandari",   rank: "Bripka",role: "Bhabin",    region: "Jakasetia",       jid: "62812•••••071", active: true },
    { name: "Bripka Agus Salim",       rank: "Bripka",role: "Bhabin",    region: "Marga Jaya",      jid: "62812•••••082", active: true },
    { name: "Brigadir Rudi Hartono",   rank: "Brigadir", role: "Bhabin", region: "Kayuringin Jaya", jid: "62812•••••090", active: true },
    { name: "Bripka Nita Rahmawati",   rank: "Bripka",role: "Bhabin",    region: "Jakamulya",       jid: "62812•••••103", active: true },
    { name: "Penata TK I Lina",        rank: "Penata", role: "Admin",    region: "Sistem",          jid: "62812•••••118", active: true }
  ];

  var GROUPS = [
    { name: "URC Polsek Bekasi Selatan", jid: "1203630••••••@g.us", purpose: "URC / Patroli", members: 18, status: "Terhubung", commands: 42 },
    { name: "Piket SPKT",                jid: "1203630••••••@g.us", purpose: "Piket",         members: 9,  status: "Terhubung", commands: 7 },
    { name: "Bhabinkamtibmas Wilkum",    jid: "1203630••••••@g.us", purpose: "Bhabin",        members: 12, status: "Terhubung", commands: 3 }
  ];

  function buildTimeline(createdAt, status, assignee) {
    var events = [{ label: "Tiket dibuat oleh bot", actor: "SIGAP Bot", at: createdAt, done: true }];
    if (status === "baru") return events;
    if (status === "ditolak") {
      events.push({ label: "Laporan ditolak — tidak sesuai / duplikat", actor: "Bripka Andi", at: at(createdAt, 4), done: true });
      return events;
    }
    events.push({ label: "Diterima piket", actor: "Bripka Andi", at: at(createdAt, 1), done: true });
    if (status === "diterima") return events;
    if (status === "ditunda") {
      events.push({ label: "Ditunda — menunggu informasi tambahan", actor: "Bripka Andi", at: at(createdAt, 6), done: true });
      return events;
    }
    events.push({ label: "OTW ke TKP", actor: assignee || "Aiptu Rina", at: at(createdAt, 4), done: true });
    if (status === "otw") return events;
    events.push({ label: "Tiba di TKP", actor: assignee || "Aiptu Rina", at: at(createdAt, 14), done: true });
    if (status === "ditkp") return events;
    events.push({ label: "Selesai — ditangani di lapangan", actor: assignee || "Aiptu Rina", at: at(createdAt, 42), done: true });
    return events;
  }

  function makeTicket(o) {
    var createdAt = iso(o.minutesAgo);
    var reporter = rep(o.reporter);
    var category = CATEGORIES[o.category] || CATEGORIES.lain;
    var assignee = o.assignee || null;
    return {
      id: "BKS-" + DATE_CODE + "-" + String(o.seq).padStart(3, "0"),
      seq: o.seq,
      title: o.title,
      category: o.category,
      categoryLabel: category.label,
      categoryShort: category.short,
      categoryIcon: category.icon,
      priority: o.priority,
      status: o.status,
      region: o.region,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      accuracy: o.accuracy || 12,
      reporter: reporter,
      reporterName: reporter.name,
      reporterPhone: reporter.phone,
      source: o.source || "wa",
      description: o.description,
      media: o.media || [],
      cluster: o.cluster || 0,
      assignee: assignee,
      eta: o.eta || null,
      closeNote: o.closeNote || null,
      rejectReason: o.rejectReason || null,
      internalNote: o.internalNote || "",
      createdAt: createdAt,
      timeline: buildTimeline(createdAt, o.status, assignee),
      sla: o.sla || null,
      unread: o.status === "baru"
    };
  }

  var TICKETS = [
    makeTicket({
      seq: 25, minutesAgo: 2, category: "tawuran", priority: "P1", status: "baru",
      title: "Tawuran antar kelompok di Jl. Raya Pekayon",
      region: "Pekayon Jaya", address: "Jl. Raya Pekayon No. 88, dekat pasar",
      lat: -6.2588, lng: 106.9812, accuracy: 9,
      reporter: "Rizky Maulana",
      description: "Dua kelompok pemuda terlibat saling lempar di depan pasar. Sekitar 15 orang, ada yang membawa kayu. Warga takut keluar rumah. Situasi masih ramai.",
      media: [
        media("photo", "IMG_2041.jpg", "2.4 MB"),
        media("photo", "IMG_2042.jpg", "1.9 MB"),
        media("video", "VID_2043.mp4", "18.6 MB", 34)
      ],
      cluster: 3
    }),
    makeTicket({
      seq: 24, minutesAgo: 6, category: "pidana", priority: "P2", status: "baru",
      title: "Pencurian motor di parkiran minimarket",
      region: "Jakasetia", address: "Jl. Jakasetia Raya, parkiran minimarket",
      lat: -6.2412, lng: 106.9782, accuracy: 14,
      reporter: "Siti Aminah",
      description: "Motor Honda Beat warna hitam hilang dari parkiran sekitar 20 menit lalu. Pelaku terlihat pria memakai jaket hitam dan helm full face. Ada rekaman CCTV minimarket.",
      media: [media("photo", "IMG_3310.jpg", "1.6 MB")],
      cluster: 0
    }),
    makeTicket({
      seq: 23, minutesAgo: 9, category: "bencana", priority: "P2", status: "baru",
      title: "Banjir setinggi 40 cm di Jl. Marga Jaya",
      region: "Marga Jaya", address: "Jl. Marga Jaya RT 04/RW 02",
      lat: -6.2664, lng: 106.9741, accuracy: 18,
      reporter: "Ahmad Fauzi",
      description: "Air masuk ke rumah warga, sudah setinggi lutut orang dewasa. Ada dua lansia yang perlu dievakuasi. Hujan masih deras.",
      media: [
        media("photo", "IMG_8821.jpg", "2.1 MB"),
        media("audio", "VN_8822.ogg", "0.8 MB", 47)
      ],
      cluster: 2
    }),
    makeTicket({
      seq: 22, minutesAgo: 12, category: "laka", priority: "P2", status: "diterima",
      title: "Laka lantas motor vs mobil, satu korban luka",
      region: "Kayuringin Jaya", address: "Jl. Ahmad Yani, depan SPBU",
      lat: -6.2449, lng: 106.9921, accuracy: 11,
      reporter: "Dewi Lestari",
      description: "Korban pengendara motor tergeletak, sudah dibawa warga ke pinggir jalan. Mobil putih kabur ke arah barat. Arus lalu lintas tersendat.",
      media: [
        media("photo", "IMG_5510.jpg", "1.4 MB"),
        media("photo", "IMG_5511.jpg", "1.8 MB")
      ],
      assignee: "Bripka Andi Saputra", cluster: 0
    }),
    makeTicket({
      seq: 21, minutesAgo: 18, category: "bencana", priority: "P3", status: "otw",
      title: "Pohon tumbang menutup jalan",
      region: "Marga Jaya", address: "Jl. Marga Jaya ujung, dekat lapangan",
      lat: -6.2681, lng: 106.9718, accuracy: 22,
      reporter: "Bagas Pratama",
      description: "Pohon besar tumbang melintang jalan. Belum ada korban, tapi akses warga terputus. Butuh bantuan Damkar/Dishub.",
      media: [media("photo", "IMG_7712.jpg", "2.9 MB")],
      assignee: "Aiptu Rina Marlina", eta: "4 mnt", cluster: 0
    }),
    makeTicket({
      seq: 20, minutesAgo: 22, category: "tawuran", priority: "P3", status: "otw",
      title: "Orang mencurigakan mengintai rumah warga",
      region: "Jakamulya", address: "Jl. Jakamulya RT 07/RW 03",
      lat: -6.2547, lng: 106.9961, accuracy: 16,
      reporter: "Nur Hidayah",
      description: "Ada pria tidak dikenal mondar-mandir sejak sore, sempat mencoba membuka pagar. Warga sudah menghubungi ketua RT.",
      media: [], assignee: "Bripka Dedi Kurniawan", eta: "6 mnt", cluster: 0
    }),
    makeTicket({
      seq: 19, minutesAgo: 28, category: "tawuran", priority: "P1", status: "ditkp",
      title: "Tawuran susulan di depan sekolah",
      region: "Pekayon Jaya", address: "Jl. Pendidikan, depan SMPN 12",
      lat: -6.2612, lng: 106.9840, accuracy: 8,
      reporter: "Rizky Maulana",
      description: "Tawuran susulan, sekitar 20 orang. Tim sudah di lokasi, situasi mulai terkendali. Satu orang diamankan. Warga diminta menjauh.",
      media: [
        media("photo", "IMG_2099.jpg", "3.2 MB"),
        media("photo", "IMG_2100.jpg", "2.8 MB"),
        media("video", "VID_2101.mp4", "24.1 MB", 51)
      ],
      assignee: "Aiptu Rina Marlina", cluster: 4
    }),
    makeTicket({
      seq: 18, minutesAgo: 34, category: "laka", priority: "P3", status: "diterima",
      title: "Kemacetan panjang akibat kendaraan mogok",
      region: "Kayuringin Jaya", address: "Jl. Tol Jatiasih, arah Jakarta",
      lat: -6.2428, lng: 106.9950, accuracy: 35,
      reporter: "Hendra Gunawan",
      description: "Truk mogok di lajur kanan, antrean sekitar 2 km. Sudah ada petugas derek di lokasi.",
      media: [media("photo", "IMG_6631.jpg", "1.1 MB")],
      assignee: "Bripka Andi Saputra", cluster: 0
    }),
    makeTicket({
      seq: 17, minutesAgo: 48, category: "tawuran", priority: "P3", status: "ditunda",
      title: "Suara petasan sejak pukul 21.00",
      region: "Jakasetia", address: "Jl. Jakasetia RT 02/RW 01",
      lat: -6.2391, lng: 106.9757, accuracy: 28,
      reporter: "Maya Sari",
      description: "Suara petasan berulang, warga resah. Tidak terlihat sumbernya. Minta patroli.",
      media: [], assignee: null,
      internalNote: "Patroli sudah lewat pukul 21.30, tidak ditemukan sumber suara. Akan dicek lagi."
    }),
    makeTicket({
      seq: 16, minutesAgo: 72, category: "bencana", priority: "P2", status: "selesai",
      title: "Banjir surut, warga mulai bersih-bersih",
      region: "Marga Jaya", address: "Jl. Marga Jaya RT 04/RW 02",
      lat: -6.2652, lng: 106.9735, accuracy: 15,
      reporter: "Ahmad Fauzi",
      description: "Air mulai surut sejak pukul 20.30. Warga bergotong royong membersihkan lumpur. Tidak ada korban jiwa.",
      media: [
        media("photo", "IMG_8890.jpg", "2.0 MB"),
        media("photo", "IMG_8891.jpg", "1.7 MB")
      ],
      assignee: "Aiptu Rina Marlina", cluster: 2,
      closeNote: "Banjir surut pukul 21.05. Pompa air dibantu Damkar. Dua lansia dievakuasi ke rumah kerabat. Situasi kondusif."
    }),
    makeTicket({
      seq: 15, minutesAgo: 105, category: "pidana", priority: "P2", status: "selesai",
      title: "Motor hilang ditemukan, pelaku belum tertangkap",
      region: "Jakasetia", address: "Jl. Jakasetia Raya, parkiran minimarket",
      lat: -6.2405, lng: 106.9770, accuracy: 10,
      reporter: "Siti Aminah",
      description: "Motor ditemukan di gang belakang minimarket dalam kondisi kunci rusak. Pelaku masih dalam pengejaran.",
      media: [media("photo", "IMG_3344.jpg", "2.3 MB")],
      assignee: "Bripka Dedi Kurniawan", cluster: 0,
      closeNote: "Kendaraan ditemukan pukul 20.55, sudah dikembalikan ke pemilik. Olah TKP dan CCTV dilakukan. Pelaku belum tertangkap."
    }),
    makeTicket({
      seq: 14, minutesAgo: 125, category: "laka", priority: "P2", status: "ditolak",
      title: "Laporan laka lantas tidak sesuai lokasi",
      region: "Jakamulya", address: "Lokasi tidak ditemukan",
      lat: -6.2561, lng: 106.9980, accuracy: 120,
      reporter: "Bayu Setiawan",
      description: "Pelapor mengaku melihat laka lantas, tetapi lokasi yang dikirim berada di luar wilkum dan tidak ditemukan kejadian.",
      media: [], rejectReason: "Lokasi di luar wilkum / tidak dapat diverifikasi",
      internalNote: "Sudah dihubungi, pelapor tidak bisa menjelaskan lokasi. Diarahkan ke Polsek terdekat."
    }),
    makeTicket({
      seq: 13, minutesAgo: 150, category: "kebakaran", priority: "P1", status: "selesai",
      title: "Kebakaran lahan kosong berhasil dipadamkan",
      region: "Pekayon Jaya", address: "Jl. Pekayon Jaya, lahan kosong dekat rel",
      lat: -6.2620, lng: 106.9801, accuracy: 13,
      reporter: "Rizky Maulana",
      description: "Api membakar ilalang seluas ±200 m². Damkar sudah di lokasi, api berhasil dipadamkan. Tidak ada korban.",
      media: [
        media("photo", "IMG_1980.jpg", "2.7 MB"),
        media("photo", "IMG_1981.jpg", "2.2 MB"),
        media("video", "VID_1982.mp4", "12.4 MB", 22)
      ],
      assignee: "Aiptu Rina Marlina", cluster: 2,
      closeNote: "Damkar memadamkan api pukul 19.40. Tidak ada korban jiwa. Penyebab diduga pembakaran sampah."
    }),
    makeTicket({
      seq: 12, minutesAgo: 190, category: "tawuran", priority: "P2", status: "selesai",
      title: "Tawuran dibubarkan, situasi kondusif",
      region: "Kayuringin Jaya", address: "Jl. Kayuringin Raya, dekat pasar",
      lat: -6.2452, lng: 106.9910, accuracy: 17,
      reporter: "Hendra Gunawan",
      description: "Tawuran antar remaja berhasil dibubarkan. Tidak ada korban jiwa. Dua orang diamankan untuk pembinaan.",
      media: [media("photo", "IMG_4401.jpg", "1.9 MB")],
      assignee: "Bripka Andi Saputra", cluster: 1,
      closeNote: "Tim tiba pukul 18.55, membubarkan massa. Dua remaja dibawa ke Polsek untuk pembinaan. Situasi kondusif."
    })
  ];

  /* ---------- Analitik ---------- */
  var DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  var HEAT = [];
  for (var d = 0; d < 7; d++) {
    var row = [];
    for (var h = 0; h < 24; h++) {
      var base = 0;
      if (h >= 6 && h <= 8) base = 3;
      if (h >= 17 && h <= 22) base = 7;
      if (h >= 19 && h <= 21) base = 11;
      var v = Math.round(base + 3 * Math.abs(Math.sin((d + 1) * 1.7 + h * 0.9)) + (d === 5 ? 2 : 0));
      row.push(v);
    }
    HEAT.push(row);
  }

  var ANALYTICS = {
    kpis: [
      { label: "Total laporan", value: "187", delta: "+12,4%", up: true, spark: [12, 18, 14, 22, 19, 26, 31] },
      { label: "Median ack P1", value: "1m 42s", delta: "-18s", up: true, spark: [9, 8, 7, 8, 6, 6, 5] },
      { label: "Median OTW P1", value: "4m 10s", delta: "-26s", up: true, spark: [7, 6, 6, 5, 5, 4, 4] },
      { label: "Tiket selesai", value: "96,2%", delta: "+1,8%", up: true, spark: [86, 88, 91, 90, 93, 95, 96] },
      { label: "Laporan palsu", value: "2,1%", delta: "-0,4%", up: true, down: true, spark: [4, 3, 4, 2, 3, 2, 2] }
    ],
    categories: [
      { id: "tawuran", label: "Kamtibmas", count: 64, color: "#FFB020" },
      { id: "pidana", label: "Tindak Pidana", count: 48, color: "#FF7A45" },
      { id: "bencana", label: "Bencana", count: 31, color: "#4D9FFF" },
      { id: "laka", label: "Laka & Macet", count: 27, color: "#B18CFF" },
      { id: "kebakaran", label: "Kebakaran", count: 17, color: "#FF5A5F" }
    ],
    regions: [
      { name: "Pekayon Jaya", count: 54 },
      { name: "Kayuringin Jaya", count: 42 },
      { name: "Jakasetia", count: 38 },
      { name: "Marga Jaya", count: 31 },
      { name: "Jakamulya", count: 22 }
    ],
    sla: {
      days: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
      p50: [3.2, 2.9, 3.4, 2.6, 2.4, 2.8, 2.1],
      p90: [6.8, 6.1, 7.2, 5.9, 5.4, 6.2, 4.8]
    },
    hotspots: [
      { name: "Pasar Pekayon", region: "Pekayon Jaya", count: 18, trend: "+4" },
      { name: "Jl. Ahmad Yani", region: "Kayuringin Jaya", count: 14, trend: "+2" },
      { name: "Parkiran Minimarket Jakasetia", region: "Jakasetia", count: 11, trend: "+3" },
      { name: "Jl. Marga Jaya", region: "Marga Jaya", count: 9, trend: "-1" },
      { name: "Depan SMPN 12", region: "Pekayon Jaya", count: 7, trend: "+2" }
    ]
  };

  var SHIFT = {
    label: "Shift Malam",
    time: "20:00 — 08:00",
    outgoing: "Bripka Andi Saputra",
    incoming: "Brigadir Siti Nurhaliza",
    started: "20:00 WIB"
  };

  var AUDIT = [
    { time: "21:42:18", actor: "Bripka Andi", action: "Menerima tiket", entity: "BKS-" + DATE_CODE + "-022", ip: "10.10.2.14" },
    { time: "21:41:56", actor: "SIGAP Bot", action: "Membuat tiket", entity: "BKS-" + DATE_CODE + "-025", ip: "127.0.0.1" },
    { time: "21:40:12", actor: "Aiptu Rina", action: "OTW ke TKP", entity: "BKS-" + DATE_CODE + "-019", ip: "10.10.2.31" },
    { time: "21:39:44", actor: "Bripka Andi", action: "Disposisi ke URC", entity: "BKS-" + DATE_CODE + "-022", ip: "10.10.2.14" },
    { time: "21:38:02", actor: "SIGAP Bot", action: "Forward ke grup URC", entity: "BKS-" + DATE_CODE + "-025", ip: "127.0.0.1" },
    { time: "21:36:20", actor: "Brigadir Siti", action: "Login berhasil", entity: "Session", ip: "10.10.2.22" },
    { time: "21:35:09", actor: "Bripka Andi", action: "Reveal nomor pelapor", entity: "BKS-" + DATE_CODE + "-023", ip: "10.10.2.14" },
    { time: "21:34:51", actor: "SIGAP Bot", action: "Menerima voice note", entity: "BKS-" + DATE_CODE + "-023", ip: "127.0.0.1" }
  ];

  window.SIGAP_DATA = {
    NOW: NOW,
    DATE_CODE: DATE_CODE,
    CATEGORIES: CATEGORIES,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    REGIONS: REGIONS,
    REPORTERS: REPORTERS,
    TICKETS: TICKETS,
    OFFICERS: OFFICERS,
    GROUPS: GROUPS,
    ANALYTICS: ANALYTICS,
    SHIFT: SHIFT,
    AUDIT: AUDIT,
    DAYS: DAYS,
    HEAT: HEAT
  };
})();
