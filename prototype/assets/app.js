/* SIGAP prototype — interactions. Vanilla JS, no build step. */
(function () {
  "use strict";

  var D = window.SIGAP_DATA;
  if (!D) return;

  // Prototype basemap: a local OSM snapshot of the demo wilkum, so the
  // prototype works offline and looks consistent in screenshots.
  // Production: licensed/self-hosted tiles with the same attribution.
  var MAP_BOUNDS = [
    [-6.293458760393975, 106.94091796875],
    [-6.21701232781719, 107.017822265625]
  ];
  var MAP_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  var state = {
    view: "live",
    filter: "all",
    selectedId: null,
    sound: false,
    wall: false,
    layers: { tickets: true, boundaries: true, heat: false },
    fullLayers: { tickets: true, heat: false },
    mapFilters: { status: "all", category: "all", region: "all" },
    dataTab: "reporter",
    dataQuery: "",
    handoverNote: "",
    handoverSigned: false,
    paletteIndex: 0,
    paletteItems: [],
    nextSeq: 26,
    liveMap: null,
    fullMap: null,
    liveTicketLayer: null,
    liveBoundaryLayer: null,
    liveHeatLayer: null,
    fullTicketLayer: null,
    fullHeatLayer: null,
    fullBoundaryLayer: null,
    alarmTicketId: null,
    soundCtx: null
  };

  var tickets = JSON.parse(JSON.stringify(D.TICKETS));
  var regions = JSON.parse(JSON.stringify(D.REGIONS));

  /* ============================================================
     Utilities
     ============================================================ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || "") + '" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function maskPhone(phone) {
    var s = String(phone || "");
    if (s.length < 8) return "••••";
    return s.slice(0, 4) + "•••••" + s.slice(-3);
  }

  function wibTime(iso, withSeconds) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: withSeconds ? "2-digit" : undefined,
      hour12: false
    }).format(new Date(iso));
  }

  function timeAgo(iso) {
    var diff = Math.max(0, Date.now() - new Date(iso).getTime());
    var s = Math.floor(diff / 1000);
    if (s < 20) return "baru saja";
    if (s < 60) return s + " dtk lalu";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " mnt lalu";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " jam lalu";
    return Math.floor(h / 24) + " hr lalu";
  }

  function timeAgoShort(iso) {
    var diff = Math.max(0, Date.now() - new Date(iso).getTime());
    var s = Math.floor(diff / 1000);
    if (s < 60) return "baru";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "j";
    return Math.floor(h / 24) + "h";
  }

  function statusMeta(key) {
    return D.STATUSES[key] || { label: String(key || "").toUpperCase(), color: "#8496a6" };
  }
  function catMeta(key) {
    return D.CATEGORIES[key] || D.CATEGORIES.lain;
  }
  function prioMeta(key) {
    return D.PRIORITIES[key] || { label: "NORMAL", color: "#8496a6" };
  }
  function isActive(t) {
    return ["baru", "diterima", "otw", "ditkp", "ditunda"].indexOf(t.status) >= 0;
  }
  function isFinal(t) {
    return t.status === "selesai" || t.status === "ditolak";
  }
  function getTicket(id) {
    for (var i = 0; i < tickets.length; i++) if (tickets[i].id === id) return tickets[i];
    return null;
  }
  function getSelected() { return getTicket(state.selectedId); }
  function shortId(t) { return "#" + t.id.split("-").pop(); }

  function slaTarget(priority) {
    if (priority === "P1") return "Target ack 2 menit";
    if (priority === "P2") return "Target ack 10 menit";
    return "Target ack 30 menit";
  }

  function sortTickets(list) {
    var sw = { baru: 0, diterima: 1, otw: 2, ditkp: 3, ditunda: 4, selesai: 5, ditolak: 6 };
    var pw = { P1: 0, P2: 1, P3: 2 };
    return list.slice().sort(function (a, b) {
      var aa = isActive(a) ? 0 : 1;
      var bb = isActive(b) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (pw[a.priority] !== pw[b.priority]) return pw[a.priority] - pw[b.priority];
      if (sw[a.status] !== sw[b.status]) return sw[a.status] - sw[b.status];
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function filteredTickets() {
    var list = tickets.slice();
    if (state.filter === "baru") list = list.filter(function (t) { return t.status === "baru"; });
    else if (state.filter === "proses") list = list.filter(function (t) { return ["diterima", "otw", "ditkp", "ditunda"].indexOf(t.status) >= 0; });
    else if (state.filter === "selesai") list = list.filter(function (t) { return t.status === "selesai"; });
    return sortTickets(list);
  }

  function copyText(text, label) {
    function done() { showToast("Disalin", label || text, "success"); }
    function fail() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        showToast("Tidak bisa menyalin", "Browser memblokir clipboard di prototipe.", "warn");
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      fail();
    }
  }

  function showToast(title, message, type) {
    var stack = $("#toast-stack");
    if (!stack) return;
    while (stack.children.length >= 4) stack.removeChild(stack.firstElementChild);
    var t = document.createElement("div");
    t.className = "toast is-" + (type || "info");
    var ic = type === "success" ? "i-check-circle" : type === "warn" ? "i-alert" : type === "danger" ? "i-x-circle" : "i-info";
    t.innerHTML = icon(ic) + "<div><b>" + esc(title) + "</b>" + (message ? "<span>" + esc(message) + "</span>" : "") + "</div>";
    stack.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 4200);
  }

  function closeAlarm() {
    var el = $("#alarm-banner");
    if (el) el.hidden = true;
  }

  function showAlarm(t) {
    var el = $("#alarm-banner");
    if (!el) return;
    state.alarmTicketId = t.id;
    $("#alarm-title").textContent = t.categoryShort + " · " + t.region;
    $("#alarm-meta").textContent = t.id + " · " + timeAgo(t.createdAt);
    el.hidden = false;
  }

  /* ============================================================
     Sound
     ============================================================ */
  function ensureAudio() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!state.soundCtx) state.soundCtx = new Ctx();
    if (state.soundCtx.state === "suspended") state.soundCtx.resume();
    return state.soundCtx;
  }

  function beep(freq, dur, delay, gainValue) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    var start = ctx.currentTime + (delay || 0);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue || 0.08, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (dur || 0.12));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + (dur || 0.12) + 0.03);
  }

  function playAlarm() {
    if (!state.sound) return;
    beep(880, 0.13, 0, 0.09);
    beep(660, 0.13, 0.19, 0.09);
    beep(880, 0.2, 0.38, 0.11);
  }

  function toggleSound() {
    state.sound = !state.sound;
    var btn = $("#sound-btn");
    var use = btn ? btn.querySelector("use") : null;
    if (btn) {
      btn.classList.toggle("is-active", state.sound);
      btn.title = state.sound ? "Matikan suara alarm" : "Aktifkan suara alarm";
      btn.setAttribute("aria-label", btn.title);
    }
    if (use) use.setAttribute("href", state.sound ? "#i-bell" : "#i-bell-off");
    if (state.sound) {
      ensureAudio();
      beep(880, 0.1, 0, 0.08);
      beep(1100, 0.12, 0.14, 0.08);
      showToast("Suara alarm aktif", "Alarm akan berbunyi saat ada laporan darurat.", "success");
    } else {
      showToast("Suara alarm dimatikan", "Alarm visual tetap berjalan.", "info");
    }
  }

  /* ============================================================
     Render — common
     ============================================================ */
  function renderRailBadge() {
    var count = tickets.filter(function (t) { return t.status === "baru"; }).length;
    var badge = $("#rail-badge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count ? "" : "none";
    }
  }

  function renderQueueStats() {
    var baru = tickets.filter(function (t) { return t.status === "baru"; }).length;
    var proses = tickets.filter(function (t) { return ["diterima", "otw", "ditkp", "ditunda"].indexOf(t.status) >= 0; }).length;
    var p1 = tickets.filter(function (t) { return t.priority === "P1" && isActive(t); }).length;
    var selesai = tickets.filter(function (t) { return t.status === "selesai"; }).length;
    var el = $("#queue-stats");
    if (!el) return;
    el.innerHTML =
      '<div class="qstat is-amber"><span>Baru</span><b>' + baru + '</b></div>' +
      '<div class="qstat is-red"><span>P1 aktif</span><b>' + p1 + '</b></div>' +
      '<div class="qstat is-green"><span>Selesai</span><b>' + selesai + '</b></div>';

    var counts = {
      all: tickets.length,
      baru: baru,
      proses: proses,
      selesai: selesai
    };
    Object.keys(counts).forEach(function (k) {
      var b = $("#count-" + k);
      if (b) b.textContent = counts[k];
    });
    renderRailBadge();
  }

  function rowHtml(t) {
    var s = statusMeta(t.status);
    var c = catMeta(t.category);
    var mediaCount = t.media ? t.media.length : 0;
    var classes = ["ticket-row"];
    if (t.id === state.selectedId) classes.push("is-selected");
    if (t.priority === "P1") classes.push("is-p1");
    if (t.unread) classes.push("is-unread");
    return '<button class="' + classes.join(" ") + '" data-id="' + t.id + '" role="listitem" style="--cat:' + c.color + ';--c:' + s.color + '">' +
      '<div class="row-top">' +
        '<span class="row-id">' + shortId(t) + '</span>' +
        (t.unread ? '<span class="row-new"></span>' : '') +
        '<span class="row-status"><i></i>' + s.label + '</span>' +
        '<span class="row-time">' + timeAgoShort(t.createdAt) + '</span>' +
      '</div>' +
      '<div class="row-title">' + esc(t.title) + '</div>' +
      '<div class="row-meta">' + icon(c.icon) + '<b>' + esc(c.label) + '</b><span class="dot-sep">·</span><span>' + esc(t.region) + '</span></div>' +
      '<div class="row-foot">' +
        '<span class="row-person"><span class="mini-avatar">' + initials(t.reporterName) + '</span><span>' + esc(t.reporterName) + '</span></span>' +
        '<span class="row-extra">' +
          (t.cluster ? '<span class="row-cluster">+' + t.cluster + ' terkait</span>' : '') +
          (mediaCount ? icon("i-camera") + mediaCount : '') +
        '</span>' +
      '</div>' +
    '</button>';
  }

  function renderQueue() {
    var list = filteredTickets();
    var el = $("#queue-list");
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="data-empty">Tidak ada tiket pada filter ini.</div>';
    } else {
      el.innerHTML = list.map(rowHtml).join("");
    }
    var count = $("#queue-count");
    if (count) count.textContent = list.length;
    renderQueueStats();
  }

  function renderMapStats() {
    var active = tickets.filter(isActive);
    var p1 = active.filter(function (t) { return t.priority === "P1"; }).length;
    var baru = active.filter(function (t) { return t.status === "baru"; }).length;
    var otw = active.filter(function (t) { return t.status === "otw" || t.status === "ditkp"; }).length;
    var el = $("#map-stats");
    if (el) {
      el.innerHTML =
        '<div class="map-stat is-red"><span>P1</span><b>' + p1 + '</b></div>' +
        '<div class="map-stat is-amber"><span>Baru</span><b>' + baru + '</b></div>' +
        '<div class="map-stat"><span>OTW</span><b>' + otw + '</b></div>';
    }
    var label = $("#map-active-count");
    if (label) label.textContent = active.length + " tiket aktif";
  }

  /* ============================================================
     Render — detail
     ============================================================ */
  function mediaTile(m, index) {
    if (m.kind === "audio") {
      var bars = "";
      for (var b = 0; b < 30; b++) {
        var h = 16 + Math.abs(Math.sin((b + 2) * 1.37 + index)) * 72;
        bars += '<i style="--h:' + h.toFixed(0) + '%"></i>';
      }
      return '<button class="media-tile is-audio" data-media="' + index + '" title="' + esc(m.name) + '">' +
        '<span class="media-badge">VN</span>' + icon("i-mic") +
        '<span class="waveform">' + bars + '</span>' +
        '<span class="audio-meta">' + (m.duration || 0) + "s</span></button>";
    }
    var video = m.kind === "video";
    return '<button class="media-tile" data-media="' + index + '" title="' + esc(m.name) + '">' +
      '<span class="media-badge">' + (video ? "VIDEO" : "FOTO") + '</span>' +
      icon(video ? "i-play" : "i-camera") +
      '<span class="media-name">' + esc(m.name) + '</span></button>';
  }

  function timelineHtml(t) {
    var items = t.timeline.map(function (e, i) {
      var current = !isActive(t) && i === t.timeline.length - 1;
      return '<li class="' + (current ? "is-current" : "") + '">' +
        '<div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>' +
        '<div class="tl-body"><div class="tl-label">' + esc(e.label) + '</div>' +
        '<div class="tl-meta">' + wibTime(e.at) + ' WIB · ' + esc(e.actor) + '</div></div></li>';
    }).join("");

    if (isActive(t)) {
      var nextLabel = {
        baru: "Menunggu diterima piket",
        diterima: "Menunggu tim OTW",
        otw: "Menunggu tiba di TKP",
        ditkp: "Menunggu penutupan tiket",
        ditunda: "Menunggu informasi tambahan"
      }[t.status] || "Menunggu tindakan";
      items += '<li class="is-current">' +
        '<div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>' +
        '<div class="tl-body"><div class="tl-label">' + nextLabel + '</div>' +
        '<div class="tl-meta">Sekarang · ' + slaTarget(t.priority) + '</div></div></li>';
    }
    return items;
  }

  function actionsHtml(t) {
    var primary;
    switch (t.status) {
      case "baru": primary = { label: "Terima Laporan", icon: "i-check", action: "advance" }; break;
      case "diterima": primary = { label: "OTW ke TKP", icon: "i-arrow-right", action: "advance" }; break;
      case "otw": primary = { label: "Tiba di TKP", icon: "i-pin", action: "advance" }; break;
      case "ditkp": primary = { label: "Selesaikan", icon: "i-check-circle", action: "advance" }; break;
      case "ditunda": primary = { label: "Lanjutkan", icon: "i-arrow-right", action: "advance" }; break;
      default: primary = { label: "Buka Kembali", icon: "i-refresh", action: "reopen" };
    }
    var canTunda = ["baru", "diterima", "otw", "ditkp"].indexOf(t.status) >= 0;
    var canReject = t.status !== "selesai" && t.status !== "ditolak";
    return '<div class="action-row">' +
        '<button class="btn btn-ghost icon-only" data-action="phone" title="Telepon pelapor">' + icon("i-phone") + '</button>' +
        '<button class="btn btn-primary" data-action="' + primary.action + '">' + icon(primary.icon) + " " + primary.label + '</button>' +
        (canTunda ? '<button class="btn btn-ghost" data-action="tunda">Tunda</button>' : '') +
      '</div>' +
      '<div class="link-row">' +
        (canReject ? '<button class="link-btn" data-action="reject">Tandai tidak valid / palsu</button>' : '') +
        '<button class="link-btn" data-action="copy-id">Salin ID tiket</button>' +
      '</div>' +
      '<div class="fine">Semua aksi tercatat di audit log. P1 dieskalasi otomatis.</div>';
  }

  function renderDetail() {
    var panel = $("#detail-panel");
    if (!panel) return;
    var t = getSelected();
    if (!t) {
      panel.innerHTML = '<div class="detail-empty">' +
        '<div class="empty-icon">' + icon("i-target") + '</div>' +
        '<b>Belum ada tiket dipilih</b>' +
        '<p>Pilih tiket dari antrean atau pin di peta untuk melihat detail dan mengambil tindakan.</p>' +
        '<div class="empty-keys"><kbd>J</kbd><kbd>K</kbd><span class="muted">navigasi</span></div>' +
        '</div>';
      return;
    }

    var s = statusMeta(t.status);
    var c = catMeta(t.category);
    var p = prioMeta(t.priority);
    var mediaHtml = t.media && t.media.length
      ? '<div class="media-grid">' + t.media.map(mediaTile).join("") + '</div>'
      : '<div class="empty-line">Tidak ada media. Pelapor dapat mengirim menyusul.</div>';

    var clusterHtml = t.cluster
      ? '<div class="cluster-note">' + icon("i-layers") +
        '<span><b>' + t.cluster + ' laporan terkait</b> dalam radius ±300 m / 30 menit. ' +
        '<button class="link-btn" data-action="cluster">Lihat cluster</button></span></div>'
      : '';

    panel.innerHTML =
      '<div class="detail-head">' +
        '<div class="detail-id-row">' +
          '<span class="detail-id">' + t.id + '</span>' +
          '<button class="icon-btn" data-action="copy-id" title="Salin ID">' + icon("i-copy") + '</button>' +
          '<span class="status-chip" style="--c:' + s.color + '"><i class="dot"></i>' + s.label + '</span>' +
          '<button class="icon-btn detail-close" data-action="close-detail" title="Tutup">' + icon("i-close") + '</button>' +
        '</div>' +
        '<h2 class="detail-title">' + esc(t.title) + '</h2>' +
        '<div class="detail-sub">' + icon(c.icon) + '<b>' + esc(c.label) + '</b><span class="dot-sep">·</span>' +
          icon("i-pin") + '<b>' + esc(t.region) + '</b><span class="dot-sep">·</span>' +
          icon("i-clock") + '<span>' + wibTime(t.createdAt) + ' WIB</span></div>' +
      '</div>' +
      '<div class="detail-scroll">' +
        '<div class="priority-banner" style="--c:' + p.color + '"><b>' + t.priority + ' · ' + p.label + '</b>' +
          '<span>' + slaTarget(t.priority) + '</span><span class="mono">' + timeAgo(t.createdAt) + '</span></div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Pelapor</div>' +
          '<div class="person-card">' +
            '<span class="avatar">' + initials(t.reporterName) + '</span>' +
            '<div class="person-main">' +
              '<div class="person-name">' + esc(t.reporterName) +
                (t.reporter && t.reporter.verified ? '<span class="verified">' + icon("i-check") + ' Terverifikasi</span>' : '') +
              '</div>' +
              '<div class="person-sub">' + maskPhone(t.reporterPhone) + ' · <b>' + (t.reporter ? t.reporter.reports : 1) + ' laporan</b> · ' +
                (t.reporter ? t.reporter.valid : 1) + ' valid</div>' +
            '</div>' +
            '<div class="person-actions">' +
              '<button class="icon-btn" data-action="phone" title="Telepon">' + icon("i-phone") + '</button>' +
              '<button class="icon-btn" data-action="chat" title="Chat">' + icon("i-chat") + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Lokasi kejadian</div>' +
          '<div class="location-card">' +
            '<div class="location-visual"><span class="location-pin">' + icon("i-pin") + '</span></div>' +
            '<div class="location-body">' +
              '<div class="coord-row"><span>LAT <b>' + t.lat.toFixed(5) + '</b></span><span>LNG <b>' + t.lng.toFixed(5) + '</b></span><span>±' + t.accuracy + ' m</span></div>' +
              '<div class="location-address">' + esc(t.address) + '</div>' +
              '<div class="location-meta">Kel. ' + esc(t.region) + ' · ' + (t.status === "ditolak" ? "Perlu verifikasi" : "Terverifikasi (demo)") + '</div>' +
              '<div class="location-actions">' +
                '<button class="btn btn-ghost" data-action="open-maps">' + icon("i-map") + ' Buka Maps</button>' +
                '<button class="btn btn-ghost" data-action="copy-coord">' + icon("i-copy") + ' Salin</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Deskripsi</div>' +
          '<div class="description">' + esc(t.description) + '</div>' +
        '</div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Media · ' + (t.media ? t.media.length : 0) + '</div>' +
          mediaHtml + clusterHtml +
        '</div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Riwayat</div>' +
          '<ul class="timeline">' + timelineHtml(t) + '</ul>' +
        '</div>' +

        '<div class="detail-section">' +
          '<div class="detail-section-title">Catatan internal</div>' +
          (t.internalNote ? '<div class="note-history">' + esc(t.internalNote).replace(/\n/g, "<br>") + '</div>' : '') +
          '<div class="note-box"><input id="note-input" type="text" placeholder="Tambah catatan (hanya petugas)..." autocomplete="off">' +
          '<button class="icon-btn" data-action="add-note" title="Simpan catatan">' + icon("i-send") + '</button></div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' + actionsHtml(t) + '</div>';
  }

  function renderAll() {
    renderQueue();
    renderDetail();
    renderMapStats();
  }

  /* ============================================================
     Map
     ============================================================ */
  function mapFallback(id) {
    var el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<div class="map-fallback">' +
        '<div class="empty-icon">' + icon("i-map") + '</div>' +
        '<b>Peta tidak tersedia</b><span>Periksa koneksi internet untuk memuat tile peta. Daftar tiket tetap bisa dipakai.</span></div>';
    }
  }

  function baseMap(id) {
    if (typeof L === "undefined") {
      mapFallback(id);
      return null;
    }
    var map = L.map(id, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 13,
      maxZoom: 16,
      maxBounds: L.latLngBounds(MAP_BOUNDS).pad(0.03),
      maxBoundsViscosity: 0.8
    }).setView([-6.252, 106.984], 14);
    L.imageOverlay("assets/map-bekasi.jpg", MAP_BOUNDS, {
      className: "map-base-image",
      interactive: false
    }).addTo(map);
    map.attributionControl.addAttribution(MAP_ATTR);
    return map;
  }

  function addBoundaries(map, group) {
    regions.forEach(function (r) {
      var poly = L.polygon(r.polygon, {
        color: "#5a7488",
        weight: 1.2,
        opacity: 0.82,
        dashArray: "4 5",
        fillColor: "#FFB020",
        fillOpacity: 0.018,
        interactive: true
      }).addTo(group);
      poly.bindTooltip(r.name, { sticky: true, direction: "top" });
      poly.on("mouseover", function () {
        poly.setStyle({ color: "#8aa6bb", fillOpacity: 0.07 });
      });
      poly.on("mouseout", function () {
        poly.setStyle({ color: "#5a7488", fillOpacity: 0.018 });
      });
      L.marker(r.center, {
        icon: L.divIcon({
          className: "",
          html: '<div class="region-label">' + esc(r.name) + '</div>',
          iconSize: [110, 18],
          iconAnchor: [55, 9]
        }),
        interactive: false
      }).addTo(group);
    });
  }

  function pinHtml(t) {
    var s = statusMeta(t.status);
    var c = catMeta(t.category);
    var selected = t.id === state.selectedId;
    var done = isFinal(t);
    return '<div class="map-pin ' + (selected ? "is-selected " : "") + (done ? "is-done" : "") + '"' +
      ' style="--c:' + s.color + ';--cat:' + c.color + '" data-priority="' + t.priority + '">' +
      icon(c.icon) +
      (t.priority === "P1" && isActive(t) ? '<span class="pin-alert"></span>' : '') +
      '</div>';
  }

  function markerFor(t, onClick) {
    var marker = L.marker([t.lat, t.lng], {
      icon: L.divIcon({ className: "", html: pinHtml(t), iconSize: [32, 32], iconAnchor: [16, 16] }),
      riseOnHover: true,
      zIndexOffset: t.priority === "P1" ? 1200 : 0
    });
    marker.bindTooltip(shortId(t) + " · " + esc(t.categoryShort), { direction: "top", offset: [0, -14] });
    marker.on("click", onClick);
    return marker;
  }

  function renderLivePins() {
    if (!state.liveMap || !state.liveTicketLayer) return;
    state.liveTicketLayer.clearLayers();
    tickets.forEach(function (t) {
      markerFor(t, function () { selectTicket(t.id); }).addTo(state.liveTicketLayer);
    });
  }

  function renderLiveHeat() {
    if (!state.liveMap || !state.liveHeatLayer) return;
    state.liveHeatLayer.clearLayers();
    tickets.forEach(function (t) {
      var base = t.cluster ? 0.055 : 0.038;
      L.circle([t.lat, t.lng], {
        radius: t.cluster ? 520 : 340,
        stroke: false,
        fillColor: t.priority === "P1" ? "#FF5A5F" : "#FFB020",
        fillOpacity: base,
        interactive: false
      }).addTo(state.liveHeatLayer);
    });
    if (state.layers.heat && !state.liveMap.hasLayer(state.liveHeatLayer)) {
      state.liveMap.addLayer(state.liveHeatLayer);
    }
  }

  function initLiveMap() {
    if (state.liveMap) return;
    state.liveMap = baseMap("map");
    if (!state.liveMap) return;
    state.liveTicketLayer = L.layerGroup().addTo(state.liveMap);
    state.liveBoundaryLayer = L.layerGroup().addTo(state.liveMap);
    state.liveHeatLayer = L.layerGroup();
    addBoundaries(state.liveMap, state.liveBoundaryLayer);
    renderLivePins();
    renderLiveHeat();
    var bounds = L.latLngBounds(regions.map(function (r) { return r.center; }));
    state.liveMap.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
    setTimeout(function () { if (state.liveMap) state.liveMap.invalidateSize(); }, 120);
  }

  function applyMapFilters(list) {
    return list.filter(function (t) {
      if (state.mapFilters.status === "baru" && t.status !== "baru") return false;
      if (state.mapFilters.status === "proses" && ["diterima", "otw", "ditkp", "ditunda"].indexOf(t.status) < 0) return false;
      if (state.mapFilters.status === "selesai" && t.status !== "selesai") return false;
      if (state.mapFilters.category !== "all" && t.category !== state.mapFilters.category) return false;
      if (state.mapFilters.region !== "all" && t.region !== state.mapFilters.region) return false;
      return true;
    });
  }

  function renderFullLayers() {
    if (!state.fullMap || !state.fullTicketLayer) return;
    var list = applyMapFilters(tickets);
    state.fullTicketLayer.clearLayers();
    state.fullHeatLayer.clearLayers();

    list.forEach(function (t) {
      markerFor(t, function () {
        switchView("live");
        setTimeout(function () { selectTicket(t.id); }, 60);
      }).addTo(state.fullTicketLayer);
      L.circle([t.lat, t.lng], {
        radius: t.cluster ? 520 : 340,
        stroke: false,
        fillColor: t.priority === "P1" ? "#FF5A5F" : "#FFB020",
        fillOpacity: t.cluster ? 0.06 : 0.035,
        interactive: false
      }).addTo(state.fullHeatLayer);
    });

    if (state.fullLayers.heat && !state.fullMap.hasLayer(state.fullHeatLayer)) state.fullMap.addLayer(state.fullHeatLayer);
    if (!state.fullLayers.tickets && state.fullMap.hasLayer(state.fullTicketLayer)) state.fullMap.removeLayer(state.fullTicketLayer);
    if (state.fullLayers.tickets && !state.fullMap.hasLayer(state.fullTicketLayer)) state.fullMap.addLayer(state.fullTicketLayer);

    var count = $("#map-full-count");
    if (count) count.textContent = list.length + " tiket";
  }

  function initFullMap() {
    if (state.fullMap) return;
    state.fullMap = baseMap("map-full");
    if (!state.fullMap) return;
    state.fullBoundaryLayer = L.layerGroup().addTo(state.fullMap);
    state.fullTicketLayer = L.layerGroup().addTo(state.fullMap);
    state.fullHeatLayer = L.layerGroup();
    addBoundaries(state.fullMap, state.fullBoundaryLayer);
    renderFullLayers();
    var bounds = L.latLngBounds(regions.map(function (r) { return r.center; }));
    state.fullMap.fitBounds(bounds, { padding: [46, 46], maxZoom: 15 });
    setTimeout(function () { if (state.fullMap) state.fullMap.invalidateSize(); }, 120);
  }

  function refreshMaps() {
    if (state.liveMap) {
      renderLivePins();
      renderLiveHeat();
    }
    if (state.fullMap) renderFullLayers();
  }

  function selectTicket(id, opts) {
    opts = opts || {};
    var t = getTicket(id);
    if (!t) return;
    if (state.wall) {
      setWall(false, true);
      showToast("Mode dinding dimatikan", "Tiket dibuka untuk ditangani.", "info");
    }
    state.selectedId = id;
    t.unread = false;
    if (window.innerWidth <= 1200 || opts.drawer) {
      document.body.classList.add("detail-open");
    }
    renderAll();
    refreshMaps();
    if (state.liveMap && !opts.noPan) {
      state.liveMap.panTo([t.lat, t.lng], { animate: true, duration: 0.35 });
    }
    if (state.fullMap && state.view === "map" && !opts.noPan) {
      state.fullMap.panTo([t.lat, t.lng], { animate: true, duration: 0.35 });
    }
  }

  /* ============================================================
     Transitions
     ============================================================ */
  function transitionSelected(to) {
    var t = getSelected();
    if (!t) {
      showToast("Belum ada tiket dipilih", "Pilih tiket dari antrean terlebih dahulu.", "warn");
      return;
    }
    if (isFinal(t) && to !== "diterima") {
      showToast("Tiket sudah final", "Buka kembali tiket jika perlu tindak lanjut.", "warn");
      return;
    }
    if (to === "selesai" && !t.closeNote) {
      t.closeNote = "Ditutup dari dashboard. Penanganan selesai (demo).";
    }
    if (to === "ditolak") {
      t.rejectReason = "Ditandai tidak valid / palsu (demo).";
    }
    t.status = to;
    t.unread = false;
    var now = new Date().toISOString();
    if (to === "diterima") t.ackAt = now;
    if (to === "otw") {
      t.otwAt = now;
      t.assignee = t.assignee || "Aiptu Rina Marlina";
    }
    if (to === "ditkp") t.arriveAt = now;
    if (to === "selesai") t.closedAt = now;

    var label = {
      diterima: "Diterima piket",
      otw: "OTW ke TKP" + (t.assignee ? " — " + t.assignee : ""),
      ditkp: "Tiba di TKP",
      selesai: "Selesai — ditangani di lapangan",
      ditunda: "Ditunda — menunggu informasi tambahan",
      ditolak: "Laporan ditandai tidak valid / palsu"
    }[to] || ("Status diubah menjadi " + statusMeta(to).label);

    t.timeline.push({ label: label, actor: "Bripka Andi", at: now, done: true });
    t.timeline.forEach(function (e) { e.done = true; });

    if (to === "selesai" || to === "ditolak") {
      if (state.alarmTicketId === t.id) closeAlarm();
    }

    renderAll();
    refreshMaps();
    showToast("Tiket " + shortId(t) + " → " + statusMeta(to).label, label, to === "ditolak" ? "warn" : "success");
  }

  function advanceSelected() {
    var t = getSelected();
    if (!t) {
      showToast("Belum ada tiket dipilih", "Pilih tiket dari antrean terlebih dahulu.", "warn");
      return;
    }
    if (t.status === "baru") transitionSelected("diterima");
    else if (t.status === "diterima") transitionSelected("otw");
    else if (t.status === "otw") transitionSelected("ditkp");
    else if (t.status === "ditkp") transitionSelected("selesai");
    else if (t.status === "ditunda") transitionSelected("diterima");
    else showToast("Tidak ada aksi lanjutan", "Tiket berstatus " + statusMeta(t.status).label + ".", "info");
  }

  function reopenSelected() {
    var t = getSelected();
    if (!t) return;
    t.status = "diterima";
    t.timeline.push({
      label: "Tiket dibuka kembali oleh Pawas",
      actor: "Ipda Fajar",
      at: new Date().toISOString(),
      done: true
    });
    renderAll();
    refreshMaps();
    showToast("Tiket dibuka kembali", shortId(t) + " kembali ke antrean.", "success");
  }

  function addNote() {
    var t = getSelected();
    var input = $("#note-input");
    if (!t || !input) return;
    var value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    var now = new Date();
    var stamp = wibTime(now);
    t.internalNote = (t.internalNote ? t.internalNote + "\n" : "") + "[" + stamp + " WIB · Bripka Andi] " + value;
    t.timeline.push({
      label: "Catatan internal ditambahkan",
      actor: "Bripka Andi",
      at: now.toISOString(),
      done: true
    });
    renderDetail();
    showToast("Catatan ditambahkan", "Hanya terlihat oleh petugas.", "success");
  }

  /* ============================================================
     Alarm / simulation
     ============================================================ */
  function setWall(on, silent) {
    state.wall = !!on;
    document.body.classList.toggle("wall", state.wall);
    var btn = $("#wall-btn");
    if (btn) {
      btn.classList.toggle("is-active", state.wall);
      var span = btn.querySelector("span");
      if (span) span.textContent = state.wall ? "Keluar Dinding" : "Mode Dinding";
      btn.title = state.wall ? "Keluar mode dinding (W)" : "Mode Dinding (W)";
    }
    if (state.wall) document.body.classList.remove("detail-open");
    setTimeout(function () {
      if (state.liveMap) state.liveMap.invalidateSize();
      if (state.fullMap) state.fullMap.invalidateSize();
    }, 120);
    if (!silent) {
      showToast(
        state.wall ? "Mode dinding aktif" : "Mode dinding nonaktif",
        state.wall ? "Tampilan diperbesar untuk monitor piket. Klik tiket untuk keluar dan menangani." : "Kembali ke tampilan kerja.",
        "info"
      );
    }
  }

  function simulateTicket() {
    var templates = [
      {
        category: "tawuran", priority: "P1", title: "Tawuran di Jl. Raya Pekayon",
        region: "Pekayon Jaya", address: "Jl. Raya Pekayon, dekat pasar",
        reporter: "Rizky Maulana", cluster: 1,
        description: "Dua kelompok terlibat saling lempar. Warga meminta tim segera datang. Situasi masih ramai.",
        media: [{ kind: "photo", name: "IMG_2401.jpg", size: "2.2 MB" }, { kind: "video", name: "VID_2402.mp4", size: "14.8 MB", duration: 28 }]
      },
      {
        category: "pidana", priority: "P2", title: "Pencurian motor di parkiran",
        region: "Kayuringin Jaya", address: "Jl. Kayuringin Raya, parkiran minimarket",
        reporter: "Siti Aminah", cluster: 0,
        description: "Motor hilang sekitar 10 menit lalu. Pelaku terlihat membawa motor ke arah utara.",
        media: [{ kind: "photo", name: "IMG_5140.jpg", size: "1.7 MB" }]
      },
      {
        category: "bencana", priority: "P2", title: "Banjir di Jl. Marga Jaya",
        region: "Marga Jaya", address: "Jl. Marga Jaya RT 05/RW 02",
        reporter: "Ahmad Fauzi", cluster: 2,
        description: "Air masuk rumah warga, setinggi betis. Hujan masih deras. Ada lansia yang perlu dibantu.",
        media: [{ kind: "photo", name: "IMG_9012.jpg", size: "2.0 MB" }, { kind: "audio", name: "VN_9013.ogg", size: "0.7 MB", duration: 38 }]
      },
      {
        category: "laka", priority: "P2", title: "Laka lantas di Jl. Ahmad Yani",
        region: "Kayuringin Jaya", address: "Jl. Ahmad Yani, depan SPBU",
        reporter: "Dewi Lestari", cluster: 0,
        description: "Motor vs mobil, satu korban luka. Mobil kabur ke arah barat. Arus lalu lintas tersendat.",
        media: [{ kind: "photo", name: "IMG_5521.jpg", size: "1.5 MB" }]
      }
    ];
    var tpl = templates[Math.floor(Math.random() * templates.length)];
    var region = regions.filter(function (r) { return r.name === tpl.region; })[0] || regions[0];
    var reporter = D.REPORTERS.filter(function (r) { return r.name === tpl.reporter; })[0] || D.REPORTERS[0];
    var now = new Date();
    var seq = state.nextSeq++;
    var t = {
      id: "BKS-" + D.DATE_CODE + "-" + String(seq).padStart(3, "0"),
      seq: seq,
      title: tpl.title,
      category: tpl.category,
      categoryLabel: catMeta(tpl.category).label,
      categoryShort: catMeta(tpl.category).short,
      categoryIcon: catMeta(tpl.category).icon,
      priority: tpl.priority,
      status: "baru",
      region: tpl.region,
      address: tpl.address,
      lat: region.center[0] + (Math.random() - 0.5) * 0.004,
      lng: region.center[1] + (Math.random() - 0.5) * 0.004,
      accuracy: 8 + Math.round(Math.random() * 20),
      reporter: JSON.parse(JSON.stringify(reporter)),
      reporterName: reporter.name,
      reporterPhone: reporter.phone,
      source: "wa",
      description: tpl.description,
      media: tpl.media,
      cluster: tpl.cluster,
      assignee: null,
      eta: null,
      closeNote: null,
      rejectReason: null,
      internalNote: "",
      createdAt: now.toISOString(),
      timeline: [{ label: "Tiket dibuat oleh bot", actor: "SIGAP Bot", at: now.toISOString(), done: true }],
      sla: null,
      unread: true
    };

    tickets.unshift(t);
    state.filter = "all";
    var activeFilter = $(".filter-chip[data-filter='all']");
    if (activeFilter) {
      $$(".filter-chip").forEach(function (b) { b.classList.remove("is-active"); });
      activeFilter.classList.add("is-active");
    }
    state.selectedId = t.id;

    if (state.view !== "live") switchView("live");
    renderAll();
    refreshMaps();
    var ql = $("#queue-list");
    if (ql) ql.scrollTop = 0;
    showAlarm(t);
    playAlarm();
    if (!state.sound) {
      showToast("Laporan darurat masuk", "Aktifkan suara alarm di ikon lonceng untuk peringatan audio.", "warn");
    } else {
      showToast("Laporan darurat masuk", shortId(t) + " · " + t.title, "danger");
    }
  }

  /* ============================================================
     View switching
     ============================================================ */
  var VIEW_TITLES = {
    live: "Live Board",
    map: "Peta Wilkum",
    analytics: "Analitik",
    data: "Data & Registry",
    handover: "Serah Terima",
    system: "Sistem"
  };

  function switchView(view) {
    if (!VIEW_TITLES[view]) return;
    state.view = view;
    $$(".rail-item").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-view") === view); });
    $$(".view").forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-view-panel") === view); });
    var title = $("#view-title");
    if (title) title.textContent = VIEW_TITLES[view];
    document.body.classList.remove("detail-open");

    if (view === "map") {
      setTimeout(function () {
        initFullMap();
        if (state.fullMap) state.fullMap.invalidateSize();
      }, 60);
    } else if (view === "live") {
      setTimeout(function () { if (state.liveMap) state.liveMap.invalidateSize(); }, 60);
    } else if (view === "analytics") {
      renderAnalytics();
    } else if (view === "data") {
      renderDataTable();
    } else if (view === "handover") {
      renderHandover();
    } else if (view === "system") {
      renderSystem();
    }
    if (window.innerWidth <= 820) window.scrollTo(0, 0);
  }

  /* ============================================================
     Palette
     ============================================================ */
  function paletteActions() {
    return [
      { type: "action", action: "live", label: "Buka Live Board", sub: "Antrean, peta, dan detail tiket", icon: "i-activity" },
      { type: "action", action: "map", label: "Buka Peta Wilkum", sub: "Sebaran tiket dan titik rawan", icon: "i-map" },
      { type: "action", action: "analytics", label: "Buka Analitik", sub: "Volume, SLA, dan pola laporan", icon: "i-chart" },
      { type: "action", action: "handover", label: "Buka Serah Terima", sub: "Checklist pergantian shift", icon: "i-swap" },
      { type: "action", action: "simulate", label: "Simulasi laporan baru", sub: "Membuat tiket demo + alarm", icon: "i-plus" },
      { type: "action", action: "wall", label: "Mode Dinding", sub: "Tampilan monitor piket", icon: "i-expand" }
    ];
  }

  function openPalette() {
    var el = $("#palette");
    if (!el) return;
    el.hidden = false;
    var input = $("#palette-input");
    if (input) {
      input.value = "";
      setTimeout(function () { input.focus(); }, 20);
    }
    state.paletteIndex = 0;
    renderPaletteResults("");
  }

  function closePalette() {
    var el = $("#palette");
    if (el) el.hidden = true;
  }

  function renderPaletteResults(query) {
    var q = String(query || "").toLowerCase().trim();
    var ticketItems = tickets.filter(function (t) {
      if (!q) return true;
      return (t.title + " " + t.id + " " + t.reporterName + " " + t.region + " " + t.categoryLabel).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 7);

    var actions = paletteActions().filter(function (a) {
      if (!q) return true;
      return (a.label + " " + a.sub).toLowerCase().indexOf(q) >= 0;
    });

    state.paletteItems = [];
    var html = "";

    if (ticketItems.length) {
      html += '<div class="palette-section">Tiket</div>';
      ticketItems.forEach(function (t) {
        var idx = state.paletteItems.length;
        state.paletteItems.push({ type: "ticket", id: t.id });
        html += '<button class="palette-item" data-palette-item="' + idx + '">' +
          '<span class="palette-icon">' + icon(catMeta(t.category).icon) + '</span>' +
          '<span class="palette-main"><b>' + shortId(t) + " · " + esc(t.title) + '</b>' +
          '<span>' + esc(t.reporterName) + " · " + esc(t.region) + " · " + statusMeta(t.status).label + '</span></span>' +
          '<span class="palette-meta">' + timeAgoShort(t.createdAt) + '</span></button>';
      });
    }

    if (actions.length) {
      html += '<div class="palette-section">Aksi</div>';
      actions.forEach(function (a) {
        var idx = state.paletteItems.length;
        state.paletteItems.push({ type: "action", action: a.action });
        html += '<button class="palette-item" data-palette-item="' + idx + '">' +
          '<span class="palette-icon">' + icon(a.icon) + '</span>' +
          '<span class="palette-main"><b>' + esc(a.label) + '</b><span>' + esc(a.sub) + '</span></span>' +
          '<span class="palette-meta">↵</span></button>';
      });
    }

    if (!html) html = '<div class="palette-empty">Tidak ada hasil untuk "' + esc(query) + '".</div>';
    var results = $("#palette-results");
    if (results) results.innerHTML = html;
    highlightPalette();
  }

  function highlightPalette() {
    $$(".palette-item").forEach(function (el, i) {
      el.classList.toggle("is-active", i === state.paletteIndex);
    });
  }

  function executePaletteItem(index) {
    var item = state.paletteItems[index];
    if (!item) return;
    closePalette();
    if (item.type === "ticket") {
      switchView("live");
      setTimeout(function () { selectTicket(item.id); }, 40);
    } else if (item.type === "action") {
      if (item.action === "simulate") simulateTicket();
      else if (item.action === "wall") setWall(!state.wall);
      else switchView(item.action);
    }
  }

  /* ============================================================
     Analytics
     ============================================================ */
  function sparkline(values, color) {
    var w = 46, h = 20, min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var range = max - min || 1;
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * w;
      var y = h - 2 - ((v - min) / range) * (h - 4);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return '<svg class="kpi-spark" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".78"/></svg>';
  }

  function renderKpis() {
    var el = $("#kpi-grid");
    if (!el) return;
    var colors = ["#FFB020", "#4D9FFF", "#8B8CFF", "#36D399", "#FF5A5F"];
    el.innerHTML = D.ANALYTICS.kpis.map(function (k, i) {
      return '<div class="kpi-card">' +
        '<div class="kpi-label">' + esc(k.label) + '</div>' +
        '<div class="kpi-value">' + esc(k.value) + '</div>' +
        '<div class="kpi-delta ' + (k.up ? "" : "down") + '">' + (k.down ? "▼" : "▲") + " " + esc(k.delta) + " vs pekan lalu</div>" +
        sparkline(k.spark, colors[i % colors.length]) +
      '</div>';
    }).join("");
  }

  function renderHeatmap() {
    var el = $("#heatmap");
    if (!el) return;
    var max = 0;
    D.HEAT.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });
    var html = "";
    D.HEAT.forEach(function (row, d) {
      html += '<div class="heat-row"><span class="heat-day">' + D.DAYS[d] + '</span>';
      row.forEach(function (v, h) {
        var alpha = 0.04 + (v / max) * 0.88;
        html += '<span class="heat-cell" style="background:rgba(255,176,32,' + alpha.toFixed(3) + ')" title="' +
          D.DAYS[d] + " " + pad2(h) + ":00 — " + v + ' laporan"></span>';
      });
      html += '</div>';
    });
    html += '<div class="heat-hours"><span></span>';
    for (var h = 0; h < 24; h++) {
      html += '<span class="heat-hour">' + (h % 3 === 0 ? pad2(h) : "") + '</span>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function renderDonut() {
    var el = $("#donut");
    var legend = $("#donut-legend");
    if (!el || !legend) return;
    var data = D.ANALYTICS.categories;
    var total = data.reduce(function (s, d) { return s + d.count; }, 0);
    var r = 54, circ = 2 * Math.PI * r;
    var offset = 0;
    var svg = '<svg viewBox="0 0 132 132">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="rgba(255,255,255,.045)" stroke-width="14"/>';
    data.forEach(function (d) {
      var len = (d.count / total) * circ;
      var gap = 2.2;
      svg += '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="14" ' +
        'stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + " " + (circ - Math.max(0, len - gap)).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" stroke-linecap="butt"/>';
      offset += len;
    });
    svg += '</svg><div class="donut-center"><b>' + total + '</b><span>laporan</span></div>';
    el.innerHTML = svg;
    legend.innerHTML = data.map(function (d) {
      return '<div class="donut-legend-row"><i style="--c:' + d.color + '"></i><span>' + esc(d.label) + '</span><b>' + d.count + '</b></div>';
    }).join("");
  }

  function renderRegionBars() {
    var el = $("#region-bars");
    if (!el) return;
    var max = Math.max.apply(null, D.ANALYTICS.regions.map(function (r) { return r.count; }));
    var total = D.ANALYTICS.regions.reduce(function (s, r) { return s + r.count; }, 0);
    var summary = '<div class="region-summary">' +
      '<div><b>' + total + '</b><span>total laporan</span></div>' +
      '<div><b>' + D.ANALYTICS.regions.length + '</b><span>kelurahan</span></div>' +
      '<div class="region-summary-note">Tertinggi:<br><b>Pekayon Jaya</b></div>' +
      '</div>';
    el.innerHTML = summary + D.ANALYTICS.regions.map(function (r) {
      var pct = Math.round((r.count / max) * 100);
      return '<div class="region-row"><span class="region-name">' + esc(r.name) + '</span>' +
        '<span class="region-track"><span class="region-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="region-value">' + r.count + '</span></div>';
    }).join("") +
      '<div class="region-footer"><span>Cakupan wilkum</span><span class="region-coverage"><i></i></span><b>5 / 5</b></div>';
  }

  function renderSla() {
    var el = $("#sla-chart");
    if (!el) return;
    var w = 620, h = 168, left = 30, right = 10, top = 12, bottom = 22;
    var plotW = w - left - right, plotH = h - top - bottom;
    var maxY = 8;
    var days = D.ANALYTICS.sla.days;
    var p50 = D.ANALYTICS.sla.p50;
    var p90 = D.ANALYTICS.sla.p90;

    function x(i) { return left + (i / (days.length - 1)) * plotW; }
    function y(v) { return top + plotH - (v / maxY) * plotH; }

    var grid = "";
    for (var v = 0; v <= 8; v += 2) {
      var yy = y(v);
      grid += '<line class="chart-grid" x1="' + left + '" y1="' + yy + '" x2="' + (w - right) + '" y2="' + yy + '"/>';
      grid += '<text class="chart-axis" x="' + (left - 8) + '" y="' + (yy + 2.5) + '" text-anchor="end">' + v + "m</text>";
    }
    var targetY = y(2);
    grid += '<line x1="' + left + '" y1="' + targetY + '" x2="' + (w - right) + '" y2="' + targetY + '" stroke="#FF5A5F" stroke-width="1" stroke-dasharray="3 4" opacity=".45"/>';
    grid += '<text class="chart-axis" x="' + (w - right) + '" y="' + (targetY - 4) + '" text-anchor="end" fill="#ff7b7f">target 2m</text>';

    var p50pts = p50.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
    var p90pts = p90.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
    var area = "M" + x(0) + "," + (top + plotH) + " L" + p50pts.replace(/ /g, " L") + " L" + x(days.length - 1) + "," + (top + plotH) + " Z";

    var dots = p50.map(function (v, i) {
      return '<circle class="chart-dot" cx="' + x(i) + '" cy="' + y(v) + '" r="2.4"/>';
    }).join("");

    var labels = days.map(function (d, i) {
      return '<text class="chart-axis" x="' + x(i) + '" y="' + (h - 6) + '" text-anchor="middle">' + d + "</text>";
    }).join("");

    el.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Grafik SLA">' +
      '<defs><linearGradient id="areaAmber" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#FFB020" stop-opacity=".26"/><stop offset="100%" stop-color="#FFB020" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path class="chart-area" d="' + area + '"/>' +
      '<polyline class="chart-line-p90" points="' + p90pts + '"/>' +
      '<polyline class="chart-line-p50" points="' + p50pts + '"/>' +
      dots + labels + '</svg>';
  }

  function renderHotspots() {
    var side = $("#hotspot-list");
    if (side) {
      side.innerHTML = D.ANALYTICS.hotspots.map(function (h, i) {
        return '<div class="hotspot-row"><span class="hotspot-rank">' + pad2(i + 1) + '</span>' +
          '<span class="hotspot-main"><b>' + esc(h.name) + '</b><span>' + esc(h.region) + '</span></span>' +
          '<span class="hotspot-count">' + h.count + '</span>' +
          '<span class="hotspot-trend ' + (h.trend.charAt(0) === "-" ? "down" : "") + '">' + esc(h.trend) + '</span></div>';
      }).join("");
    }
    var table = $("#hotspot-table");
    if (table) {
      table.innerHTML = D.ANALYTICS.hotspots.map(function (h, i) {
        return '<div class="hotspot-table-row"><span class="rank">' + pad2(i + 1) + '</span>' +
          '<span class="hs-name">' + esc(h.name) + '<br><span class="hs-region">' + esc(h.region) + '</span></span>' +
          '<span class="hs-count">' + h.count + '</span></div>';
      }).join("");
    }
  }

  function renderAnalytics() {
    renderKpis();
    renderHeatmap();
    renderDonut();
    renderRegionBars();
    renderSla();
    renderHotspots();
  }

  /* ============================================================
     Data tables
     ============================================================ */
  function tableHtml(headers, rows) {
    return '<table class="data-table"><thead><tr>' +
      headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table>';
  }

  function renderDataTable() {
    var wrap = $("#data-table");
    var countEl = $("#data-count");
    if (!wrap) return;
    var q = state.dataQuery.toLowerCase().trim();
    var rows = [];
    var headers = [];

    if (state.dataTab === "reporter") {
      headers = ["Pelapor", "Wilayah", "Laporan", "Valid", "Status", "Terakhir"];
      rows = D.REPORTERS.filter(function (r) {
        return !q || (r.name + " " + r.phone + " " + r.region).toLowerCase().indexOf(q) >= 0;
      }).map(function (r) {
        return "<tr><td><span class=\"cell-person\"><span class=\"mini-avatar\">" + initials(r.name) + "</span>" +
          "<span><span class=\"cell-name\">" + esc(r.name) + "</span><br><span class=\"cell-sub mono\">" + maskPhone(r.phone) + "</span></span></span></td>" +
          "<td>" + esc(r.region) + "</td>" +
          "<td class=\"mono\">" + r.reports + "</td>" +
          "<td class=\"mono\">" + r.valid + "</td>" +
          "<td>" + (r.verified ? '<span class="badge green">Terverifikasi</span>' : '<span class="badge muted">Belum</span>') + "</td>" +
          "<td class=\"mono\">" + timeAgo(r.last) + "</td></tr>";
      });
    } else if (state.dataTab === "officer") {
      headers = ["Petugas", "Role", "Wilayah", "JID WhatsApp", "Status"];
      rows = D.OFFICERS.filter(function (o) {
        return !q || (o.name + " " + o.role + " " + o.region + " " + o.jid).toLowerCase().indexOf(q) >= 0;
      }).map(function (o) {
        return "<tr><td><span class=\"cell-person\"><span class=\"mini-avatar\">" + initials(o.name) + "</span>" +
          "<span><span class=\"cell-name\">" + esc(o.name) + "</span><br><span class=\"cell-sub\">" + esc(o.rank) + "</span></span></span></td>" +
          "<td>" + esc(o.role) + "</td>" +
          "<td>" + esc(o.region) + "</td>" +
          "<td class=\"mono\">" + esc(o.jid) + "</td>" +
          "<td><span class=\"badge " + (o.active ? "green" : "muted") + "\">" + (o.active ? "Aktif" : "Nonaktif") + "</span></td></tr>";
      });
    } else if (state.dataTab === "region") {
      headers = ["Kelurahan", "Bhabinkamtibmas", "Polygon", "Tiket 30 hari", "Status"];
      rows = regions.filter(function (r) {
        return !q || (r.name + " " + r.bhabin).toLowerCase().indexOf(q) >= 0;
      }).map(function (r) {
        return "<tr><td><span class=\"cell-name\">" + esc(r.name) + "</span></td>" +
          "<td>" + esc(r.bhabin) + "</td>" +
          "<td><span class=\"badge green\">Terverifikasi</span></td>" +
          "<td class=\"mono\">" + r.tickets30d + "</td>" +
          "<td><span class=\"badge blue\">Aktif</span></td></tr>";
      });
    } else {
      headers = ["Grup", "Fungsi", "JID", "Anggota", "Status", "Command"];
      rows = D.GROUPS.filter(function (g) {
        return !q || (g.name + " " + g.purpose + " " + g.jid).toLowerCase().indexOf(q) >= 0;
      }).map(function (g) {
        return "<tr><td><span class=\"cell-name\">" + esc(g.name) + "</span></td>" +
          "<td>" + esc(g.purpose) + "</td>" +
          "<td class=\"mono\">" + esc(g.jid) + "</td>" +
          "<td class=\"mono\">" + g.members + "</td>" +
          "<td><span class=\"badge green\">" + esc(g.status) + "</span></td>" +
          "<td class=\"mono\">" + g.commands + "</td></tr>";
      });
    }

    wrap.innerHTML = rows.length ? tableHtml(headers, rows) : '<div class="data-empty">Tidak ada data yang cocok.</div>';
    if (countEl) countEl.textContent = rows.length + " baris";
  }

  /* ============================================================
     Handover
     ============================================================ */
  function renderHandover() {
    var open = tickets.filter(isActive);
    var p1 = open.filter(function (t) { return t.priority === "P1"; }).length;
    var baruOld = open.filter(function (t) {
      return t.status === "baru" && (Date.now() - new Date(t.createdAt).getTime()) > 30 * 60000;
    }).length;
    var ditunda = open.filter(function (t) { return t.status === "ditunda"; }).length;
    var mediaFailed = 0;

    var checklist = [
      { label: "Semua tiket P1 sudah di-ack", count: p1, checked: p1 === 0 },
      { label: "Tidak ada tiket BARU > 30 menit", count: baruOld, checked: baruOld === 0 },
      { label: "Tiket DITUNDA punya alasan", count: ditunda, checked: ditunda === 0 },
      { label: "Media gagal diunduh dicatat", count: mediaFailed, checked: true },
      { label: "Catatan shift diisi", count: 0, checked: false }
    ];

    var cl = $("#handover-checklist");
    if (cl) {
      cl.innerHTML = checklist.map(function (c, i) {
        return '<label class="check-item"><input type="checkbox" ' + (c.checked ? "checked" : "") + '>' +
          '<span class="check-box">' + icon("i-check") + '</span>' +
          '<span class="check-label">' + esc(c.label) + '</span>' +
          (c.count ? '<span class="count">' + c.count + '</span>' : "") + '</label>';
      }).join("");
    }

    var list = $("#handover-tickets");
    if (list) {
      list.innerHTML = open.length ? sortTickets(open).map(function (t) {
        var s = statusMeta(t.status);
        return '<button class="handover-ticket" data-handover-ticket="' + t.id + '">' +
          '<span class="ht-main"><span class="ht-id">' + t.id + '</span>' +
          '<span class="ht-title">' + esc(t.title) + '</span>' +
          '<span class="ht-meta">' + esc(t.region) + " · " + (t.assignee ? esc(t.assignee) : "Belum ditugaskan") + '</span></span>' +
          '<span class="status-chip" style="--c:' + s.color + '"><i class="dot"></i>' + s.label + '</span>' +
          '<span class="ht-age">' + timeAgoShort(t.createdAt) + '</span></button>';
      }).join("") : '<div class="data-empty">Tidak ada tiket terbuka. Shift bersih.</div>';
    }

    var hc = $("#handover-count");
    if (hc) hc.textContent = open.length;

    var summary = $("#shift-summary");
    if (summary) {
      var closed = tickets.filter(function (t) { return t.status === "selesai"; }).length;
      summary.innerHTML =
        '<div><b>' + tickets.length + '</b><span>tiket masuk</span></div>' +
        '<div><b>' + closed + '</b><span>selesai</span></div>' +
        '<div><b>' + open.length + '</b><span>terbuka</span></div>' +
        '<div><b>' + p1 + '</b><span>P1 aktif</span></div>';
    }

    var sign = $("#handover-sign-time");
    if (sign) {
      var date = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric"
      }).format(new Date());
      sign.textContent = date + " · " + wibTime(new Date()) + " WIB";
    }
  }

  /* ============================================================
     System
     ============================================================ */
  function renderSystem() {
    var grid = $("#system-grid");
    if (grid) {
      var cards = [
        { icon: "i-whatsapp", label: "WhatsApp Gateway", value: "ONLINE", sub: "Uptime 18 hari 4 jam", dot: true },
        { icon: "i-database", label: "Database", value: "24 MB", sub: "SQLite WAL · backup 02:00", dot: true },
        { icon: "i-hard-drive", label: "Media storage", value: "1,8 GB", sub: "2,2% dari 80 GB", dot: true },
        { icon: "i-send", label: "Outbox", value: "0 pending", sub: "0 gagal · terakhir 12 dtk lalu", dot: false }
      ];
      grid.innerHTML = cards.map(function (c) {
        return '<div class="sys-card"><span class="sys-icon">' + icon(c.icon) + '</span>' +
          '<span class="sys-main"><span class="sys-label">' + esc(c.label) + '</span>' +
          '<span class="sys-value">' + esc(c.value) + '</span>' +
          '<span class="sys-sub">' + esc(c.sub) + '</span></span>' +
          '<span class="sys-dot ' + (c.dot ? "" : "amber") + '"></span></div>';
      }).join("");
    }

    var audit = $("#audit-table");
    if (audit) {
      audit.innerHTML = D.AUDIT.map(function (a) {
        return '<div class="audit-row"><span class="audit-time">' + esc(a.time) + '</span>' +
          '<span class="audit-main"><span class="audit-action">' + esc(a.action) + '</span>' +
          '<span class="audit-sub">' + esc(a.actor) + " · " + esc(a.ip) + '</span></span>' +
          '<span class="audit-entity">' + esc(a.entity) + '</span></div>';
      }).join("");
    }
  }

  function renderQr() {
    var grid = $("#qr-grid");
    if (!grid) return;
    var n = 21;
    var html = "";
    function inFinder(r, c, fr, fc) {
      if (r < fr || r >= fr + 7 || c < fc || c >= fc + 7) return false;
      var rr = r - fr, cc = c - fc;
      return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
    }
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var on = inFinder(r, c, 0, 0) || inFinder(r, c, 0, 14) || inFinder(r, c, 14, 0);
        if (!on && !((r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7))) {
          on = ((r * 7 + c * 13 + r * c) % 5) < 2;
        }
        html += '<i class="' + (on ? "on" : "") + '"></i>';
      }
    }
    grid.innerHTML = html;
  }

  /* ============================================================
     Map filters UI
     ============================================================ */
  function renderMapFilters() {
    var statuses = [
      ["all", "Semua"], ["baru", "Baru"], ["proses", "Proses"], ["selesai", "Selesai"]
    ];
    var sEl = $("#map-status-filters");
    if (sEl) {
      sEl.innerHTML = statuses.map(function (s) {
        return '<button class="mini-chip ' + (state.mapFilters.status === s[0] ? "is-active" : "") + '" data-map-status="' + s[0] + '">' +
          (s[0] !== "all" ? '<i style="--c:' + (statusMeta(s[0]).color || "#8496a6") + '"></i>' : "") + s[1] + '</button>';
      }).join("");
    }

    var cats = [["all", "Semua"]].concat(Object.keys(D.CATEGORIES).map(function (k) {
      return [k, D.CATEGORIES[k].short];
    }));
    var cEl = $("#map-cat-filters");
    if (cEl) {
      cEl.innerHTML = cats.map(function (c) {
        return '<button class="mini-chip ' + (state.mapFilters.category === c[0] ? "is-active" : "") + '" data-map-cat="' + c[0] + '">' +
          (c[0] !== "all" ? '<i style="--c:' + D.CATEGORIES[c[0]].color + '"></i>' : "") + esc(c[1]) + '</button>';
      }).join("");
    }

    var rEl = $("#map-region-select");
    if (rEl) {
      rEl.innerHTML = '<option value="all">Semua kelurahan</option>' + regions.map(function (r) {
        return '<option value="' + esc(r.name) + '"' + (state.mapFilters.region === r.name ? " selected" : "") + '>' + esc(r.name) + '</option>';
      }).join("");
    }
  }

  /* ============================================================
     Clock
     ============================================================ */
  function tick() {
    var now = new Date();
    var timeEl = $("#clock-time");
    var dateEl = $("#clock-date");
    if (timeEl) timeEl.textContent = wibTime(now, true);
    if (dateEl) {
      dateEl.textContent = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", weekday: "short", day: "2-digit", month: "short", year: "numeric"
      }).format(now);
    }
    var hour = parseInt(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false
    }).format(now), 10);
    var shift = $("#shift-tag");
    if (shift) shift.textContent = (hour >= 8 && hour < 20) ? "Shift Siang · 08:00–20:00" : "Shift Malam · 20:00–08:00";
  }

  /* ============================================================
     Debug / demo helpers
     ============================================================ */
  function openLightbox(mediaIndex) {
    var t = getSelected();
    if (!t || !t.media || !t.media[mediaIndex]) return;
    var m = t.media[mediaIndex];
    var kind = m.kind === "audio" ? "VOICE NOTE" : m.kind === "video" ? "VIDEO TKP" : "FOTO TKP";
    $("#lightbox-kind").textContent = kind;
    $("#lightbox-name").textContent = m.name;
    $("#lightbox-meta").textContent = (m.size || "—") + " · SHA-256 9f2c…a1";
    var body = $("#lightbox-body");
    if (m.kind === "audio") {
      var bars = "";
      for (var i = 0; i < 56; i++) bars += '<i style="--h:' + (14 + Math.abs(Math.sin(i * 1.2)) * 78).toFixed(0) + '%"></i>';
      body.innerHTML = '<div class="lb-audio">' + icon("i-play") + '<span class="waveform">' + bars + '</span><span class="mono">' + (m.duration || 0) + "s</span></div>";
    } else {
      body.innerHTML = icon(m.kind === "video" ? "i-play" : "i-camera");
    }
    $("#lightbox").hidden = false;
  }

  function closeLightbox() {
    var el = $("#lightbox");
    if (el) el.hidden = true;
  }

  /* ============================================================
     Events
     ============================================================ */
  function bindEvents() {
    document.addEventListener("click", function (e) {
      var paletteItem = e.target.closest("[data-palette-item]");
      if (paletteItem) {
        executePaletteItem(parseInt(paletteItem.getAttribute("data-palette-item"), 10));
        return;
      }

      var viewBtn = e.target.closest("[data-view]");
      if (viewBtn) {
        switchView(viewBtn.getAttribute("data-view"));
        return;
      }

      var filterBtn = e.target.closest("[data-filter]");
      if (filterBtn) {
        state.filter = filterBtn.getAttribute("data-filter");
        $$(".filter-chip").forEach(function (b) { b.classList.toggle("is-active", b === filterBtn); });
        renderQueue();
        return;
      }

      var row = e.target.closest(".ticket-row");
      if (row) {
        selectTicket(row.getAttribute("data-id"));
        return;
      }

      var handover = e.target.closest("[data-handover-ticket]");
      if (handover) {
        switchView("live");
        setTimeout(function () { selectTicket(handover.getAttribute("data-handover-ticket")); }, 50);
        return;
      }

      var media = e.target.closest("[data-media]");
      if (media) {
        openLightbox(parseInt(media.getAttribute("data-media"), 10));
        return;
      }

      var tab = e.target.closest("[data-tab]");
      if (tab) {
        state.dataTab = tab.getAttribute("data-tab");
        $$(".tab").forEach(function (b) { b.classList.toggle("is-active", b === tab); });
        renderDataTable();
        return;
      }

      var action = e.target.closest("[data-action]");
      if (action) {
        handleAction(action.getAttribute("data-action"));
        return;
      }

      var toastBtn = e.target.closest("[data-toast]");
      if (toastBtn) {
        showToast(toastBtn.getAttribute("data-toast"), "Aksi ini hanya tersedia di prototipe.", "info");
        return;
      }

      if (e.target.id === "palette") closePalette();
      if (e.target.id === "lightbox") closeLightbox();
    });

    function handleAction(action) {
      var t = getSelected();
      if (action === "advance") advanceSelected();
      else if (action === "tunda") transitionSelected("ditunda");
      else if (action === "reject") transitionSelected("ditolak");
      else if (action === "reopen") reopenSelected();
      else if (action === "add-note") addNote();
      else if (action === "close-detail") document.body.classList.remove("detail-open");
      else if (action === "phone") {
        if (t) showToast("Menghubungi " + t.reporterName, maskPhone(t.reporterPhone) + " — simulasi prototipe.", "info");
      } else if (action === "chat") {
        if (t) showToast("Membuka chat", "Percakapan dengan " + t.reporterName + " (demo).", "info");
      } else if (action === "copy-id") {
        if (t) copyText(t.id, "ID tiket " + t.id);
      } else if (action === "copy-coord") {
        if (t) copyText(t.lat + ", " + t.lng, "Koordinat disalin");
      } else if (action === "open-maps") {
        if (t) window.open("https://www.google.com/maps/search/?api=1&query=" + t.lat + "," + t.lng, "_blank", "noopener");
      } else if (action === "cluster") {
        showToast("Cluster laporan", (t ? t.cluster : 0) + " laporan terkait dalam radius ±300 m / 30 menit. Tampilan cluster ada di backlog v1.1.", "info");
      } else if (action === "refresh") {
        renderAll();
        refreshMaps();
        showToast("Data diperbarui", "Sinkron dengan gateway (demo).", "success");
      }
    }

    $("#search-trigger").addEventListener("click", openPalette);
    $("#sound-btn").addEventListener("click", toggleSound);
    $("#wall-btn").addEventListener("click", function () { setWall(!state.wall); });
    $("#simulate-btn").addEventListener("click", simulateTicket);
    $("#rail-simulate").addEventListener("click", simulateTicket);
    $("#queue-refresh").addEventListener("click", function () {
      renderAll();
      refreshMaps();
      showToast("Data diperbarui", "Sinkron dengan gateway (demo).", "success");
    });
    $("#zoom-in").addEventListener("click", function () { if (state.liveMap) state.liveMap.zoomIn(); });
    $("#zoom-out").addEventListener("click", function () { if (state.liveMap) state.liveMap.zoomOut(); });
    $("#alarm-open").addEventListener("click", function () {
      closeAlarm();
      if (state.alarmTicketId) selectTicket(state.alarmTicketId);
    });
    $("#alarm-dismiss").addEventListener("click", closeAlarm);
    $("#lightbox-close").addEventListener("click", closeLightbox);
    $("#analytics-export").addEventListener("click", function () {
      showToast("Export disiapkan", "Rekap 7 hari dalam PDF/Excel (demo).", "info");
    });
    $("#map-reset").addEventListener("click", function () {
      state.mapFilters = { status: "all", category: "all", region: "all" };
      renderMapFilters();
      renderFullLayers();
      showToast("Filter direset", "Menampilkan semua tiket.", "info");
    });

    $$(".layer-chip[data-layer]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-layer");
        state.layers[key] = !state.layers[key];
        btn.classList.toggle("is-active", state.layers[key]);
        var group = key === "tickets" ? state.liveTicketLayer : key === "boundaries" ? state.liveBoundaryLayer : state.liveHeatLayer;
        if (!group || !state.liveMap) return;
        if (state.layers[key]) state.liveMap.addLayer(group);
        else state.liveMap.removeLayer(group);
      });
    });

    $$(".layer-chip[data-full-layer]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!state.fullMap) return;
        var key = btn.getAttribute("data-full-layer");
        state.fullLayers[key] = !state.fullLayers[key];
        btn.classList.toggle("is-active", state.fullLayers[key]);
        if (key === "tickets") {
          if (state.fullLayers.tickets) state.fullMap.addLayer(state.fullTicketLayer);
          else state.fullMap.removeLayer(state.fullTicketLayer);
        } else {
          if (state.fullLayers.heat) state.fullMap.addLayer(state.fullHeatLayer);
          else state.fullMap.removeLayer(state.fullHeatLayer);
        }
      });
    });

    $$("[data-full-zoom]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!state.fullMap) return;
        if (btn.getAttribute("data-full-zoom") === "in") state.fullMap.zoomIn();
        else state.fullMap.zoomOut();
      });
    });

    $("#map-status-filters").addEventListener("click", function (e) {
      var chip = e.target.closest("[data-map-status]");
      if (!chip) return;
      state.mapFilters.status = chip.getAttribute("data-map-status");
      renderMapFilters();
      renderFullLayers();
    });
    $("#map-cat-filters").addEventListener("click", function (e) {
      var chip = e.target.closest("[data-map-cat]");
      if (!chip) return;
      state.mapFilters.category = chip.getAttribute("data-map-cat");
      renderMapFilters();
      renderFullLayers();
    });
    $("#map-region-select").addEventListener("change", function (e) {
      state.mapFilters.region = e.target.value;
      renderFullLayers();
    });
    $("#map-period").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      $$("#map-period button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      showToast("Periode diubah", b.textContent + " (demo).", "info");
    });

    $("#data-search").addEventListener("input", function (e) {
      state.dataQuery = e.target.value;
      renderDataTable();
    });

    $("#analytics-range").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      $$("#analytics-range button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      showToast("Rentang diubah", b.textContent + " (demo).", "info");
    });

    $("#handover-note").addEventListener("input", function (e) {
      state.handoverNote = e.target.value;
    });

    $("#handover-submit").addEventListener("click", function () {
      var note = $("#handover-note").value.trim();
      if (!note) {
        showToast("Catatan shift masih kosong", "Isi catatan sebelum menandatangani serah terima.", "warn");
        $("#handover-note").focus();
        return;
      }
      state.handoverSigned = true;
      var btn = $("#handover-submit");
      btn.disabled = true;
      btn.innerHTML = icon("i-check-circle") + " Terserahkan";
      showToast("Serah terima tercatat", "Tiket terbuka dan catatan diteruskan ke shift berikutnya.", "success");
    });

    var paletteInput = $("#palette-input");
    paletteInput.addEventListener("input", function (e) {
      state.paletteIndex = 0;
      renderPaletteResults(e.target.value);
    });
    paletteInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1);
        highlightPalette();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.paletteIndex = Math.max(0, state.paletteIndex - 1);
        highlightPalette();
      } else if (e.key === "Enter") {
        e.preventDefault();
        executePaletteItem(state.paletteIndex);
      }
    });

    document.addEventListener("keydown", function (e) {
      var target = e.target;
      var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

      if (e.key === "Escape") {
        if (!$("#palette").hidden) { closePalette(); return; }
        if (!$("#lightbox").hidden) { closeLightbox(); return; }
        if (document.body.classList.contains("detail-open")) { document.body.classList.remove("detail-open"); return; }
        closeAlarm();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if ($("#palette").hidden) openPalette();
        else closePalette();
        return;
      }

      if (typing) return;

      if (e.key === "/") {
        e.preventDefault();
        openPalette();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        advanceSelected();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        var t1 = getSelected();
        if (t1 && t1.status === "otw") transitionSelected("ditkp");
        else showToast("Aksi tidak tersedia", "Tiba di TKP hanya dari status OTW.", "warn");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        simulateTicket();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setWall(!state.wall);
      } else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4" || e.key === "5" || e.key === "6") {
        var views = ["live", "map", "analytics", "data", "handover", "system"];
        switchView(views[parseInt(e.key, 10) - 1]);
      }
    });

    document.getElementById("detail-panel").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "note-input") {
        e.preventDefault();
        addNote();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1200) document.body.classList.remove("detail-open");
      if (state.liveMap) state.liveMap.invalidateSize();
      if (state.fullMap) state.fullMap.invalidateSize();
    });
  }

  function moveSelection(delta) {
    var list = filteredTickets();
    if (!list.length) return;
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === state.selectedId) { idx = i; break; }
    var next = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + delta));
    selectTicket(list[next].id);
    var row = $('.ticket-row[data-id="' + list[next].id + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    state.selectedId = tickets.length ? tickets[0].id : null;
    var boundariesBtn = $('.layer-chip[data-layer="boundaries"]');
    if (boundariesBtn) boundariesBtn.classList.add("is-active");

    renderAll();
    renderMapFilters();
    renderAnalytics();
    renderDataTable();
    renderHandover();
    renderSystem();
    renderQr();
    initLiveMap();
    tick();
    setInterval(tick, 1000);
    bindEvents();

    var params = new URLSearchParams(window.location.search);
    var initialView = params.get("view");
    if (initialView && VIEW_TITLES[initialView]) switchView(initialView);

    setTimeout(function () {
      if (state.liveMap) state.liveMap.invalidateSize();
    }, 250);

    // Demo hint, once.
    setTimeout(function () {
      showToast("Prototipe SIGAP", "Klik Simulasi atau tekan N untuk melihat alarm laporan darurat.", "info");
    }, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
