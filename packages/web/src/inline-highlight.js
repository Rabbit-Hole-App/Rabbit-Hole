// Owner 2026-11-09: Ctrl+K over highlighted words in a card. The words are the request's subject (a text range of the card), shown as a short chip, marked on the card
// while the window is open, with the window beside them. Pure helpers (no React); the editor and the canvas call them.
import { cardText } from './canvas-semantics.js';

// The chip's text: the first 2-3 words, at most `max` characters, the ellipsis inside the chip (owner: [ maximum likelihod.., x ]).
export function firstWords(text, { words = 3, max = 24 } = {}) {
  const all = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!all.length) return '';
  let shown = all.slice(0, words).join(' ');
  const cut = all.length > words || shown.length > max;
  if (shown.length > max) shown = shown.slice(0, max - 1).trimEnd();
  return cut ? `${shown}…` : shown;
}

// Where a normalized (single-spaced) passage sits in the card's own text: [from, to) in the card's characters, or null. The selection API gives the words as the
// reader sees them, the card's text keeps its line breaks, so both are compared single-spaced and mapped back.
export function locate(whole, passage) {
  const want = String(passage || '').replace(/\s+/g, ' ').trim();
  if (!want) return null;
  let flat = '';
  const at = [];
  let space = true; // collapse runs of white space, drop leading
  for (let i = 0; i < whole.length; i += 1) {
    const blank = /\s/.test(whole[i]);
    if (blank && space) continue;
    flat += blank ? ' ' : whole[i];
    at.push(i);
    space = blank;
  }
  const found = flat.indexOf(want);
  if (found < 0) return null;
  return { from: at[found], to: at[found + want.length - 1] + 1 };
}

// The highlighted words of the card under the selection: { id, range, highlight } or null. highlight: the live Range (kept so the words stay marked after focus moves
// into the Ctrl+K field and the native selection collapses), its client rects, the first line's top relative to the card in world units (alignY: the new card starts level
// with the highlighted line), and the words.
export function pickedHighlight(root, blocks, zoom = 1, selection = typeof window !== 'undefined' ? window.getSelection?.() : null) {
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer, host = node.nodeType === 1 ? node : node.parentElement;
  const card = host?.closest?.('[data-block-id]');
  if (!card || !root.contains(card)) return null;
  const id = card.getAttribute('data-block-id'), block = (blocks || []).find(entry => entry.id === id);
  if (!block) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const spot = locate(cardText(block), text);
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(({ left, top, width, height }) => ({ left, top, width, height }));
  if (!rects.length) return null;
  const top = Math.min(...rects.map(rect => rect.top)), cardTop = card.getBoundingClientRect().top;
  return { id, range: spot ? { id, from: spot.from, to: spot.to, text: cardText(block).slice(spot.from, spot.to) } : null,
    highlight: { id, text, rects, live: range.cloneRange(), alignY: Math.max(0, Math.round((top - cardTop) / (zoom || 1))) } };
}

