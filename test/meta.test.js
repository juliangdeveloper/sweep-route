'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { metaUpdate, metaDeclare } = require('../meta.js');
const {
  STATS,
  ACHIEVEMENTS,
  deriveStats,
  backfillMeta,
  createMetaPump,
  flushMeta,
  resetMetaClock,
  recordRoute,
  countersFromMeta
} = require('../progress.js');

const KEY = 'meta.v1.sweep-route';
const SAVE = 'sweeproute_v1';
const VERSION = '1.6.9';

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

function countWrites(keys) {
  const writes = [];
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { writes.push(k); orig(k, v); };
  return writes;
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
  resetMetaClock();
  metaDeclare(STATS);
});

afterEach(() => {
  global.Date = realDate;
  delete global.localStorage;
  delete global.window;
  delete global.location;
  resetMetaClock();
  metaDeclare(STATS);
});

test('old save without the meta key backfills one correct record', () => {
  const save = oldSave();
  const rawSave = JSON.stringify(save);
  localStorage.setItem(SAVE, rawSave);

  backfillMeta(VERSION);

  assert.equal(localStorage.getItem(SAVE), rawSave);
  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'sweep-route');
  assert.equal(rec.version, VERSION);
  assert.equal(rec.updatedAt, fixedNow);
  assert.deepEqual(Object.keys(rec).sort(), ['hitos', 'logros', 'proyecto', 'slug', 'stats', 'updatedAt', 'v', 'version']);
  assert.deepEqual(Object.keys(rec.stats), Object.keys(STATS));
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
  assert.equal(localStorage.getItem(KEY + '.corrupt'), null);
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

  backfillMeta(VERSION);

  assert.equal(localStorage.getItem(KEY), prior);
  assert.equal(localStorage.getItem(KEY + '.corrupt'), null);
});

test('corrupt JSON is copied aside and rebuilt without crashing', () => {
  const rawSave = JSON.stringify(oldSave());
  localStorage.setItem(SAVE, rawSave);
  localStorage.setItem(KEY, '{bad');
  assert.doesNotThrow(() => backfillMeta(VERSION));
  assert.equal(localStorage.getItem(KEY + '.corrupt'), '{bad');
  assert.equal(localStorage.getItem(SAVE), rawSave);
  let rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'sweep-route');
  assert.equal(rec.hitos.first_paint, fixedNow);
  assert.ok(rec.logros.includes('scale_set'));

  localStorage.setItem(KEY, JSON.stringify({ v: 2, slug: 'sweep-route' }));
  assert.doesNotThrow(() => backfillMeta(VERSION));
  assert.equal(JSON.parse(localStorage.getItem(KEY)).v, 1);
  assert.ok(localStorage.getItem(KEY + '.corrupt').includes('"v":2'));

  localStorage.setItem(KEY, JSON.stringify({ v: 1, slug: 'other-app' }));
  backfillMeta(VERSION);
  assert.equal(JSON.parse(localStorage.getItem(KEY)).slug, 'sweep-route');

  localStorage.setItem(KEY, '[]');
  backfillMeta(VERSION);
  assert.equal(localStorage.getItem(KEY + '.corrupt'), '[]');
  assert.equal(JSON.parse(localStorage.getItem(KEY)).v, 1);

  const prior = JSON.stringify({
    v: 1,
    slug: 'sweep-route',
    version: '1.0.0',
    updatedAt: '2020-01-01T00:00:00.000Z',
    stats: { routes_total: 3 },
    logros: ['first_route'],
    hitos: { first_route: '2020-01-01T00:00:00.000Z' }
  });
  localStorage.setItem(KEY, prior);
  const corruptBefore = localStorage.getItem(KEY + '.corrupt');
  backfillMeta(VERSION);
  assert.equal(localStorage.getItem(KEY), prior);
  assert.equal(localStorage.getItem(KEY + '.corrupt'), corruptBefore);

  localStorage.removeItem(KEY);
  localStorage.setItem(SAVE, '{not-json');
  assert.doesNotThrow(() => backfillMeta(VERSION));
  rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.v, 1);
  assert.deepEqual(rec.logros, []);
  assert.equal(rec.stats.painted_cells, 0);
  assert.equal(localStorage.getItem(SAVE), '{not-json');
});

