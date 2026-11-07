// User settings: graphics quality, master volume and mouse sensitivity.
// Pure normalize/parse/serialize functions plus small storage read/write
// helpers that take the storage object as an argument. Nothing here touches
// `window` or `localStorage` at import time, so Node tests can load it.

export const STORAGE_KEY = 'spaceship.settings.v1';
export const QUALITY_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const VOLUME_RANGE = Object.freeze({ min: 0, max: 1 });
export const SENSITIVITY_RANGE = Object.freeze({ min: 0.25, max: 3 });
export const DEFAULT_SETTINGS = Object.freeze({ quality: 'high', volume: 1, sensitivity: 1 });

function clampNumber(v, range, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(range.min, Math.min(range.max, v));
}

// Returns a complete, valid settings object. Unsupported quality values,
// non-numbers, NaN/Infinity, missing fields and non-object input fall back to
// the field default; finite numbers outside the range are clamped.
export function normalizeSettings(raw) {
  const src = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    quality: QUALITY_LEVELS.includes(src.quality) ? src.quality : DEFAULT_SETTINGS.quality,
    volume: clampNumber(src.volume, VOLUME_RANGE, DEFAULT_SETTINGS.volume),
    sensitivity: clampNumber(src.sensitivity, SENSITIVITY_RANGE, DEFAULT_SETTINGS.sensitivity),
  };
}

// Stored text → settings. `null`/`undefined` (nothing stored) and broken JSON
// give the defaults.
export function parseSettings(text) {
  if (typeof text !== 'string') return normalizeSettings(null);
  try {
    return normalizeSettings(JSON.parse(text));
  } catch {
    return normalizeSettings(null);
  }
}

export function serializeSettings(settings) {
  return JSON.stringify(normalizeSettings(settings));
}

// Browser storage lookup. Reading `window.localStorage` itself can throw
// (blocked cookies, sandboxed iframe), so the error is returned, not thrown.
export function getBrowserStorage(win = globalThis.window) {
  try {
    const storage = win?.localStorage;
    if (!storage) return { storage: null, error: new Error('localStorage is not available') };
    return { storage, error: null };
  } catch (error) {
    return { storage: null, error };
  }
}

// Reads only STORAGE_KEY. `ok: false` means the storage could not be read;
// the defaults are returned so the game still starts.
export function loadSettings(storage) {
  if (!storage) {
    return { settings: normalizeSettings(null), ok: false, error: new Error('no storage') };
  }
  try {
    return { settings: parseSettings(storage.getItem(STORAGE_KEY)), ok: true, error: null };
  } catch (error) {
    return { settings: normalizeSettings(null), ok: false, error };
  }
}

// Writes only STORAGE_KEY; other keys are never touched. `ok: false` means the
// value was not stored (quota, blocked storage, no storage).
export function saveSettings(storage, settings) {
  const value = normalizeSettings(settings);
  if (!storage) return { settings: value, ok: false, error: new Error('no storage') };
  try {
    storage.setItem(STORAGE_KEY, serializeSettings(value));
    return { settings: value, ok: true, error: null };
  } catch (error) {
    return { settings: value, ok: false, error };
  }
}
