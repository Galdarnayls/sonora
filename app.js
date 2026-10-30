/* Sonora — офлайн-плеер. Вся музыка хранится локально в IndexedDB браузера. */
'use strict';

/* ================= Утилиты ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const enc = encodeURIComponent;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = s => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
};
const tracksWord = n => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;
const totalTime = s => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
};
const hueOf = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Настройки хранятся отдельно для каждого аккаунта (префикс задаётся после входа)
let LS_PREFIX = 'sonora.';
const ls = {
  get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch { } }
};
const LS_KEYS = ['shuffle', 'repeat', 'volume', 'libTab', 'sort', 'session'];
const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
const UNKNOWN_ARTIST = 'Неизвестный исполнитель';
const NO_ALBUM = 'Без альбома';

/* ================= Иконки ================= */
const sv = (p, filled) => `<svg viewBox="0 0 24 24" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${p}</svg>`;
const HEART = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const I = {
  home: sv('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  homeFill: sv('<path d="M12.6 2.2a1 1 0 0 0-1.2 0l-9 7.5A1 1 0 0 0 2 10.5V20a2 2 0 0 0 2 2h5a1 1 0 0 0 1-1v-5h4v5a1 1 0 0 0 1 1h5a2 2 0 0 0 2-2v-9.5a1 1 0 0 0-.4-.8z"/>', 1),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  library: sv('<path d="M4 3v18M9 3v18M14 3.5l6 17"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  play: sv('<path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/>', 1),
  pause: sv('<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>', 1),
  next: sv('<path d="M5 5.5v13a1 1 0 0 0 1.55.83L15 13.5V19a1 1 0 0 0 2 0V5a1 1 0 0 0-2 0v5.5L6.55 4.67A1 1 0 0 0 5 5.5z"/>', 1),
  prev: sv('<path d="M19 5.5v13a1 1 0 0 1-1.55.83L9 13.5V19a1 1 0 0 1-2 0V5a1 1 0 0 1 2 0v5.5l8.45-5.83A1 1 0 0 1 19 5.5z"/>', 1),
  shuffle: sv('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  repeat: sv('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  heart: sv(`<path d="${HEART}"/>`),
  heartFill: sv(`<path d="${HEART}"/>`, 1),
  more: sv('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', 1),
  note: sv('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  down: sv('<path d="m6 9 6 6 6-6"/>'),
  back: sv('<path d="m15 18-6-6 6-6"/>'),
  queue: sv('<path d="M3 6h13M3 12h13M3 18h8M17 15v6M20 18h-6"/>'),
  car: sv('<path d="M5 17H3v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-2"/><path d="M3 13h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>'),
  vol: sv('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  volLow: sv('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
  mute: sv('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>'),
  trash: sv('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>'),
  upload: sv('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  folder: sv('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  settings: sv('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  close: sv('<path d="M18 6 6 18M6 6l12 12"/>'),
  install: sv('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  edit: sv('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  disc: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  addList: sv('<path d="M3 6h12M3 12h12M3 18h7M18 13v8M14 17h8"/>'),
  playNext: sv('<path d="M3 6h12M3 12h8M3 18h8M15 12l6 4-6 4z"/>'),
  minus: sv('<path d="M5 12h14"/>'),
  expand: sv('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  rewind: sv('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  forward: sv('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  logout: sv('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  lock: sv('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  shield: sv('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
};

/* ================= База данных ================= */
const DB = {
  db: null,
  open(name) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio');
        if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  all: s => DB.run(s, 'readonly', st => st.getAll()),
  get: (s, k) => DB.run(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => DB.run(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)),
  del: (s, k) => DB.run(s, 'readwrite', st => st.delete(k)),
  clear: s => DB.run(s, 'readwrite', st => st.clear()),
};

/* ================= Чтение тегов (ID3v2) ================= */
const Tags = {
  MAP: { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'albumArtist', TP2: 'albumArtist', TALB: 'album', TAL: 'album', TRCK: 'track', TRK: 'track', TYER: 'year', TDRC: 'year', TYE: 'year', APIC: 'cover', PIC: 'cover' },
  ss: (b, i) => ((b[i] & 127) << 21) | ((b[i + 1] & 127) << 14) | ((b[i + 2] & 127) << 7) | (b[i + 3] & 127),
  be: (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0,
  asc: (b, i, n) => String.fromCharCode(...b.subarray(i, i + n)),
  dec(bytes, e) {
    if (!bytes.length) return '';
    try {
      if (e === 1) return new TextDecoder(bytes[0] === 0xFE && bytes[1] === 0xFF ? 'utf-16be' : 'utf-16le').decode(bytes);
      if (e === 2) return new TextDecoder('utf-16be').decode(bytes);
      if (e === 3) return new TextDecoder('utf-8').decode(bytes);
      if (bytes.some(x => x >= 0xC0)) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { }
        return new TextDecoder('windows-1251').decode(bytes); // частый случай для русских mp3
      }
      return new TextDecoder('windows-1252').decode(bytes);
    } catch { return ''; }
  },
  text(d) { return this.dec(d.subarray(1), d[0]).split('\0')[0].trim(); },
  pic(d, v22) {
    const e = d[0];
    let p, mime = 'image/jpeg';
    if (v22) { p = 4; if (this.asc(d, 1, 3).toLowerCase() === 'png') mime = 'image/png'; }
    else { const z = d.indexOf(0, 1); mime = this.asc(d, 1, z - 1).toLowerCase() || mime; p = z + 1; }
    p++; // тип картинки
    if (e === 1 || e === 2) { while (p < d.length - 1 && !(d[p] === 0 && d[p + 1] === 0)) p += 2; p += 2; }
    else { while (p < d.length && d[p] !== 0) p++; p++; }
    const img = d.slice(p);
    if (img.length < 64) return null;
    if (img[0] === 0x89 && img[1] === 0x50) mime = 'image/png';
    else if (img[0] === 0xFF && img[1] === 0xD8) mime = 'image/jpeg';
    else if (!mime.includes('/')) mime = 'image/' + mime;
    return new Blob([img], { type: mime });
  },
  async read(file) {
    const out = {};
    try {
      const h = new Uint8Array(await file.slice(0, 10).arrayBuffer());
      if (h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return out;
      const ver = h[3], size = this.ss(h, 6);
      const b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
      let p = 0;
      if ((h[5] & 0x40) && ver >= 3) p = ver === 4 ? this.ss(b, 0) : this.be(b, 0) + 4;
      while (p < b.length - 10) {
        let id, len, hl;
        if (ver === 2) { id = this.asc(b, p, 3); len = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]; hl = 6; }
        else { id = this.asc(b, p, 4); len = ver === 4 ? this.ss(b, p + 4) : this.be(b, p + 4); hl = 10; }
        if (!/^[A-Z0-9]{3,4}$/.test(id) || len <= 0 || p + hl + len > b.length) break;
        const d = b.subarray(p + hl, p + hl + len), key = this.MAP[id];
        if (key === 'cover') { if (!out.cover) out.cover = this.pic(d, ver === 2); }
        else if (key && !out[key]) { const v = this.text(d); if (v) out[key] = v; }
        p += hl + len;
      }
    } catch (e) { console.warn('ID3', e); }
    if (out.track) out.track = parseInt(out.track, 10) || 0;
    if (out.year) out.year = parseInt(out.year, 10) || 0;
    return out;
  },
  fromName(name) {
    let s = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^\d{1,3}\s*[.)\-–]\s+/, '');
    const parts = s.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    return { title: s };
  }
};

function audioDuration(blob) {
  return new Promise(res => {
    const a = new Audio(), url = URL.createObjectURL(blob);
    let done = false;
    const finish = v => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); res(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => finish(0);
    setTimeout(() => finish(0), 10000);
    a.src = url;
  });
}

/* ================= Состояние ================= */
const S = {
  tracks: [], byId: new Map(), playlists: [],
  queue: [], unshuffled: null, index: -1, currentId: null, ctx: null,
  shuffle: false, repeat: 'off', volume: 1, muted: false,
  libTab: 'playlists', sort: 'added',
  search: '', installPrompt: null, wakeLock: null, user: null, pendingFiles: null,
};
const audio = $('#audio');
const covers = new Map();
const colors = new Map();

const coverURL = t => {
  if (!t || !t.cover) return null;
  if (!covers.has(t.id)) covers.set(t.id, URL.createObjectURL(t.cover));
  return covers.get(t.id);
};

function indexTracks() {
  S.byId = new Map(S.tracks.map(t => [t.id, t]));
}

function artists() {
  const m = new Map();
  for (const t of S.tracks) {
    const k = t.artist || UNKNOWN_ARTIST;
    if (!m.has(k)) m.set(k, { name: k, ids: [] });
    m.get(k).ids.push(t.id);
  }
  return [...m.values()].sort((a, b) => collator.compare(a.name, b.name));
}

function albums() {
  const m = new Map();
  for (const t of S.tracks) {
    if (!t.album || t.album === NO_ALBUM) continue;
    if (!m.has(t.album)) m.set(t.album, { name: t.album, ids: [], artists: new Set(), added: 0 });
    const a = m.get(t.album);
    a.ids.push(t.id); a.artists.add(t.albumArtist || t.artist); a.added = Math.max(a.added, t.addedAt);
  }
  return [...m.values()].map(a => ({ ...a, artist: a.artists.size > 1 ? 'Разные исполнители' : [...a.artists][0] }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/* ================= Обложки и цвета ================= */
function artHTML(t, cls = '') {
  const u = coverURL(t);
  if (u) return `<div class="art ${cls}"><img src="${u}" alt="" decoding="async" draggable="false"></div>`;
  return `<div class="art ph ${cls}" style="--h:${hueOf((t?.album || '') + (t?.artist || '') + (t?.album === NO_ALBUM ? t?.title : ''))}">${I.note}</div>`;
}

function collArt(kind, ids, cls = '') {
  if (kind === 'liked') return `<div class="art liked ${cls}">${I.heartFill}</div>`;
  if (kind === 'all') return `<div class="art all ${cls}">${I.note}</div>`;
  const withCover = [];
  const seen = new Set();
  for (const id of ids) {
    const t = S.byId.get(id);
    if (t && t.cover && !seen.has(t.album + t.artist)) { seen.add(t.album + t.artist); withCover.push(t); }
    if (withCover.length >= 4) break;
  }
  if (kind === 'playlist' && withCover.length >= 4) {
    return `<div class="art mosaic ${cls}">${withCover.map(t => `<img src="${coverURL(t)}" alt="" draggable="false">`).join('')}</div>`;
  }
  if (withCover.length) return artHTML(withCover[0], cls);
  const first = S.byId.get(ids[0]);
  if (kind === 'artist') return `<div class="art ph ${cls}" style="--h:${hueOf(first?.artist || '')}">${I.user}</div>`;
  if (kind === 'playlist') return `<div class="art ph ${cls}" style="--h:${hueOf(ids.join())}">${I.note}</div>`;
  return artHTML(first, cls);
}

function colorOf(t) {
  return new Promise(res => {
    if (!t) return res('#2a2a2a');
    if (colors.has(t.id)) return res(colors.get(t.id));
    const fallback = `hsl(${hueOf((t.album || '') + (t.artist || ''))} 40% 30%)`;
    const u = coverURL(t);
    if (!u) { colors.set(t.id, fallback); return res(fallback); }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const w = 1 + (mx - mn) / 40; // насыщенные пиксели весомее
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        r /= n; g /= n; b /= n;
        const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
        const k = l > 110 ? 110 / l : l < 50 ? 50 / Math.max(l, 1) : 1;
        const col = `rgb(${Math.round(clamp(r * k, 0, 255))} ${Math.round(clamp(g * k, 0, 255))} ${Math.round(clamp(b * k, 0, 255))})`;
        colors.set(t.id, col); res(col);
      } catch { colors.set(t.id, fallback); res(fallback); }
    };
    img.onerror = () => res(fallback);
    img.src = u;
  });
}

/* ================= Коллекции ================= */
function sortIds(ids, mode) {
  const arr = ids.map(id => S.byId.get(id)).filter(Boolean);
  const by = {
    added: (a, b) => b.addedAt - a.addedAt,
    title: (a, b) => collator.compare(a.title, b.title),
    artist: (a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.album, b.album) || (a.trackNo - b.trackNo),
    album: (a, b) => collator.compare(a.album, b.album) || (a.trackNo - b.trackNo) || collator.compare(a.title, b.title),
    plays: (a, b) => (b.plays || 0) - (a.plays || 0),
  }[mode];
  return by ? arr.sort(by).map(t => t.id) : arr.map(t => t.id);
}

function collection(key) {
  const [name, ...rest] = key.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  if (name === 'all') return { key, kind: 'all', type: 'Плейлист', title: 'Все треки', ids: sortIds(S.tracks.map(t => t.id), S.sort), sortable: true };
  if (name === 'liked') {
    const ids = S.tracks.filter(t => t.liked).sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0)).map(t => t.id);
    return { key, kind: 'liked', type: 'Плейлист', title: 'Любимые треки', ids };
  }
  if (name === 'pl') {
    const p = S.playlists.find(p => p.id === arg);
    if (!p) return null;
    return { key, kind: 'playlist', type: 'Плейлист', title: p.name, ids: p.ids.filter(id => S.byId.has(id)), playlist: p };
  }
  if (name === 'artist') {
    const ids = sortIds(S.tracks.filter(t => (t.artist || UNKNOWN_ARTIST) === arg).map(t => t.id), 'album');
    return ids.length ? { key, kind: 'artist', type: 'Исполнитель', title: arg, ids } : null;
  }
  if (name === 'album') {
    const ids = sortIds(S.tracks.filter(t => t.album === arg).map(t => t.id), 'album');
    if (!ids.length) return null;
    const ar = new Set(ids.map(id => S.byId.get(id).artist));
    return { key, kind: 'album', type: 'Альбом', title: arg, ids, sub: ar.size > 1 ? 'Разные исполнители' : [...ar][0], noAlbumCol: true };
  }
  return null;
}

/* ================= Роутинг ================= */
const route = () => (location.hash.slice(1) || 'home');
const go = h => { if (location.hash !== '#' + h) location.hash = h; };
window.addEventListener('hashchange', () => { closeMenu(); render(); $('#main').scrollTop = 0; });

function render() {
  const r = route(), [name] = r.split('/');
  const view = $('#view');
  let html;
  if (name === 'home') html = viewHome();
  else if (name === 'search') html = viewSearch();
  else if (name === 'library') html = viewLibrary();
  else if (name === 'settings') html = viewSettings();
  else html = viewCollection(r);
  view.innerHTML = html;
  if (name === 'search') { const inp = $('#searchInput'); inp.value = S.search; renderSearchResults(); if (matchMedia('(hover: hover)').matches) inp.focus(); }
  if (name === 'settings') fillStorage();
  paintGlow(r);
  renderSidebar();
  renderTabbar();
  markCurrent();
}

async function paintGlow(r) {
  const view = $('#view');
  const c = collection(r);
  let col = '#2a2a2a';
  if (c?.kind === 'liked') col = '#5038a0';
  else if (c?.kind === 'all') col = '#14713f';
  else if (c) col = await colorOf(S.byId.get(c.ids.find(id => S.byId.get(id)?.cover) || c.ids[0]));
  else if (r === 'home') col = S.currentId ? await colorOf(S.byId.get(S.currentId)) : '#1f3a2c';
  if (route() !== r) return;
  view.style.setProperty('--glow', col);
  view.style.setProperty('--top-bg', `color-mix(in srgb, ${col} 55%, #121212)`);
}

$('#main').addEventListener('scroll', () => {
  const top = $('.view-top');
  if (top) top.classList.toggle('solid', $('#main').scrollTop > 180);
}, { passive: true });

/* ================= Отрисовка: сайдбар / таббар ================= */
function libraryItems(tab) {
  const r = route();
  const cur = S.ctx?.key;
  const item = (href, art, t, s, key) =>
    `<div class="item ${r === href ? 'active' : ''} ${cur === key && S.currentId ? 'playing' : ''}" data-go="${esc(href)}">${art}<div><div class="item-t">${esc(t)}</div><div class="item-s">${esc(s)}</div></div></div>`;
  let html = '';
  const liked = S.tracks.filter(t => t.liked).map(t => t.id);
  if (tab === 'playlists') {
    html += item('liked', collArt('liked', liked), 'Любимые треки', `Плейлист · ${tracksWord(liked.length)}`, 'liked');
    html += item('all', collArt('all', []), 'Все треки', `Плейлист · ${tracksWord(S.tracks.length)}`, 'all');
    for (const p of [...S.playlists].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const ids = p.ids.filter(id => S.byId.has(id));
      html += item('pl/' + p.id, collArt('playlist', ids), p.name, `Плейлист · ${tracksWord(ids.length)}`, 'pl/' + p.id);
    }
  } else if (tab === 'artists') {
    for (const a of artists()) html += item('artist/' + enc(a.name), collArt('artist', a.ids, 'round'), a.name, `Исполнитель · ${tracksWord(a.ids.length)}`, 'artist/' + enc(a.name));
    if (!S.tracks.length) html += `<p class="item-s" style="padding:12px">Пока пусто</p>`;
  } else {
    const al = albums();
    for (const a of al) html += item('album/' + enc(a.name), collArt('album', a.ids), a.name, `Альбом · ${a.artist}`, 'album/' + enc(a.name));
    if (!al.length) html += `<p class="item-s" style="padding:12px">Альбомы появятся, когда в файлах будут теги альбома</p>`;
  }
  return html;
}

function chipsHTML() {
  const tabs = [['playlists', 'Плейлисты'], ['artists', 'Исполнители'], ['albums', 'Альбомы']];
  return `<div class="chips">${tabs.map(([k, l]) => `<button class="chip ${S.libTab === k ? 'on' : ''}" data-act="lib-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
}

function renderSidebar() {
  const r = route();
  $('#sidebar').innerHTML = `
    <div class="panel">
      <div class="brand"><img src="icons/icon.svg" alt="">Sonora<span class="spacer"></span>
        <button class="avatar" data-act="user-menu" title="${esc(S.user?.name || '')}">${esc((S.user?.name || '?').slice(0, 1).toUpperCase())}</button></div>
      <nav class="nav">
        <a href="#home" class="${r === 'home' ? 'active' : ''}">${r === 'home' ? I.homeFill : I.home}Главная</a>
        <a href="#search" class="${r === 'search' ? 'active' : ''}">${I.search}Поиск</a>
        <a href="#settings" class="${r === 'settings' ? 'active' : ''}">${I.settings}Настройки</a>
      </nav>
    </div>
    <div class="panel lib">
      <div class="lib-head">
        <h2>${I.library}Моя медиатека</h2>
        <button class="icon-btn sm" data-act="add-menu" title="Создать или добавить">${I.plus}</button>
      </div>
      ${chipsHTML()}
      <div class="lib-list">${libraryItems(S.libTab)}</div>
      <button class="add-btn" data-act="import">${I.upload}Добавить музыку</button>
    </div>`;
}

function renderTabbar() {
  const r = route();
  const isLib = r === 'library' || !['home', 'search', 'settings'].includes(r.split('/')[0]);
  $('#tabbar').innerHTML = `
    <a href="#home" class="${r === 'home' ? 'active' : ''}">${r === 'home' ? I.homeFill : I.home}Главная</a>
    <a href="#search" class="${r === 'search' ? 'active' : ''}">${I.search}Поиск</a>
    <a href="#library" class="${isLib ? 'active' : ''}">${I.library}Медиатека</a>
    <a href="#settings" class="${r === 'settings' ? 'active' : ''}">${I.settings}Ещё</a>`;
}

/* ================= Представления ================= */
function topBar(title = '', back = false, extra = '') {
  return `<div class="view-top">${back ? `<button class="icon-btn bg" data-act="back" title="Назад">${I.back}</button>` : ''}<div class="top-title">${esc(title)}</div><div class="spacer"></div>${extra}</div>`;
}

function emptyLibrary() {
  return `<div class="empty-state">
    <div class="big-ic">${I.note}</div>
    <h2>Здесь будет ваша музыка</h2>
    <p>Добавьте аудиофайлы с компьютера или телефона — они сохранятся прямо в приложении и будут играть без интернета.</p>
    <div class="btns">
      <button class="btn green" data-act="import">${I.upload}Выбрать файлы</button>
      <button class="btn ghost" data-act="import-folder">${I.folder}Выбрать папку</button>
    </div>
    <p class="hint">Поддерживаются MP3, M4A/AAC, FLAC, WAV, OGG, OPUS.<br>На компьютере можно просто перетащить файлы в окно.</p>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи';
}

function playBtn(playKey, cls = '') {
  const cur = S.ctx?.key === playKey && S.currentId && !audio.paused;
  return `<button class="play-btn ${cls}" data-act="play-coll" data-key="${esc(playKey)}" title="Слушать">${cur ? I.pause : I.play}</button>`;
}

function card({ href, art, t, s, key }) {
  return `<div class="card ${S.ctx?.key === key ? 'cur' : ''}" data-go="${esc(href)}">${art}<div class="card-t">${esc(t)}</div><div class="card-s">${esc(s)}</div>${key ? playBtn(key) : ''}</div>`;
}

function viewHome() {
  if (!S.tracks.length) return `<div class="view"><div class="glow"></div>${topBar()}${emptyLibrary()}</div>`;
  const liked = S.tracks.filter(t => t.liked).map(t => t.id);
  const tiles = [
    { href: 'liked', art: collArt('liked', liked), t: 'Любимые треки', key: 'liked' },
    { href: 'all', art: collArt('all', []), t: 'Все треки', key: 'all' },
    ...[...S.playlists].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map(p => ({ href: 'pl/' + p.id, art: collArt('playlist', p.ids.filter(id => S.byId.has(id))), t: p.name, key: 'pl/' + p.id })),
  ];
  const al = albums().sort((a, b) => b.added - a.added);
  for (const a of al) { if (tiles.length >= 8) break; tiles.push({ href: 'album/' + enc(a.name), art: collArt('album', a.ids), t: a.name, key: 'album/' + enc(a.name) }); }
  const quick = tiles.slice(0, 8).map(x => `<div class="qtile ${S.ctx?.key === x.key ? 'cur' : ''}" data-go="${esc(x.href)}">${x.art.replace('class="art', 'class="art sq')}<b>${esc(x.t)}</b>${playBtn(x.key)}</div>`).join('');

  const recentPlayed = S.tracks.filter(t => t.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 12);
  const recentAdded = [...S.tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  const trackCard = (t, list) => `<div class="card ${S.currentId === t.id ? 'cur' : ''}" data-act="play-track" data-id="${t.id}" data-list="${list}">${artHTML(t)}<div class="card-t">${esc(t.title)}</div><div class="card-s">${esc(t.artist)}</div><button class="play-btn" data-act="play-track" data-id="${t.id}" data-list="${list}">${S.currentId === t.id && !audio.paused ? I.pause : I.play}</button></div>`;
  const ar = artists().sort((a, b) => b.ids.length - a.ids.length).slice(0, 12);
  const most = S.tracks.filter(t => t.plays > 1).sort((a, b) => b.plays - a.plays).slice(0, 12);

  return `<div class="view"><div class="glow"></div>${topBar()}
    <h1 class="greet">${greeting()}</h1>
    <div class="quick">${quick}</div>
    ${recentPlayed.length ? `<section class="sec"><div class="sec-h"><h2>Недавно слушали</h2></div><div class="shelf">${recentPlayed.map(t => trackCard(t, 'recent')).join('')}</div></section>` : ''}
    <section class="sec"><div class="sec-h"><h2>Недавно добавленные</h2><a href="#all">Показать все</a></div><div class="shelf">${recentAdded.map(t => trackCard(t, 'added')).join('')}</div></section>
    ${most.length >= 3 ? `<section class="sec"><div class="sec-h"><h2>Ваши хиты</h2></div><div class="shelf">${most.map(t => trackCard(t, 'most')).join('')}</div></section>` : ''}
    <section class="sec"><div class="sec-h"><h2>Исполнители</h2><a data-act="lib-tab" data-tab="artists" data-to-lib="1">Показать все</a></div><div class="shelf">${ar.map(a => card({ href: 'artist/' + enc(a.name), art: collArt('artist', a.ids, 'round'), t: a.name, s: 'Исполнитель', key: 'artist/' + enc(a.name) })).join('')}</div></section>
    ${al.length ? `<section class="sec"><div class="sec-h"><h2>Альбомы</h2><a data-act="lib-tab" data-tab="albums" data-to-lib="1">Показать все</a></div><div class="shelf">${al.slice(0, 12).map(a => card({ href: 'album/' + enc(a.name), art: collArt('album', a.ids), t: a.name, s: a.artist, key: 'album/' + enc(a.name) })).join('')}</div></section>` : ''}
  </div>`;
}

function trackRows(ids, opts = {}) {
  const rows = ids.map((id, i) => {
    const t = S.byId.get(id);
    if (!t) return '';
    return `<div class="row" data-id="${t.id}" data-i="${i}">
      <div class="c-num"><span class="n">${opts.trackNo && t.trackNo ? t.trackNo : i + 1}</span><span class="eq"><i></i><i></i><i></i></span><span class="ic">${I.play}</span></div>
      <div class="c-title">${opts.noArt ? '' : artHTML(t)}<div><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div></div></div>
      <div class="c-album">${esc(t.album === NO_ALBUM ? '' : t.album)}</div>
      <div class="c-like"><button class="icon-btn like ${t.liked ? 'on' : ''}" data-act="like" title="Любимое">${t.liked ? I.heartFill : I.heart}</button></div>
      <div class="c-dur">${fmt(t.duration)}</div>
      <div class="c-more"><button class="icon-btn" data-act="track-menu" title="Ещё">${I.more}</button></div>
    </div>`;
  }).join('');
  return `<div class="tl ${opts.noAlbumCol ? 'no-album' : ''}" data-key="${esc(opts.key || '')}">
    <div class="tl-head"><div style="text-align:right">#</div><div>Название</div><div class="c-album">Альбом</div><div></div><div>${I.clock}</div><div></div></div>
    ${rows}</div>`;
}

function viewCollection(key) {
  const c = collection(key);
  if (!c) return `<div class="view">${topBar('', true)}<div class="empty-state"><h2>Не найдено</h2><p>Этот плейлист или исполнитель больше не существует.</p><button class="btn" data-go="home">На главную</button></div></div>`;
  const dur = c.ids.reduce((s, id) => s + (S.byId.get(id)?.duration || 0), 0);
  const isArtist = c.kind === 'artist';
  const sub = c.sub ? `<b>${esc(c.sub)}</b> · ` : '';
  const sortSel = c.sortable ? `<select data-act="sort" aria-label="Сортировка">
      ${[['added', 'Недавно добавленные'], ['title', 'Название'], ['artist', 'Исполнитель'], ['album', 'Альбом'], ['plays', 'Часто слушаемые']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>` : '';
  const plBtns = c.playlist ? `<button class="icon-btn" data-act="pl-menu" data-id="${c.playlist.id}" title="Ещё">${I.more}</button>` : '';
  const body = c.ids.length ? trackRows(c.ids, { key, noAlbumCol: c.noAlbumCol, trackNo: c.kind === 'album' }) :
    `<div class="empty-state" style="margin-top:2vh"><h2>${c.kind === 'liked' ? 'Пока нет любимых треков' : 'Плейлист пуст'}</h2>
      <p>${c.kind === 'liked' ? 'Нажмите на сердечко у трека, чтобы он появился здесь.' : 'Добавьте треки через меню «⋯» → «Добавить в плейлист».'}</p>
      <button class="btn" data-go="all">Открыть все треки</button></div>`;
  return `<div class="view"><div class="glow"></div>${topBar(c.title, true)}
    <div class="hero">
      ${collArt(c.kind, c.ids, isArtist ? 'round' : '')}
      <div class="hero-info">
        <div class="eyebrow">${c.type}</div>
        <h1>${esc(c.title)}</h1>
        <div class="meta">${sub}${tracksWord(c.ids.length)}${dur ? ', ' + totalTime(dur) : ''}</div>
      </div>
    </div>
    <div class="actions">
      ${c.ids.length ? playBtn(key, 'green') : ''}
      ${c.ids.length ? `<button class="icon-btn ${S.shuffle ? 'on' : ''}" data-act="shuffle" title="Перемешать">${I.shuffle}</button>` : ''}
      ${plBtns}
      ${sortSel}
    </div>
    ${body}
  </div>`;
}

function viewLibrary() {
  return `<div class="view">${topBar('Медиатека', false, `<button class="icon-btn" data-act="add-menu">${I.plus}</button>`)}
    <h1 class="page-h">Моя медиатека</h1>
    <div style="margin:0 -16px">${chipsHTML()}</div>
    <div class="lib-list" style="padding:0;margin:0 -8px">${libraryItems(S.libTab)}</div>
    ${!S.tracks.length ? emptyLibrary() : ''}
  </div>`;
}

function viewSearch() {
  return `<div class="view"><div class="glow" style="opacity:.35"></div>
    <div class="view-top solid" style="--top-bg:#121212"><label class="search-box">${I.search}<input id="searchInput" type="search" placeholder="Что хотите послушать?" autocomplete="off" enterkeyhint="search"></label></div>
    <div id="searchResults"></div></div>`;
}

function renderSearchResults() {
  const box = $('#searchResults');
  if (!box) return;
  const q = S.search.trim().toLowerCase();
  if (!S.tracks.length) { box.innerHTML = emptyLibrary(); return; }
  if (!q) {
    const ar = artists().sort((a, b) => b.ids.length - a.ids.length).slice(0, 24);
    box.innerHTML = `<section class="sec"><div class="sec-h"><h2>Исполнители</h2></div><div class="browse">
      ${ar.map(a => { const ct = S.byId.get(a.ids.find(id => S.byId.get(id).cover) || a.ids[0]); return `<div class="btile" style="--h:${hueOf(a.name)}" data-go="artist/${esc(enc(a.name))}"><span>${esc(a.name)}</span>${artHTML(ct)}</div>`; }).join('')}
    </div></section>`;
    return;
  }
  const words = q.split(/\s+/);
  const hit = s => { s = s.toLowerCase(); return words.every(w => s.includes(w)); };
  const tr = S.tracks.filter(t => hit(`${t.title} ${t.artist} ${t.album} ${t.fileName}`))
    .sort((a, b) => (b.title.toLowerCase().startsWith(q) - a.title.toLowerCase().startsWith(q)) || (b.plays || 0) - (a.plays || 0));
  const ar = artists().filter(a => hit(a.name));
  const al = albums().filter(a => hit(a.name + ' ' + a.artist));
  const pl = S.playlists.filter(p => hit(p.name));
  if (!tr.length && !ar.length && !al.length && !pl.length) {
    box.innerHTML = `<div class="empty-state"><h2>Ничего не найдено по запросу «${esc(S.search)}»</h2><p>Проверьте написание или попробуйте другой запрос.</p></div>`;
    return;
  }
  S.searchIds = tr.map(t => t.id);
  let top = '';
  if (ar.length && (!tr.length || ar[0].name.toLowerCase().startsWith(q))) {
    const a = ar[0];
    top = `<div class="top-result" data-go="artist/${esc(enc(a.name))}">${collArt('artist', a.ids, 'round')}<h3>${esc(a.name)}</h3><p>Исполнитель</p>${playBtn('artist/' + enc(a.name))}</div>`;
  } else if (tr.length) {
    const t = tr[0];
    top = `<div class="top-result" data-act="play-track" data-id="${t.id}" data-list="search">${artHTML(t)}<h3>${esc(t.title)}</h3><p>Трек · ${esc(t.artist)}</p><button class="play-btn" data-act="play-track" data-id="${t.id}" data-list="search">${I.play}</button></div>`;
  }
  box.innerHTML = `
    ${tr.length ? `<div class="search-top sec">
      <div><div class="sec-h"><h2>Лучший результат</h2></div>${top}</div>
      <div><div class="sec-h"><h2>Треки</h2></div>${trackRows(tr.slice(0, 5), { key: 'search', noAlbumCol: true })}</div>
    </div>` : ''}
    ${tr.length > 5 ? `<section class="sec"><div class="sec-h"><h2>Все треки</h2></div>${trackRows(tr, { key: 'search' })}</section>` : ''}
    ${ar.length ? `<section class="sec"><div class="sec-h"><h2>Исполнители</h2></div><div class="shelf">${ar.map(a => card({ href: 'artist/' + enc(a.name), art: collArt('artist', a.ids, 'round'), t: a.name, s: 'Исполнитель', key: 'artist/' + enc(a.name) })).join('')}</div></section>` : ''}
    ${al.length ? `<section class="sec"><div class="sec-h"><h2>Альбомы</h2></div><div class="shelf">${al.map(a => card({ href: 'album/' + enc(a.name), art: collArt('album', a.ids), t: a.name, s: a.artist, key: 'album/' + enc(a.name) })).join('')}</div></section>` : ''}
    ${pl.length ? `<section class="sec"><div class="sec-h"><h2>Плейлисты</h2></div><div class="shelf">${pl.map(p => card({ href: 'pl/' + p.id, art: collArt('playlist', p.ids), t: p.name, s: 'Плейлист', key: 'pl/' + p.id })).join('')}</div></section>` : ''}`;
  markCurrent();
}

function viewSettings() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dur = S.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  return `<div class="view"><div class="glow"></div>${topBar('Настройки')}
    <h1 class="page-h">Настройки</h1>
    <div class="set-card">
      <div class="acc-row">
        <div class="avatar big">${esc((S.user?.name || '?').slice(0, 1).toUpperCase())}</div>
        <div><h3 style="margin:0">${esc(S.user?.name || '')}</h3><p style="margin:0">Ваш аккаунт на этом устройстве</p></div>
      </div>
      <div class="btns">
        <button class="btn" data-act="logout">${I.logout}Выйти</button>
        <button class="btn ghost" data-act="change-pass">${I.lock}Сменить пароль</button>
        <button class="btn ghost" data-act="delete-account" style="color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger)">${I.trash}Удалить аккаунт</button>
      </div>
    </div>
    <div class="set-card">
      <h3>Медиатека</h3>
      <div class="stats">
        <div><b>${S.tracks.length}</b><span>${plural(S.tracks.length, 'трек', 'трека', 'треков')}</span></div>
        <div><b>${artists().length}</b><span>исполнителей</span></div>
        <div><b>${S.playlists.length}</b><span>плейлистов</span></div>
        <div><b>${totalTime(dur)}</b><span>музыки</span></div>
      </div>
      <div class="meter"><i id="storBar" style="width:0"></i></div>
      <p id="storText">Считаем место…</p>
      <div class="btns">
        <button class="btn green" data-act="import">${I.upload}Добавить файлы</button>
        <button class="btn ghost" data-act="import-folder">${I.folder}Добавить папку</button>
      </div>
    </div>
    <div class="set-card">
      <h3>Установка приложения</h3>
      ${standalone ? `<p>Sonora уже установлена и работает как приложение. ✓</p>` :
      S.installPrompt ? `<p>Установите Sonora — появится иконка на рабочем столе, приложение будет открываться в своём окне и работать без интернета.</p><div class="btns"><button class="btn green" data-act="install">${I.install}Установить</button></div>` :
        isIOS ? `<p>На iPhone: откройте сайт в <b>Safari</b> → кнопка «Поделиться» → <b>«На экран „Домой“»</b>.</p>` :
          `<p>В Chrome или Edge нажмите значок установки в адресной строке (или меню ⋮ → «Установить приложение» / «Добавить на главный экран»).</p>`}
    </div>
    <div class="set-card">
      <h3>${I.car.replace('<svg', '<svg style="display:inline;vertical-align:-6px;margin-right:8px"')}Для машины</h3>
      <ol>
        <li>Подключите телефон к машине по <b>Bluetooth</b> или кабелю.</li>
        <li>Кнопки на руле и магнитоле (следующий / предыдущий / пауза) управляют Sonora.</li>
        <li>Включите <b>режим «Авто»</b> — огромные кнопки, экран не гаснет. Свайп по обложке влево/вправо — следующий/предыдущий трек.</li>
      </ol>
      <div class="btns" style="margin-top:14px"><button class="btn" data-act="car">${I.car}Включить режим «Авто»</button></div>
    </div>
    <div class="set-card">
      <h3>${I.shield.replace('<svg', '<svg style="display:inline;vertical-align:-6px;margin-right:8px"')}Хранение</h3>
      <p id="persistText">Музыка хранится только на этом устройстве, в памяти приложения. В интернет ничего не отправляется. На каждом устройстве (ПК и телефон) треки добавляются отдельно.</p>
      <div class="btns">
        <button class="btn ghost" data-act="persist">Защитить от автоочистки</button>
        <button class="btn ghost" data-act="wipe" style="color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger)">${I.trash}Удалить всю медиатеку</button>
      </div>
    </div>
    <p class="hint" style="text-align:center">Sonora · офлайн-плеер · горячие клавиши: Пробел — пауза, ← → — перемотка, Shift+← → — трек</p>
  </div>`;
}

async function fillStorage() {
  const bar = $('#storBar'), txt = $('#storText');
  const used = S.tracks.reduce((s, t) => s + (t.size || 0), 0);
  let quota = 0, persisted = false;
  try { const e = await navigator.storage.estimate(); quota = e.quota || 0; } catch { }
  try { persisted = await navigator.storage.persisted(); } catch { }
  const mb = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : Math.round(b / 1e6) + ' МБ';
  if (bar) bar.style.width = quota ? clamp(used / quota * 100, 1, 100) + '%' : '0';
  if (txt) txt.textContent = quota ? `Занято ${mb(used)} из доступных ${mb(quota)}` : `Занято ${mb(used)}`;
  const pt = $('#persistText');
  if (pt && persisted) pt.textContent += ' Защита от автоочистки включена ✓';
}

/* ================= Плеер ================= */
function renderPlayerShell() {
  $('#player').innerHTML = `
    <div class="p-left">
      <button class="p-art js-art" data-act="open-np" title="Открыть плеер"></button>
      <div class="p-meta"><div class="p-title js-title" data-act="open-np"></div><div class="p-artist js-artist"></div></div>
      <button class="icon-btn like js-like" data-act="like-current" title="Любимое">${I.heart}</button>
    </div>
    <div class="p-center">
      <div class="p-ctrls">
        <button class="icon-btn sm js-shuffle" data-act="shuffle" title="Перемешать">${I.shuffle}</button>
        <button class="icon-btn" data-act="prev" title="Назад">${I.prev}</button>
        <button class="play-btn js-toggle" data-act="toggle" title="Воспроизвести">${I.play}</button>
        <button class="icon-btn" data-act="next" title="Далее">${I.next}</button>
        <button class="icon-btn sm js-repeat" data-act="repeat" title="Повтор">${I.repeat}</button>
      </div>
      <div class="p-seek"><span class="js-cur">0:00</span><input type="range" class="seek" min="0" max="1000" value="0" step="1" aria-label="Позиция"><span class="js-dur">0:00</span></div>
    </div>
    <div class="p-right">
      <button class="icon-btn" data-act="car" title="Режим «Авто»">${I.car}</button>
      <button class="icon-btn" data-act="queue" title="Очередь">${I.queue}</button>
      <button class="icon-btn js-mute" data-act="mute" title="Звук">${I.vol}</button>
      <input type="range" class="vol" min="0" max="100" value="100" aria-label="Громкость">
      <button class="icon-btn" data-act="open-np" title="Во весь экран">${I.expand}</button>
    </div>
    <div class="p-mini-progress"><i class="js-bar"></i></div>`;
  $('#player').addEventListener('click', e => {
    if (matchMedia('(max-width: 820px)').matches && !e.target.closest('button')) openNP();
  });
}

function renderNPShell() {
  $('#np').innerHTML = `
    <div class="np-head">
      <button class="icon-btn" data-act="close-np" title="Свернуть">${I.down}</button>
      <div class="np-ctx"><small>Играет из</small><b class="js-ctx"></b></div>
      <button class="icon-btn" data-act="current-menu" title="Ещё">${I.more}</button>
    </div>
    <div class="np-art js-art js-swipe"></div>
    <div class="np-info"><div><h2 class="js-title"></h2><p class="js-artist"></p></div><button class="icon-btn like js-like" data-act="like-current">${I.heart}</button></div>
    <div class="np-seek"><input type="range" class="seek always" min="0" max="1000" value="0" aria-label="Позиция"><div class="times"><span class="js-cur">0:00</span><span class="js-dur">0:00</span></div></div>
    <div class="np-ctrls">
      <button class="icon-btn sm js-shuffle" data-act="shuffle">${I.shuffle}</button>
      <button class="icon-btn" data-act="prev">${I.prev}</button>
      <button class="play-btn js-toggle" data-act="toggle">${I.play}</button>
      <button class="icon-btn" data-act="next">${I.next}</button>
      <button class="icon-btn sm js-repeat" data-act="repeat">${I.repeat}</button>
    </div>
    <div class="np-foot">
      <button class="pill" data-act="car">${I.car}Режим «Авто»</button>
      <button class="icon-btn" data-act="queue" title="Очередь">${I.queue}</button>
    </div>`;
}

function renderCarShell() {
  $('#car').innerHTML = `
    <div class="car-head">
      <button class="pill" data-act="car-exit">${I.close}Выйти</button>
      <div class="clock js-clock"></div>
      <button class="pill" data-act="queue">${I.queue}Очередь</button>
    </div>
    <div class="car-info js-swipe"><div class="js-art"></div><div><h2 class="js-title"></h2><p class="js-artist"></p></div></div>
    <div class="car-bar js-carbar"><i class="js-bar"></i></div>
    <div class="car-times"><span class="js-cur">0:00</span><span class="js-dur">0:00</span></div>
    <div class="car-ctrls">
      <button data-act="prev" aria-label="Предыдущий">${I.prev}</button>
      <button class="car-play js-toggle" data-act="toggle" aria-label="Пауза">${I.play}</button>
      <button data-act="next" aria-label="Следующий">${I.next}</button>
    </div>
    <div class="car-extra">
      <button data-act="seek-back">${I.rewind}<span>15</span></button>
      <button class="js-shuffle" data-act="shuffle">${I.shuffle}</button>
      <button class="js-like" data-act="like-current">${I.heart}</button>
      <button class="js-repeat" data-act="repeat">${I.repeat}</button>
      <button data-act="seek-fwd">${I.forward}<span>15</span></button>
    </div>`;
  $('.js-carbar').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    if (audio.duration) audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
  });
}

function syncPlayer() {
  const t = S.byId.get(S.currentId);
  $('#player').classList.toggle('empty', !t);
  for (const el of $$('.js-title')) el.textContent = t ? t.title : '';
  for (const el of $$('.js-artist')) el.textContent = t ? t.artist : '';
  for (const el of $$('.js-ctx')) el.textContent = S.ctx?.name || 'Медиатека';
  for (const el of $$('.js-art')) {
    const want = t ? t.id : '';
    if (el.dataset.tid !== want) { el.dataset.tid = want; el.innerHTML = t ? artHTML(t) : ''; }
  }
  for (const el of $$('.js-like')) {
    const on = !!t?.liked;
    el.classList.toggle('on', on);
    el.innerHTML = on ? I.heartFill : I.heart;
  }
  syncControls();
  if (t) colorOf(t).then(c => {
    if (S.currentId !== t.id) return;
    document.documentElement.style.setProperty('--np', c);
    document.documentElement.style.setProperty('--mini', `color-mix(in srgb, ${c} 70%, #000)`);
  });
  document.title = t ? `${t.title} · ${t.artist}` : 'Sonora';
}

function syncControls() {
  const playing = !audio.paused && !!S.currentId;
  document.body.classList.toggle('is-playing', playing);
  for (const el of $$('.js-toggle')) { el.innerHTML = playing ? I.pause : I.play; el.title = playing ? 'Пауза' : 'Воспроизвести'; }
  for (const el of $$('.js-shuffle, [data-act=shuffle]')) el.classList.toggle('on', S.shuffle);
  for (const el of $$('.js-repeat')) {
    el.classList.toggle('on', S.repeat !== 'off');
    el.classList.toggle('rep-one', S.repeat === 'one');
    el.title = { off: 'Повтор выключен', all: 'Повтор всех', one: 'Повтор трека' }[S.repeat];
  }
  for (const b of $$('[data-act=play-coll]')) {
    const cur = S.ctx?.key === b.dataset.key && playing;
    b.innerHTML = cur ? I.pause : I.play;
  }
  for (const b of $$('.card [data-act=play-track], .top-result [data-act=play-track]')) {
    b.innerHTML = b.dataset.id === S.currentId && playing ? I.pause : I.play;
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = S.currentId ? (playing ? 'playing' : 'paused') : 'none';
}

function markCurrent() {
  for (const r of $$('.row')) r.classList.toggle('cur', r.dataset.id === S.currentId);
  for (const c of $$('.card[data-id]')) c.classList.toggle('cur', c.dataset.id === S.currentId);
  syncControls();
}

let seeking = false;
function syncProgress() {
  const d = audio.duration || S.byId.get(S.currentId)?.duration || 0;
  const c = audio.currentTime || 0;
  const p = d ? c / d * 100 : 0;
  for (const el of $$('.js-cur')) el.textContent = fmt(c);
  for (const el of $$('.js-dur')) el.textContent = fmt(d);
  for (const el of $$('.js-bar')) el.style.width = p + '%';
  if (!seeking) for (const el of $$('.seek')) { el.value = Math.round(p * 10); el.style.setProperty('--p', p + '%'); }
}

function syncVolume() {
  const v = S.muted ? 0 : S.volume;
  audio.volume = v;
  const el = $('.vol');
  if (el) { el.value = Math.round(v * 100); el.style.setProperty('--p', v * 100 + '%'); }
  const m = $('.js-mute');
  if (m) m.innerHTML = v === 0 ? I.mute : v < .5 ? I.volLow : I.vol;
}

let loadToken = 0;
async function loadTrack(id, autoplay = true, startAt = 0) {
  const t = S.byId.get(id);
  if (!t) return;
  const token = ++loadToken;
  let blob;
  try { blob = await DB.get('audio', id); } catch (e) { console.error(e); }
  if (token !== loadToken) return;
  if (!blob) { toast('Файл трека не найден'); return; }
  if (S.audioURL) URL.revokeObjectURL(S.audioURL);
  S.audioURL = URL.createObjectURL(blob);
  S.currentId = id;
  audio.src = S.audioURL;
  if (startAt > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = startAt; }, { once: true });
  if (autoplay) {
    try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
    t.plays = (t.plays || 0) + 1; t.lastPlayed = Date.now();
    DB.put('tracks', t).catch(() => { });
  }
  setMediaSession(t);
  syncPlayer(); markCurrent(); syncProgress(); renderQueue();
  saveSession();
}

function playList(ids, startIndex = 0, ctx = null) {
  if (!ids.length) return;
  S.ctx = ctx;
  S.queue = ids.slice();
  S.unshuffled = null;
  S.index = clamp(startIndex, 0, ids.length - 1);
  if (S.shuffle) applyShuffle();
  loadTrack(S.queue[S.index]);
  renderSidebar();
}

function applyShuffle() {
  S.unshuffled = S.queue.slice();
  const cur = S.queue[S.index];
  const rest = S.queue.filter((_, i) => i !== S.index);
  S.queue = cur ? [cur, ...shuffleArr(rest)] : shuffleArr(rest);
  S.index = 0;
}

function toggleShuffle() {
  S.shuffle = !S.shuffle;
  ls.set('shuffle', S.shuffle);
  if (S.queue.length) {
    if (S.shuffle) applyShuffle();
    else if (S.unshuffled) {
      const cur = S.queue[S.index];
      S.queue = S.unshuffled; S.unshuffled = null;
      S.index = Math.max(0, S.queue.indexOf(cur));
    }
  }
  syncControls(); renderQueue(); saveSession();
  toast(S.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено');
}

function cycleRepeat() {
  S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat];
  ls.set('repeat', S.repeat);
  syncControls();
  toast({ off: 'Повтор выключен', all: 'Повтор всех треков', one: 'Повтор текущего трека' }[S.repeat]);
}

function togglePlay() {
  if (!S.currentId) {
    const ids = collection('all').ids;
    if (ids.length) playList(ids, S.shuffle ? Math.floor(Math.random() * ids.length) : 0, { key: 'all', name: 'Все треки' });
    return;
  }
  if (audio.paused) audio.play().catch(() => { }); else audio.pause();
}

function next(auto = false) {
  if (!S.queue.length) return;
  if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => { }); return; }
  let i = S.index + 1;
  if (i >= S.queue.length) {
    if (S.repeat === 'all' || !auto) {
      i = 0;
      if (S.shuffle && S.queue.length > 2) { const cur = S.queue[S.index]; shuffleArr(S.queue); if (S.queue[0] === cur) S.queue.push(S.queue.shift()); }
    } else { audio.pause(); audio.currentTime = 0; syncControls(); return; }
  }
  S.index = i;
  loadTrack(S.queue[i]);
}

function prev() {
  if (!S.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  S.index = S.index > 0 ? S.index - 1 : (S.repeat === 'all' ? S.queue.length - 1 : 0);
  loadTrack(S.queue[S.index]);
}

function seekBy(s) {
  if (!S.currentId) return;
  audio.currentTime = clamp(audio.currentTime + s, 0, audio.duration || 0);
}

function addToQueue(ids, playNext = false) {
  if (!S.currentId) { playList(ids, 0, { key: 'queue', name: 'Очередь' }); return; }
  if (playNext) {
    S.queue.splice(S.index + 1, 0, ...ids);
    if (S.unshuffled) { const p = S.unshuffled.indexOf(S.currentId); S.unshuffled.splice(p + 1, 0, ...ids); }
  } else {
    S.queue.push(...ids);
    if (S.unshuffled) S.unshuffled.push(...ids);
  }
  renderQueue(); saveSession();
  toast(playNext ? 'Будет играть следующим' : 'Добавлено в очередь');
}

function saveSession() {
  ls.set('session', { queue: S.queue, unshuffled: S.unshuffled, index: S.index, time: audio.currentTime || 0, ctx: S.ctx });
}

/* Media Session — кнопки на руле, Bluetooth, экран блокировки */
function setMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const u = coverURL(t);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album === NO_ALBUM ? '' : t.album,
      artwork: u ? [{ src: u, sizes: '512x512', type: t.cover.type || 'image/jpeg' }] :
        [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
    });
  } catch (e) { console.warn(e); }
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const h = {
    play: () => { if (S.currentId) audio.play(); else togglePlay(); },
    pause: () => audio.pause(),
    stop: () => audio.pause(),
    previoustrack: () => prev(),
    nexttrack: () => next(),
    seekbackward: d => seekBy(-(d.seekOffset || 10)),
    seekforward: d => seekBy(d.seekOffset || 10),
    seekto: d => { if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; },
  };
  for (const [k, fn] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, fn); } catch { } }
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration;
  if (!isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: clamp(audio.currentTime, 0, d) }); } catch { }
}

