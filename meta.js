'use strict';

var FASE = Object.freeze({ IDEA: 1, DEFINICION: 2, DISENO: 3, CONSTRUCCION: 4, VALIDACION: 5, LANZAMIENTO_Y_MANTENIMIENTO: 6, DESCARTADA: 7 });
var ESTADO_FASE = Object.freeze({ PENDIENTE: 0, EN_CURSO: 1, BLOQUEADA: 2, EN_REVISION: 3, COMPLETADA: 4 });
var TIPO_STAT = Object.freeze({ TOTAL_ACUMULADO: 'total_acumulado', MEJOR_MARCA: 'mejor_marca', VALOR_ACTUAL: 'valor_actual' });
var TIPO_PROYECTO = Object.freeze({ PROYECTO: 'proyecto', AREA: 'area', RECURSO: 'recurso', ARCHIVO: 'archivo' });

var PROYECTO = {
  objetivo: 'En algún momento pensé que era una buena idea, pero tal vez te sirva de inspiración.',
  fase: FASE.DESCARTADA,
  fase_estado: ESTADO_FASE.COMPLETADA,
  fases_completadas: 2
};

var proyectoSource = PROYECTO;

function proyectoInt(n, lo, hi) {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
}

function enumValido(enumeracion, valor) {
  return Object.values(enumeracion).indexOf(valor) !== -1;
}

function statConservaMaximo(tipo) {
  return tipo === TIPO_STAT.TOTAL_ACUMULADO || tipo === TIPO_STAT.MEJOR_MARCA;
}

function statsDeclarados(stats) {
  if (Array.isArray(stats)) return stats;
  if (!stats || typeof stats !== 'object') return [];
  return Object.keys(stats).map(function (key) { return { key: key, tipo: stats[key] && stats[key].tipo }; });
}

function metaProyecto(p) {
  try {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var o = p.objetivo;
    if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
    if (!enumValido(FASE, p.fase) || !enumValido(ESTADO_FASE, p.fase_estado) || !proyectoInt(p.fases_completadas, 0, FASE.LANZAMIENTO_Y_MANTENIMIENTO)) return null;
    if (p.tipo !== undefined && !enumValido(TIPO_PROYECTO, p.tipo)) return null;
    var bloque = { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
    if (p.tipo !== undefined) bloque.tipo = p.tipo;
    return bloque;
  } catch (e) {
    return null;
  }
}

function metaSetProyecto(p) {
  proyectoSource = p === null ? PROYECTO : p;
}

function withProyecto(record) {
  var p = metaProyecto(proyectoSource);
  if (p) record.proyecto = p;
  return record;
}

var declaredStats = [];

function metaDeclare(list) {
  try {
    var src = statsDeclarados(list);
    var out = [];
    for (var i = 0; i < src.length && out.length < 20; i++) {
      var item = src[i];
      var key = typeof item === 'string' ? item : (item && item.key);
      if (typeof key !== 'string' || !key) continue;
      var seen = false;
      for (var j = 0; j < out.length; j++) if (out[j].key === key) seen = true;
      if (seen) continue;
      out.push({ key: key, tipo: item && typeof item === 'object' ? item.tipo : undefined });
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
        stats[spec.key] = (statConservaMaximo(spec.tipo) && hasOld) ? Math.max(previous[spec.key], incoming[spec.key]) : incoming[spec.key];
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
    PROYECTO: PROYECTO,
    FASE: FASE,
    ESTADO_FASE: ESTADO_FASE,
    TIPO_STAT: TIPO_STAT,
    TIPO_PROYECTO: TIPO_PROYECTO,
    enumValido: enumValido,
    statConservaMaximo: statConservaMaximo,
    statsDeclarados: statsDeclarados
  };
}
globalThis.metaUpdate = metaUpdate;
globalThis.metaDeclare = metaDeclare;
globalThis.metaDemo = metaDemo;
