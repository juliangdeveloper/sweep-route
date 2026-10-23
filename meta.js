'use strict';

function metaStore() {
  try {
    const store = globalThis.localStorage;
    if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') return store;
  } catch (e) {}
  return null;
}

function finiteStats(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) out[keys[i]] = v;
  }
  return out;
}

// Read the slug record, merge this snapshot, and notify a parent frame.
// Never throws.
function metaUpdate(slug, version, patch) {
  try {
    const store = metaStore();
    if (!store) return null;
    const key = 'meta.v1.' + slug;
    let prev = {};
    try {
      const raw = store.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prev = parsed;
      }
    } catch (e) {
      prev = {};
    }

    const given = patch && typeof patch === 'object' ? patch : {};
    const stats = (given.stats && typeof given.stats === 'object')
      ? finiteStats(given.stats)
      : finiteStats(prev.stats);

    const ids = new Set();
    const prevLogros = Array.isArray(prev.logros) ? prev.logros : [];
    for (let i = 0; i < prevLogros.length; i++) {
      if (typeof prevLogros[i] === 'string' && prevLogros[i]) ids.add(prevLogros[i]);
    }
    const incoming = Array.isArray(given.logros) ? given.logros : [];
    for (let i = 0; i < incoming.length; i++) {
      if (typeof incoming[i] === 'string' && incoming[i]) ids.add(incoming[i]);
    }

    const now = new Date().toISOString();
    const prevHitos = (prev.hitos && typeof prev.hitos === 'object') ? prev.hitos : {};
    const logros = Array.from(ids).sort();
    const hitos = {};
    for (let i = 0; i < logros.length; i++) {
      const id = logros[i];
      hitos[id] = (typeof prevHitos[id] === 'string' && prevHitos[id]) ? prevHitos[id] : now;
    }

    const record = {
      v: 1,
      slug: slug,
      version: version == null ? '' : String(version),
      updatedAt: now,
      stats: stats,
      logros: logros,
      hitos: hitos
    };
    store.setItem(key, JSON.stringify(record));

    try {
      const w = globalThis.window;
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
  module.exports = { metaUpdate: metaUpdate };
}
globalThis.metaUpdate = metaUpdate;
