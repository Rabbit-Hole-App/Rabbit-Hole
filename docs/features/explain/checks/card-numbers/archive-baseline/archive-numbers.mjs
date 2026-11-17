// archive-numbers.mjs: read-only baseline of definitional number errors in the production explain archive.
// R2 bucket rabbit-hole-prod-learn-media, prefix explain-archive/, LIST + GET only. Credentials are read by name from the owner .env in memory and never printed.
// Raw records are real learners' data: cached ONLY in raw-local/ (delete after the run). Every output holds ids, day, depth, kind, model and numbers only.
// Usage: node archive-numbers.mjs   (writes counts.json and archive-numbers.md next to this file)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELFTEST = process.argv[2] === '--selftest'; // asserts the rule functions on synthetic specs, no network
const RAW = path.join(HERE, 'raw-local');
const CUTOFF = '2026-11-14T07:40:00.000Z'; // release 132 = 2026-11-13T23:40 PT
const CUTOFF_DAY = CUTOFF.slice(0, 10);
const REPO = 'C:/Users/cyudhist/Desktop/workspace/small-parallel'; // git object store only; nothing is written to it
const SOURCES = { release: '65164f68673631bbf2762f5a47d508990d6d4728', cn: '3ecab0496' }; // the RELEASE_SHA the archive records carry; feat/card-numbers tip
const NODE_MODULES = 'C:/s/card-numbers/node_modules';
fs.mkdirSync(RAW, { recursive: true });

