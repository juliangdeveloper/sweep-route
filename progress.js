'use strict';

const META_SLUG = 'sweep-route';
const SAVE_KEY = 'sweeproute_v1';
const LOGIC_W = 900;
const MAX_CELLS = 62000;

const metaApi = (typeof module === 'object' && module.exports) ? require('./meta.js') : null;

const STATS = [
  { key: 'painted_cells' },
  { key: 'zones' },
  { key: 'calibrated' },
  { key: 'px_per_m' },
  { key: 'broom_cm' },
  { key: 'has_start' },
  { key: 'return_to_start' },
  { key: 'brush_px' },
  { key: 'has_plan' },
  { key: 'plans_loaded', monotonic: true },
  { key: 'routes_total', monotonic: true },
  { key: 'routes_cover', monotonic: true },
  { key: 'routes_once', monotonic: true },
  { key: 'routes_visit', monotonic: true },
  { key: 'routes_return', monotonic: true },
  { key: 'best_coverage', monotonic: true },
  { key: 'longest_m', monotonic: true },
  { key: 'grid_cells' },
  { key: 'painted_m2' }
];

function metaDeclareNow(list) {
  try {
    const fn = (metaApi && metaApi.metaDeclare) || globalThis.metaDeclare;
    if (typeof fn === 'function') fn(list);
  } catch (e) {}
}
metaDeclareNow(STATS);

function metaWrite(slug, version, patch) {
  try {
    const fn = (metaApi && metaApi.metaUpdate) || globalThis.metaUpdate;
    if (typeof fn === 'function') return fn(slug, version, patch);
  } catch (e) {}
  return null;
}

function metaIsDemo() {
  try {
    const fn = (metaApi && metaApi.metaDemo) || globalThis.metaDemo;
    return typeof fn === 'function' && !!fn();
  } catch (e) {
    return false;
  }
}

function num(v, fallback) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : fallback;
}

function posInt(v) {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function unrle(s, len) {
  const parts = s.split(',');
  const m = new Uint8Array(len);
  let i = 0;
  for (let p = 0; p < parts.length; p += 2) {
    const n = +parts[p], v = +parts[p + 1];
    for (let k = 0; k < n && i < len; k++, i++) m[i] = v;
  }
  return m;
}

function decodeMask(s, len) {
  if (!len) return new Uint8Array(0);
  if (typeof s !== 'string' || !s) return new Uint8Array(len);
  try { return unrle(s, len); } catch (e) { return new Uint8Array(len); }
}

function countZones(mask, gw, gh) {
  const n = gw * gh;
  if (!n || !mask || mask.length < n) return 0;
  const lab = new Int32Array(n);
  lab.fill(-1);
  let zones = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const st = [i];
    lab[i] = zones;
    let count = 0;
    while (st.length) {
      const c = st.pop();
      count++;
      const x = c % gw, y = (c / gw) | 0;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let d = 0; d < 4; d++) {
        const nx = x + dirs[d][0], ny = y + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (mask[j] && lab[j] < 0) { lab[j] = zones; st.push(j); }
      }
    }
    if (count >= 4) zones++;
  }
  return zones;
}

function emptyProg() {
  return {
    routesTotal: 0,
    routesCover: 0,
    routesOnce: 0,
    routesVisit: 0,
    routesReturn: 0,
    bestCoverage: 0,
    longestM: 0,
    plansLoaded: 0
  };
}

function normalizeProg(p) {
  const out = emptyProg();
  if (!p || typeof p !== 'object') return out;
  const keys = Object.keys(out);
  for (let i = 0; i < keys.length; i++) {
    const v = p[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[keys[i]] = v;
  }
  return out;
}

function countersFromStats(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return normalizeProg({
    routesTotal: s.routes_total,
    routesCover: s.routes_cover,
    routesOnce: s.routes_once,
    routesVisit: s.routes_visit,
    routesReturn: s.routes_return,
    bestCoverage: s.best_coverage,
    longestM: s.longest_m,
    plansLoaded: s.plans_loaded
  });
}

function countersFromMeta() {
  try {
    const store = globalThis.localStorage;
    if (!store) return emptyProg();
    const raw = store.getItem('meta.v1.' + META_SLUG);
    if (!raw) return emptyProg();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || parsed.slug !== META_SLUG) return emptyProg();
    return countersFromStats(parsed.stats);
  } catch (e) {
    return emptyProg();
  }
}

