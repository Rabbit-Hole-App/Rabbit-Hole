// The webpage card's pure parts (WebpageCard.jsx; brief C:/s/spec/day-1021/webcard-brief.md). Capture coordinates are CSS pixels
// of the captured page (its width is the capture browser's viewport). The card draws them at scale = card width / capture width;
// the canvas transform does the zoom, so nothing here depends on it. Nothing here asks a model.

// pdf-anchor.js speaks pdf.js viewports: a capture's is the identity, so a highlight's rects are capture pixels.
export const captureViewport = ({ width, height }) => ({ width, height, rotation: 0, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] });
export const cardScale = (cardWidth, captureWidth) => (captureWidth > 0 && cardWidth > 0 ? cardWidth / captureWidth : 1);

// One text run as the text layer draws it (index.css .textLayer: font-size = --total-scale-factor * --font-height, then scaleX):
// left, top and font height in capture pixels, scaleX stretching the run's natural width (measure(text, fontHeight)) to its box.
export function runStyle(run, measure) {
  const natural = run.text ? measure(run.text, run.h) : 0;
  return { left: run.x, top: run.y, fontHeight: run.h, scaleX: natural > 0 && run.w > 0 ? run.w / natural : 1 };
}

// Each run belongs to the tile its vertical middle falls in, so a tile's text mounts and unmounts with its picture.
export function runsByTile(runs, tiles) {
  const out = tiles.map(() => []);
  for (const run of runs || []) {
    // The capture names the tile that holds the run's top (interface section 3); older or partial runs fall back to their middle.
    const mid = run.y + run.h / 2;
    const at = Number.isInteger(run.tile) && run.tile >= 0 && run.tile < tiles.length ? run.tile : tiles.findIndex(tile => mid >= tile.y && mid < tile.y + tile.h);
    out[at === -1 ? tiles.length - 1 : at]?.push(run);
  }
  return out;
}

// The scroll offset (capture pixels) kept inside the page: 0 to page height minus the visible height.
export const clampScroll = (top, pageHeight, viewHeight) => Math.max(0, Math.min(Math.max(0, pageHeight - viewHeight), Number.isFinite(top) ? top : 0));

// A wheel over the card. Locked, or Ctrl/Cmd held (zoom): null, the canvas takes it (pans or zooms). Unlocked: the page's new
// offset; the wheel's screen pixels are card pixels over the canvas zoom, then capture pixels over the card scale.
export function wheelScroll({ locked, ctrl = false, top, deltaY, zoom = 1, scale = 1, pageHeight, viewHeight }) {
  if (locked || ctrl) return null;
  return clampScroll(top + deltaY / (zoom || 1) / (scale || 1), pageHeight, viewHeight);
}

// Keys that scroll a focused, unlocked card, in capture pixels.
export function keyScroll(key, top, viewHeight, pageHeight) {
  const step = { ArrowDown: 60, ArrowUp: -60, PageDown: viewHeight * 0.9, PageUp: -viewHeight * 0.9 }[key];
  if (key === 'Home') return 0;
  if (key === 'End') return clampScroll(pageHeight, pageHeight, viewHeight);
  return step == null ? null : clampScroll(top + step, pageHeight, viewHeight);
}

// The card's state (webcard-interface.md section 1): `capture` is the approved capture on show; `pending` a capture in flight or
// awaiting Retry; `failure` the last refusal. A Refresh that has not passed never replaces the approved capture: the capture and
// its highlights stay on show and the attempt is a notice above them.
const NOTICE = {
  capturing: { text: 'Capturing the page' },
  screening: { text: 'Checking the page' },
  inconclusive: { text: 'Hidden: the check could not finish', retry: true },
  error: { text: 'Hidden: the check could not finish', retry: true },
  stopped: { text: 'The capture stopped before it finished', retry: true },
  capture_error: { text: 'The capture failed', retry: true },
  blocked: { text: 'Hidden', dismiss: true },
  login_required: { text: 'Login required', dismiss: true },
  unavailable: { text: 'Unavailable', dismiss: true },
  failed: { text: 'Unavailable', dismiss: true },
};
// asked: whether this page has the capture request in flight (a reload loses it, and the card says the capture stopped instead of
// starting another one: no automatic refetch).
export function cardState(block, { asked = false } = {}) {
  const shown = block.capture?.manifestId ? block.capture : null;
  let status = block.pending?.status || block.failure?.status || null;
  if (status === 'capturing' && !asked && !block.pending?.manifestId) status = 'stopped';
  if (status === 'error' && !block.pending?.manifestId) status = 'capture_error'; // nothing was captured, so nothing is hidden
  const base = status && NOTICE[status];
  const reason = (block.pending || block.failure)?.reason || '';
  const notice = base ? { ...base, status, reason, refresh: !!shown, remove: !shown && !!base.dismiss, dismiss: !!shown && !!base.dismiss } : null;
  const truncated = !!shown && Object.values(shown.truncated || {}).some(Boolean);
  return { shown, notice, waiting: status === 'capturing' || status === 'screening', truncated };
}