// ---- credentials, by name, in memory only
const envText = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = name => { const l = envText.split(/\r?\n/).find(x => x.startsWith(name + '=')); if (!l) throw new Error(`${name} missing`); return l.slice(name.length + 1).trim().replace(/^["']|["']$/g, ''); };
const TOKEN = secret('CLOUDFLARE_API_TOKEN'), ACCOUNT = secret('CLOUDFLARE_ACCOUNT_ID');
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/rabbit-hole-prod-learn-media/objects`;
const api = async url => { const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }); if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split('?')[0].replace(ACCOUNT, '<account>')}`); return r; };

// ---- 1. list (GET only)
const keys = [];
for (let cursor = ''; !SELFTEST;) {
  const j = await (await api(`${BASE}?prefix=explain-archive/&per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json();
  keys.push(...j.result.map(o => ({ key: o.key, modified: o.last_modified })));
  if (!j.result_info?.is_truncated && !j.result_info?.cursor) break;
  cursor = j.result_info.cursor; if (!cursor) break;
}
const dayOf = k => k.split('/')[1];
const idOf = k => k.split('/').pop().replace(/\.json$/, '');
const listedBeforeByDay = keys.filter(k => dayOf(k.key) < CUTOFF_DAY).length; // a key's day is the UTC day of the write, which is never before `at`
const toRead = keys.filter(k => dayOf(k.key) >= CUTOFF_DAY);

// ---- 2. download to raw-local (skip cached), parse
const records = [], unparsed = [];
for (const k of SELFTEST ? [] : toRead) {
  const f = path.join(RAW, idOf(k.key) + '.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, await (await api(`${BASE}/${encodeURIComponent(k.key)}`)).text());
  try { records.push({ ...JSON.parse(fs.readFileSync(f, 'utf8')), _id: idOf(k.key), _day: dayOf(k.key) }); } catch (e) { unparsed.push({ id: idOf(k.key), why: 'JSON parse: ' + e.message.slice(0, 60) }); }
}
const since = records.filter(r => typeof r.at === 'string' && r.at >= CUTOFF);
const beforeInRead = records.filter(r => !(typeof r.at === 'string' && r.at >= CUTOFF)).length;
const sorted = records.map(r => r.at).filter(Boolean).sort();

// ---- 3. the repo's own validators, extracted from the exact release and from feat/card-numbers
const validators = {};
for (const [name, sha] of Object.entries(SOURCES)) {
  const dir = path.join(HERE, 'src-' + name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['-C', REPO, 'archive', sha, 'packages/web/src/tutor-diagrams', 'packages/web/src/math-tokens.js'], { maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    fs.symlinkSync(NODE_MODULES, path.join(dir, 'node_modules'), 'junction'); // so zod resolves; remove with rmdir, never rm -rf
  }
  validators[name] = (await import(pathToFileURL(path.join(dir, 'packages/web/src/tutor-diagrams/spec.js')).href)).parseTutorDiagram;
}
const { checkCard } = await import(pathToFileURL('C:/s/sprint2-evidence/card-errors/checks.mjs').href);

// ---- 4. rules. enforced = does the SERVER (parseTutorDiagram on the carried release / on feat/card-numbers) already reject a violation of it
const RULES = {
  'box-fence-arithmetic': { kind: 'box-plot', text: 'fences = Q1 - 1.5 x IQR and Q3 + 1.5 x IQR (tolerance half a unit of the last decimal written)', release: false, cn: true },
  'box-outlier-inside-fence': { kind: 'box-plot', text: 'every outlier strictly outside the fences (whiskers when no fences)', release: true, cn: true },
  'stacked-total': { kind: 'bar-chart (stacked, total stated)', text: 'parts sum to the stated total (half a unit of the last decimal per part)', release: true, cn: true },
  'token-links-normalized': { kind: 'token-links', text: 'normalized query weights sum to 1 (0.98 to 1.02)', release: true, cn: true },
  'histogram-proportion-sum': { kind: 'histogram (measure proportion)', text: 'bin proportions in [0,1] and sum to 1 (1e-6)', release: true, cn: true },
  'heatmap-range-encloses': { kind: 'heatmap', text: 'every cell inside the stated colour range (range encloses min and max)', release: true, cn: true },
  'plot-reference-stat': { kind: 'coordinate-plot', text: 'reference line labelled mean/average/median equals that statistic of the plotted values (half a unit of its last decimal)', release: false, cn: false },
};
const INFO = {
  'bar-unit-sum': 'bar-chart (basic) with a probability/percent unit: values sum to 1 / 100 (informational; grouped or ranking charts need not sum)',
  'softmax-recompute': 'transformation labelled softmax: after = softmax(before) within 0.011 (checks.mjs; informational)',
  'transformation-probabilities-sum': 'transformation labelled softmax/probability: after items sum to 1 (checks.mjs; informational)',
};
// No definitional rule exists for these in the schema (reported as examined, never as violations): a waterfall states no closing total (the renderer derives it); a t-account states no balance (the renderer derives it).
const NO_RULE = { waterfall: 'opening + changes: the closing is derived by the renderer, no total is stated in the schema', 't-account': 'debits and credits: the balance is derived by the renderer, no balance is stated in the schema' };

const dec = v => (String(v).split('.')[1] ?? '').length;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = v => (typeof v === 'number' ? +v.toFixed(6) : v);

function runRules(d) { // d: one diagram object -> { rule: { examined, violations: [{ stated, correct }] } }
  const out = {}; const add = (rule, bad) => { (out[rule] ??= { examined: 0, violations: [] }).examined++; if (bad) out[rule].violations.push(bad); };
  switch (d.kind) {
    case 'box-plot': for (const b of d.boxes ?? []) {
      if (b.fences) { const places = Math.max(0, ...[b.q1, b.q3, b.fences.lower, b.fences.upper].map(dec)), spread = 1.5 * (b.q3 - b.q1), low = b.q1 - spread, high = b.q3 + spread, tol = 0.5 * 10 ** -places + 1e-9;
        add('box-fence-arithmetic', Math.abs(b.fences.lower - low) > tol || Math.abs(b.fences.upper - high) > tol ? { stated: `fences ${b.fences.lower} / ${b.fences.upper} (Q1 ${b.q1}, Q3 ${b.q3})`, correct: `${fmt(low)} / ${fmt(high)}` } : null); }
      const lo = b.fences?.lower ?? b.whiskerLow, hi = b.fences?.upper ?? b.whiskerHigh;
      for (const o of b.outliers ?? []) add('box-outlier-inside-fence', o.value >= lo && o.value <= hi ? { stated: `outlier ${o.value}`, correct: `outside ${lo} / ${hi}` } : null);
    } break;
    case 'bar-chart':
      if (d.variant === 'stacked' && d.bars && d.total !== undefined) { const places = Math.max(dec(d.total), ...d.bars.map(x => dec(x.value))), sum = d.bars.reduce((a, x) => a + x.value, 0);
        add('stacked-total', Math.abs(sum - d.total) > d.bars.length * 0.5 * 10 ** -places + 1e-9 ? { stated: `total ${d.total}`, correct: `parts sum ${fmt(sum)}` } : null); }
      if (!d.variant && d.bars && /probab|%|percent|share|proportion/i.test(d.unit ?? '')) { const v = d.bars.map(x => x.value), s = v.reduce((a, b) => a + b, 0), unit = v.every(x => x >= 0 && x <= 1) ? 1 : 100;
        add('bar-unit-sum', Math.abs(s - unit) > Math.max(unit === 1 ? 0.02 : 2, v.length * (unit === 1 ? 0.005 : 0.5)) ? { stated: `values sum ${fmt(s)}`, correct: String(unit) } : null); }
      break;
    case 'token-links': if (d.normalized) for (const q of d.queries ?? []) { const s = q.weights.reduce((a, b) => a + b, 0); add('token-links-normalized', s < 0.98 - q.weights.length * Number.EPSILON || s > 1.02 + q.weights.length * Number.EPSILON ? { stated: `weights sum ${fmt(s)}`, correct: '1 (0.98 to 1.02)' } : null); } break;
    case 'histogram': if (d.measure === 'proportion') for (const s of d.series ?? []) { const t = s.values.reduce((a, b) => a + b, 0); add('histogram-proportion-sum', s.values.some(v => v > 1) || Math.abs(t - 1) > 1e-6 ? { stated: `bins sum ${fmt(t)}`, correct: '1' } : null); } break;
    case 'heatmap': { const cells = (d.rows ?? []).flatMap(r => r.cells).filter(v => v !== null); if (cells.length) add('heatmap-range-encloses', Math.min(...cells) < d.range.min || Math.max(...cells) > d.range.max ? { stated: `range ${d.range.min} to ${d.range.max}`, correct: `cells ${Math.min(...cells)} to ${Math.max(...cells)}` } : null); } break;
    case 'coordinate-plot': for (const a of d.annotations ?? []) {
      const m = /\b(mean|average|median)\b/i.exec(a.label ?? ''); if (a.kind !== 'reference-line' || !m) continue;
      const stat = /median/i.test(m[1]) ? median : mean, per = (d.series ?? []).filter(s => s.points?.length >= 3).map(s => stat(s.points.map(p => p[a.axis])));
      if (!per.length) continue; // series given by formula or too few points: nothing to recompute
      const tol = 0.5 * 10 ** -dec(a.value) + 1e-9; // a line stating a statistic of the plotted samples must match one plotted series
      add('plot-reference-stat', per.some(v => Math.abs(v - a.value) <= tol) ? null : { stated: `${a.label} = ${a.value}`, correct: per.map(fmt).join(' or ') });
    } break;
  }
  if (NO_RULE[d.kind]) (out['no-rule:' + d.kind] ??= { examined: 0, violations: [] }).examined++;
  return out;
}

if (SELFTEST) {
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`selftest ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  const v = (d, r) => runRules(d)[r]?.violations.length ?? null;
  const box = (fences, outliers = []) => ({ kind: 'box-plot', boxes: [{ q1: 10, q3: 20, median: 15, whiskerLow: 5, whiskerHigh: 25, fences, outliers }] });
  eq(v(box({ lower: -5, upper: 35 }), 'box-fence-arithmetic'), 0, 'fence ok'); eq(v(box({ lower: -5, upper: 40 }), 'box-fence-arithmetic'), 1, 'fence wrong');
  eq(v(box({ lower: -5, upper: 35 }, [{ value: 35 }]), 'box-outlier-inside-fence'), 1, 'outlier on fence is inside'); eq(v(box({ lower: -5, upper: 35 }, [{ value: 36 }]), 'box-outlier-inside-fence'), 0, 'outlier outside');
  eq(v({ kind: 'bar-chart', variant: 'stacked', total: 12, bars: [{ label: 'a', value: 4 }, { label: 'b', value: 5 }] }, 'stacked-total'), 1, 'stacked total');
  eq(v({ kind: 'token-links', normalized: true, queries: [{ index: 0, weights: [0.5, 0.4] }] }, 'token-links-normalized'), 1, 'token-links'); eq(v({ kind: 'token-links', normalized: true, queries: [{ index: 0, weights: [0.5, 0.49] }] }, 'token-links-normalized'), 0, 'token-links ok');
  eq(v({ kind: 'histogram', measure: 'proportion', series: [{ values: [0.5, 0.4] }] }, 'histogram-proportion-sum'), 1, 'histogram');
  eq(v({ kind: 'heatmap', range: { min: 0, max: 1 }, rows: [{ cells: [0.2, 1.5, null] }] }, 'heatmap-range-encloses'), 1, 'heatmap');
  const plot = lbl => ({ kind: 'coordinate-plot', series: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 6 }] }], annotations: [{ kind: 'reference-line', axis: 'y', label: lbl, value: 3 }] });
  eq(v(plot('Mean'), 'plot-reference-stat'), 0, 'mean ok'); eq(v(plot('Median'), 'plot-reference-stat'), 1, 'median is 2, not 3');
  console.log('selftest ok'); process.exit(0);
}
const NUMERIC = new Set(['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'sample-set', 'waterfall', 't-account', 'number-line', 'timeline', 'tensor', 'token-links', 'transformation', 'matrix', 'figure']);
// Every diagram object in a delivered card: the rh-diagram fences of the body, plus any object with a numeric `kind` anywhere else in the returned block (a structured visuals field); nested panels are walked.
function diagramsOf(block) {
  const specs = [], seen = new Set(); let badFences = 0;
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.kind === 'string' && NUMERIC.has(o.kind) && !seen.has(o)) { seen.add(o); specs.push(o); } Object.values(o).forEach(walk); } };
  const roots = [];
  for (const m of String(block.body ?? '').matchAll(/```rh-diagram\n([\s\S]*?)```/g)) { try { const j = JSON.parse(m[1]); roots.push(j.diagram ?? j); } catch { badFences++; } }
  const { body, ...rest } = block; roots.forEach(walk); walk(rest);
  return { specs, roots, badFences, kinds: roots.map(r => r.kind) };
}
const pickModel = r => { const s = (r.steps ?? r.attempts ?? []).find(x => x.outcome === 'artifact'); if (s?.model) return { id: `${s.provider ?? '?'}/${s.model}`, from: 'steps' }; const a = r.returned?.authoredBy; return a?.model ? { id: `${a.provider ?? '?'}/${a.model}`, from: 'returned.authoredBy' } : { id: 'unknown', from: 'none' }; };

