'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { metaUpdate } = require('../meta.js');
const {
  ACHIEVEMENTS,
  deriveStats,
  backfillMeta,
  createMetaPump,
  recordRoute,
  mergeSave
} = require('../progress.js');

const KEY = 'meta.v1.sweep-route';
const SAVE = 'sweeproute_v1';

function memoryStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); }
  };
}

function rle(mask) {
  const out = [];
  let c = mask[0], n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === c && n < 65000) n++;
    else { out.push(n, c); c = mask[i]; n = 1; }
  }
  out.push(n, c);
  return out.join(',');
}

function paint(mask, gw, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) mask[y * gw + x] = 1;
  }
}

function oldSave() {
  const gw = 40, gh = 20;
  const mask = new Uint8Array(gw * gh);
  paint(mask, gw, 0, 0, 39, 9);
  paint(mask, gw, 0, 15, 9, 19);
  paint(mask, gw, 30, 18, 32, 18);
  return {
    gw: gw,
    gh: gh,
    mask: rle(mask),
    pxPerM: 80,
    calibrated: true,
    broom: 0.5,
    retStart: true,
    mode: 'visit',
    start: { x: 1, y: 1 },
    brush: '14',
    img: 'data:image/png;base64,AAAA',
    legacyFlag: 1
  };
}

let realDate;
let fixedNow;

function at(iso) {
  const fixed = new Date(iso);
  global.Date = class extends realDate {
    constructor(...args) {
      if (args.length === 0) super(fixed.getTime());
      else super(...args);
    }
    static now() { return fixed.getTime(); }
  };
  global.Date.UTC = realDate.UTC;
  global.Date.parse = realDate.parse;
}

beforeEach(() => {
  realDate = Date;
  fixedNow = '2026-10-23T18:00:00.000Z';
  at(fixedNow);
  global.localStorage = memoryStorage();
  delete global.window;
  delete global.location;
});

afterEach(() => {
  global.Date = realDate;
  delete global.localStorage;
  delete global.window;
  delete global.location;
});

test('old save without the meta key backfills one correct record', () => {
  const save = oldSave();
  const rawSave = JSON.stringify(save);
  localStorage.setItem(SAVE, rawSave);

  backfillMeta('1.6.0');

  assert.equal(localStorage.getItem(SAVE), rawSave);
  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'sweep-route');
  assert.equal(rec.version, '1.6.0');
  assert.equal(rec.updatedAt, fixedNow);
  assert.deepEqual(Object.keys(rec).sort(), ['hitos', 'logros', 'slug', 'stats', 'updatedAt', 'v', 'version']);
  assert.deepEqual(rec.stats, {
    painted_cells: 453,
    zones: 2,
    calibrated: 1,
    px_per_m: 80,
    broom_cm: 50,
    has_start: 1,
    return_to_start: 1,
    brush_px: 14,
    has_plan: 1,
    plans_loaded: 1,
    routes_total: 0,
    routes_cover: 0,
    routes_once: 0,
    routes_visit: 0,
    routes_return: 0,
    best_coverage: 0,
    longest_m: 0,
    grid_cells: 800,
    painted_m2: 35.83
  });
  assert.deepEqual(rec.logros, [
    'area_ready',
    'first_paint',
    'multi_zone',
    'plan_loaded',
    'scale_set',
    'start_set'
  ]);
  assert.deepEqual(Object.keys(rec.hitos), rec.logros);
  for (const id of rec.logros) assert.equal(rec.hitos[id], fixedNow);
  assert.equal(Object.keys(rec.stats).length <= 20, true);
  assert.equal(ACHIEVEMENTS.length >= 5 && ACHIEVEMENTS.length <= 12, true);
});

test('an existing meta record is not overwritten by backfill', () => {
  const prior = JSON.stringify({
    v: 1,
    slug: 'sweep-route',
    version: '1.0.0',
    updatedAt: '2020-01-01T00:00:00.000Z',
    stats: { routes_total: 3, best_coverage: 80 },
    logros: ['first_route'],
    hitos: { first_route: '2020-01-01T00:00:00.000Z' }
  });
  localStorage.setItem(KEY, prior);
  localStorage.setItem(SAVE, JSON.stringify(oldSave()));

  backfillMeta('1.6.0');

  assert.equal(localStorage.getItem(KEY), prior);
});

