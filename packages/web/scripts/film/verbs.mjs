// The beat verbs of the film runner and the static config check (no browser): used by `capture.mjs --dry` and `draft.mjs --dry`.
// A beat is { "do": "<verb>", ...fields }. A locator is a css string, "@name" (a named locator of film.config.json "locators"), or an object { css | role+name | text, within, hasText, hasExactText, nth, first }.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// verb -> required fields
export const VERBS = {
  goto: ['url'], 'wait-for': ['on'], blur: [], start: [], end: [], hold: ['ms'], shot: ['name'], click: ['on'], hover: ['on'], type: ['text'], press: [], 'mouse-press': [],
  camera: [], 'scroll-into-view': ['on'], 'scroll-heading': ['text'], 'slash-command': ['field', 'option', 'pill'], 'choose-depth': ['scope', 'level'], skeleton: [], 'wait-card': [], 'set-files': ['on', 'name', 'file'],
  'toggle-layout': ['card'], 'select-text': ['container', 'text', 'toolbar'], 'drag-to-free-spot': ['card'], caption: ['text', 'ms'], sticker: [], stamp: ['name'], mark: ['kind'],
  'click-empty': ['x', 'y'], fit: [], expect: ['on', 'as'], 'dump-layout': [], poster: [],
};
export const MARK_KINDS = ['typing', 'reveal', 'depth', 'hold', 'dead', 'cut', 'upload', 'camera', 'hover', 'act'];

export function resolveData(cfg, file, dataDir) { return isAbsolute(file) ? file : join(dataDir, file); }

// Returns { errors: [...], warnings: [...] }. dataDir = where the per-video data (bank, markdown) lives (env FILM_DATA or the config's folder).
export function checkConfig(cfg, dataDir) {
  const errors = [], warnings = [];
  const need = (cond, text) => { if (!cond) errors.push(text); };
  need(cfg && typeof cfg === 'object', 'config is not an object');
  if (errors.length) return { errors, warnings };
  for (const key of ['name', 'app', 'viewport', 'beats']) need(cfg[key] !== undefined, `missing "${key}"`);
  need(/^canvas-[0-9a-f]{8}$/.test(cfg.app?.id || ''), 'app.id must be canvas-<8 hex> (LearnPage treats only that as a canvas)');
  need(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(JSON.stringify(cfg)), 'the config must not contain an email address (the profile email is built from app.emailLocal + app.emailDomain at run time)');
  const named = new Set(Object.keys(cfg.locators || {})), texts = new Set(Object.keys(cfg.texts || {}));
  const ref = (value, where) => {
    if (typeof value !== 'string' || !value.startsWith('@')) return;
    const name = value.slice(1);
    if (!named.has(name) && !texts.has(name)) errors.push(`${where}: unknown reference ${value}`);
  };
  const walk = (value, where) => {
    if (typeof value === 'string') return ref(value, where);
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${where}[${i}]`));
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
  };
  const stamps = new Set();
  (cfg.beats || []).forEach((beat, i) => {
    const where = `beats[${i}] (${beat?.do})`;
    if (!beat || !VERBS[beat.do]) { errors.push(`${where}: unknown verb`); return; }
    for (const field of VERBS[beat.do]) if (beat[field] === undefined) errors.push(`${where}: missing "${field}"`);
    if (beat.do === 'stamp') stamps.add(beat.name);
    if (beat.do === 'mark') {
      if (!MARK_KINDS.includes(beat.kind)) errors.push(`${where}: mark kind "${beat.kind}" is not one of ${MARK_KINDS.join(', ')}`);
      if (typeof beat.from === 'string' && !stamps.has(beat.from)) errors.push(`${where}: mark from "${beat.from}" is not a stamp set earlier`);
    }
    if (beat.do === 'wait-card' && !beat.title && !beat.on) errors.push(`${where}: needs "title" or "on"`);
    if (beat.do === 'set-files' && !cfg.files?.[beat.file]) errors.push(`${where}: files.${beat.file} is not declared`);
    walk(beat, where);
  });
  const starts = cfg.beats?.filter(b => b.do === 'start').length, ends = cfg.beats?.filter(b => b.do === 'end').length;
  need(starts === 1, `exactly one "start" beat is needed (found ${starts})`);
  need(ends === 1, `exactly one "end" beat is needed (found ${ends})`);
  const queue = cfg.routes?.artifacts?.queue || [];
  const bankFile = cfg.files?.bank && resolveData(cfg, cfg.files.bank, dataDir);
  if (cfg.routes?.artifacts) need(bankFile, 'routes.artifacts needs files.bank');
  for (const [i, entry] of queue.entries()) need(Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] >= 1000, `routes.artifacts.queue[${i}] must be [bankKey, delayMs >= 1000] (the wait is the skeleton footage: 1600-2000 ms)`);
  const askAnswers = cfg.routes?.ask?.answers || [];
  if (bankFile && existsSync(bankFile)) {
    let bank = null;
    try { bank = JSON.parse(readFileSync(bankFile, 'utf8')); } catch (e) { errors.push(`bank is not valid JSON: ${e.message}`); }
    if (bank) {
      for (const [key] of queue) need(bank[key]?.response, `bank has no "${key}".response (routes.artifacts.queue)`);
      for (const a of askAnswers) need(bank[a.bank]?.sse, `bank has no "${a.bank}".sse (routes.ask.answers)`);
    }
  } else if (cfg.files?.bank) warnings.push(`bank file not found at ${bankFile} (set FILM_DATA): bank keys not checked`);
  for (const [key, value] of Object.entries(cfg.files || {})) if (key !== 'bank' && !existsSync(resolveData(cfg, value, dataDir))) warnings.push(`file "${key}" not found at ${resolveData(cfg, value, dataDir)} (set FILM_DATA)`);
  const r = cfg.ramp || {};
  need(r.fast >= 1 && r.fast <= 2.5, 'ramp.fast must be between 1 and 2.5 (the SOP says 1.4; a faster ramp is a deviation to state in the report)');
  if (r.fast !== 1.4) warnings.push(`ramp.fast is ${r.fast}, the SOP says 1.4: state the deviation in the draft's note`);
  return { errors, warnings };
}