// ---- 5. evaluate
const totals = { listed: keys.length, listedBefore: listedBeforeByDay, readKeys: toRead.length, beforeInReadDays: beforeInRead, since: since.length, typedExplain: 0, typedDelivered: 0, typedOther: 0, v2JobSkipped: 0, unparsed: unparsed.length, deliveredWithNumericDiagram: 0, deliveredWithAnyDiagram: 0, badFences: 0, specs: 0, releases: {}, byDepth: {}, modelFrom: {}, planKinds: {}, kindsDelivered: {}, kindsNumeric: {}, validator: { release: { ok: 0, fail: 0 }, cn: { ok: 0, fail: 0 } } };
const perRule = {}, perModel = {}, perRecord = {}, examples = [];
const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
for (const r of since) {
  bump(totals.releases, r.release ?? 'null');
  if (r.result !== undefined && r.returned === undefined) { totals.v2JobSkipped++; continue; } // v2 scene job (explain-job.js)
  if (r.request?.command !== 'explanation') { totals.typedOther++; continue; }
  totals.typedExplain++;
  if (r.outcome !== 'artifact' || !r.returned) { totals.typedOther++; continue; }
  totals.typedDelivered++;
  const depth = r.request?.depth ?? r.returned?.depth ?? 'unknown'; bump(totals.byDepth, depth);
  const model = pickModel(r); bump(totals.modelFrom, model.from);
  bump(totals.planKinds, String(r.plan?.kind ?? 'none'));
  const { specs, roots, badFences, kinds } = diagramsOf(r.returned); totals.badFences += badFences;
  if (roots.length) totals.deliveredWithAnyDiagram++;
  const kindsHere = [...new Set(specs.map(s => s.kind))]; kinds.forEach(k => bump(totals.kindsDelivered, String(k)));
  const numeric = specs.some(s => ['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'waterfall', 't-account', 'number-line', 'token-links', 'tensor'].includes(s.kind) || s.kind === 'transformation' || s.kind === 'matrix' || s.kind === 'timeline' || s.kind === 'sample-set');
  if (numeric) { totals.deliveredWithNumericDiagram++; kindsHere.forEach(k => bump(totals.kindsNumeric, k)); }
  const m = perModel[model.id] ??= { delivered: 0, numeric: 0, rules: {} }; m.delivered++; if (numeric) m.numeric++;
  const rec = { day: r.at.slice(0, 10), depth, model: model.id, release: r.release ?? null, kinds: kinds, rules: {} };
  const seenRule = {}; // per card: examined and violated once per rule
  for (const s of specs) {
    totals.specs++;
    const wrapped = { diagram: s };
    for (const v of Object.keys(validators)) { try { validators[v](wrapped); totals.validator[v].ok++; } catch { totals.validator[v].fail++; } }
    for (const [rule, res] of Object.entries(runRules(s))) {
      const x = seenRule[rule] ??= { examined: 0, violations: 0 }; x.examined += res.examined; x.violations += res.violations.length;
      for (const bad of res.violations) examples.push({ id: r._id, kind: s.kind, rule, model: model.id, ...bad });
    }
  }
  // informational rules from checks.mjs on the same cards (softmax recompute; transformation probabilities)
  const fencesJson = roots; const card = { body: r.returned.body, diagrams: fencesJson };
  try { const flags = checkCard(card); for (const [rule, id] of [['softmax-recompute', 'softmax-recompute'], ['transformation-probabilities-sum', 'probabilities-should-sum-to-1']]) {
    const ex = flags.examined.includes(rule === 'softmax-recompute' ? 'softmax-recompute' : 'probabilities-sum'); if (!ex) continue;
    const bad = flags.filter(f => f.check === id); const x = seenRule[rule] ??= { examined: 0, violations: 0 }; x.examined++; x.violations += bad.length;
    bad.forEach(b => examples.push({ id: r._id, kind: 'transformation', rule, model: model.id, stated: b.detail.replace(/^.*?(card states|after items)/, '$1'), correct: b.detail.split(',')[0].slice(0, 80) })); } } catch (e) { unparsed.push({ id: r._id, why: 'checks.mjs: ' + e.message.slice(0, 60) }); }
  for (const [rule, x] of Object.entries(seenRule)) {
    const t = perRule[rule] ??= { cardsExamined: 0, cardsViolating: 0, itemsExamined: 0, itemsViolating: 0 }; t.cardsExamined++; t.itemsExamined += x.examined; t.itemsViolating += x.violations; if (x.violations) t.cardsViolating++;
    const mm = m.rules[rule] ??= { cardsExamined: 0, cardsViolating: 0 }; mm.cardsExamined++; if (x.violations) mm.cardsViolating++;
    rec.rules[rule] = x.violations ? 'violation' : 'ok';
  }
  perRecord[r._id] = rec;
}
totals.unparsed = unparsed.length;

// ---- 6. write counts.json and archive-numbers.md (ids, numbers, counts only)
const rangeFound = sorted.length ? { first: sorted[0], last: sorted.at(-1) } : null;
const counts = { generatedFrom: 'R2 rabbit-hole-prod-learn-media explain-archive/ (LIST+GET)', cutoff: CUTOFF, dayRangeListed: keys.length ? [dayOf(keys[0].key), dayOf(keys.at(-1).key)].sort() : null, atRange: rangeFound, totals, rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, { ...v, ...(perRule[k] ?? { cardsExamined: 0, cardsViolating: 0, itemsExamined: 0, itemsViolating: 0 }) }])),
  info: Object.fromEntries(Object.entries(INFO).map(([k, v]) => [k, { text: v, ...(perRule[k] ?? { cardsExamined: 0, cardsViolating: 0, itemsExamined: 0, itemsViolating: 0 }) }])), noRule: NO_RULE, perModel, perRecord, unparsed };