let lastSave = 0;
audio.addEventListener('timeupdate', () => {
  syncProgress();
  const now = Date.now();
  if (now - lastSave > 5000) { lastSave = now; saveSession(); }
});
audio.addEventListener('play', () => { syncControls(); updatePositionState(); });
audio.addEventListener('pause', () => { syncControls(); saveSession(); });
audio.addEventListener('ended', () => next(true));
audio.addEventListener('loadedmetadata', () => {
  syncProgress(); updatePositionState();
  const t = S.byId.get(S.currentId);
  if (t && (!t.duration || Math.abs(t.duration - audio.duration) > 2) && isFinite(audio.duration)) { t.duration = audio.duration; DB.put('tracks', t).catch(() => { }); }
});
audio.addEventListener('seeked', updatePositionState);
audio.addEventListener('error', () => {
  if (!S.currentId || !audio.src) return;
  const t = S.byId.get(S.currentId);
  toast(`Не удаётся воспроизвести «${t?.title || 'трек'}» — формат не поддерживается`);
  if (S.queue.length > 1 && !audio.dataset.err) { audio.dataset.err = '1'; setTimeout(() => { delete audio.dataset.err; next(); }, 1200); }
});

/* Перемотка ползунком */
document.addEventListener('input', e => {
  const el = e.target;
  if (el.classList.contains('seek')) {
    seeking = true;
    const d = audio.duration || 0;
    el.style.setProperty('--p', el.value / 10 + '%');
    for (const c of $$('.js-cur')) c.textContent = fmt(el.value / 1000 * d);
  } else if (el.classList.contains('vol')) {
    S.volume = el.value / 100; S.muted = false; ls.set('volume', S.volume); syncVolume();
  } else if (el.id === 'searchInput') {
    S.search = el.value; renderSearchResults();
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.classList.contains('seek')) {
    if (audio.duration) audio.currentTime = el.value / 1000 * audio.duration;
    seeking = false;
  } else if (el.dataset.act === 'sort') {
    S.sort = el.value; ls.set('sort', S.sort); render();
  } else if (el.id === 'fileInput' || el.id === 'folderInput') {
    importFiles(el.files); el.value = '';
  }
});