test('corrupt JSON does not crash', () => {
  localStorage.setItem(KEY, '{bad');
  localStorage.setItem(SAVE, JSON.stringify(oldSave()));
  assert.doesNotThrow(() => backfillMeta('1.6.0'));
  assert.equal(localStorage.getItem(KEY), '{bad');

  localStorage.removeItem(KEY);
  localStorage.setItem(SAVE, '{not-json');
  assert.doesNotThrow(() => backfillMeta('1.6.0'));
  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'sweep-route');
  assert.deepEqual(rec.logros, []);
  assert.deepEqual(rec.hitos, {});
  assert.equal(rec.stats.painted_cells, 0);
  assert.equal(rec.stats.calibrated, 0);
  assert.equal(localStorage.getItem(SAVE), '{not-json');

  localStorage.setItem(KEY, '{still-bad');
  assert.doesNotThrow(() => metaUpdate('sweep-route', '1.6.0', {
    stats: { routes_total: 1, longest_m: Infinity, label: 'nope' },
    logros: ['first_route']
  }));
  const fresh = JSON.parse(localStorage.getItem(KEY));
  assert.equal(fresh.stats.routes_total, 1);
  assert.equal(fresh.stats.longest_m, undefined);
  assert.equal(fresh.stats.label, undefined);
  assert.deepEqual(fresh.logros, ['first_route']);
});

test('metaUpdate keeps hitos, unions logros, and posts to the parent', () => {
  const messages = [];
  global.window = {
    parent: {
      postMessage(data, origin) { messages.push({ data: data, origin: origin }); }
    }
  };
  global.location = { origin: 'https://example.test' };

  metaUpdate('sweep-route', '1.6.0', {
    stats: { routes_total: 1, best_coverage: NaN },
    logros: ['first_route', 'first_route']
  });
  at('2026-10-24T12:00:00.000Z');
  const parent = global.window.parent;
  parent.postMessage = function () { throw new Error('blocked'); };
  assert.doesNotThrow(() => metaUpdate('sweep-route', '1.6.0', {
    stats: { routes_total: 2, best_coverage: 100 },
    logros: ['full_cover']
  }));

  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.deepEqual(rec.stats, { routes_total: 2, best_coverage: 100 });
  assert.deepEqual(rec.logros, ['first_route', 'full_cover']);
  assert.equal(rec.hitos.first_route, fixedNow);
  assert.equal(rec.hitos.full_cover, '2026-10-24T12:00:00.000Z');
  assert.equal(rec.updatedAt, '2026-10-24T12:00:00.000Z');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'https://example.test');
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, KEY);
  assert.equal(messages[0].data.data.logros[0], 'first_route');

  messages.length = 0;
  global.window = { parent: null };
  global.window.parent = global.window;
  metaUpdate('sweep-route', '1.6.0', { stats: { routes_total: 3 }, logros: [] });
  assert.equal(messages.length, 0);
});

test('progress updates are written at most once per second', (t) => {
  global.Date = realDate;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let reads = 0;
  const schedule = createMetaPump('1.6.0', () => {
    reads += 1;
    return { gw: 4, gh: 4, mask: '16,1', pxPerM: 60, broom: 0.35, brush: 14, prog: { routesTotal: reads } };
  });
  schedule();
  schedule();
  schedule();
  assert.equal(localStorage.getItem(KEY), null);
  t.mock.timers.tick(1);
  assert.equal(reads, 1);
  const first = localStorage.getItem(KEY);
  assert.ok(first);
  schedule();
  schedule();
  t.mock.timers.tick(999);
  assert.equal(localStorage.getItem(KEY), first);
  t.mock.timers.tick(1);
  assert.equal(reads, 2);
  assert.notEqual(localStorage.getItem(KEY), first);
  assert.equal(JSON.parse(localStorage.getItem(KEY)).stats.routes_total, 2);
});

test('route counters unlock later achievements and unknown save keys stay', () => {
  let prog = recordRoute(null, 'cover', true, 100, 12.3456);
  prog = recordRoute(prog, 'once', false, 40, 3);
  prog = recordRoute(prog, 'visit', false, 10, 55.2);
  for (let i = 0; i < 7; i++) prog = recordRoute(prog, 'cover', false, 90, 1);
  assert.equal(prog.routesTotal, 10);
  assert.equal(prog.routesCover, 8);
  assert.equal(prog.routesOnce, 1);
  assert.equal(prog.routesVisit, 1);
  assert.equal(prog.routesReturn, 1);
  assert.equal(prog.bestCoverage, 100);
  assert.equal(prog.longestM, 55.2);

  const save = mergeSave({ legacyFlag: 1, mask: 'old' }, {
    gw: 20, gh: 20, mask: '400,1', pxPerM: 60, calibrated: true,
    broom: 0.35, brush: 14, start: { x: 0, y: 0 }, prog: prog
  });
  assert.equal(save.legacyFlag, 1);
  assert.equal(save.mask, '400,1');
  const stats = deriveStats(save);
  const ids = ACHIEVEMENTS.filter(a => a.condition(stats)).map(a => a.id).sort();
  assert.deepEqual(ids, [
    'all_modes',
    'area_ready',
    'closed_loop',
    'first_paint',
    'first_route',
    'full_cover',
    'route_50m',
    'routes_10',
    'scale_set',
    'start_set'
  ]);
});
