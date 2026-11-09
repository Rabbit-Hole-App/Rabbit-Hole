// Codex set 3 replay (kept next to the bench it extends; scripts/explain-bench stays the source of truth for the ledger): validates the paraphrase sets against the
// originals, runs the selector bench on both, and scores saved planner rows (rows.json of planner.mjs runs) with the planner's own scorer. No model call.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SET_NAMES = ['correct-svg', 'aiml'];
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '../..');
const PARAPHRASES = join(HERE, 'sets/paraphrases');
const promptKey = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

export function validateParaphraseSet(original, paraphrased) {
  assert.equal(paraphrased.name, original.name);
  const parents = new Map(original.prompts.map(({ id, prompt, ...labels }) => [id, labels]));
  const texts = new Set(original.prompts.map(p => promptKey(p.prompt)));
  const counts = new Map();
  for (const { id, sourceId, prompt, ...labels } of paraphrased.prompts) {
    assert.ok(parents.has(sourceId), `Unknown parent for ${id}`);
    assert.deepEqual(labels, parents.get(sourceId), `Changed labels for ${id}`);
    const count = (counts.get(sourceId) ?? 0) + 1;
    assert.equal(id, `${sourceId}-p${count}`);
    counts.set(sourceId, count);
    const key = promptKey(prompt);
    assert.ok(key && !texts.has(key), `Expected distinct learner wording for ${id}`);
    texts.add(key);
  }
  for (const id of parents.keys()) assert.equal(counts.get(id), 5, `Expected five paraphrases of ${id}`);
}

const caseKey = ({ set, id, depth }) => `${set}/${id}/${depth}`;

export function scorePlannerReplay(cases, capturedRows, { planOf, summarize }) {
  const expected = new Map(cases.map(c => [caseKey(c), c]));
  const seen = new Set();
  const rows = capturedRows.map(({ set, id, depth, prompt, answers, usage, ms, error }) => {
    const key = caseKey({ set, id, depth });
    const c = expected.get(key);
    assert.ok(c, `Unknown recorded planner case ${key}`);
    assert.ok(!seen.has(key), `Duplicate recorded planner case ${key}`);
    assert.equal(prompt, c.prompt, `Recorded prompt differs for ${key}`);
    seen.add(key);
    if (answers) return { ...c, answers, usage, ms, plan: planOf(answers) };
    assert.ok(error, `Recorded planner case ${key} has neither answers nor an error`);
    return { ...c, error };
  });
  const answered = rows.filter(r => r.answers).length;
  return {
    cases: cases.length,
    answered,
    errors: rows.length - answered,
    missing: cases.length - rows.length,
    summary: answered ? summarize(rows) : null,
  };
}

function plannerReport(cases, file, planner) {
  return scorePlannerReplay(cases, file ? readJson(file) : [], planner);
}

async function main() {
  const { values } = parseArgs({ options: {
    'bench-dir': { type: 'string' }, // default: this directory (selector.mjs, planner.mjs and sets/ live beside this script)
    tree: { type: 'string', default: ROOT },
    out: { type: 'string' },
    'planner-original-rows': { type: 'string' },
    'planner-paraphrase-rows': { type: 'string' },
  } });
  const benchDir = resolve(values['bench-dir'] ?? HERE);
  const originalDir = join(benchDir, 'sets');
  for (const name of SET_NAMES) {
    validateParaphraseSet(readJson(join(originalDir, `${name}.json`)), readJson(join(PARAPHRASES, `${name}.json`)));
  }
  const fromBench = name => import(pathToFileURL(join(benchDir, name)).href);
  const [{ selectorBench }, planner] = await Promise.all([fromBench('selector.mjs'), fromBench('planner.mjs')]);
  const tree = resolve(values.tree);
  const [originals, paraphrases] = await Promise.all([
    selectorBench({ tree, setDir: originalDir }),
    selectorBench({ tree, setDir: PARAPHRASES }),
  ]);
  assert.deepEqual([...originals.mismatches, ...paraphrases.mismatches], [], 'Selector bench and production picks differ');
  const report = {
    selector: { originals, paraphrases },
    planner: {
      originals: plannerReport(planner.cases(originalDir), values['planner-original-rows'], planner),
      paraphrases: plannerReport(planner.cases(PARAPHRASES), values['planner-paraphrase-rows'], planner),
    },
  };
  console.table(Object.entries(report.selector).flatMap(([corpus, result]) => result.rows.map(row => ({ corpus, ...row }))));
  for (const [corpus, result] of Object.entries(report.planner)) {
    console.log(`Planner ${corpus}: ${result.answered}/${result.cases} recorded answers, ${result.errors} errors, ${result.missing} missing`);
    if (result.summary) console.table(result.summary);
  }
  if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
