// Formatted text on the canvas (docs/features/canvas-editing.md): text boxes, sticky notes, shape text and connector
// labels. `text` stays the plain string every reader uses - the Tutor's context, search, copy, accessibility, the
// server's shared-board ask - and is never anything else. Formatting rides beside it:
//  - object-wide: font, fontSize, bold, italic, underline, textColor, align, valign (closed shapes), mode ('code')
//  - per character range: `runs`, [{ t, b, i, u, c, f, s }], whose t's join to exactly `text`.
// A runs list that no longer spells `text` (an older client edited the words, a code-mode edit) is reconciled or
// dropped, never shown in place of the words. Nothing here holds HTML: values are validated before they are drawn.

export const FONTS = {
  sans: { label: 'Sans', stack: "'Inter Variable', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: 'Serif', stack: "Georgia, Cambria, 'Times New Roman', serif" },
  mono: { label: 'Mono', stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
};
export const FONT_KEYS = Object.keys(FONTS);
export const SIZE_MIN = 8, SIZE_MAX = 160;
export const SIZE_PRESETS = [12, 14, 16, 20, 24, 32, 48, 64];
export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'middle', 'bottom'];
const HEX = /^#[0-9a-f]{6}$/i;
const RUN_KEYS = ['b', 'i', 'u', 'c', 'f', 's'];

// A colour typed or picked: #rgb or #rrggbb, with or without the #; anything else is null.
export function hexColor(value) {
  const raw = String(value || '').trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return HEX.test(raw) ? raw : null;
}

// A font size typed: a number clamped to the range, whole or half points; anything else is null.
export function fontSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n * 2) / 2));
}

// One run's attributes, kept only when valid. false / null / undefined mean "as the object".
function cleanAttrs(run) {
  const out = {};
  if (run.b === true || run.b === false) out.b = run.b;
  if (run.i === true || run.i === false) out.i = run.i;
  if (run.u === true || run.u === false) out.u = run.u;
  const c = run.c && hexColor(run.c);
  if (c) out.c = c;
  if (FONT_KEYS.includes(run.f)) out.f = run.f;
  const s = run.s != null ? fontSize(run.s) : null;
  if (s) out.s = s;
  return out;
}

const sameAttrs = (a, b) => RUN_KEYS.every(key => a[key] === b[key]);

// Runs merged where neighbours match, empty runs gone; null when nothing is formatted (the plain text says it all).
export function compactRuns(runs) {
  const out = [];
  for (const run of runs) {
    if (!run.t) continue;
    const attrs = cleanAttrs(run), last = out[out.length - 1];
    if (last && sameAttrs(last, attrs)) last.t += run.t;
    else out.push({ t: run.t, ...attrs });
  }
  return out.some(run => RUN_KEYS.some(key => key in run)) ? out : null;
}

// The runs to draw for an entry: its saved runs when they still spell its text, else the text as one plain run.
export function runsOf(entry) {
  const text = String(entry?.text ?? entry?.label ?? '');
  const runs = Array.isArray(entry?.runs) ? entry.runs : null;
  if (runs && runs.every(run => run && typeof run.t === 'string') && runs.map(run => run.t).join('') === text) {
    return runs.map(run => ({ t: run.t, ...cleanAttrs(run) }));
  }
  return text ? [{ t: text }] : [];
}

export const plainOf = runs => runs.map(run => run.t).join('');

// Formatting carried over onto edited words: the unchanged start and end keep their runs, the new middle takes the
// formatting of what it replaced (else of the character before it). Used when the words changed where formatting was not drawn (Code mode, an
// older client) - the new words always win.
export function reconcileRuns(runs, text) {
  const old = plainOf(runs);
  if (old === text) return runs;
  let start = 0;
  while (start < old.length && start < text.length && old[start] === text[start]) start += 1;
  let end = 0;
  while (end < old.length - start && end < text.length - start && old[old.length - 1 - end] === text[text.length - 1 - end]) end += 1;
  const head = sliceRuns(runs, 0, start), tail = sliceRuns(runs, old.length - end, old.length);
  const middle = text.slice(start, text.length - end);
  // New words over replaced ones look like what they replaced; added words continue the character before them.
  const replaced = sliceRuns(runs, start, old.length - end)[0];
  const like = replaced || head[head.length - 1] || tail[0] || {};
  const carry = { ...like, t: middle };
  return [...head, carry, ...tail].filter(run => run.t);
}

// The runs between two character offsets, split where needed.
export function sliceRuns(runs, from, to) {
  const out = [];
  let at = 0;
  for (const run of runs) {
    const end = at + run.t.length;
    if (end > from && at < to) out.push({ ...run, t: run.t.slice(Math.max(0, from - at), Math.min(run.t.length, to - at)) });
    at = end;
  }
  return out;
}

