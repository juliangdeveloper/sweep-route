'use strict';

const META_SLUG = 'sweep-route';
const SAVE_KEY = 'sweeproute_v1';
const LOGIC_W = 900;
const MAX_CELLS = 62000;

const metaApi = (typeof module === 'object' && module.exports) ? require('./meta.js') : null;

function metaWrite(slug, version, patch) {
  try {
    const fn = (metaApi && metaApi.metaUpdate) || globalThis.metaUpdate;
    if (typeof fn === 'function') fn(slug, version, patch);
  } catch (e) {}
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

// Connected walkable regions of at least 4 cells, same rule as the planner.
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

// Copy of the previous save plus these fields. Extra keys stay.
function mergeSave(prev, next) {
  const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {};
  const add = (next && typeof next === 'object' && !Array.isArray(next)) ? next : {};
  return Object.assign({}, base, add);
}

function paintedM2(painted, gw, pxPerM) {
  if (!painted || !gw || !pxPerM) return 0;
  const cellM = (LOGIC_W / gw) / pxPerM;
  const area = painted * cellM * cellM;
  if (!Number.isFinite(area) || area < 0) return 0;
  return Math.round(area * 100) / 100;
}

// Flat numeric stats for meta.v1.sweep-route. At most 20 keys.
function deriveStats(save) {
  const src = (save && typeof save === 'object') ? save : {};
  let gw = posInt(src.gw);
  let gh = posInt(src.gh);
  if (!gw || !gh || gw * gh > MAX_CELLS) { gw = 0; gh = 0; }
  const mask = decodeMask(src.mask, gw * gh);
  let painted = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) painted++;
  const prog = normalizeProg(src.prog);
  const pxPerM = num(src.pxPerM, 60);
  const broom = num(src.broom, 0.35);
  const brush = num(src.brush, 14);
  const hasPlan = src.img ? 1 : 0;
  return {
    painted_cells: painted,                         // walkable cells in the saved mask
    zones: countZones(mask, gw, gh),                // regions of 4 or more cells
    calibrated: src.calibrated ? 1 : 0,             // 1 once a real distance was entered
    px_per_m: pxPerM,                               // scale; 60 when the save has none
    broom_cm: Math.round(broom * 100),              // sweeper width in centimeters
    has_start: (src.start && typeof src.start === 'object') ? 1 : 0,
    return_to_start: src.retStart ? 1 : 0,          // "regresar al inicio" is on
    brush_px: brush,                                // brush diameter in canvas pixels
    has_plan: hasPlan,                              // a floor-plan image is stored
    plans_loaded: Math.max(prog.plansLoaded, hasPlan),
    routes_total: prog.routesTotal,                 // routes computed
    routes_cover: prog.routesCover,                 // Cubrir todo
    routes_once: prog.routesOnce,                   // Sin repetir
    routes_visit: prog.routesVisit,                 // Visitar zonas
    routes_return: prog.routesReturn,               // routes that return to the start
    best_coverage: prog.bestCoverage,               // best percent of the mask the route covered
    longest_m: prog.longestM,                       // longest computed route, meters
    grid_cells: gw * gh,
    painted_m2: paintedM2(painted, gw, pxPerM)      // painted area at the saved scale
  };
}

// Stable achievement ids. Never rename or reuse an id.
const ACHIEVEMENTS = [
  // At least one walkable cell is painted.
  { id: 'first_paint', condition: function (s) { return s.painted_cells >= 1; } },
  // A real area, not a single brush dab (400 cells or more).
  { id: 'area_ready', condition: function (s) { return s.painted_cells >= 400; } },
  // A start flag is stored.
  { id: 'start_set', condition: function (s) { return s.has_start === 1; } },
  // Scale was calibrated from a known distance.
  { id: 'scale_set', condition: function (s) { return s.calibrated === 1; } },
  // A floor plan was loaded (image present, or a later load was counted).
  { id: 'plan_loaded', condition: function (s) { return s.has_plan === 1 || s.plans_loaded >= 1; } },
  // At least one route was computed.
  { id: 'first_route', condition: function (s) { return s.routes_total >= 1; } },
  // A route covered 100% of the painted area.
  { id: 'full_cover', condition: function (s) { return s.best_coverage >= 100; } },
  // A computed route returned to the start.
  { id: 'closed_loop', condition: function (s) { return s.routes_return >= 1; } },
  // Cubrir todo, Sin repetir, and Visitar zonas have each been used.
  { id: 'all_modes', condition: function (s) { return s.routes_cover >= 1 && s.routes_once >= 1 && s.routes_visit >= 1; } },
  // Two or more separate walkable zones.
  { id: 'multi_zone', condition: function (s) { return s.zones >= 2; } },
  // Ten routes computed.
  { id: 'routes_10', condition: function (s) { return s.routes_total >= 10; } },
  // A computed route is at least 50 meters.
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

// If meta.v1.sweep-route is absent, write it once from the current save.
// An existing value, including corrupt JSON, is left untouched.
function backfillMeta(version, fallbackSave) {
  try {
    const store = projectStore();
    if (!store) return;
    const key = 'meta.v1.' + META_SLUG;
    const existing = store.getItem(key);
    if (existing != null) {
      try { JSON.parse(existing); } catch (e) {}
      return;
    }
    let save = null;
    try {
      const raw = store.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') save = parsed;
      }
    } catch (e) {
      save = {};
    }
    if (save == null) save = (fallbackSave && typeof fallbackSave === 'object') ? fallbackSave : {};
    const stats = deriveStats(save);
    metaWrite(META_SLUG, version, { stats: stats, logros: logrosFromStats(stats) });
  } catch (e) {}
}

// Trailing throttle: at most one metaUpdate per second, using the latest save.
function createMetaPump(version, readSave) {
  let timer = null;
  let wroteAt = 0;
  let started = false;
  function flush() {
    timer = null;
    started = true;
    wroteAt = Date.now();
    try {
      const save = typeof readSave === 'function' ? readSave() : {};
      const stats = deriveStats(save || {});
      metaWrite(META_SLUG, version, { stats: stats, logros: logrosFromStats(stats) });
    } catch (e) {}
  }
  return function scheduleMeta() {
    try {
      if (timer !== null) return;
      const wait = started ? Math.max(0, 1000 - (Date.now() - wroteAt)) : 0;
      timer = setTimeout(flush, wait);
    } catch (e) {}
  };
}

const progressApi = {
  META_SLUG: META_SLUG,
  SAVE_KEY: SAVE_KEY,
  ACHIEVEMENTS: ACHIEVEMENTS,
  deriveStats: deriveStats,
  logrosFromStats: logrosFromStats,
  backfillMeta: backfillMeta,
  createMetaPump: createMetaPump,
  recordRoute: recordRoute,
  normalizeProg: normalizeProg,
  mergeSave: mergeSave
};

if (typeof module === 'object' && module.exports) {
  module.exports = progressApi;
}
globalThis.ACHIEVEMENTS = ACHIEVEMENTS;
globalThis.deriveStats = deriveStats;
globalThis.logrosFromStats = logrosFromStats;
globalThis.backfillMeta = backfillMeta;
globalThis.createMetaPump = createMetaPump;
globalThis.recordRoute = recordRoute;
globalThis.normalizeProg = normalizeProg;
globalThis.mergeSave = mergeSave;