/* ================= Очередь ================= */
let queueOpen = false;
function renderQueue() {
  if (!queueOpen) return;
  const q = $('#queue');
  const cur = S.byId.get(S.currentId);
  const up = S.queue.slice(S.index + 1).map((id, i) => ({ t: S.byId.get(id), i: S.index + 1 + i })).filter(x => x.t);
  const row = (t, i, removable) => `<div class="item ${t.id === S.currentId ? 'playing' : ''}" data-act="queue-jump" data-qi="${i}">${artHTML(t)}<div><div class="item-t">${esc(t.title)}</div><div class="item-s">${esc(t.artist)}</div></div>${removable ? `<button class="icon-btn" data-act="queue-remove" data-qi="${i}" title="Убрать">${I.minus}</button>` : ''}</div>`;
  q.innerHTML = `<div class="queue-head"><h2>Очередь</h2><button class="icon-btn" data-act="queue" title="Закрыть">${I.close}</button></div>
    <div class="queue-body">
      ${cur ? `<h4>Сейчас играет</h4>${row(cur, S.index, false)}` : '<p class="item-s" style="padding:12px">Ничего не играет</p>'}
      ${up.length ? `<h4>Далее${S.ctx?.name ? ': ' + esc(S.ctx.name) : ''}</h4>${up.slice(0, 200).map(x => row(x.t, x.i, true)).join('')}` : ''}
      ${up.length > 200 ? `<p class="item-s" style="padding:12px">…и ещё ${up.length - 200}</p>` : ''}
    </div>`;
}
function toggleQueue(force) {
  queueOpen = force ?? !queueOpen;
  $('#queue').hidden = !queueOpen;
  renderQueue();
}

