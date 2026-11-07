// Regression tests for src/settings.js: defaults, validation, recovery from
// bad stored data, storage exceptions and a save→load round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, DEFAULT_SETTINGS, QUALITY_LEVELS,
  normalizeSettings, parseSettings, serializeSettings,
  getBrowserStorage, loadSettings, saveSettings,
} from '../src/settings.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

const DEFAULTS = { quality: 'high', volume: 1, sensitivity: 1 };

test('defaults are high / 1 / 1 and quality levels are low|medium|high', () => {
  assert.deepEqual({ ...DEFAULT_SETTINGS }, DEFAULTS);
  assert.deepEqual([...QUALITY_LEVELS], ['low', 'medium', 'high']);
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
});

test('nothing stored → defaults', () => {
  assert.deepEqual(parseSettings(null), DEFAULTS);
  assert.deepEqual(parseSettings(undefined), DEFAULTS);
  const r = loadSettings(memoryStorage());
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings, DEFAULTS);
});

test('broken JSON → defaults', () => {
  for (const text of ['{', 'not json', '', '{"quality":"low",']) {
    assert.deepEqual(parseSettings(text), DEFAULTS, text);
  }
  const r = loadSettings(memoryStorage({ [STORAGE_KEY]: '{oops' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings, DEFAULTS);
});

test('wrong structure → defaults', () => {
  for (const text of ['null', '42', '"high"', '[1,2,3]', 'true']) {
    assert.deepEqual(parseSettings(text), DEFAULTS, text);
  }
});

test('wrong types and unsupported values fall back per field', () => {
  assert.deepEqual(
    normalizeSettings({ quality: 'ultra', volume: '0.5', sensitivity: null }),
    DEFAULTS,
  );
  assert.deepEqual(normalizeSettings({ quality: 'HIGH', volume: NaN, sensitivity: Infinity }), DEFAULTS);
  assert.deepEqual(normalizeSettings({ quality: 2, volume: -Infinity, sensitivity: true }), DEFAULTS);
  // a valid field is kept even when its neighbours are invalid
  assert.deepEqual(
    normalizeSettings({ quality: 'low', volume: 'loud', sensitivity: 2 }),
    { quality: 'low', volume: 1, sensitivity: 2 },
  );
});

test('missing fields use their defaults', () => {
  assert.deepEqual(parseSettings('{}'), DEFAULTS);
  assert.deepEqual(parseSettings('{"quality":"medium"}'), { quality: 'medium', volume: 1, sensitivity: 1 });
  assert.deepEqual(parseSettings('{"volume":0.3}'), { quality: 'high', volume: 0.3, sensitivity: 1 });
});

test('finite out-of-range numbers are clamped to the bounds', () => {
  assert.deepEqual(
    normalizeSettings({ quality: 'low', volume: 5, sensitivity: 10 }),
    { quality: 'low', volume: 1, sensitivity: 3 },
  );
  assert.deepEqual(
    normalizeSettings({ quality: 'low', volume: -1, sensitivity: 0 }),
    { quality: 'low', volume: 0, sensitivity: 0.25 },
  );
  // bounds themselves are valid
  assert.deepEqual(
    normalizeSettings({ quality: 'medium', volume: 0, sensitivity: 0.25 }),
    { quality: 'medium', volume: 0, sensitivity: 0.25 },
  );
});

test('save → load round trip keeps the values and other keys', () => {
  const storage = memoryStorage({ other: 'keep me' });
  const saved = saveSettings(storage, { quality: 'medium', volume: 0.35, sensitivity: 1.75 });
  assert.equal(saved.ok, true);
  assert.deepEqual(JSON.parse(storage.data.get(STORAGE_KEY)), { quality: 'medium', volume: 0.35, sensitivity: 1.75 });
  assert.equal(storage.data.get('other'), 'keep me');
  assert.deepEqual([...storage.data.keys()].sort(), ['other', STORAGE_KEY].sort());
  const loaded = loadSettings(storage);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.settings, { quality: 'medium', volume: 0.35, sensitivity: 1.75 });
});

test('save normalizes before writing', () => {
  const storage = memoryStorage();
  const r = saveSettings(storage, { quality: 'ultra', volume: 9, sensitivity: 'x' });
  assert.deepEqual(r.settings, { quality: 'high', volume: 1, sensitivity: 1 });
  assert.equal(storage.data.get(STORAGE_KEY), serializeSettings(r.settings));
});

test('storage exceptions are reported, not thrown', () => {
  const broken = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const loaded = loadSettings(broken);
  assert.equal(loaded.ok, false);
  assert.match(loaded.error.message, /SecurityError/);
  assert.deepEqual(loaded.settings, DEFAULTS);

  const saved = saveSettings(broken, { quality: 'low', volume: 0.5, sensitivity: 2 });
  assert.equal(saved.ok, false);
  assert.match(saved.error.message, /QuotaExceededError/);
  // the caller still gets the normalized value to apply for this session
  assert.deepEqual(saved.settings, { quality: 'low', volume: 0.5, sensitivity: 2 });

  // no storage at all
  assert.equal(loadSettings(null).ok, false);
  assert.equal(saveSettings(null, DEFAULTS).ok, false);
});

test('getBrowserStorage reports a throwing localStorage getter', () => {
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('denied'); } });
  const r = getBrowserStorage(win);
  assert.equal(r.storage, null);
  assert.match(r.error.message, /denied/);

  const storage = memoryStorage();
  assert.equal(getBrowserStorage({ localStorage: storage }).storage, storage);
  assert.equal(getBrowserStorage(undefined).storage, null);
});
