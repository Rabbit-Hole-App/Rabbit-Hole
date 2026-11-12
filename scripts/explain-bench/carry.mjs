// Carried verdicts (owner 2026-11-09, "judge only what changed"). Pure helpers over scored cards, no network.
// A card's delivered spec = each diagram's spec JSON (keys sorted) + the body text, hashed with the prompt, the depth and the judge RUBRIC VERSIONS: a rubric version bump changes every hash, so nothing
// carries across it. Equal hash to a card of the carried run = byte-identical delivery = the same judge input, so its verdicts are copied and the judge is not called ("carried").
// The judge cache (judge.mjs) is already keyed by rubric version + the exact text the judge reads, so it carries too; report.mjs counts both and says which.
import { createHash } from 'node:crypto';

export const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const sha = s => createHash('sha256').update(s).digest('hex');
export const depthOf = c => c.depth || 'standard'; // a card sent with no depth is Standard on the server
export const identity = c => `${c.set}|${c.id}|${depthOf(c)}`;
export const specsOf = c => canon((c.diagrams || []).map(d => d.spec ?? null));
// versions: the judge rubric versions in force (sorted strings). body: the card's delivered body text.
export const cardHash = (c, body, versions) => sha(canon({ id: c.id, prompt: c.prompt, depth: depthOf(c), versions: [...versions].sort(), specs: (c.diagrams || []).map(d => d.spec ?? null), body: String(body ?? '') }));
// A reference-copied card: the server gave the author a reference other than the generic per-kind shape ("shape-*" ids).
export const referenceCopied = c => !!c.references?.ids?.some(id => !String(id).startsWith('shape-'));

// prev: the carried run's scored cards; bodyOf(card) -> its body text; versions: the rubric versions that run was judged with (none = not judged: nothing carries).
export function carryIndex(prevCards, bodyOf, versions) {
  const byHash = new Map(), specs = new Map();
  for (const c of prevCards.filter(x => x.delivered)) {
    if (versions.length && bodyOf(c) != null) byHash.set(cardHash(c, bodyOf(c), versions), c);
    (specs.get(identity(c)) || specs.set(identity(c), new Set()).get(identity(c))).add(specsOf(c));
  }
  return { byHash, specs };
}

// Copies the carried card's verdicts onto an identical card. -> how many items of each rubric were carried.
export function copyVerdicts(c, p) {
  const n = { factual: 0, faithful: 0, beyond: 0, picture: 0 };
  if (p.judge?.factual) { c.judge = p.judge; n.factual++; }
  c.diagrams.forEach((d, i) => { const q = p.diagrams[i]; if (q?.faithful) { d.faithful = q.faithful; n.faithful++; } if (q?.beyond) { d.beyond = q.beyond; n.beyond++; } });
  c.pictures.forEach((x, i) => { if (p.pictures[i]?.content) { x.content = p.pictures[i].content; n.picture++; } });
  c.carried = true;
  return n;
}

// Byte-identical counts against the carried run, overall and by set, split by reference-copied cards and the rest. identicalSpec = the diagrams equal one of the same prompt's (the prose may differ).
export function identicalStats(cards, index) {
  const row = () => ({ cards: 0, identicalHash: 0, identicalSpec: 0 }), out = { all: row(), referenceCopied: row(), other: row(), bySet: {} };
  for (const c of cards.filter(x => x.delivered)) {
    const hash = index.byHash.has(c.specHash), spec = !!index.specs.get(identity(c))?.has(specsOf(c));
    for (const r of [out.all, referenceCopied(c) ? out.referenceCopied : out.other, (out.bySet[c.set] ||= row())]) { r.cards++; if (hash) r.identicalHash++; if (spec) r.identicalSpec++; }
  }
  return out;
}

// The judged/carried accounting per rubric. judge: judgeItems' result; hashCarried: items carried by hash; dryRun: "judged" then means "would be judged".
export function accounting(judge, hashCarried) {
  const out = {};
  for (const k of ['factual', 'faithful', 'beyond', 'picture']) {
    const inCache = judge.cachedBy?.[k] || 0, items = (judge.byRubric?.[k] || 0) + (hashCarried[k] || 0);
    out[k] = { items, carried: inCache + (hashCarried[k] || 0), carriedByHash: hashCarried[k] || 0, carriedByCache: inCache, judged: judge.dryRun ? (judge.byRubric?.[k] || 0) - inCache : judge.callsBy?.[k] || 0 };
  }
  return out;
}

// The report.md lines for a run's carry record. table: report.mjs's markdown table helper.
export function carryLines(K, table) {
  const A = K.rubrics, id = K.identical, pc = (a, b) => (b ? `${a}/${b} (${Math.round(100 * a / b)}%)` : '-'), from = K.from ? `\`${K.from}\`` : 'an earlier run';
  const out = ['### Judged and carried (judge only what changed)', '',
    `Carried = the verdict was reused: the card's spec + body + prompt + depth + rubric versions hash like a card of ${from} (--carry-from), or the judge cache already held the verdict for the exact text the judge reads (the cache is keyed by rubric version, so a rubric version bump invalidates both). ${K.dryRun ? '**Dry run: judged = would be judged.**' : ''}`, '',
    table(['rubric', 'items', 'judged', 'carried', 'by hash', 'by cache'], Object.entries(A).map(([k, v]) => [k, v.items, v.judged, v.carried, v.carriedByHash, v.carriedByCache])), '',
    `Cards carried whole: ${pc(K.cards.carried, K.cards.delivered)}. By set: ${Object.entries(K.bySet).map(([n, v]) => `${n} ${pc(v.carried, v.cards)}`).join(', ')}.`, ''];
  if (id) out.push(`Byte-identical to ${from}: whole card (spec + body) ${pc(id.all.identicalHash, id.all.cards)}; diagrams only (the prose differs) ${pc(id.all.identicalSpec, id.all.cards)}. Reference-copied cards: whole ${pc(id.referenceCopied.identicalHash, id.referenceCopied.cards)}, diagrams only ${pc(id.referenceCopied.identicalSpec, id.referenceCopied.cards)}. Other cards: whole ${pc(id.other.identicalHash, id.other.cards)}, diagrams only ${pc(id.other.identicalSpec, id.other.cards)}.`, '');
  return out;
}
