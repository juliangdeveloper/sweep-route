'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Meta = require('../meta.js');
const Progress = require('../progress.js');

function useStorage() {
  const data = {};
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
  return data;
}

test('los enums están congelados y PROYECTO usa sus valores', () => {
  for (const e of [Meta.FASE, Meta.ESTADO_FASE, Meta.TIPO_STAT, Progress.STATS]) assert.ok(Object.isFrozen(e));
  assert.deepEqual(Object.values(Meta.FASE), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Object.values(Meta.ESTADO_FASE), [0, 1, 2, 3, 4]);
  assert.equal(Meta.PROYECTO.fase, Meta.FASE.DESCARTADA);
  assert.equal(Meta.PROYECTO.fase_estado, Meta.ESTADO_FASE.COMPLETADA);
  assert.deepEqual(Meta.metaProyecto(Meta.PROYECTO), Object.assign({}, Meta.PROYECTO));
});

test('cada stat declara un tipo válido y una unidad, y la mezcla respeta su tipo', async () => {
  const STATS = Progress.STATS;
  const tipos = Object.values(Meta.TIPO_STAT);
  const keys = Object.keys(STATS);
  assert.ok(keys.length >= 1 && keys.length <= 20);
  for (const key of keys) {
    assert.ok(tipos.includes(STATS[key].tipo), key);
    assert.ok(typeof STATS[key].unidad === 'string' && STATS[key].unidad.length > 0, key);
  }
  const declared = Object.assign({}, STATS, { en_curso: { tipo: Meta.TIPO_STAT.VALOR_ACTUAL, unidad: 'prueba' } });
  const data = useStorage();
  const alto = {};
  const bajo = {};
  for (const key of Object.keys(declared)) { alto[key] = 10; bajo[key] = 3; }
  Meta.metaDeclare(declared);
  try {
    Meta.metaUpdate('sweep-route', '1', { stats: alto, logros: [] });
    Meta.metaUpdate('sweep-route', '1', { stats: bajo, logros: [] });
  } finally {
    Meta.metaDeclare(STATS);
  }
  const record = JSON.parse(data['meta.v1.sweep-route']);
  for (const key of Object.keys(declared)) {
    assert.equal(record.stats[key], declared[key].tipo === Meta.TIPO_STAT.VALOR_ACTUAL ? 3 : 10, key);
  }
});