fs.writeFileSync(path.join(HERE, 'counts.json'), JSON.stringify(counts, null, 1));

const rate = (v, n) => n ? `${(100 * v / n).toFixed(1)}%` : 'n/a';
const yn = b => (b ? 'yes' : 'no');
const L = [];
L.push('# Production explain archive: definitional number checks (baseline)', '', `Source: R2 bucket rabbit-hole-prod-learn-media, prefix explain-archive/, LIST and GET only. Cutoff: records with \`at\` >= ${CUTOFF} (release 132, 2026-11-13T23:40 PT). Generated by archive-numbers.mjs. No learner text, user id or card prose appears here.`, '');
L.push('## Totals', '', '| Item | Count |', '|---|---|', `| Records listed under explain-archive/ | ${totals.listed} |`, `| Records before the cutoff (listed under an earlier UTC day, plus read records with an earlier \`at\`) | ${totals.listedBefore + totals.beforeInReadDays} |`, `| Records since 132 (\`at\` >= cutoff) | ${totals.since} |`,
  `| Typed /explain records (command explanation) | ${totals.typedExplain} |`, `| Typed /explain cards delivered (outcome artifact) | ${totals.typedDelivered} |`, `| Delivered cards with a diagram fence | ${totals.deliveredWithAnyDiagram} |`, `| Delivered cards with a numeric diagram | ${totals.deliveredWithNumericDiagram} |`, `| Diagram specs examined | ${totals.specs} |`, `| v2 scene job records skipped (carry result, not returned) | ${totals.v2JobSkipped} |`, `| Other records skipped (other commands, or not delivered) | ${totals.typedOther} |`, `| Records or fences that could not be parsed | ${totals.unparsed + totals.badFences} |`, '');
