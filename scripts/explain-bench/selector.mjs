// Selector bench (owner 2026-11-08): no model calls. For every labelled prompt, which worked examples does the author's reference selector
// (packages/control-plane/src/explanation-references.js) pick, and are their kinds the kinds the prompt is expected to get? The free measurement for
// every new reference batch, run before any model call. A copy of the production scoring is kept here so the report can show scores; parity() checks
// that the copy picks exactly what production picks.
// Usage: node scripts/explain-bench/selector.mjs [--tree <repo root with the selector under test>] [--json out.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SELECTOR_FILE = 'packages/control-plane/src/explanation-references.js';
const SET_DIR = join(HERE, 'sets');

const normalized = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function matches(h, phrase) {
  const forms = new Set([phrase, `${phrase}s`, `${phrase}es`]);
  if (phrase.endsWith('y')) forms.add(`${phrase.slice(0, -1)}ies`);
  if (phrase.endsWith('ies')) forms.add(`${phrase.slice(0, -3)}y`);
  if (phrase.endsWith('s') && !phrase.endsWith('ss')) forms.add(phrase.slice(0, -1));
  if (phrase.endsWith('es')) forms.add(phrase.slice(0, -2));
  return [...forms].some(f => (` ${h} `).includes(` ${f} `));
}
function scored(query, ref) {
  let score = 0;
  for (const k of new Set(ref.keywords.map(normalized).filter(Boolean))) if (matches(query, k)) score += Math.min(12, 2 + k.split(' ').length * 2);
  if (ref.prompts.some(p => normalized(p) === query)) score += 50;
  return score;
}
// The copy of the production pick for a bare prompt (no context, no required kinds): score > 0, best first, registry order on ties, at most 2.
const pick = (references, prompt) => references.map((ref, index) => ({ ref, index, score: scored(normalized(prompt), ref) })).filter(x => x.score > 0)
  .sort((a, b) => (b.score - a.score) || a.index - b.index).slice(0, 2).map(x => ({ ...x.ref, score: x.score }));

// Shape-example fallback (owner 2026-11-08): when the tree under test exports fallbackKind, production sends one examples.json entry of that kind when no
// topical reference scores; the copy does the same, so parity covers it and the report counts those picks separately.
// Labelled prompts: correct-svg (kinds per depth, unioned) and aiml (best/acceptable mixes; D:* accepts any kind except the prompt's bad kinds).
const kindsOf = list => new Set(list.flat().flatMap(s => (String(s).startsWith('D:') ? String(s).slice(2).split('|') : [])));
export function labelledPrompts(setDir = SET_DIR) {
  const out = [];
  const csvg = JSON.parse(readFileSync(join(setDir, 'correct-svg.json'), 'utf8'));
  for (const p of csvg.prompts) {
    const ds = ['overview', 'standard', 'deep'].map(d => p[d] || p.depths?.[d]).filter(Boolean);
    const right = new Set(ds.flatMap(d => d.kinds || []).filter(k => !/^P/.test(k)).map(k => k.replace(/^D:/, '')));
    const okay = new Set([...right, ...ds.flatMap(d => d.acceptableKinds || []).map(k => k.replace(/^D:/, ''))]);
    out.push({ set: 'correct-svg', id: p.id, prompt: p.prompt, right, okay, bad: new Set() });
  }
  const aiml = JSON.parse(readFileSync(join(setDir, 'aiml.json'), 'utf8'));
  for (const p of aiml.prompts) {
    const right = kindsOf(p.best || []); right.delete('*');
    out.push({ set: 'aiml', id: p.id, prompt: p.prompt, right, okay: new Set([...right, ...kindsOf(p.acceptable || [])]), bad: new Set(p.badKinds || []) });
  }
  return out;
}
const ok = (p, k) => !p.bad.has(k) && (p.okay.has(k) || p.okay.has('*'));

// -> { rows, detail, mismatches }: per set, coverage, kind-right and right-or-acceptable shares of the selected examples, prompts given a wrong-kind example.
export async function selectorBench({ tree, setDir = SET_DIR } = {}) {
  const imp = p => import(pathToFileURL(resolve(tree, p)).href);
  const { diagramReferences } = await imp('packages/web/src/tutor-diagrams/reference-library.js');
  const prod = await imp(SELECTOR_FILE);
  const examples = JSON.parse(readFileSync(resolve(tree, 'packages/web/src/tutor-diagrams/examples.json'), 'utf8'));
  const prompts = labelledPrompts(setDir), detail = [], mismatches = [];
  for (const p of prompts) {
    let refs = pick(diagramReferences, p.prompt);
    if (!refs.length && prod.fallbackKind) { const kind = prod.fallbackKind(p.prompt), spec = kind && examples.find(e => e.diagram.kind === kind); if (spec) refs = [{ id: `shape-${kind}`, spec, score: 0, shape: true }]; }
    const production = prod.selectDiagramReferences({ prompt: p.prompt, context: {}, requiredKinds: [] }).map(r => r.id);
    if (refs.map(r => r.id).join() !== production.join()) mismatches.push({ id: p.id, copy: refs.map(r => r.id), production });
    detail.push({ set: p.set, id: p.id, prompt: p, refs: refs.map(r => ({ id: r.id, kind: r.spec.diagram.kind, score: r.score, ...(r.shape ? { shape: true } : {}) })) });
  }
  const rows = [...new Set(prompts.map(p => p.set))].map(set => {
    const ds = detail.filter(d => d.set === set), ex = ds.flatMap(d => d.refs.map(r => ({ p: d.prompt, k: r.kind })));
    const right = ex.filter(e => e.p.right.has(e.k)).length, okay = ex.filter(e => ok(e.p, e.k)).length, pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
    return { set, prompts: ds.length, 'given an example': ds.filter(d => d.refs.length).length, examples: ex.length, 'kind right': `${right}/${ex.length} ${pct(right, ex.length)}`,
      'right or acceptable': `${okay}/${ex.length} ${pct(okay, ex.length)}`, 'prompts with a wrong-kind example': `${ds.filter(d => d.refs.some(r => !ok(d.prompt, r.kind))).length}/${ds.length}`,
      'shape examples (right kind)': (sh => `${sh.length} (${sh.filter(d => d.prompt.right.has(d.refs[0].kind)).length} right, ${sh.filter(d => ok(d.prompt, d.refs[0].kind)).length} right or acceptable)`)(ds.filter(d => d.refs[0]?.shape)) };
  });
  return { rows, detail: detail.map(({ prompt, ...d }) => d), mismatches };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const tree = arg('--tree', resolve(HERE, '../..'));
  if (!existsSync(resolve(tree, SELECTOR_FILE))) { console.error(`no ${SELECTOR_FILE} under ${tree}; pass --tree <repo root with the selector>`); process.exit(2); }
  const out = await selectorBench({ tree });
  if (out.mismatches.length) { console.error('the copy differs from production:', JSON.stringify(out.mismatches)); process.exit(1); }
  console.table(out.rows);
  for (const d of out.detail) if (d.refs.length) console.log(`${d.set.padEnd(12)} ${d.id.padEnd(20)} ${d.refs.map(r => `${r.id}:${r.kind}`).join(', ')}`);
  const json = arg('--json'); if (json) writeFileSync(json, JSON.stringify({ tree, ...out }, null, 1));
}