// A server Result (webcard-interface.md section 2) folded into the block. Only `ready` replaces the capture and its fileRef;
// screening, inconclusive and error keep the attempt pending; a refusal is the failure. Anything else leaves the block as it was.
export function applyResult(block, result, now = Date.now()) {
  if (!result?.status) return block;
  if (result.status === 'ready' && result.capture?.manifestId) {
    const same = block.capture?.manifestId === result.capture.manifestId;
    return { ...block, title: result.title || result.capture.title || block.title, capture: result.capture, fileRef: result.fileRef, pending: null, failure: null, scrollTop: same ? block.scrollTop || 0 : 0 };
  }
  if (['screening', 'inconclusive', 'error'].includes(result.status)) {
    return { ...block, pending: { manifestId: result.manifestId || block.pending?.manifestId || null, lineage: result.lineage || block.pending?.lineage || null, status: result.status, reason: result.reason || null, startedAt: block.pending?.startedAt || now }, failure: null };
  }
  if (['blocked', 'login_required', 'unavailable', 'failed'].includes(result.status)) return { ...block, pending: null, failure: { status: result.status, reason: result.reason || null } };
  return block;
}
// A Refresh (or a first capture, or Retry of a stopped capture) as the card holds it until the server answers.
export const startPending = (block, now = Date.now()) => ({ ...block, pending: { manifestId: null, lineage: block.capture?.lineage || block.pending?.lineage || null, status: 'capturing', reason: null, startedAt: now }, failure: null });
export const lineageOf = block => block.capture?.lineage || block.pending?.lineage || null;

// What the highlights route returned, for the capture on show: its own highlights, and how many sit on earlier versions. A
// list for another version (the route answered for a capture this card does not show) shows nothing and counts it all.
export function highlightView(answer, sha256) {
  if (!answer) return { current: [], earlier: 0 };
  if (!sha256 || answer.sha256 !== sha256) return { current: [], earlier: (answer.highlights?.length || 0) + (answer.changed || 0) };
  return { current: answer.highlights || [], earlier: answer.changed || 0 };
}

// The highlights route's address for the capture on show (interface section 1: key web:<lineage>, manifest in place of home).
export const highlightSource = (app, capture) => (capture?.lineage && capture.manifestId ? { app, key: `web:${capture.lineage}`, manifest: capture.manifestId } : null);
// The PUT body of a text highlight (control-plane pdf-excerpts.js highlightAnchor): page 1, no rotation, the capture's own box
// as the view, its rects in capture pixels.
export const highlightBody = (source, capture, { rects, quote }) => ({
  ...source, sha256: capture.sha256, kind: 'text', page: { index: 1, label: null }, rects, rotate: 0, view: [0, 0, capture.width, capture.height], quote,
});

// Ask about selection: the passage with the page's title, URL and capture (scope "Selection to Chat composer"), as the text of
// a kind 'card' ref. It only fills the composer; nothing is sent.
export function askText(block, exact) {
  const capture = block.capture || {};
  return `Selected text from the webpage "${block.title || block.url}" (${block.url}), capture ${capture.manifestId || 'unknown'} version ${String(capture.sha256 || '').slice(0, 12) || 'unknown'}:\n${exact}`;
}
