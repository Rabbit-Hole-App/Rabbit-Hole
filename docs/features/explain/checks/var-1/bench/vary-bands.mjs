// offline (no spend): for each variation run, are the delivered values inside the reference's vary bands, and did labels and structure stay the reference's?
// usage: node vary-bands.mjs <results.jsonl> <out.md>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [resultsFile = 'results.jsonl', outFile = 'vary-bands.md'] = process.argv.slice(2);
const TREE = 'C:/s/var1-bench-trees/after/packages';
const imp = f => import(pathToFileURL(`${TREE}/${f}`).href);
const { prepareArtifactAuthorRequest } = await imp('control-plane/src/learn-artifact.js');
const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
const rows = fs.readFileSync(resultsFile, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.set === 'vary');
const at = (root, path) => path.split('.').reduce((node, key) => node?.[key], root);
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const penv = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const flat = (o, p = '', acc = {}) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], p ? `${p}.${k}` : k, acc); else acc[p] = o; return acc; };
const textPath = p => /(^|\.)(title|caption|label|heading|name|categories\.\d+|unit|kind|variant|id)$/.test(p);
const shape = o => { // structure signature: kind plus the length of every array
  const sig = []; const w = (n, p) => { if (Array.isArray(n)) { sig.push(`${p}[${n.length}]`); n.forEach((x, i) => w(x, `${p}[]`)); } else if (n && typeof n === 'object') for (const k of Object.keys(n)) w(n[k], p ? `${p}.${k}` : k); }; w(o, ''); return [...new Set(sig)].sort().join(' ');
};
const out = [];
const P = s => out.push(s);
P(`# VAR-1 variation bands: ${resultsFile}\n`);
P('For each variation run: (a) every path in the reference\'s `vary` map: the delivered value, whether it lies in the band [min, max] and whether it equals the value the sampler drew for this requestSeed (the card kept the drawn input); (b) labels: text fields (title, caption, labels, categories, units, kind) of the delivered card that differ from the sampled reference, and (c) whether the array-length structure (series, points, bars, categories) is the reference\'s.\n');
P('| item | reference | authored by | in band | equals drawn | out of band (path: value vs band) | text fields changed | structure same |\n|---|---|---|---|---|---|---|---|');
const detail = [];
const tot = { paths: 0, inBand: 0, equal: 0, structSame: 0, runs: 0 };
for (const r of rows) {
  const ref = diagramReferences.find(x => x.id === r.refId);
  const drawn = quiet(() => prepareArtifactAuthorRequest(penv, { command: 'explanation', args: r.prompt, ...(r.depth !== 'balanced' ? { depth: r.depth } : {}), requestSeed: r.requestSeed })).diagramReferences.find(x => x.id === r.refId)?.spec?.diagram;
  const card = Array.isArray(r.diagrams) ? r.diagrams[0] : null;
  if (!ref || !drawn || !card) { P(`| ${r.idx} | ${r.refId} | ${r.authoredBy?.provider} | n/a | n/a | no card, no reference or no drawn spec | | |`); continue; }
  let inBand = 0, equal = 0; const outs = [];
  const entries = Object.entries(ref.vary);
  for (const [p, band] of entries) {
    const [lo, hi] = band; const v = at(card, p), d = at(drawn, p);
    const ok = typeof v === 'number' && v >= lo && v <= hi;
    if (ok) inBand++; else outs.push(`${p}: ${v === undefined ? 'missing' : v} vs [${lo}, ${hi}]`);
    if (v === d) equal++;
  }
  const fc = flat(card), fd = flat(drawn);
  const changed = [...new Set([...Object.keys(fc), ...Object.keys(fd)])].filter(k => textPath(k) && fc[k] !== fd[k]);
  const same = shape(card) === shape(drawn);
  tot.runs++; tot.paths += entries.length; tot.inBand += inBand; tot.equal += equal; tot.structSame += same ? 1 : 0;
  P(`| ${r.idx} | ${r.refId} | ${r.authoredBy?.provider} | ${inBand}/${entries.length} | ${equal}/${entries.length} | ${outs.join('; ') || 'none'} | ${changed.length} | ${same ? 'yes' : 'NO'} |`);
  detail.push(`### item ${r.idx} ${r.refId} (${r.requestSeed})\ntext changed: ${changed.slice(0, 10).map(k => `${k}: "${String(fd[k]).slice(0, 40)}" -> "${String(fc[k]).slice(0, 40)}"`).join('; ') || 'none'}\nshape reference: ${shape(drawn).slice(0, 200)}\nshape card:      ${shape(card).slice(0, 200)}\n`);
}
P(`\nTotals: ${tot.runs} runs with a card; vary paths in band ${tot.inBand}/${tot.paths}; equal to the drawn value ${tot.equal}/${tot.paths}; structure same ${tot.structSame}/${tot.runs}.\n`);
P(detail.join('\n'));
fs.writeFileSync(outFile, out.join('\n') + '\n');
console.log(out.slice(0, rows.length + 6).join('\n'));