// The whole card as one context object (owner 2026-11-09): which card it is and everything in it, with the highlighted words flagged: { cardId, cardType, title, highlighted, body (the prose, the
// visuals marked [visual n]), visuals: each diagram's saved spec and each picture's prompt, alt and caption, questions, terms }. Anything highlighted in the card (prose, a diagram label, a caption)
// gives the same object. Size-capped inside the 8,000 characters every context takes (the server's limit): the prose up to BODY_CAP, the specs up to SPEC_CAP in all, pictures in full.
export const BODY_CAP = 3600, SPEC_CAP = 2600;
const FENCE_RE = /```(rh-diagram|rh-illustration)\n([\s\S]*?)\n```/g;
const parse = json => { try { return JSON.parse(json); } catch { return null; } };
export function cardContext(block, highlighted = '') {
  const visuals = [];
  const prose = String(block?.body ?? '').replace(FENCE_RE, (all, kind, json) => {
    const spec = parse(json);
    if (kind === 'rh-diagram') visuals.push({ kind: 'diagram', spec: spec?.diagram ?? spec ?? json });
    else visuals.push({ kind: 'picture', prompt: String(spec?.prompt ?? spec?.p ?? ''), alt: String(spec?.alt ?? spec?.a ?? ''), caption: String(spec?.caption ?? spec?.c ?? '') });
    return `\n\n[visual ${visuals.length}]\n\n`;
  });
  const own = prose.trim() ? prose.replace(/\n{3,}/g, '\n\n') : cardText(block || {});
  let spent = 0;
  const shown = visuals.map(visual => {
    if (visual.kind !== 'diagram') return visual;
    const text = JSON.stringify(visual.spec);
    if (spent + text.length > SPEC_CAP) return { kind: 'diagram', spec: `(saved spec, ${text.length} characters, left out of this message)` };
    spent += text.length;
    return visual;
  });
  const questions = (block?.interactions?.questions || []).map(question => question?.text).filter(Boolean).slice(0, 3);
  const terms = (block?.interactions?.terms || []).map(term => term?.label).filter(Boolean).slice(0, 12);
  return { cardId: block?.id ?? null, cardType: block?.type ?? 'card', title: String(block?.title ?? '').slice(0, 200), highlighted: String(highlighted).replace(/\s+/g, ' ').trim().slice(0, 1500),
    body: own.trim().slice(0, BODY_CAP), ...(shown.length ? { visuals: shown } : {}), ...(questions.length ? { questions } : {}), ...(terms.length ? { terms } : {}) };
}
// The message the model reads: one instruction line, then the card. The same text rides as the Chat's question context and as /explain's context.
export const contextMessage = card => `The learner highlighted these words in this card: "${card.highlighted}". The card is: ${JSON.stringify(card)}`.slice(0, 8000);
// What /explain from Ctrl+K sends as the request's context: the whole-card message when the handoff carries the card, else the target's words as before.
export function explainContext(target) {
  if (target?.card) return contextMessage(target.card);
  const words = String(target?.text ?? '').trim();
  return words ? words.slice(0, 8000) : null;
}

// Owner 2026-11-09: the Ctrl+K window stands CLOSE to the highlighted words and never over them. rects: the highlighted words' line rects in surface coordinates ({ left, top, width, height }); size: the window's
// { w, h } (its reserved height, so a streamed answer never moves it); surface: { w, h }; avoid: other boxes it keeps clear of when it can (the card's own toolbar and the bottom strip). Preference: below the
// last line (left edge on the words' left, clamped), above the first line (held by its bottom edge: it grows up), right of the words, left of them. A spot counts only when it overlaps no line of the words
// by even a pixel; the gap to the nearest words is WORDS_GAP, and stays within WORDS_GAP_MAX unless the viewport forces a farther spot. Returns { left, top, up, gap, side }.
export const WORDS_GAP = 10, WORDS_GAP_MAX = 24, WORDS_EDGE = 8;
const overlapArea = (a, b) => Math.max(0, Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top));
const asBox = r => ({ left: r.left, top: r.top, w: r.width, h: r.height });
export function placeBesideWords(rects, size, surface, { gap = WORDS_GAP, edge = WORDS_EDGE, avoid = [] } = {}) {
  const lines = (rects || []).filter(r => r.width > 0 && r.height > 0);
  if (!lines.length) return null;
  const left = Math.min(...lines.map(r => r.left)), top = Math.min(...lines.map(r => r.top));
  const right = Math.max(...lines.map(r => r.left + r.width)), bottom = Math.max(...lines.map(r => r.top + r.height));
  const lastLine = lines.reduce((a, b) => (b.top + b.height > a.top + a.height ? b : a)), firstLine = lines.reduce((a, b) => (b.top < a.top ? b : a));
  const clampX = x => Math.max(edge, Math.min(x, surface.w - size.w - edge)), clampY = y => Math.max(edge, Math.min(y, surface.h - size.h - edge));
  const words = lines.map(asBox), blocked = avoid.map(b => ({ left: b.x ?? b.left, top: b.y ?? b.top, w: b.w ?? b.width, h: b.h ?? b.height }));
  const spots = [
    { side: 'below', left: clampX(lastLine.left), top: bottom + gap, up: false },
    { side: 'above', left: clampX(firstLine.left), top: top - gap - size.h, up: true },
    { side: 'right', left: right + gap, top: clampY(top), up: false },
    { side: 'left', left: left - gap - size.w, top: clampY(top), up: false },
  ].map(spot => ({ ...spot, left: clampX(spot.left), top: spot.up ? Math.max(edge, spot.top) : Math.min(spot.top, surface.h - size.h - edge) }));
  const box = spot => ({ left: spot.left, top: spot.top, w: size.w, h: size.h });
  const cost = spot => words.reduce((sum, w) => sum + overlapArea(box(spot), w), 0) * 1000 + blocked.reduce((sum, b) => sum + overlapArea(box(spot), b), 0);
  // the gap of a spot: the distance from the window to the nearest of the words along the side it stands on
  const gapOf = spot => { const b = box(spot); const dx = Math.max(0, Math.max(b.left - right, left - (b.left + b.w))), dy = Math.max(0, Math.max(b.top - bottom, top - (b.top + b.h))); return Math.round(Math.max(dx, dy)); };
  const clear = spots.filter(spot => cost(spot) < 1000);
  const pool = clear.length ? clear : spots;
  const near = pool.filter(spot => gapOf(spot) <= WORDS_GAP_MAX);
  const best = (near.length ? near : pool).reduce((a, b) => (cost(b) < cost(a) ? b : a), (near.length ? near : pool)[0]);
  return { left: Math.round(best.left), top: Math.round(best.top), up: best.up, side: best.side, gap: gapOf(best) };
}

