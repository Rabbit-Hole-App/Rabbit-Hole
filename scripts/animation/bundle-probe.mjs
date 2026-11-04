// Read-only walk of a built (dist-dev directory) or served (origin, GET only) web bundle, shared by ladder-smoke.mjs and
// post-release-verify-ladder.mjs. Same approach as C:/s/spec/animation/release/prod-bundle-probe.mjs: start at the entry page, follow every
// "/static/X.js" and "./X.js" reference, hand each chunk's text to the caller. No session, no credential, no write.
//   node scripts/animation/bundle-probe.mjs (--dir packages/web/dist-dev | --origin https://...) [--features a,b,c] [--expect present|absent]
// Exit 0 only when the result matches --expect. The default features are the ladder's five (MVP3 client features).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASE_FEATURES = ['curve_radius', 'action_motion']; // declared since MVP1: the anchor that finds the declaring array
export const LADDER_FEATURES = ['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp'];
const UA = { 'User-Agent': 'rabbit-hole-prod-release-readonly' };

export const dirReader = dir => async p => (existsSync(join(dir, p.replace(/^\//, ''))) ? readFileSync(join(dir, p.replace(/^\//, '')), 'utf8') : null);
export const originReader = origin => async p => {
  const r = await fetch(new URL(p, origin), { headers: UA, signal: AbortSignal.timeout(20_000) });
  return r.status === 200 ? r.text() : null;
};

// Visits the entry page and every chunk it reaches, up to `concurrency` reads at once. -> { chunks, unreadable: [paths] }
export async function walkBundle({ read, entry, onChunk, concurrency = 12 }) {
  const html = await read(entry);
  if (!html) return { chunks: 0, unreadable: [entry], noEntry: true };
  // shortcut: only /static/*.js scripts are followed; a bundle that moves its chunks elsewhere reads as zero chunks and the callers fail loudly.
  const queue = [...html.matchAll(/(?:src|href)="(\/static\/[A-Za-z0-9._-]+\.js)"/g)].map(m => m[1]);
  const seen = new Set(), unreadable = [];
  while (queue.length) {
    const batch = [...new Set(queue.splice(0, concurrency))].filter(p => !seen.has(p));
    batch.forEach(p => seen.add(p));
    await Promise.all(batch.map(async p => {
      let text = null;
      try { text = await read(p); } catch { /* counted as unreadable below */ }
      if (text == null) { unreadable.push(p); return; }
      await onChunk(p, text);
      for (const [, name] of text.matchAll(/["'`](?:\.\/|\/static\/)([A-Za-z0-9_.-]+\.js)["'`]/g)) if (!seen.has(`/static/${name}`)) queue.push(`/static/${name}`);
    }));
  }
  return { chunks: seen.size - unreadable.length, unreadable };
}

// A chunk declares the client features when each is a quoted string inside one window around the anchor, i.e. the same array literal.
export function declares(text, features, anchor = BASE_FEATURES[0]) {
  const at = [...text.matchAll(new RegExp(`["'\`]${anchor}["'\`]`, 'g'))].map(m => m.index);
  return at.some(i => { const w = text.slice(Math.max(0, i - 500), i + 800); return features.every(f => new RegExp(`["'\`]${f}["'\`]`).test(w)); });
}

// -> { chunks, card: [Animation3DCard chunk names], declaredIn: [chunks], unreadable }
export async function probeBundle({ read, entry = '/explore', features = LADDER_FEATURES, concurrency }) {
  const card = new Set(), declaredIn = [];
  const walked = await walkBundle({ read, entry, concurrency, onChunk: (p, text) => {
    if (p.includes('/Animation3DCard-')) card.add(p);
    if (declares(text, [...BASE_FEATURES.slice(0, 1), ...features])) declaredIn.push(p);
  } });
  return { ...walked, card: [...card], declaredIn };
}

// -> { chunks, hits: {pattern source: [chunks that match]}, card } for each regular expression source in `patterns`.
export async function scanBundle({ read, entry = '/explore', patterns, concurrency }) {
  const res = patterns.map(src => [src, new RegExp(src, 'i')]), hits = Object.fromEntries(patterns.map(s => [s, []])), card = new Set();
  const walked = await walkBundle({ read, entry, concurrency, onChunk: (p, text) => {
    if (p.includes('/Animation3DCard-')) card.add(p);
    for (const [src, re] of res) if (re.test(text)) hits[src].push(p);
  } });
  return { ...walked, hits, card: [...card] };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const dir = arg('--dir'), origin = arg('--origin'), expect = arg('--expect') || 'present';
  const features = arg('--features')?.split(',').filter(Boolean) ?? LADDER_FEATURES;
  if (!dir === !origin || !['present', 'absent'].includes(expect)) { console.error('usage: bundle-probe.mjs (--dir <dist-dev> | --origin <https://...>) [--features a,b] [--expect present|absent]'); process.exit(2); }
  const r = await probeBundle({ read: dir ? dirReader(dir) : originReader(origin), entry: dir ? 'index.html' : '/explore', features });
  console.log(`${r.chunks} chunks read; Animation3DCard: ${r.card.join(', ') || 'none'}; ${features.join(', ')} declared in: ${r.declaredIn.join(', ') || 'no chunk'}${r.unreadable.length ? `; unreadable: ${r.unreadable.slice(0, 3).join(', ')}` : ''}`);
  const ok = !r.noEntry && r.chunks > 0 && r.card.length > 0 && (expect === 'present' ? r.declaredIn.length > 0 : r.declaredIn.length === 0);
  console.log(ok ? `OK: features ${expect}` : `NOT OK: expected the features ${expect}${r.card.length ? '' : ' (and no Animation3DCard chunk was reached: the walk may be blind)'}`);
  process.exit(ok ? 0 : 1);
}
