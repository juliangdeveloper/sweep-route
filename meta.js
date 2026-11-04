'use strict';

var FASE = Object.freeze({ IDEA: 1, DEFINICION: 2, DISENO: 3, CONSTRUCCION: 4, VALIDACION: 5, LANZAMIENTO_Y_MANTENIMIENTO: 6, DESCARTADA: 7 });
var ESTADO_FASE = Object.freeze({ PENDIENTE: 0, EN_CURSO: 1, BLOQUEADA: 2, EN_REVISION: 3, COMPLETADA: 4 });
var TIPO_STAT = Object.freeze({ TOTAL_ACUMULADO: 'total_acumulado', MEJOR_MARCA: 'mejor_marca', VALOR_ACTUAL: 'valor_actual' });
var TIPO_PROYECTO = Object.freeze({ PROYECTO: 'proyecto', AREA: 'area', RECURSO: 'recurso', ARCHIVO: 'archivo' });

var PROYECTO = {
  objetivo: 'En algún momento pensé que era una buena idea, pero tal vez te sirva de inspiración.',
  fase: FASE.DESCARTADA,
  fase_estado: ESTADO_FASE.COMPLETADA,
  fases_completadas: 2,
  tipo: TIPO_PROYECTO.RECURSO,
  aportes: [
    { stat: 'Programación', exp: 6, fuente: 'creacion' },
    { stat: 'Diseño', exp: 7, fuente: 'creacion' },
    { stat: 'Planificación', exp: 10, fuente: 'uso' }
  ]
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

var APORTE_STAT_MAX = 32;
var APORTE_EXP_MAX = 99;

function aportesValidos(lista) {
  if (!Array.isArray(lista)) return null;
  var out = [];
  var seen = {};
  for (var i = 0; i < lista.length; i++) {
    var it = lista[i];
    if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
    var stat = it.stat;
    var exp = it.exp;
    var fuente = it.fuente;
    if (typeof stat !== 'string' || !stat.trim() || stat !== stat.trim() || Array.from(stat).length > APORTE_STAT_MAX) return null;
    if (fuente !== 'creacion' && fuente !== 'uso') return null;
    if (!(proyectoInt(exp, 1, APORTE_EXP_MAX))) return null;
    var key = stat + '\n' + fuente;
    if (seen[key]) return null;
    if (Object.keys(it).length !== 3) return null;
    seen[key] = true;
    out.push({ stat: stat, exp: exp, fuente: fuente });
  }
  return out;
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
    if (p.bloqueada === true) bloque.bloqueada = true;
    if (p.aportes !== undefined) {
      var aportes = aportesValidos(p.aportes);
      if (!aportes) return null;
      bloque.aportes = aportes;
    }
    return bloque;
  } catch (e) {
    return null;
  }
}

function metaSetProyecto(p) {
  proyectoSource = p === null ? PROYECTO : p;
}

function metaDeclararProyecto(slug, version) {
  try {
    var store = globalThis.localStorage;
    if (!store || !slug) return null;
    var clave = 'meta.v1.' + slug;
    var raw = store.getItem(clave);
    var base = null;
    if (raw != null && raw !== '') {
      try {
        var previo = JSON.parse(raw);
        if (previo && typeof previo === 'object' && !Array.isArray(previo) && previo.v === 1 && previo.slug === slug) base = previo;
      } catch (e) {
        base = null;
      }
      if (!base) store.setItem(clave + '.corrupt', String(raw));
    }
    if (!base) base = { v: 1, slug: slug, version: String(version == null ? '' : version).replace(/^[vV]/, ''), updatedAt: new Date().toISOString(), stats: {}, logros: [], hitos: {} };
    var p = metaProyecto(proyectoSource);
    if (p) base.proyecto = p;
    var texto = JSON.stringify(base);
    if (texto !== raw) {
      store.setItem(clave, texto);
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage({ type: 'meta', key: clave, data: base }, location.origin);
    }
    return base;
  } catch (e) {
    return null;
  }
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
    metaProyecto: metaProyecto,
    metaSetProyecto: metaSetProyecto,
    metaDeclararProyecto: metaDeclararProyecto,
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
globalThis.metaDeclararProyecto = metaDeclararProyecto;