/* ================= Экран «Сейчас играет» и режим «Авто» ================= */
function openNP() {
  if (!S.currentId) return;
  const np = $('#np');
  if (!np.hidden) return;
  np.hidden = false; np.classList.remove('closing');
  history.pushState({ np: 1 }, '');
  syncPlayer(); syncProgress();
}
function closeNP(fromPop = false) {
  const np = $('#np');
  if (np.hidden) return;
  np.classList.add('closing');
  setTimeout(() => { np.hidden = true; np.classList.remove('closing'); }, 240);
  if (!fromPop && history.state?.np) history.back();
}
window.addEventListener('popstate', e => {
  if (!e.state?.np && !$('#np').hidden) closeNP(true);
  if (!e.state?.car && !$('#car').hidden) exitCar(true);
});

let clockTimer;
async function enterCar() {
  const car = $('#car');
  car.hidden = false;
  history.pushState({ car: 1, np: history.state?.np }, '');
  syncPlayer(); syncProgress();
  const tick = () => { const el = $('.js-clock'); if (el) el.textContent = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); };
  tick(); clockTimer = setInterval(tick, 10000);
  await requestWake();
  try { if (matchMedia('(max-width: 820px)').matches && !document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch { }
}
function exitCar(fromPop = false) {
  const car = $('#car');
  if (car.hidden) return;
  car.hidden = true;
  clearInterval(clockTimer);
  if (S.wakeLock) { S.wakeLock.release().catch(() => { }); S.wakeLock = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  if (!fromPop && history.state?.car) history.back();
}
async function requestWake() {
  try { if ('wakeLock' in navigator && !$('#car').hidden) S.wakeLock = await navigator.wakeLock.request('screen'); } catch { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#car').hidden) requestWake(); });

/* Свайпы по обложке */
function setupSwipe() {
  let x0 = null, y0 = 0, el = null;
  document.addEventListener('touchstart', e => {
    el = e.target.closest('.js-swipe');
    if (!el) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 == null || !el) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? next() : prev(); }
    else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5 && el.closest('#np')) closeNP();
  }, { passive: true });
}

/* ================= Импорт ================= */
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|flac|wav|ogg|oga|opus|webm|weba|mp4|aiff?|caf)$/i;
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', weba: 'audio/webm', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf' };
let importing = false;