function recordRoute(prog, mode, retStart, covPct, meters) {
  const p = normalizeProg(prog);
  p.routesTotal += 1;
  if (mode === 'cover') p.routesCover += 1;
  else if (mode === 'once') p.routesOnce += 1;
  else if (mode === 'visit') p.routesVisit += 1;
  if (retStart) p.routesReturn += 1;
  if (typeof covPct === 'number' && Number.isFinite(covPct) && covPct > p.bestCoverage) p.bestCoverage = covPct;
  if (typeof meters === 'number' && Number.isFinite(meters) && meters > p.longestM) {
    p.longestM = Math.round(meters * 1000) / 1000;
  }
  return p;
}

function paintedM2(painted, gw, pxPerM) {
  if (!painted || !gw || !pxPerM) return 0;
  const cellM = (LOGIC_W / gw) / pxPerM;
  const area = painted * cellM * cellM;
  if (!Number.isFinite(area) || area < 0) return 0;
  return Math.round(area * 100) / 100;
}

function deriveStats(save) {
  const src = (save && typeof save === 'object') ? save : {};
  let gw = posInt(src.gw);
  let gh = posInt(src.gh);
  if (!gw || !gh || gw * gh > MAX_CELLS) { gw = 0; gh = 0; }
  const mask = decodeMask(src.mask, gw * gh);
  let painted = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) painted++;
  const counters = normalizeProg(src.counters);
  const pxPerM = num(src.pxPerM, 60);
  const broom = num(src.broom, 0.35);
  const brush = num(src.brush, 14);
  const hasPlan = src.hasPlan ? 1 : (src.img ? 1 : 0);
  return {
    painted_cells: painted,
    zones: countZones(mask, gw, gh),
    calibrated: src.calibrated ? 1 : 0,
    px_per_m: pxPerM,
    broom_cm: Math.round(broom * 100),
    has_start: (src.start && typeof src.start === 'object') ? 1 : 0,
    return_to_start: src.retStart ? 1 : 0,
    brush_px: brush,
    has_plan: hasPlan,
    plans_loaded: Math.max(counters.plansLoaded, hasPlan),
    routes_total: counters.routesTotal,
    routes_cover: counters.routesCover,
    routes_once: counters.routesOnce,
    routes_visit: counters.routesVisit,
    routes_return: counters.routesReturn,
    best_coverage: counters.bestCoverage,
    longest_m: counters.longestM,
    grid_cells: gw * gh,
    painted_m2: paintedM2(painted, gw, pxPerM)
  };
}

const ACHIEVEMENTS = [
  { id: 'first_paint', condition: function (s) { return s.painted_cells >= 1; } },
  { id: 'area_ready', condition: function (s) { return s.painted_cells >= 400; } },
  { id: 'start_set', condition: function (s) { return s.has_start === 1; } },
  { id: 'scale_set', condition: function (s) { return s.calibrated === 1; } },
  { id: 'plan_loaded', condition: function (s) { return s.has_plan === 1 || s.plans_loaded >= 1; } },
  { id: 'first_route', condition: function (s) { return s.routes_total >= 1; } },
  { id: 'full_cover', condition: function (s) { return s.best_coverage >= 100; } },
  { id: 'closed_loop', condition: function (s) { return s.routes_return >= 1; } },
  { id: 'all_modes', condition: function (s) { return s.routes_cover >= 1 && s.routes_once >= 1 && s.routes_visit >= 1; } },
  { id: 'multi_zone', condition: function (s) { return s.zones >= 2; } },
  { id: 'routes_10', condition: function (s) { return s.routes_total >= 10; } },
  { id: 'route_50m', condition: function (s) { return s.longest_m >= 50; } }
];

function logrosFromStats(stats) {
  const out = [];
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    try {
      if (ACHIEVEMENTS[i].condition(stats)) out.push(ACHIEVEMENTS[i].id);
    } catch (e) {}
  }
  return out;
}

function projectStore() {
  try {
    const store = globalThis.localStorage;
    if (store && typeof store.getItem === 'function') return store;
  } catch (e) {}
  return null;
}

function rawRecordValid(raw) {
  try {
    const parsed = JSON.parse(raw);
    return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === 1 && parsed.slug === META_SLUG);
  } catch (e) {
    return false;
  }
}

