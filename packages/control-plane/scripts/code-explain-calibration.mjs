// The code-explain calibration (docs tutor-prompts-and-routing.md section 8a): the thirteen questions on nanoGPT, run through the real handler
// (src/learn-code-explain.js runCodeExplain), with the real model when ANTHROPIC_API_KEY is in the environment (read by name, never printed).
// Each row records pass/fail against its checks (the checkable conditions implemented mechanically; what only a reader can judge is listed
// as `review`), tokens and cost. Output: a markdown table and a JSON file.
//
//   ANTHROPIC_API_KEY=... node scripts/code-explain-calibration.mjs [--rows 1,2,13] [--out <dir>]     (from packages/control-plane; about US$1.30 for all thirteen)
//   node scripts/code-explain-calibration.mjs --preflight                                              (no key, no model call: builds every row's prompt and checks its size)
//
// The fixture is the repo's nanoGPT snapshot (web/e2e/nanogpt-repository-fixture.mjs: the real files at commit 3adf61e and a graph in the indexer's shape).
// Pass = every check holds AND the validator accepted the output on the first try (prompts file 8a); a row that only validated after the re-ask shows
// `valid` but not `firstTry`. Rows 11-13 also get cross-row checks (same facts, different emphasis) computed after all three have run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SNAPSHOT as WEB_SNAPSHOT, content, COMMIT } from '../../web/e2e/nanogpt-repository-fixture.mjs';
import { runCodeExplain, sentencesOf, gatherCode, userMessage, relationshipLines, estimateTokens, CODE_EXPLAIN_MODEL, CODE_EXPLAIN_TOOL } from '../src/learn-code-explain.js';
import { composeTutorPrompt } from '../src/tutor-prompt.js';

// The control plane's snapshot shape: files are { path: text }.
export const SNAPSHOT = { repo: 'karpathy/nanoGPT', commit: COMMIT, skipped: [], graph: WEB_SNAPSHOT.graph, files: content };