async function importFiles(list) {
  const files = [...(list || [])].filter(f => (f.type && f.type.startsWith('audio/')) || AUDIO_EXT.test(f.name));
  if (!files.length) { toast('Аудиофайлы не найдены'); return; }
  if (importing) { toast('Подождите, идёт импорт…'); return; }
  importing = true;
  const bar = $('#importbar');
  bar.hidden = false;
  const existing = new Set(S.tracks.map(t => t.fileName + '|' + t.size));
  let added = 0, skipped = 0, failed = 0;
  const base = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    bar.innerHTML = `<b>Добавляем музыку: ${i + 1} из ${files.length}</b><span>${esc(f.name)}</span><div class="meter"><i style="width:${(i / files.length) * 100}%"></i></div>`;
    if (existing.has(f.name + '|' + f.size)) { skipped++; continue; }
    try {
      const tags = await Tags.read(f);
      const fn = Tags.fromName(f.name);
      const ext = (f.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
      const type = f.type || MIME[ext] || 'audio/mpeg';
      const blob = f.type ? f : new Blob([f], { type });
      const duration = await audioDuration(blob);
      const id = uid();
      const t = {
        id, title: tags.title || fn.title || f.name, artist: tags.artist || fn.artist || tags.albumArtist || UNKNOWN_ARTIST,
        albumArtist: tags.albumArtist || '', album: tags.album || NO_ALBUM, trackNo: tags.track || 0, year: tags.year || 0,
        duration, cover: tags.cover || null, fileName: f.name, size: f.size, type,
        addedAt: base - i, liked: false, plays: 0,
      };
      await DB.put('audio', blob, id);
      await DB.put('tracks', t);
      S.tracks.push(t); S.byId.set(id, t); existing.add(f.name + '|' + f.size);
      added++;
      if (added % 10 === 0) renderSidebar();
    } catch (e) {
      console.error('import', f.name, e);
      failed++;
      if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message))) { toast('Закончилось место на устройстве'); break; }
    }
  }
  bar.hidden = true;
  importing = false;
  render();
  const parts = [];
  if (added) parts.push(`Добавлено: ${tracksWord(added)}`);
  if (skipped) parts.push(`уже были: ${skipped}`);
  if (failed) parts.push(`ошибок: ${failed}`);
  toast(parts.join(', ') || 'Ничего не добавлено');
  if (added) requestPersist(false);
}