let metaHasWritten = false;
let metaWroteAt = 0;
let metaPending = false;
let metaTimer = null;
let metaRead = null;
let metaVersion = '';
let hideWindow = null;

function resetMetaClock() {
  metaHasWritten = false;
  metaWroteAt = 0;
  metaPending = false;
  if (metaTimer !== null) {
    clearTimeout(metaTimer);
    metaTimer = null;
  }
}

function noteMetaWrite() {
  metaHasWritten = true;
  metaWroteAt = Date.now();
}

function backfillMeta(version, fallbackSave) {
  try {
    if (metaIsDemo()) return;
    const store = projectStore();
    if (!store) return;
    const key = 'meta.v1.' + META_SLUG;
    let existing = null;
    try { existing = store.getItem(key); } catch (e) { return; }
    if (existing != null && rawRecordValid(existing)) return;
    let save = null;
    try {
      const raw = store.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) save = parsed;
      }
    } catch (e) {
      save = {};
    }
    if (save == null) save = (fallbackSave && typeof fallbackSave === 'object') ? fallbackSave : {};
    const stats = deriveStats(save);
    const wrote = metaWrite(META_SLUG, version, { stats: stats, logros: logrosFromStats(stats) });
    if (wrote) noteMetaWrite();
  } catch (e) {}
}

function performMetaWrite() {
  metaTimer = null;
  try {
    if (metaIsDemo()) {
      metaPending = false;
      return;
    }
    const save = typeof metaRead === 'function' ? metaRead() : {};
    const stats = deriveStats(save || {});
    if (metaWrite(META_SLUG, metaVersion, { stats: stats, logros: logrosFromStats(stats) })) metaPending = false;
  } catch (e) {
  } finally {
    noteMetaWrite();
  }
}

function flushMeta() {
  try {
    if (!metaPending || metaIsDemo()) return;
    if (metaTimer !== null) {
      clearTimeout(metaTimer);
      metaTimer = null;
    }
    performMetaWrite();
  } catch (e) {}
}

function onVisibility() {
  try {
    const doc = globalThis.document;
    if (doc && doc.visibilityState === 'hidden') flushMeta();
  } catch (e) {}
}

function bindHide() {
  try {
    const w = globalThis.window;
    if (!w || typeof w.addEventListener !== 'function' || hideWindow === w) return;
    hideWindow = w;
    const fn = function () { flushMeta(); };
    w.addEventListener('pagehide', fn);
    w.addEventListener('beforeunload', fn);
    const doc = globalThis.document;
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  } catch (e) {}
}

function createMetaPump(version, readSave) {
  metaVersion = version;
  metaRead = readSave;
  bindHide();
  return function scheduleMeta() {
    try {
      if (metaIsDemo()) return;
      metaPending = true;
      if (metaTimer !== null) return;
      const wait = metaHasWritten ? Math.max(0, 1000 - (Date.now() - metaWroteAt)) : 0;
      metaTimer = setTimeout(performMetaWrite, wait);
    } catch (e) {}
  };
}

const progressApi = {
  META_SLUG: META_SLUG,
  SAVE_KEY: SAVE_KEY,
  STATS: STATS,
  ACHIEVEMENTS: ACHIEVEMENTS,
  deriveStats: deriveStats,
  logrosFromStats: logrosFromStats,
  backfillMeta: backfillMeta,
  createMetaPump: createMetaPump,
  flushMeta: flushMeta,
  resetMetaClock: resetMetaClock,
  recordRoute: recordRoute,
  normalizeProg: normalizeProg,
  countersFromMeta: countersFromMeta,
  countersFromStats: countersFromStats
};

if (typeof module === 'object' && module.exports) {
  module.exports = progressApi;
}
globalThis.STATS = STATS;
globalThis.ACHIEVEMENTS = ACHIEVEMENTS;
globalThis.deriveStats = deriveStats;
globalThis.logrosFromStats = logrosFromStats;
globalThis.backfillMeta = backfillMeta;
globalThis.createMetaPump = createMetaPump;
globalThis.flushMeta = flushMeta;
globalThis.resetMetaClock = resetMetaClock;
globalThis.recordRoute = recordRoute;
globalThis.normalizeProg = normalizeProg;
globalThis.countersFromMeta = countersFromMeta;
