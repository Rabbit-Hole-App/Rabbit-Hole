// Fixture captures for the webpage card checks (webpage-card-check.mjs, webpage-card-perf-check.mjs), in the shapes of
// C:/s/spec/day-1021/webcard-interface.md v2 and control-plane/src/webpage-capture.js: a manifest, 1280 px wide JPEG tiles 1400 px tall placed by y, and text runs
// in CSS px of the page. Each tile is one flat colour with a darker band, so a region picture says which part of the page it
// shows. No network, no model: the JPEGs are drawn by the check's own Chromium.
import { createHash, randomBytes } from 'node:crypto';

export const TILE_W = 1280, TILE_H = 1400;
export const COLORS = { red: [214, 48, 49], green: [39, 174, 96], blue: [41, 98, 255], amber: [243, 156, 18], grey: [120, 120, 120] };
const hex = n => randomBytes(n).toString('hex');
export const sourceId = () => `fs_${hex(12)}`;
export const lineageId = () => `wc_${hex(12)}`;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// { colour name: JPEG Buffer } for the named colours, drawn once in a blank page of `browser`.
export async function tileJpegs(browser, names = Object.keys(COLORS)) {
  const page = await browser.newPage();
  try {
    const out = await page.evaluate(([list, w, h]) => list.map(([name, [r, g, b]]) => {
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d');
      x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, w, h);
      x.fillStyle = `rgb(${r >> 1},${g >> 1},${b >> 1})`; x.fillRect(0, h / 2 - 20, w, 40);
      return [name, c.toDataURL('image/jpeg', 0.8).split(',')[1]];
    }), [names.map(n => [n, COLORS[n]]), TILE_W, TILE_H]);
    return Object.fromEntries(out.map(([name, b64]) => [name, Buffer.from(b64, 'base64')]));
  } finally { await page.close(); }
}

// One capture version. tiles: colour names, top to bottom (each TILE_H tall); runs: [{ text, x, y, w, h }] in page px.
// -> { lineage, manifestId, sha256, files: [{ id, role, declared, type, bytes, sha256 }], capture, fileRef, manifest, colors }
export function makeCapture({ jpegs, tiles, runs = [], url = 'https://example.com/a', title = 'Example Domain', lineage = lineageId(), truncated = {} }) {
  const height = tiles.length * TILE_H, files = [];
  // declared: the file_sources.declared_type the server writes (webpage-manifest, webpage-tile, webpage-text).
  const add = (role, type, bytes, index) => { const f = { id: sourceId(), role, declared: `webpage-${role}`, type, bytes, sha256: sha256(bytes), index }; files.push(f); return f; };
  const tileFiles = tiles.map((name, index) => add('tile', 'image/jpeg', jpegs[name], index));
  const textRuns = runs.map(run => ({ ...run, tile: Math.floor(run.y / TILE_H) }));
  const textFile = add('text', 'application/json', Buffer.from(JSON.stringify({ runs: textRuns })));
  const flags = { height: false, bytes: false, text: false, ...truncated };
  const manifest = { v: 1, lineage, url, finalUrl: url, title, fetchedAt: new Date().toISOString(), width: TILE_W, height, pageHeight: flags.height ? 20000 + TILE_H : height,
    tiles: tileFiles.map(f => ({ index: f.index, y: f.index * TILE_H, h: TILE_H, key: f.id, sha256: f.sha256, type: 'image/jpeg' })),
    text: { key: textFile.id, sha256: textFile.sha256, chars: textRuns.reduce((n, r) => n + r.text.length, 0) }, truncated: flags, screening: { status: 'pending', reason: null } };
  const manifestFile = add('manifest', 'application/json', Buffer.from(JSON.stringify(manifest)));
  // The server's Result fileRef (webpage-capture.js result()): v 1, the manifest as source, family and meta, tiles then text in bundle.
  const fileRef = { v: 1, source: { id: manifestFile.id, rev: manifestFile.sha256 }, family: 'webpage',
    meta: { name: `${title} (webpage capture).json`, type: 'application/json', size: manifestFile.bytes.length, title }, bundle: [...tileFiles.map(f => ({ role: 'tile', index: f.index, source: { id: f.id, rev: f.sha256 } })), { role: 'text', source: { id: textFile.id, rev: textFile.sha256 } }] };
  const capture = { lineage, manifestId: manifestFile.id, sha256: manifestFile.sha256, capturedAt: Date.now(), finalUrl: url, width: TILE_W, height, truncated: flags };
  return { lineage, manifestId: manifestFile.id, sha256: manifestFile.sha256, files, capture, fileRef, manifest, url, title, tileIds: tileFiles.map(f => f.id), textId: textFile.id, colors: tiles };
}

// The interface's Result for a capture that passed screening.
export const readyResult = cap => ({ status: 'ready', reason: null, lineage: cap.lineage, manifestId: cap.manifestId, title: cap.title, finalUrl: cap.url,
  screening: { status: 'passed', reason: null }, capture: cap.capture, fileRef: cap.fileRef });
// A Result that is not ready (screening, inconclusive, error, blocked, login_required, unavailable).
export const heldResult = (status, { lineage, manifestId = null, reason = null, url = 'https://example.com/a' } = {}) => ({ status, reason, lineage, manifestId, title: null, finalUrl: url,
  screening: ['screening', 'inconclusive', 'error', 'blocked'].includes(status) ? { status: status === 'screening' ? 'pending' : status === 'blocked' ? 'failed' : status, reason } : null, capture: null, fileRef: null });

// A webpage block (interface section 1) at a world position.
export const webpageBlock = (id, cap, { x = 0, y = 0, w = 520, h = 640, ...rest } = {}) => ({ id, type: 'webpage', x, y, w, h, dx: x, dy: y, url: cap?.url ?? rest.url, title: cap?.title ?? rest.title,
  ...(cap ? { capture: cap.capture, fileRef: cap.fileRef } : {}), pending: null, failure: null, scrollTop: 0, locked: false, ...rest });