test('declared stats are capped, ordered, and monotonic', () => {
  metaUpdate('sweep-route', 'v' + VERSION, {
    stats: {
      routes_total: 4,
      best_coverage: 90,
      brush_px: 20,
      longest_m: 10,
      painted_cells: 50,
      nope: 7,
      label: 'x'
    },
    logros: ['first_route']
  });
  metaUpdate('sweep-route', VERSION, {
    stats: { routes_total: 2, best_coverage: NaN, brush_px: 8, longest_m: Infinity },
    logros: []
  });
  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.version, VERSION);
  assert.equal(rec.stats.routes_total, 4);
  assert.equal(rec.stats.best_coverage, 90);
  assert.equal(rec.stats.longest_m, 10);
  assert.equal(rec.stats.brush_px, 8);
  assert.equal(rec.stats.painted_cells, 50);
  assert.equal(rec.stats.nope, undefined);
  assert.deepEqual(Object.keys(rec.stats), ['painted_cells', 'brush_px', 'routes_total', 'best_coverage', 'longest_m']);

  const many = [];
  const stats = {};
  for (let i = 0; i < 25; i++) {
    many.push({ key: 'k' + i, tipo: i % 2 === 0 ? 'total_acumulado' : 'valor_actual' });
    stats['k' + i] = i + 1;
  }
  stats.extra = 1;
  try {
    metaDeclare(many);
    localStorage.removeItem(KEY);
    metaUpdate('sweep-route', VERSION, { stats: stats, logros: [] });
    const got = Object.keys(JSON.parse(localStorage.getItem(KEY)).stats);
    assert.equal(got.length, 20);
    assert.deepEqual(got, many.slice(0, 20).map(s => s.key));
  } finally {
    metaDeclare(STATS);
  }
});

test('metaUpdate keeps hitos, unions logros, and posts to the parent', () => {
  const messages = [];
  global.window = {
    parent: {
      postMessage(data, origin) { messages.push({ data: data, origin: origin }); }
    }
  };
  global.location = { origin: 'https://example.test', search: '' };

  metaUpdate('sweep-route', 'v' + VERSION, {
    stats: { routes_total: 1, best_coverage: NaN },
    logros: ['first_route', 'first_route']
  });
  at('2026-10-24T12:00:00.000Z');
  const parent = global.window.parent;
  parent.postMessage = function () { throw new Error('blocked'); };
  assert.doesNotThrow(() => metaUpdate('sweep-route', VERSION, {
    stats: { routes_total: 2, best_coverage: 100 },
    logros: ['full_cover']
  }));

  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.version, VERSION);
  assert.equal(rec.stats.routes_total, 2);
  assert.equal(rec.stats.best_coverage, 100);
  assert.deepEqual(rec.logros, ['first_route', 'full_cover']);
  assert.equal(rec.hitos.first_route, fixedNow);
  assert.equal(rec.hitos.full_cover, '2026-10-24T12:00:00.000Z');
  assert.equal(rec.updatedAt, '2026-10-24T12:00:00.000Z');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'https://example.test');
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, KEY);
  assert.equal(messages[0].data.data.version, VERSION);

  messages.length = 0;
  global.window = { parent: null };
  global.window.parent = global.window;
  metaUpdate('sweep-route', VERSION, { stats: { routes_total: 1 }, logros: [] });
  assert.equal(messages.length, 0);
  assert.equal(JSON.parse(localStorage.getItem(KEY)).stats.routes_total, 2);
});

test('demo and preview modes do not write or postMessage', () => {
  const messages = [];
  global.window = {
    parent: { postMessage() { messages.push(1); } }
  };
  global.location = { search: '?demo=1', origin: 'https://example.test' };
  const raw = JSON.stringify(oldSave());
  localStorage.setItem(SAVE, raw);
  backfillMeta(VERSION);
  metaUpdate('sweep-route', VERSION, { stats: { routes_total: 9 }, logros: ['first_route'] });
  const schedule = createMetaPump(VERSION, () => ({ gw: 4, gh: 4, mask: '16,1', counters: { routesTotal: 3 } }));
  schedule();
  flushMeta();
  assert.equal(localStorage.getItem(KEY), null);
  assert.equal(localStorage.getItem(KEY + '.corrupt'), null);
  assert.equal(messages.length, 0);
  assert.equal(localStorage.getItem(SAVE), raw);

  global.location = { search: '?preview=1', origin: 'https://example.test' };
  backfillMeta(VERSION);
  assert.equal(localStorage.getItem(KEY), null);
});

test('old save is unchanged after load and routes, with at most one meta write per second', (t) => {
  global.Date = realDate;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const raw = JSON.stringify(oldSave());
  localStorage.setItem(SAVE, raw);
  const writes = countWrites();
  backfillMeta(VERSION);
  assert.deepEqual(writes, [KEY]);
  assert.equal(localStorage.getItem(SAVE), raw);

  let counters = countersFromMeta();
  counters = recordRoute(counters, 'cover', true, 100, 60);
  counters = recordRoute(counters, 'visit', false, 20, 12);
  const schedule = createMetaPump(VERSION, () => ({
    gw: 40,
    gh: 20,
    mask: JSON.parse(raw).mask,
    pxPerM: 80,
    calibrated: true,
    broom: 0.5,
    retStart: true,
    brush: '14',
    start: { x: 1, y: 1 },
    hasPlan: 1,
    counters: counters
  }));
  schedule();
  schedule();
  t.mock.timers.tick(400);
  assert.deepEqual(writes, [KEY]);
  assert.equal(localStorage.getItem(SAVE), raw);
  t.mock.timers.tick(600);
  assert.equal(writes.filter(k => k === KEY).length, 2);
  assert.equal(writes.includes(SAVE), false);
  const rec = JSON.parse(localStorage.getItem(KEY));
  assert.equal(rec.stats.routes_total, 2);
  assert.equal(rec.stats.routes_cover, 1);
  assert.equal(rec.stats.routes_visit, 1);
  assert.equal(rec.stats.routes_return, 1);
  assert.equal(rec.stats.best_coverage, 100);
  assert.equal(rec.stats.longest_m, 60);
  assert.equal(JSON.stringify(rec).includes('base64'), false);
  assert.equal(localStorage.getItem(SAVE), raw);
});

