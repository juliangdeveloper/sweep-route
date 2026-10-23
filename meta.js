'use strict';

// Project status, set by hand and bumped with the version. Never computed from play.
// fase 1-6: Idea, Definición, Diseño, Construcción, Validación, Lanzamiento y mantenimiento.
// fase_estado 0-4: pendiente, en curso, bloqueada, en revisión, completada.
var PROYECTO = {
  objetivo: 'Calcular sobre un plano pintado la ruta de barrido más corta que cubre toda el área, medida en metros reales.',
  fase: 6,
  fase_estado: 1,
  fases_completadas: 5
};

var proyectoSource = PROYECTO;

function proyectoInt(n, lo, hi) {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
}

// Clean copy of a proyecto block, or null when any field is missing or out of range.
function metaProyecto(p) {
  try {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var o = p.objetivo;
    if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
    if (!proyectoInt(p.fase, 1, 6) || !proyectoInt(p.fase_estado, 0, 4) || !proyectoInt(p.fases_completadas, 0, 6)) return null;
    return { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
  } catch (e) {
    return null;
  }
}

// Tests only: swap the block the writer uses (null restores PROYECTO).
function metaSetProyecto(p) {
  proyectoSource = p === null ? PROYECTO : p;
}

// Adds the current proyecto block to a record being written, when it is valid.
function withProyecto(record) {
  var p = metaProyecto(proyectoSource);
  if (p) record.proyecto = p;
  return record;
}

var declaredStats = [];

function metaDeclare(list) {
  try {
    var src = Array.isArray(list) ? list : [];
    var out = [];
    for (var i = 0; i < src.length && out.length < 20; i++) {
      var item = src[i];
      var key = typeof item === 'string' ? item : (item && item.key);
      if (typeof key !== 'string' || !key) continue;
      var seen = false;
      for (var j = 0; j < out.length; j++) if (out[j].key === key) seen = true;
      if (seen) continue;
      out.push({ key: key, monotonic: !!(item && typeof item === 'object' && item.monotonic) });
    }
    declaredStats = out;
  } catch (e) {}
}

function plainVersion(version) {
  var s = version == null ? '' : String(version).trim();
  if (s.charAt(0) === 'v' || s.charAt(0) === 'V') s = s.slice(1);
  return s;
}

function metaDemo() {
  try {
    var loc = globalThis.location;
    var search = loc && typeof loc.search === 'string' ? loc.search : '';
    if (!search) return false;
    var q = new URLSearchParams(search);
    var demo = q.get('demo');
    var preview = q.get('preview');
    return demo === '1' || demo === 'true' || preview === '1' || preview === 'true';
  } catch (e) {
    return false;
  }
}

function metaStore() {
  try {
    var store = globalThis.localStorage;
    if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') return store;
  } catch (e) {}
  return null;
}

function finiteMap(obj) {
  var out = {};
  if (!obj || typeof obj !== 'object') return out;
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) out[keys[i]] = v;
  }
  return out;
}

function recordValid(parsed, slug) {
  return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === 1 && parsed.slug === slug);
}

// Merge one snapshot into meta.v1.<slug>. Never throws. No write in demo/preview.
function metaUpdate(slug, version, patch) {
  try {
    if (metaDemo()) return null;
    var store = metaStore();
    if (!store) return null;
    var key = 'meta.v1.' + slug;
    var prev = {};
    try {
      var raw = store.getItem(key);
      if (raw != null) {
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (recordValid(parsed, slug)) prev = parsed;
        else {
          try { store.setItem(key + '.corrupt', raw); } catch (e) {}
        }
      }
    } catch (e) {
      prev = {};
    }

    var given = patch && typeof patch === 'object' ? patch : {};
    var incoming = finiteMap(given.stats);
    var previous = finiteMap(prev.stats);
    var stats = {};
    for (var i = 0; i < declaredStats.length; i++) {
      var spec = declaredStats[i];
      var hasNew = Object.prototype.hasOwnProperty.call(incoming, spec.key);
      var hasOld = Object.prototype.hasOwnProperty.call(previous, spec.key);
      if (hasNew) {
        stats[spec.key] = (spec.monotonic && hasOld) ? Math.max(previous[spec.key], incoming[spec.key]) : incoming[spec.key];
      } else if (hasOld) {
        stats[spec.key] = previous[spec.key];
      }
    }

    var ids = new Set();
    var prevLogros = Array.isArray(prev.logros) ? prev.logros : [];
    for (var a = 0; a < prevLogros.length; a++) {
      if (typeof prevLogros[a] === 'string' && prevLogros[a]) ids.add(prevLogros[a]);
    }
    var incomingLogros = Array.isArray(given.logros) ? given.logros : [];
    for (var b = 0; b < incomingLogros.length; b++) {
      if (typeof incomingLogros[b] === 'string' && incomingLogros[b]) ids.add(incomingLogros[b]);
    }

    var now = new Date().toISOString();
    var prevHitos = (prev.hitos && typeof prev.hitos === 'object') ? prev.hitos : {};
    var logros = Array.from(ids).sort();
    var hitos = {};
    for (var c = 0; c < logros.length; c++) {
      var id = logros[c];
      hitos[id] = (typeof prevHitos[id] === 'string' && prevHitos[id]) ? prevHitos[id] : now;
    }

    var record = {
      v: 1,
      slug: slug,
      version: plainVersion(version),
      updatedAt: now,
      stats: stats,
      logros: logros,
      hitos: hitos
    };
    withProyecto(record);
    store.setItem(key, JSON.stringify(record));

    try {
      var w = globalThis.window;
      if (w && w.parent && w.parent !== w) {
        w.parent.postMessage({ type: 'meta', key: key, data: record }, globalThis.location.origin);
      }
    } catch (e) {}
    return record;
  } catch (e) {
    return null;
  }
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    metaUpdate: metaUpdate,
    metaDeclare: metaDeclare,
    metaDemo: metaDemo,
    metaProyecto: metaProyecto,
    metaSetProyecto: metaSetProyecto,
    PROYECTO: PROYECTO
  };
}
globalThis.metaUpdate = metaUpdate;
globalThis.metaDeclare = metaDeclare;
globalThis.metaDemo = metaDemo;