L.push(`Date range actually found: key days ${counts.dayRangeListed?.join(' to ') ?? 'none'}; \`at\` first ${rangeFound?.first ?? 'none'}, last ${rangeFound?.last ?? 'none'}.`, '');
L.push(`Release SHAs carried by the records: ${Object.entries(totals.releases).map(([k, v]) => `${k.slice(0, 9)} x${v}`).join(', ') || 'none'}.`, `Cards by depth: ${Object.entries(totals.byDepth).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`, `Diagram kinds delivered (rh-diagram fences): ${Object.entries(totals.kindsDelivered).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`, `Planner kind of delivered cards: ${Object.entries(totals.planKinds).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`, `Authoring model read from: ${Object.entries(totals.modelFrom).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'} (the attempt whose outcome is artifact; returned.authoredBy only when absent).`, '');
L.push(`Server validator (parseTutorDiagram) on every spec: release ${SOURCES.release.slice(0, 9)} ok ${totals.validator.release.ok} / rejects ${totals.validator.release.fail}; feat/card-numbers ${SOURCES.cn} ok ${totals.validator.cn.ok} / rejects ${totals.validator.cn.fail}.`, '');
L.push('## Per rule (definition only)', '', '"Server-enforced" is read from the validator source: release = parseTutorDiagram at the archive\'s release SHA, card-numbers = tip 3ecab0496 (not on main). Where it is enforced, violations should be 0.', '',
  '| Rule | Kind | Server-enforced (release) | Server-enforced (card-numbers) | Cards examined | Cards violating | Rate | Items examined | Items violating |', '|---|---|---|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(RULES)) { const t = perRule[k] ?? { cardsExamined: 0, cardsViolating: 0, itemsExamined: 0, itemsViolating: 0 }; L.push(`| ${k}: ${v.text} | ${v.kind} | ${yn(v.release)} | ${yn(v.cn)} | ${t.cardsExamined} | ${t.cardsViolating} | ${rate(t.cardsViolating, t.cardsExamined)} | ${t.itemsExamined} | ${t.itemsViolating} |`); }
for (const [k, why] of Object.entries(NO_RULE)) { const t = perRule['no-rule:' + k]; L.push(`| ${k}: no definitional rule (${why}) | ${k} | n/a | n/a | ${t?.cardsExamined ?? 0} | n/a | n/a | ${t?.itemsExamined ?? 0} | n/a |`); }
L.push('', '### Informational (not violations by themselves)', '', '| Rule | Cards examined | Cards flagged | Rate |', '|---|---|---|---|');
for (const [k, v] of Object.entries(INFO)) { const t = perRule[k] ?? { cardsExamined: 0, cardsViolating: 0 }; L.push(`| ${k}: ${v} | ${t.cardsExamined} | ${t.cardsViolating} | ${rate(t.cardsViolating, t.cardsExamined)} |`); }
L.push('', '## Per authoring model', '');
const ruleIds = [...Object.keys(RULES), ...Object.keys(INFO)];
L.push(`| Model | Delivered cards | With numeric diagram | ${ruleIds.map(r => `${r} (violating/examined)`).join(' | ')} |`, `|---|---|---|${ruleIds.map(() => '---').join('|')}|`);
for (const [id, m] of Object.entries(perModel)) L.push(`| ${id} | ${m.delivered} | ${m.numeric} | ${ruleIds.map(r => m.rules[r] ? `${m.rules[r].cardsViolating}/${m.rules[r].cardsExamined}` : '0/0').join(' | ')} |`);
if (!Object.keys(perModel).length) L.push('| (no delivered typed cards) | 0 | 0 |' + ruleIds.map(() => ' 0/0 |').join(''));
L.push('', '## Examples (anonymised: record id, kind, numbers, model)', '');
if (!examples.length) L.push('None: no definitional violation was found in the records examined.');
for (const e of examples.slice(0, 5)) L.push(`- ${e.id} | ${e.kind} | ${e.rule} | stated ${e.stated} | correct ${e.correct} | ${e.model}`);
L.push('', '## Honest limits', '', `- Sample size: ${totals.since} record(s) since the cutoff, ${totals.typedDelivered} typed delivered card(s), ${totals.deliveredWithNumericDiagram} with a numeric diagram. A rate over so few cards says nothing about prevalence; this file is the baseline format and the first data point.`,
  '- Records that could not be parsed: ' + (unparsed.length || totals.badFences ? JSON.stringify(unparsed) + ` ${totals.badFences} unparsable fence(s)` : 'none') + '.', '- The reference-line rule recomputes a mean/median from the plotted points only (series defined by formula are skipped); it is not server-enforced and not a model-free guarantee of intent.', '- Per-record outcomes, with day, depth, kinds and model, are in counts.json.');
fs.writeFileSync(path.join(HERE, 'archive-numbers.md'), L.join('\n') + '\n');
console.log(JSON.stringify({ listed: totals.listed, since: totals.since, typedDelivered: totals.typedDelivered, numeric: totals.deliveredWithNumericDiagram, unparsed: totals.unparsed, examples: examples.length }));