async function requestPersist(loud = true) {
  try {
    if (!navigator.storage?.persist) { if (loud) toast('Браузер не поддерживает эту функцию'); return; }
    const ok = await navigator.storage.persist();
    if (loud) toast(ok ? 'Готово: музыка защищена от автоочистки' : 'Браузер не разрешил. Установите приложение — это поможет.');
    if (route() === 'settings') fillStorage();
  } catch { }
}

/* Drag & drop */
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('#dropzone').hidden = false; e.preventDefault(); } });
window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropzone').hidden = true; });
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; $('#dropzone').hidden = true;
  const items = [...(e.dataTransfer?.items || [])];
  const entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.some(en => en.isDirectory)) {
    const files = [];
    const walk = en => new Promise(res => {
      if (en.isFile) en.file(f => { files.push(f); res(); }, () => res());
      else if (en.isDirectory) {
        const r = en.createReader(), all = [];
        const read = () => r.readEntries(async es => { if (!es.length) { for (const x of all) await walk(x); res(); } else { all.push(...es); read(); } }, () => res());
        read();
      } else res();
    });
    for (const en of entries) await walk(en);
    importFiles(files);
  } else importFiles(e.dataTransfer?.files);
});

/* ================= Лайки, плейлисты, удаление ================= */
async function toggleLike(id) {
  const t = S.byId.get(id);
  if (!t) return;
  t.liked = !t.liked; t.likedAt = t.liked ? Date.now() : 0;
  await DB.put('tracks', t);
  toast(t.liked ? 'Добавлено в «Любимые треки»' : 'Удалено из «Любимых треков»');
  if (route() === 'liked') render(); else { refreshLikes(id); renderSidebar(); }
  syncPlayer();
}
function refreshLikes(id) {
  const t = S.byId.get(id);
  for (const r of $$(`.row[data-id="${id}"] .like`)) { r.classList.toggle('on', t.liked); r.innerHTML = t.liked ? I.heartFill : I.heart; }
}

async function createPlaylist(withIds = []) {
  const name = await askText({ title: 'Новый плейлист', value: `Мой плейлист № ${S.playlists.length + 1}`, ok: 'Создать' });
  if (!name) return null;
  const p = { id: uid(), name, ids: [...withIds], createdAt: Date.now(), updatedAt: Date.now() };
  await DB.put('playlists', p);
  S.playlists.push(p);
  toast(withIds.length ? `Добавлено в «${name}»` : `Плейлист «${name}» создан`);
  if (!withIds.length) go('pl/' + p.id); else render();
  return p;
}

async function addToPlaylist(p, ids) {
  const fresh = ids.filter(id => !p.ids.includes(id));
  if (!fresh.length) { toast(`Уже есть в «${p.name}»`); return; }
  p.ids.push(...fresh); p.updatedAt = Date.now();
  await DB.put('playlists', p);
  toast(`Добавлено в «${p.name}»`);
  render();
}

async function removeFromPlaylist(p, id) {
  p.ids = p.ids.filter(x => x !== id); p.updatedAt = Date.now();
  await DB.put('playlists', p);
  toast(`Удалено из «${p.name}»`);
  render();
}

async function renamePlaylist(p) {
  const name = await askText({ title: 'Переименовать плейлист', value: p.name, ok: 'Сохранить' });
  if (!name) return;
  p.name = name; p.updatedAt = Date.now();
  await DB.put('playlists', p);
  if (S.ctx?.key === 'pl/' + p.id) S.ctx.name = name;
  render();
}

async function deletePlaylist(p) {
  if (!await confirmBox({ title: 'Удалить плейлист?', text: `Плейлист «${p.name}» будет удалён. Сами треки останутся в медиатеке.`, ok: 'Удалить', danger: true })) return;
  await DB.del('playlists', p.id);
  S.playlists = S.playlists.filter(x => x !== p);
  toast('Плейлист удалён');
  if (route() === 'pl/' + p.id) go('library'); else render();
}

async function editTrack(t) {
  const title = await askText({ title: 'Название трека', value: t.title, ok: 'Далее' });
  if (!title) return;
  const artist = await askText({ title: 'Исполнитель', value: t.artist, ok: 'Далее' });
  if (!artist) return;
  const album = await askText({ title: 'Альбом', value: t.album, ok: 'Сохранить' });
  if (!album) return;
  Object.assign(t, { title, artist, album });
  colors.delete(t.id);
  await DB.put('tracks', t);
  render(); syncPlayer();
  if (t.id === S.currentId) setMediaSession(t);
  toast('Сохранено');
}

async function deleteTracks(ids) {
  const one = ids.length === 1 ? S.byId.get(ids[0]) : null;
  if (!await confirmBox({
    title: one ? 'Удалить трек?' : `Удалить ${tracksWord(ids.length)}?`,
    text: one ? `«${one.title}» будет удалён из приложения. Файл на вашем диске не пострадает.` : 'Треки будут удалены из приложения. Файлы на диске не пострадают.',
    ok: 'Удалить', danger: true
  })) return;
  const set = new Set(ids);
  if (set.has(S.currentId)) {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    S.currentId = null;
  }
  for (const id of ids) {
    await DB.del('audio', id); await DB.del('tracks', id);
    if (covers.has(id)) { URL.revokeObjectURL(covers.get(id)); covers.delete(id); }
  }
  S.tracks = S.tracks.filter(t => !set.has(t.id)); indexTracks();
  for (const p of S.playlists) if (p.ids.some(id => set.has(id))) { p.ids = p.ids.filter(id => !set.has(id)); await DB.put('playlists', p); }
  const cur = S.queue[S.index];
  S.queue = S.queue.filter(id => !set.has(id));
  if (S.unshuffled) S.unshuffled = S.unshuffled.filter(id => !set.has(id));
  S.index = cur && !set.has(cur) ? S.queue.indexOf(cur) : Math.min(S.index, S.queue.length - 1);
  if (!S.currentId && S.queue.length && S.index >= 0) loadTrack(S.queue[S.index], false);
  toast('Удалено');
  render(); syncPlayer(); renderQueue(); saveSession();
}

