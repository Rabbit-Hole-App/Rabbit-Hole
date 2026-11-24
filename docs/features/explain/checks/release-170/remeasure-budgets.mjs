// One-off (not committed): recompute figure-chapter-token-budgets.json entries the way the test checks them and the topic pipeline writes them
// (scripts/topic-pipeline/author-runtime.mjs lines 123-130; countSpecTokens = js-tiktoken cl100k_base on JSON.stringify(spec), reference-linter.mjs line 87).
// usage: node remeasure-budgets.mjs <treeRoot> [--write]
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2], write = process.argv.includes('--write');
const { getEncoding } = await import(pathToFileURL('C:/s/topics-wt/what-is-machine-learning/node_modules/js-tiktoken/dist/index.js').href).catch(() => import(pathToFileURL('C:/s/topics-wt/what-is-machine-learning/node_modules/js-tiktoken/index.js').href));
const encoding = getEncoding('cl100k_base');
const dir = root + '/packages/web/src/tutor-diagrams/';
const { figureChapterReferences } = await import(pathToFileURL(dir + 'figure-chapter-references.js').href);
const file = dir + 'figure-chapter-token-budgets.json';
const raw = fs.readFileSync(file, 'utf8'), budgets = JSON.parse(raw);
let same = 0; const changed = [];
for (const ref of figureChapterReferences) for (const depth of ['overview', 'standard', 'deep']) {
  const { spec, detailSpec } = { ...ref, ...ref.depths?.[depth] };
  [spec, detailSpec].filter(Boolean).forEach((visual, index) => {
    const json = JSON.stringify(visual);
    const entry = { tokens: encoding.encode(json, [], []).length, sha256: createHash('sha256').update(json).digest('hex') };
    const old = budgets.refs[ref.id][depth][index];
    if (old.tokens === entry.tokens && old.sha256 === entry.sha256) { same++; return; }
    changed.push(`${ref.id}/${depth}[${index}] tokens ${old.tokens}->${entry.tokens}`);
    budgets.refs[ref.id][depth][index] = entry;
  });
}
console.log(`refs ${figureChapterReferences.length}, entries unchanged ${same}, changed ${changed.length}`);
for (const line of changed) console.log('  ' + line);
if (write) {
  const crlf = raw.includes('\r\n');
  const out = JSON.stringify(budgets, null, 2) + '\n';
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
}