// Owner 2026-11-09: Ctrl+K over highlighted words may zoom in and pan, so the words AND the window beside them sit in the middle of what the learner can see, the canvas dimmed behind. The target camera, in surface pixels:
// words { left, top, right, bottom } as they are now; win { w, h, gap }: the window stands below the words, as wide as win.w and as tall as win.h, a gap under them. The window keeps its size on screen, the words grow with the zoom, so the
// union of the two is measured AFTER the zoom: max(words width, win.w) wide, words height + gap + win.h tall. Its centre goes to the centre of `area` ({ left, top, right, bottom }, already less the floating controls and panels); the zoom is the
// largest from the current one up to CAMERA_ZOOM_MAX at which the union fits in CAMERA_PAD of the area (never below the current zoom: no zoom-out). Returns { x, y, z }, or null when the camera is already there (within `noop` px, same zoom).
export const CAMERA_ZOOM_MAX = 1.5, CAMERA_PAD = 0.9;
export function cameraForWords(words, win, view, area, { max = CAMERA_ZOOM_MAX, pad = CAMERA_PAD, noop = 4 } = {}) {
  const ww = words.right - words.left, wh = words.bottom - words.top, aw = area.right - area.left, ah = area.bottom - area.top;
  if (!(ww > 0 && wh > 0 && aw > 0 && ah > 0)) return null;
  const union = k => ({ w: Math.max(ww * k, win.w), h: wh * k + win.gap + win.h });
  let k = Math.max(1, max / view.z);
  while (k > 1 && (union(k).w > aw * pad || union(k).h > ah * pad)) k = Math.max(1, k - 0.01);
  const z = Math.round(view.z * k * 1000) / 1000, size = union(k);
  const worldLeft = (words.left - view.x) / view.z, worldTop = (words.top - view.y) / view.z;
  const next = { x: Math.round((area.left + area.right) / 2 - size.w / 2 - worldLeft * z), y: Math.round((area.top + area.bottom) / 2 - size.h / 2 - worldTop * z), z };
  const now = union(1), dx = words.left + now.w / 2 - (area.left + area.right) / 2, dy = words.top + now.h / 2 - (area.top + area.bottom) / 2;
  if (k === 1 && Math.abs(dx) <= noop && Math.abs(dy) <= noop) return null;
  return next;
}

// A scrim over `size` that leaves the given rects (plus `pad`) undimmed: one even-odd path (the outer box, then one hole per rect).
export function scrimPath(size, rects, pad = 3) {
  const holes = rects.map(r => `M${Math.round(r.left - pad)} ${Math.round(r.top - pad)}h${Math.round(r.width + pad * 2)}v${Math.round(r.height + pad * 2)}h${-Math.round(r.width + pad * 2)}z`).join('');
  return `path(evenodd, "M0 0H${Math.round(size.w)}V${Math.round(size.h)}H0z${holes}")`;
}