test('the one-second window starts after a slow save read, not before it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = countWrites();
  const start = new realDate(fixedNow).getTime();
  const schedule = createMetaPump(VERSION, () => {
    at(new realDate(start + 973).toISOString());
    return { gw: 4, gh: 4, mask: '16,1', counters: { routesTotal: 1 } };
  });
  schedule();
  flushMeta();
  assert.equal(writes.filter(k => k === KEY).length, 1);

  at(new realDate(start + 973 + 500).toISOString());
  schedule();
  t.mock.timers.tick(499);
  assert.equal(writes.filter(k => k === KEY).length, 1);
  t.mock.timers.tick(1);
  assert.equal(writes.filter(k => k === KEY).length, 2);
});

test('a failed meta write stays pending and is retried on the next attempt', (t) => {
  global.Date = realDate;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let failNext = true;
  const writes = [];
  const set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => {
    if (k === KEY && failNext) {
      failNext = false;
      throw new Error('QuotaExceededError');
    }
    writes.push(k);
    set(k, v);
  };
  const schedule = createMetaPump(VERSION, () => ({ gw: 4, gh: 4, mask: '16,1', counters: { routesTotal: 2 } }));
  schedule();
  t.mock.timers.tick(0);
  assert.equal(localStorage.getItem(KEY), null);

  flushMeta();
  assert.deepEqual(writes, [KEY]);
  assert.equal(JSON.parse(localStorage.getItem(KEY)).stats.routes_total, 2);

  flushMeta();
  t.mock.timers.tick(2000);
  assert.deepEqual(writes, [KEY]);
});

test('pagehide and hidden visibility flush a pending change immediately', (t) => {
  global.Date = realDate;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const writes = countWrites();
  const messages = [];
  const listeners = { window: {}, document: {} };
  function listen(bag, type, fn) { (bag[type] || (bag[type] = [])).push(fn); }
  global.window = {
    addEventListener(type, fn) { listen(listeners.window, type, fn); },
    parent: { postMessage(data, origin) { messages.push({ data: data, origin: origin }); } }
  };
  global.document = {
    visibilityState: 'visible',
    addEventListener(type, fn) { listen(listeners.document, type, fn); }
  };
  global.location = { origin: 'https://example.test', search: '' };
  localStorage.setItem(SAVE, JSON.stringify({ gw: 4, gh: 4, mask: '16,1', pxPerM: 60, broom: 0.35, brush: 14 }));
  writes.length = 0;
  backfillMeta(VERSION);
  assert.equal(writes.filter(k => k === KEY).length, 1);
  messages.length = 0;
  const schedule = createMetaPump(VERSION, () => ({
    gw: 4, gh: 4, mask: '16,1', counters: { routesTotal: 1, routesCover: 1 }
  }));
  listeners.window.pagehide[0]();
  global.document.visibilityState = 'hidden';
  listeners.document.visibilitychange[0]();
  assert.equal(writes.filter(k => k === KEY).length, 1);
  assert.equal(messages.length, 0);

  schedule();
  listeners.window.pagehide[0]();
  assert.equal(writes.filter(k => k === KEY).length, 2);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, KEY);
  assert.equal(messages[0].origin, 'https://example.test');
  listeners.document.visibilitychange[0]();
  assert.equal(writes.filter(k => k === KEY).length, 2);

  schedule();
  global.document.visibilityState = 'visible';
  listeners.document.visibilitychange[0]();
  assert.equal(writes.filter(k => k === KEY).length, 2);
  global.document.visibilityState = 'hidden';
  listeners.document.visibilitychange[0]();
  assert.equal(writes.filter(k => k === KEY).length, 3);
  assert.equal(messages.length, 2);
  t.mock.timers.tick(1000);
  assert.equal(writes.filter(k => k === KEY).length, 3);
});

test('compute does not rewrite the project save', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const compute = html.slice(html.indexOf('function compute()'), html.indexOf('function render()'));
  assert.equal(compute.includes('saveState'), false);
  const saveBody = html.slice(html.indexOf('function saveState()'), html.indexOf('function loadState()'));
  assert.equal(saveBody.includes('prog'), false);
  assert.equal(saveBody.includes('mergeSave'), false);
  assert.match(html, /const APP_VERSION = '1\.6\.9'/);
  assert.match(html, /id="verBadge">v1\.6\.9/);
});

test('route counters unlock later achievements', () => {
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

  const stats = deriveStats({
    gw: 20, gh: 20, mask: '400,1', pxPerM: 60, calibrated: true,
    broom: 0.35, brush: 14, start: { x: 0, y: 0 }, counters: prog
  });
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