// A range spec -> a code ref. from/to: a 1-based line number or a RegExp (first match at or after `from`); no `from`: the whole file.
const lineOf = (path, spec, after = 1) => {
  if (typeof spec === 'number') return spec;
  const lines = content[path].split('\n');
  for (let i = after - 1; i < lines.length; i++) if (spec.test(lines[i])) return i + 1;
  throw new Error(`calibration fixture: ${spec} not found in ${path} after line ${after}`);
};
const ref = ({ path, from, to, after }) => {
  const start = from === undefined ? 1 : lineOf(path, from, after ? lineOf(path, after) : 1), end = from === undefined ? content[path].split('\n').length : lineOf(path, to ?? from, start);
  return { sourceId: `code:${SNAPSHOT.repo}@${COMMIT}:${path}`, kind: 'code', name: path, version: COMMIT, range: { path, start, end } };
};
const MASK = [{ path: 'model.py', from: /register_buffer\("bias"/ }, { path: 'model.py', from: /def forward\(self, x\):/, to: /y = self\.resid_dropout/ }];
const DEFAULTS = [{ path: 'sample.py', from: /^init_from = /, to: /^exec\(open\('configurator/ }];

// ---- the checks -------------------------------------------------------------------------------------------------------------------------
const proseOf = (card, depth) => card?.depths?.[depth]?.prose ?? '';
const allProse = card => ['brief', 'standard', 'detailed'].map(d => proseOf(card, d)).join(' ');
const SYMBOL = /`|\w+_\w+|\w+\(\)|\.\w+\(|\bself\b/;
// A line of `path` is covered by an anchor of the Standard depth (its target is a range or mention that holds the line).
const covers = (card, path, line) => {
  const spans = new Map();
  for (const f of card.files) for (const r of f.ranges) spans.set(r.id, { path: f.path, ...r });
  for (const m of card.mentioned) spans.set(m.id, m);
  return card.depths.standard.anchors.some(a => { const s = spans.get(a.target); return s && s.path === path && s.start <= line && line <= s.end; });
};
const lineAt = (path, pattern) => lineOf(path, pattern);
const mentionsPath = (card, test) => card.mentioned.some(m => test.test(m.path)) || card.files.some(f => test.test(f.path) && false);
const check = (name, ok, detail = '') => ({ name, ok: !!ok, ...(detail ? { detail } : {}) });
const standard = card => proseOf(card, 'standard');
const lastSentence = prose => sentencesOf(prose).at(-1) ?? '';

const common = (row, { card, firstTry, codeText }) => {
  const out = [check('valid', !!card, card ? '' : 'no card'), check('firstTry', firstTry)];
  if (!card) return out;
  const brief = sentencesOf(proseOf(card, 'brief'));
  out.push(check('brief <= 2 sentences', brief.length <= 2, `${brief.length}`));
  const q = row.question.toLowerCase();
  const symbols = (proseOf(card, 'brief').match(new RegExp(SYMBOL.source, 'g')) ?? []).filter(s => !q.includes(s.replace(/`/g, '').toLowerCase()));
  out.push(check('brief names no symbol the question did not', symbols.length === 0, symbols.join(' ')));
  out.push(check('trace only on detailed', !('trace' in card.depths.brief) && !('trace' in card.depths.standard)));
  if (row.trace) out.push(check('detailed has a trace', !!card.depths.detailed.trace));
  const ungrounded = [...new Set([proseOf(card, 'brief'), standard(card)].join(' ').match(/\b\d[\d,.]*\d\b/g) ?? [])].filter(n => !codeText.includes(n) && !row.question.includes(n));
  out.push(check('numbers in Brief and Standard come from the code', ungrounded.length === 0, ungrounded.join(' ')));
  out.push(check('prose never names the use case', !/use_codebase|debug_behavior|\buse case\b|use the codebase|fix something|change something/i.test(allProse(card))));
  if (row.figure === 'null') out.push(check('figure is null', card.figure === null, card.figure?.referenceId ?? ''));
  return out;
};

// id, the added code, the question, the goal (use), what is checkable, and what only a reader can judge.
export const ROWS = [
  { n: 1, refs: MASK, question: 'how does attention hide later tokens?', use: null, trace: true, figure: 'any',
    checks: card => [check('Standard anchors the mask buffer line', covers(card, 'model.py', lineAt('model.py', /register_buffer\("bias"/))), check('Standard anchors the masked_fill line', covers(card, 'model.py', lineAt('model.py', /att = att\.masked_fill/)))],
    review: 'matches the section 5c example in structure; BRIEF symbol-free; trace at DETAILED only' },
  { n: 2, refs: [{ path: 'configurator.py' }], question: 'how do my --flags end up changing train.py?', use: null, trace: false, figure: 'null',
    checks: card => [check('Standard anchors the exec(open(config_file)) line', covers(card, 'configurator.py', lineAt('configurator.py', /exec\(open\(config_file\)/))), check('Standard anchors the globals() assert', covers(card, 'configurator.py', lineAt('configurator.py', /assert type\(attempt\)/)) || covers(card, 'configurator.py', lineAt('configurator.py', /if key in globals/))),
      check('mentioned names train.py', mentionsPath(card, /(^|\/)train\.py$/))],
    review: 'BRIEF says in plain words that it rewrites the script\'s settings before training starts' },
  { n: 3, refs: [{ path: 'sample.py', from: /^# look for the meta pickle/, to: 89 }], question: 'why does the output start with my --start text?', use: null, trace: true, figure: 'any',
    checks: card => [check('Standard anchors the decode(y[0]) line', covers(card, 'sample.py', lineAt('sample.py', /decode\(y\[0\]/)))],
    review: 'DETAILED trace shows the prompt tokens prepended' },
  { n: 4, refs: [{ path: 'data/shakespeare_char/prepare.py' }], question: 'what does meta.pkl contain and who reads it?', use: null, trace: false, figure: 'null',
    checks: card => [check('mentioned names sample.py', mentionsPath(card, /(^|\/)sample\.py$/)), check('no keys beyond vocab_size, itos, stoi', !/\b(block_size|n_layer|n_embd|encoding|chars)\b/.test(allProse(card)))],
    review: 'mentioned holds sample.py\'s meta load line; no invented keys' },
  { n: 5, refs: [{ path: 'train.py', from: /if iter_num % eval_interval == 0/, to: /torch\.save\(checkpoint/ }], question: 'when is ckpt.pt written?', use: null, trace: false, figure: 'any',
    checks: card => [check('Standard states the improvement condition', /best_val_loss|always_save_checkpoint|val(idation)? loss|improv|lower/i.test(standard(card))), check('Standard states the iter_num > 0 condition', /iter_num|first (evaluation|step|iteration)|step 0|iteration 0|> ?0|zero/i.test(standard(card))),
      check('mentioned cites the config (eval_interval)', mentionsPath(card, /^config\//))],
    review: 'both conditions from the code; first possible save at step 250 with the config\'s eval_interval' },
  { n: 6, refs: [{ path: 'model.py', after: /class GPT\(nn\.Module\)/, from: /def __init__\(self, config\)/, to: /self\.transformer\.wte\.weight = self\.lm_head\.weight/ }], question: 'why are the embedding and output weights the same?', use: null, trace: false, figure: 'any',
    checks: card => [check('names the weight tying', /tying|tied|share|same (weights|matrix)/i.test(allProse(card))), check('no external paper claims', !/\b(Press and Wolf|Press & Wolf|et al|arXiv|2017)\b/.test(allProse(card)))],
    review: 'DETAILED gives the stated reason only if the code\'s comment says it' },
  { n: 7, refs: [{ path: 'train.py', from: /def get_lr/, to: /return min_lr \+ coeff/ }], question: 'how does the learning rate change over training?', use: null, trace: true, figure: 'any',
    checks: card => [check('Standard anchors three places', card.depths.standard.anchors.length >= 3, `${card.depths.standard.anchors.length}`), check('mentioned cites the config', mentionsPath(card, /^config\//))],
    review: 'three phases in run order; the trace uses the config\'s numbers' },
  { n: 8, refs: MASK, question: 'can the model see the future?', use: null, trace: false, figure: 'any',
    checks: card => { const s = sentencesOf(proseOf(card, 'brief')); return [check('Brief has a second sentence', s.length === 2), check('the second sentence corrects the premise', /\b(no|not|never|cannot|can't|only|hidden|blank|mask|before)/i.test(s[1] ?? ''), s[1] ?? '')]; },
    review: 'the correction is the right one: a position sees only earlier ones' },
  { n: 9, refs: [{ path: 'bench.py' }], question: 'how fast is this on my GPU?', use: null, trace: false, figure: 'null',
    checks: card => [check('the last Standard sentence names a file or line it would need', /[\w./-]+\.py(:\d+)?|:\d+/.test(lastSentence(standard(card))), lastSentence(standard(card))), check('no invented throughput', !/\b\d+(\.\d+)?\s*(ms|milliseconds|tokens\/s|tokens per second|it\/s|TFLOPS|%)/.test(allProse(card)))],
    review: 'STANDARD ends with one sentence saying the code cannot answer, and what it would need' },
  { n: 10, refs: [{ path: 'model.py', from: 1, to: 20 }], question: 'what does compile do here?', use: null, trace: false, figure: 'any',
    checks: card => [check('mentioned names train.py', mentionsPath(card, /(^|\/)train\.py$/) || mentionsPath(card, /(^|\/)sample\.py$/))],
    review: 'names the compile line elsewhere; describes no behaviour it was not shown' },
  { n: 11, refs: DEFAULTS, question: 'what do these settings do?', use: 'use_codebase', trace: false, figure: 'any',
    checks: card => [check('Standard speaks of the output each knob changes', /output|sample|generat|text|longer|random/i.test(standard(card)))],
    review: 'one suggestion is a knob to try; BRIEF has the same structure as row 13' },
  { n: 12, refs: DEFAULTS, question: 'what do these settings do?', use: 'debug_behavior', trace: false, figure: 'any',
    checks: card => [check('Standard speaks of what goes wrong with a bad value', /assert|type|wrong|error|fail|invalid|bad|break|mismatch/i.test(standard(card)))],
    review: 'one suggestion is a way to confirm a cause; facts identical to row 11' },
  { n: 13, refs: DEFAULTS, question: 'what do these settings do?', use: null, trace: false, figure: 'any', checks: () => [], review: 'the neutral reading; rows 11-13 agree on every fact' },
];

// Rows 11-13: the same code, three goals. Mechanical part: structure and emphasis differ the way the overlays intend.
const crossChecks = results => {
  const [r11, r12, r13] = [11, 12, 13].map(n => results.find(r => r.n === n)?.card);
  if (!r11 || !r12 || !r13) return [check('rows 11-13 all produced a card', false)];
  const sets = [r11, r12, r13].map(c => c.suggestions.join('|'));
  return [
    check('BRIEF has the same sentence count in rows 11 and 13', sentencesOf(proseOf(r11, 'brief')).length === sentencesOf(proseOf(r13, 'brief')).length),
    check('the suggestions differ between the three goals', new Set(sets).size === 3),
    check('Standard differs between the goals (emphasis)', new Set([standard(r11), standard(r12), standard(r13)]).size === 3),
  ];
};

// ---- the run ----------------------------------------------------------------------------------------------------------------------------
// The real transport: the Messages API with the key read by name. Same call shape as ask.js anthropicTransport for an explicit model (no fallbacks).
const apiCall = key => async (env, body, model) => fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'user-agent': 'code-explain-calibration/1' }, body: JSON.stringify({ model, ...body }),
});

async function preflight(rows) {
  for (const row of rows) {
    const refs = row.refs.map(ref), code = gatherCode(SNAPSHOT, refs);
    const message = userMessage({ question: row.question, snapshot: SNAPSHOT, code: code.text, relationships: relationshipLines(SNAPSHOT, code.shown), fileNames: Object.keys(SNAPSHOT.files).join(', ') });
    const system = composeTutorPrompt({ task: 'code-explain', use: row.use }).text;
    console.log(`row ${String(row.n).padStart(2)}  code lines ${code.shown.reduce((n, s) => n + s.end - s.start + 1, 0)}  est. input tokens ${estimateTokens(system, message, JSON.stringify(CODE_EXPLAIN_TOOL))}  ${row.question}`);
  }
}

export async function runCalibration({ rows = ROWS, key, out = null, callModel = apiCall(key) } = {}) {
  const results = [];
  for (const row of rows) {
    const refs = row.refs.map(ref), code = gatherCode(SNAPSHOT, refs);
    const log = console.log; console.log = () => {}; // the handler's operator lines are not this report
    let r;
    try { r = await runCodeExplain({ env: {}, snapshot: SNAPSHOT, question: row.question, refs, use: row.use, callModel }); } finally { console.log = log; }
    const card = r.codeExplain, checks = common(row, { card, firstTry: r.firstTry, codeText: code.text });
    if (card) { try { checks.push(...row.checks(card)); } catch (error) { checks.push(check('row checks ran', false, error.message)); } }
    results.push({ n: row.n, question: row.question, use: row.use, pass: checks.every(c => c.ok), valid: !!card, firstTry: r.firstTry, attempts: r.attempts, reason: r.reason ?? null, checks, review: row.review,
      inputTokens: r.usage.input, outputTokens: r.usage.output, usd: Number(r.usage.usd.toFixed(4)), figure: card ? card.figure?.referenceId ?? null : null, card, answer: r.answer });
    console.error(`row ${row.n}: ${results.at(-1).pass ? 'pass' : 'FAIL'}${card ? '' : ` (${r.reason})`}`);
  }
  const cross = rows.some(r => r.n >= 11) ? crossChecks(results) : [];
  const summary = { model: CODE_EXPLAIN_MODEL, commit: COMMIT, at: new Date().toISOString(), rows: results.length, passed: results.filter(r => r.pass).length, usd: Number(results.reduce((n, r) => n + r.usd, 0).toFixed(4)), cross };
  const report = { summary, results };
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'code-explain-calibration.json'), JSON.stringify(report, null, 2)); writeFileSync(join(out, 'code-explain-calibration.md'), markdown(report)); }
  return report;
}

export function markdown({ summary, results }) {
  const head = `# Code-explain calibration (${summary.model}, nanoGPT ${summary.commit.slice(0, 7)}, ${summary.at})\n\n${summary.passed}/${summary.rows} rows pass, cost US$${summary.usd}\n\n`;
  const rows = results.map(r => `| ${r.n} | ${r.question} | ${r.use ?? 'none'} | ${r.pass ? 'pass' : 'FAIL'} | ${r.valid ? (r.firstTry ? 'first try' : `after ${r.attempts} tries`) : 'no card'} | ${r.checks.filter(c => !c.ok).map(c => c.name + (c.detail ? ` (${c.detail})` : '')).join('; ') || (r.reason ?? '')} | ${r.inputTokens} / ${r.outputTokens} | ${r.usd} | ${r.figure ?? ''} | ${r.review} |`);
  const cross = summary.cross.length ? `\n\nRows 11-13 together: ${summary.cross.map(c => `${c.ok ? 'pass' : 'FAIL'} ${c.name}`).join('; ')}\n` : '';
  return `${head}| # | question | goal | result | validator | failed checks | tokens in / out | USD | figure | a reader still checks |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}${cross}\n`;
}

// ---- the command line -------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? true; };
  const only = flag('--rows') ? new Set(String(flag('--rows')).split(',').map(Number)) : null;
  const rows = only ? ROWS.filter(r => only.has(r.n)) : ROWS;
  if (args.includes('--preflight')) { await preflight(rows); process.exit(0); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('ANTHROPIC_API_KEY is not set (it is read by name from the environment). Use --preflight to check the rows without a model call.'); process.exit(2); }
  const report = await runCalibration({ rows, key, out: flag('--out') && flag('--out') !== true ? flag('--out') : 'code-explain-calibration-out' });
  console.log(markdown(report));
  process.exit(report.summary.passed === report.summary.rows && report.summary.cross.every(c => c.ok) ? 0 : 1);
}