// Replace [from, to) with `insert` (a string, taking `attrs`); returns new runs.
export function spliceRuns(runs, from, to, insert, attrs = {}) {
  const total = plainOf(runs).length;
  const piece = insert ? [{ ...attrs, t: insert }] : [];
  return [...sliceRuns(runs, 0, from), ...piece, ...sliceRuns(runs, to, total)].filter(run => run.t);
}

// One attribute set over [from, to). `value` null clears it (the object's value shows through).
export function formatRuns(runs, from, to, key, value) {
  const total = plainOf(runs).length;
  const mid = sliceRuns(runs, from, to).map(run => {
    const next = { ...run };
    if (value == null) delete next[key]; else next[key] = value;
    return next;
  });
  return [...sliceRuns(runs, 0, from), ...mid, ...sliceRuns(runs, to, total)];
}

// What one character looks like: its run's attribute, else the object's, else the default.
const OBJECT_KEY = { b: 'bold', i: 'italic', u: 'underline', c: 'textColor', f: 'font', s: 'fontSize' };
export function effective(run, base, key) {
  if (run && run[key] != null) return run[key];
  return base[key];
}

// The object's own values in run terms, with defaults: base.s is the level's size unless a size was set.
export function baseOf(entry, { color = '#37352f', size = 14, weight = 400 } = {}) {
  return {
    b: entry.bold != null ? !!entry.bold : weight >= 600,
    i: !!entry.italic, u: !!entry.underline,
    c: hexColor(entry.textColor) || color,
    f: FONT_KEYS.includes(entry.font) ? entry.font : 'sans',
    s: fontSize(entry.fontSize) || size,
  };
}

// The value a control shows for a range: the one value every character shares, or 'mixed'. An empty range (a caret)
// reads the character before it - what typing continues - and the pending format wins over both.
export function valueOver(runs, from, to, key, base, pending = null) {
  if (pending && key in pending) return pending[key];
  const total = plainOf(runs).length;
  if (from === to) {
    const at = Math.max(0, Math.min(from, total) - 1);
    return effective(sliceRuns(runs, at, at + 1)[0], base, key);
  }
  const values = new Set(sliceRuns(runs, from, to).map(run => effective(run, base, key)));
  return values.size === 1 ? [...values][0] : 'mixed';
}

// Whole-object formatting: the object takes the value and every run lets go of its own, so the whole text shows it.
export function formatObject(entry, key, value) {
  const runs = Array.isArray(entry.runs) ? compactRuns(entry.runs.map(run => { const next = { ...run }; delete next[key]; return next; })) : null;
  const next = { ...entry, [OBJECT_KEY[key]]: value };
  if (value == null) delete next[OBJECT_KEY[key]];
  if (runs) next.runs = runs; else delete next.runs;
  return next;
}

// The toggles (bold, italic, underline) flip to "on" unless every character is already on.
export function toggleValue(runs, from, to, key, base, pending = null) {
  const current = valueOver(runs, from, to, key, base, pending);
  return current !== true;
}

// The object-wide value of a key across several selected objects: one value, or 'mixed'.
export function objectsValue(entries, key, baseFor) {
  const values = new Set();
  for (const entry of entries) {
    const runs = runsOf(entry), base = baseFor(entry);
    values.add(runs.length ? valueOver(runs, 0, plainOf(runs).length, key, base) : base[key]);
    if (values.size > 1) return 'mixed';
  }
  return values.size ? [...values][0] : null;
}

// CSS for one run against the object's base (only what differs is written).
export function runStyle(run, base, colorOf = color => color) {
  const style = {};
  if (run.b != null && run.b !== base.b) style.fontWeight = run.b ? 700 : 400;
  if (run.i != null && run.i !== base.i) style.fontStyle = run.i ? 'italic' : 'normal';
  // Underline is written on every run that has it, never on the object: a parent's underline cannot be taken off a child.
  if (effective(run, base, 'u')) style.textDecoration = 'underline';
  if (run.c && run.c !== base.c) style.color = colorOf(run.c);
  if (run.f && run.f !== base.f) style.fontFamily = FONTS[run.f].stack;
  if (run.s && run.s !== base.s) style.fontSize = `${run.s}px`;
  return style;
}

// CSS for the object as a whole.
export function objectStyle(entry, base, colorOf = color => color) {
  return {
    fontFamily: FONTS[base.f].stack,
    fontSize: base.s,
    ...(entry.bold != null ? { fontWeight: entry.bold ? 700 : 400 } : {}),
    fontStyle: base.i ? 'italic' : undefined,
    color: colorOf(base.c),
    ...(ALIGNS.includes(entry.align) ? { textAlign: entry.align } : {}),
  };
}

// What a save writes for an edited text: the words, and runs only when something in them is formatted.
export function textPatch(runs) {
  const text = plainOf(runs);
  const compact = compactRuns(runs);
  return compact ? { text, runs: compact } : { text, runs: undefined };
}