async function wipeAll() {
  if (!await confirmBox({ title: 'Удалить всю медиатеку?', text: 'Все треки и плейлисты будут удалены из приложения. Это действие нельзя отменить. Файлы на вашем диске не пострадают.', ok: 'Удалить всё', danger: true })) return;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  await DB.clear('audio'); await DB.clear('tracks'); await DB.clear('playlists');
  for (const u of covers.values()) URL.revokeObjectURL(u);
  covers.clear(); colors.clear();
  Object.assign(S, { tracks: [], playlists: [], queue: [], unshuffled: null, index: -1, currentId: null, ctx: null });
  indexTracks(); saveSession();
  render(); syncPlayer();
  toast('Медиатека очищена');
}

/* ================= Меню ================= */
function openMenu(anchor, items, head = '') {
  const layer = $('#menu');
  layer.hidden = false;
  layer.innerHTML = `<div class="menu" role="menu">${head}${items.map((it, i) => it === '-' ? '<hr>' :
    `<button class="${it.danger ? 'danger' : ''}" data-mi="${i}" role="menuitem">${it.icon || ''}<span>${esc(it.label)}</span></button>`).join('')}</div>`;
  const menu = $('.menu', layer);
  if (!matchMedia('(max-width: 820px)').matches) {
    const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, bottom: innerHeight / 2, top: innerHeight / 2, right: innerWidth / 2 };
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = r.right - mw, y = r.bottom + 4;
    if (x < 8) x = Math.min(r.left, innerWidth - mw - 8);
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
    menu.style.left = clamp(x, 8, innerWidth - mw - 8) + 'px';
    menu.style.top = y + 'px';
  }
  layer.onclick = e => {
    const b = e.target.closest('[data-mi]');
    if (!b && e.target.closest('.menu')) return;
    closeMenu();
    if (b) items[+b.dataset.mi].fn();
  };
}
function closeMenu() { const l = $('#menu'); l.hidden = true; l.innerHTML = ''; }

function playlistPicker(anchor, ids) {
  const items = [{ icon: I.plus, label: 'Новый плейлист', fn: () => createPlaylist(ids) }];
  if (S.playlists.length) items.push('-');
  for (const p of [...S.playlists].sort((a, b) => b.updatedAt - a.updatedAt)) items.push({ icon: I.note, label: p.name, fn: () => addToPlaylist(p, ids) });
  openMenu(anchor, items, `<div class="menu-title">Добавить в плейлист</div>`);
}

function trackMenu(anchor, id, listKey) {
  const t = S.byId.get(id);
  if (!t) return;
  const pl = listKey?.startsWith('pl/') ? S.playlists.find(p => 'pl/' + p.id === listKey) : null;
  const items = [
    { icon: I.playNext, label: 'Воспроизвести далее', fn: () => addToQueue([id], true) },
    { icon: I.queue, label: 'Добавить в очередь', fn: () => addToQueue([id]) },
    { icon: I.addList, label: 'Добавить в плейлист', fn: () => playlistPicker(anchor, [id]) },
    { icon: t.liked ? I.heartFill : I.heart, label: t.liked ? 'Удалить из любимых' : 'Добавить в любимые', fn: () => toggleLike(id) },
    '-',
    { icon: I.user, label: 'К исполнителю', fn: () => { closeNP(); go('artist/' + enc(t.artist)); } },
  ];
  if (t.album && t.album !== NO_ALBUM) items.push({ icon: I.disc, label: 'К альбому', fn: () => { closeNP(); go('album/' + enc(t.album)); } });
  items.push({ icon: I.edit, label: 'Изменить сведения', fn: () => editTrack(t) });
  items.push('-');
  if (pl) items.push({ icon: I.minus, label: 'Удалить из этого плейлиста', fn: () => removeFromPlaylist(pl, id) });
  items.push({ icon: I.trash, label: 'Удалить из медиатеки', danger: true, fn: () => deleteTracks([id]) });
  openMenu(anchor, items, `<div class="menu-title">${artHTML(t)}<div><b>${esc(t.title)}</b>${esc(t.artist)}</div></div>`);
}

function addMenu(anchor) {
  openMenu(anchor, [
    { icon: I.plus, label: 'Создать плейлист', fn: () => createPlaylist() },
    '-',
    { icon: I.upload, label: 'Добавить файлы', fn: () => $('#fileInput').click() },
    { icon: I.folder, label: 'Добавить папку', fn: () => $('#folderInput').click() },
  ]);
}

/* ================= Модальные окна и тосты ================= */
function modal(html, onOpen) {
  return new Promise(res => {
    const layer = $('#modal');
    layer.hidden = false;
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const done = v => { layer.hidden = true; layer.innerHTML = ''; document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', key, true);
    layer.onclick = e => { if (e.target === layer) done(null); };
    onOpen(layer, done);
  });
}
function askText({ title, value = '', ok = 'OK' }) {
  return modal(`<h3>${esc(title)}</h3><form><input type="text" maxlength="120" value="${esc(value)}"><div class="btns"><button type="button" class="btn ghost" data-x>Отмена</button><button class="btn green">${esc(ok)}</button></div></form>`,
    (l, done) => {
      const inp = $('input', l);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      $('[data-x]', l).onclick = () => done(null);
      $('form', l).onsubmit = e => { e.preventDefault(); done(inp.value.trim() || null); };
    });
}
function confirmBox({ title, text, ok = 'OK', danger }) {
  return modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="btns"><button class="btn ghost" data-x>Отмена</button><button class="btn ${danger ? 'danger' : 'green'}" data-ok>${esc(ok)}</button></div>`,
    (l, done) => { $('[data-x]', l).onclick = () => done(false); $('[data-ok]', l).onclick = () => done(true); setTimeout(() => $('[data-ok]', l).focus(), 30); });
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ================= Обработчик кликов ================= */
const ACT = {
  'import': () => $('#fileInput').click(),
  'import-folder': () => $('#folderInput').click(),
  'add-menu': el => addMenu(el),
  'lib-tab': el => { S.libTab = el.dataset.tab; ls.set('libTab', S.libTab); if (el.dataset.toLib) { go('library'); if (route() === 'library') render(); } else if (route() === 'library') render(); else renderSidebar(); },
  'back': () => { if (history.length > 1) history.back(); else go('home'); },
  'toggle': () => togglePlay(),
  'next': () => next(),
  'prev': () => prev(),
  'shuffle': () => toggleShuffle(),
  'repeat': () => cycleRepeat(),
  'seek-back': () => seekBy(-15),
  'seek-fwd': () => seekBy(15),
  'mute': () => { S.muted = !S.muted; syncVolume(); },
  'like-current': () => S.currentId && toggleLike(S.currentId),
  'like': el => toggleLike(el.closest('[data-id]').dataset.id),
  'open-np': () => openNP(),
  'close-np': () => closeNP(),
  'car': () => { if (!S.currentId && S.tracks.length) togglePlay(); enterCar(); },
  'car-exit': () => exitCar(),
  'queue': () => toggleQueue(),
  'queue-jump': el => { S.index = +el.dataset.qi; loadTrack(S.queue[S.index]); },
  'queue-remove': el => {
    const i = +el.dataset.qi, id = S.queue[i];
    S.queue.splice(i, 1);
    if (S.unshuffled) { const j = S.unshuffled.indexOf(id); if (j >= 0) S.unshuffled.splice(j, 1); }
    renderQueue(); saveSession();
  },
  'install': async () => {
    if (!S.installPrompt) return;
    S.installPrompt.prompt();
    const r = await S.installPrompt.userChoice.catch(() => null);
    S.installPrompt = null;
    if (r?.outcome === 'accepted') toast('Sonora устанавливается…');
    render();
  },
  'persist': () => requestPersist(true),
  'wipe': () => wipeAll(),
  'logout': () => Auth.logout(),
  'change-pass': () => Auth.changePassword(),
  'delete-account': () => Auth.deleteAccount(),
  'user-menu': el => openMenu(el, [
    { icon: I.settings, label: 'Настройки', fn: () => go('settings') },
    { icon: I.lock, label: 'Сменить пароль', fn: () => Auth.changePassword() },
    '-',
    { icon: I.logout, label: 'Выйти', fn: () => Auth.logout() },
  ], `<div class="menu-title"><div><b>${esc(S.user.name)}</b>Аккаунт на этом устройстве</div></div>`),
  'track-menu': el => { const row = el.closest('[data-id]'); trackMenu(el, row.dataset.id, el.closest('.tl')?.dataset.key || route()); },
  'current-menu': el => S.currentId && trackMenu(el, S.currentId, S.ctx?.key),
  'pl-menu': el => {
    const p = S.playlists.find(x => x.id === el.dataset.id);
    if (!p) return;
    openMenu(el, [
      { icon: I.playNext, label: 'Воспроизвести далее', fn: () => addToQueue(p.ids.filter(id => S.byId.has(id)), true) },
      { icon: I.queue, label: 'Добавить в очередь', fn: () => addToQueue(p.ids.filter(id => S.byId.has(id))) },
      '-',
      { icon: I.edit, label: 'Переименовать', fn: () => renamePlaylist(p) },
      { icon: I.trash, label: 'Удалить плейлист', danger: true, fn: () => deletePlaylist(p) },
    ]);
  },
  'play-coll': el => {
    const key = el.dataset.key;
    if (S.ctx?.key === key && S.currentId) { togglePlay(); return; }
    const c = collection(key);
    if (!c || !c.ids.length) return;
    playList(c.ids, S.shuffle ? Math.floor(Math.random() * c.ids.length) : 0, { key, name: c.title });
  },
  'play-track': el => {
    const id = el.dataset.id;
    if (id === S.currentId) { togglePlay(); return; }
    const list = el.dataset.list;
    let ids, name;
    if (list === 'recent') { ids = S.tracks.filter(t => t.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).map(t => t.id); name = 'Недавно слушали'; }
    else if (list === 'most') { ids = S.tracks.filter(t => t.plays > 1).sort((a, b) => b.plays - a.plays).map(t => t.id); name = 'Ваши хиты'; }
    else if (list === 'search') { ids = S.searchIds || [id]; name = 'Поиск'; }
    else { ids = [...S.tracks].sort((a, b) => b.addedAt - a.addedAt).map(t => t.id); name = 'Недавно добавленные'; }
    playList(ids, Math.max(0, ids.indexOf(id)), { key: 'list:' + list, name });
  },
};

document.addEventListener('click', e => {
  const actEl = e.target.closest('[data-act]');
  if (actEl && actEl.tagName !== 'SELECT') {
    const fn = ACT[actEl.dataset.act];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(actEl, e); return; }
  }
  const row = e.target.closest('.row');
  if (row) {
    const tl = row.closest('.tl');
    const key = tl?.dataset.key || route();
    const id = row.dataset.id;
    if (id === S.currentId) { togglePlay(); return; }
    let ids, name;
    if (key === 'search') { ids = S.searchIds || [id]; name = 'Поиск'; }
    else { const c = collection(key); ids = c ? c.ids : [id]; name = c?.title; }
    playList(ids, Math.max(0, ids.indexOf(id)), { key, name });
    return;
  }
  const goEl = e.target.closest('[data-go]');
  if (goEl) { go(goEl.dataset.go); }
});

document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.row');
  if (row) { e.preventDefault(); trackMenu(row.querySelector('[data-act=track-menu]'), row.dataset.id, row.closest('.tl')?.dataset.key); }
});

document.addEventListener('keydown', e => {
  if (!S.user || e.target.matches('input[type=text], input[type=search], input[type=password], textarea') || !$('#modal').hidden) return;
  if (e.key === 'Escape') { if (!$('#menu').hidden) closeMenu(); else if (queueOpen) toggleQueue(false); else if (!$('#car').hidden) exitCar(); else closeNP(); return; }
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? next() : seekBy(5); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? prev() : seekBy(-5); }
  else if (e.key === 'ArrowUp' && e.ctrlKey) { S.volume = clamp(S.volume + .1, 0, 1); ls.set('volume', S.volume); syncVolume(); }
  else if (e.key === 'ArrowDown' && e.ctrlKey) { S.volume = clamp(S.volume - .1, 0, 1); ls.set('volume', S.volume); syncVolume(); }
  else if (e.key === 'MediaTrackNext') next();
  else if (e.key === 'MediaTrackPrevious') prev();
});

/* ================= PWA ================= */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; if (route() === 'settings') render(); });
window.addEventListener('appinstalled', () => { S.installPrompt = null; toast('Sonora установлена'); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}
// Открытие аудиофайлов через установленное приложение («Открыть с помощью» на ПК)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async p => {
    if (!p.files?.length) return;
    const files = await Promise.all(p.files.map(h => h.getFile()));
    if (S.user && DB.db) await importFiles(files); else S.pendingFiles = files;
  });
}

/* ================= Аккаунты =================
   Аккаунты локальные: живут на этом устройстве, у каждого своя база с музыкой и свои настройки.
   Пароль хранится только в виде хэша PBKDF2-SHA256. */
const Auth = {
  list() { try { return JSON.parse(localStorage.getItem('sonora.accounts')) || []; } catch { return []; } },
  save(list) { localStorage.setItem('sonora.accounts', JSON.stringify(list)); },
  find(name) { const k = name.trim().toLowerCase(); return this.list().find(a => a.key === k); },
  async hash(password, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async register(name, password) {
    name = name.trim();
    if (name.length < 2) throw new Error('Имя должно быть не короче 2 символов');
    if (password.length < 4) throw new Error('Пароль должен быть не короче 4 символов');
    if (this.find(name)) throw new Error('Такой пользователь уже есть на этом устройстве');
    const list = this.list();
    const key = name.toLowerCase();
    const salt = uid() + uid();
    // Первый аккаунт забирает медиатеку, созданную до появления входа
    const legacy = !list.length && !list.some(a => a.db === 'sonora');
    const acc = {
      key, name, salt, hash: await this.hash(password, salt), createdAt: Date.now(),
      db: legacy ? 'sonora' : 'sonora-u-' + uid(), prefix: legacy ? 'sonora.' : `sonora.u.${uid()}.`,
    };
    list.push(acc); this.save(list);
    return acc;
  },
  async login(name, password) {
    const acc = this.find(name);
    if (!acc || await this.hash(password, acc.salt) !== acc.hash) throw new Error('Неверное имя пользователя или пароль');
    return acc;
  },
  current() { const k = localStorage.getItem('sonora.currentUser'); return k ? this.list().find(a => a.key === k) || null : null; },
  logout() {
    audio.pause();
    saveSession();
    localStorage.removeItem('sonora.currentUser');
    location.hash = '';
    location.reload();
  },
  async changePassword() {
    const ok = await modal(`<h3>Сменить пароль</h3><form>
      <input type="password" name="old" placeholder="Текущий пароль" autocomplete="current-password">
      <input type="password" name="n1" placeholder="Новый пароль" autocomplete="new-password">
      <input type="password" name="n2" placeholder="Повторите новый пароль" autocomplete="new-password">
      <p class="auth-err" style="margin:-8px 0 14px"></p>
      <div class="btns"><button type="button" class="btn ghost" data-x>Отмена</button><button class="btn green">Сохранить</button></div></form>`,
      (l, done) => {
        setTimeout(() => $('input', l).focus(), 30);
        $('[data-x]', l).onclick = () => done(false);
        $('form', l).onsubmit = async e => {
          e.preventDefault();
          const f = e.target, err = $('.auth-err', l);
          const acc = this.find(S.user.name);
          if (await this.hash(f.old.value, acc.salt) !== acc.hash) { err.textContent = 'Текущий пароль неверный'; return; }
          if (f.n1.value.length < 4) { err.textContent = 'Новый пароль должен быть не короче 4 символов'; return; }
          if (f.n1.value !== f.n2.value) { err.textContent = 'Пароли не совпадают'; return; }
          const list = this.list(), a = list.find(x => x.key === acc.key);
          a.salt = uid() + uid(); a.hash = await this.hash(f.n1.value, a.salt);
          this.save(list);
          done(true);
        };
      });
    if (ok) toast('Пароль изменён');
  },
  async deleteAccount() {
    if (!await confirmBox({ title: 'Удалить аккаунт?', text: `Аккаунт «${S.user.name}» и вся его музыка и плейлисты будут удалены с этого устройства. Это нельзя отменить.`, ok: 'Удалить аккаунт', danger: true })) return;
    audio.pause();
    const acc = S.user;
    DB.db?.close();
    await new Promise(res => { const r = indexedDB.deleteDatabase(acc.db); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    for (const k of LS_KEYS) localStorage.removeItem(acc.prefix + k);
    this.save(this.list().filter(a => a.key !== acc.key));
    localStorage.removeItem('sonora.currentUser');
    location.hash = '';
    location.reload();
  },
};

function showAuth() {
  const has = Auth.list().length > 0;
  let mode = has ? 'login' : 'register';
  const box = $('#auth');
  const draw = (msg = '') => {
    const reg = mode === 'register';
    box.innerHTML = `<div class="auth-card">
      <div class="auth-logo"><img src="icons/icon.svg" alt=""><span>Sonora</span></div>
      <h1>${reg ? 'Создайте аккаунт' : 'Вход в Sonora'}</h1>
      <p class="auth-sub">${reg ? 'У каждого аккаунта своя музыка и свои плейлисты.' : 'Войдите, чтобы слушать свою музыку.'}</p>
      ${!reg && Auth.list().length ? `<div class="auth-users">${Auth.list().map(a => `<button type="button" class="chip" data-user="${esc(a.name)}">${esc(a.name)}</button>`).join('')}</div>` : ''}
      <form autocomplete="on" novalidate>
        <label>Имя пользователя<input type="text" name="u" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="40" required></label>
        <label>Пароль<input type="password" name="p" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
        ${reg ? `<label>Повторите пароль<input type="password" name="p2" autocomplete="new-password" required></label>` : ''}
        <p class="auth-err" role="alert">${esc(msg)}</p>
        <button class="btn green auth-submit">${reg ? 'Зарегистрироваться' : 'Войти'}</button>
      </form>
      <p class="auth-switch">${reg ? (has ? 'Уже есть аккаунт? <button type="button" data-mode="login">Войти</button>' : '') : 'Нет аккаунта? <button type="button" data-mode="register">Зарегистрироваться</button>'}</p>
      <p class="auth-note">${I.shield}Аккаунты и музыка хранятся только на этом устройстве и никуда не отправляются. Если поделитесь ссылкой с другом, у него будет своя отдельная медиатека.</p>
    </div>`;
    const f = $('form', box);
    setTimeout(() => (f.u.value ? f.p : f.u).focus(), 30);
    for (const b of $$('[data-mode]', box)) b.onclick = () => { mode = b.dataset.mode; draw(); };
    for (const b of $$('[data-user]', box)) b.onclick = () => { f.u.value = b.dataset.user; f.p.focus(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const err = $('.auth-err', box), btn = $('.auth-submit', box);
      err.textContent = '';
      if (!window.crypto?.subtle) { err.textContent = 'Откройте приложение по адресу https:// — иначе вход не работает'; return; }
      if (!f.u.value.trim() || !f.p.value) { err.textContent = 'Введите имя пользователя и пароль'; return; }
      if (reg && f.p.value !== f.p2.value) { err.textContent = 'Пароли не совпадают'; return; }
      btn.disabled = true;
      try {
        const acc = reg ? await Auth.register(f.u.value, f.p.value) : await Auth.login(f.u.value, f.p.value);
        localStorage.setItem('sonora.currentUser', acc.key);
        box.hidden = true;
        start(acc);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    };
  };
  box.hidden = false;
  $('#app').hidden = true;
  draw();
}

function start(acc) {
  S.user = acc;
  LS_PREFIX = acc.prefix;
  Object.assign(S, {
    shuffle: ls.get('shuffle', false), repeat: ls.get('repeat', 'off'), volume: ls.get('volume', 1),
    libTab: ls.get('libTab', 'playlists'), sort: ls.get('sort', 'added'),
  });
  $('#auth').hidden = true;
  $('#app').hidden = false;
  init(acc.db);
}

/* ================= Запуск ================= */
async function init(dbName) {
  renderPlayerShell(); renderNPShell(); renderCarShell();
  setupMediaSession(); setupSwipe();
  syncVolume();
  try {
    await DB.open(dbName);
    [S.tracks, S.playlists] = await Promise.all([DB.all('tracks'), DB.all('playlists')]);
  } catch (e) {
    console.error(e);
    toast('Не удалось открыть хранилище браузера');
  }
  indexTracks();
  const ses = ls.get('session', null);
  if (ses && ses.queue?.length) {
    S.queue = ses.queue.filter(id => S.byId.has(id));
    S.unshuffled = ses.unshuffled ? ses.unshuffled.filter(id => S.byId.has(id)) : null;
    const curId = ses.queue[ses.index];
    S.index = S.queue.indexOf(curId);
    S.ctx = ses.ctx;
    if (S.index >= 0) await loadTrack(S.queue[S.index], false, ses.time || 0);
    else if (S.queue.length) { S.index = 0; await loadTrack(S.queue[0], false); }
  }
  render();
  syncPlayer();
  syncProgress();
  if (S.pendingFiles) { const f = S.pendingFiles; S.pendingFiles = null; importFiles(f); }
}

const savedUser = Auth.current();
if (savedUser) start(savedUser); else showAuth();
