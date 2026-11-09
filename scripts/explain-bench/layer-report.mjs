// Per-layer report for the full-candidate 3x (owner 2026-11-09: "the report shows each layer's intended effect separately so a regression can be placed without a bisect").
// One section per layer (planner, prompt, server, Codex, prose pass), each comparing the NEW run with the OLD run (the clean-up) on the SAME cards, one verdict line per layer,
// and for a regressed layer the commits of that layer. No model call unless --judge (the decisive-step-v1 judge: 8 short calls, about US$0.05).
// Usage: node scripts/explain-bench/layer-report.mjs --new <run dir|none> --old <run dir> [--base <116 run dir>] [--batch-before <dir> --batch-after <dir>] [--prose-new <dir> --prose-old <dir>]
//        [--log-new app.log --log-old app.log] [--repo <git worktree>] [--ref release/explain-117] [--since 76d4486c6] [--judge] [--out report.md]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { JUDGE_MODEL, PRICE, keyTransport } from './judge.mjs';

const json = f => JSON.parse(readFileSync(f, 'utf8'));
const cardsOf = dir => (dir && dir !== 'none' && existsSync(join(dir, 'results.json')) ? json(join(dir, 'results.json')).cards : null);
const key = c => `${c.set}/${c.id}/${c.depth || '-'}/r${c.run}`;
const pairs = (a, b) => { const m = new Map(b.map(c => [key(c), c])); return a.flatMap(c => (m.has(key(c)) ? [[c, m.get(key(c))]] : [])); };
const count = (xs, f = () => true) => xs.filter(f).length;
const by = (xs, f) => xs.reduce((o, x) => ((o[f(x)] = (o[f(x)] || []).concat([x])), o), {});
const diagramOf = d => d?.spec?.diagram || d?.spec || {};
const lab = c => ({ right: 'R', acceptable: 'A', wrong: 'W' }[c.score] || '-');
const NA = why => `n/a: ${why}`;
const verdicts = [];
const verdict = (layer, word, why) => { verdicts.push({ layer, word, why }); return `**${layer}: ${word}** (${why})`; };
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
const lines = (path, event) => (path && existsSync(path) ? readFileSync(path, 'utf8').split('\n').flatMap(l => { const i = l.indexOf('{"event":"' + event + '"'); if (i < 0) return []; try { return [JSON.parse(l.slice(i))]; } catch { return []; } }) : null);
const sumCorr = cs => cs.reduce((o, c) => (Object.entries(c.corrections || {}).forEach(([k, v]) => (o[k] = (o[k] || 0) + v)), o), {});
const causes = cs => cs.reduce((o, c) => ([...new Set((c.repairCauses || []).filter(x => x.attempt === 0).map(x => x.cause))].forEach(k => (o[k] = (o[k] || 0) + 1)), o), {});
const rawCards = dir => { const raw = join(dir || '', 'raw'); return existsSync(raw) ? readdirSync(raw).flatMap(s => (existsSync(join(raw, s, 'cards')) ? readdirSync(join(raw, s, 'cards')).filter(f => f.endsWith('.json')).map(f => json(join(raw, s, 'cards', f)).response?.block).filter(Boolean) : [])) : null; };

// ---- 1 planner ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function planner(nw, old) {
  const P = pairs(nw, old), delivered = P.filter(([n, o]) => n.delivered && o.delivered);
  const right = cs => count(cs, c => c.score === 'right');
  const flips = delivered.filter(([n, o]) => n.plan?.kind !== o.plan?.kind);
  const collateral = flips.filter(([n, o]) => n.score === 'wrong' && o.score !== 'wrong');
  const perSet = Object.entries(by(delivered, ([n]) => n.set)).map(([s, ps]) => [s, `${right(ps.map(p => p[1]))}/${ps.length}`, `${right(ps.map(p => p[0]))}/${ps.length}`]);
  const perDepth = Object.entries(by(delivered.filter(([n]) => n.depth), ([n]) => n.depth)).map(([d, ps]) => [d, `${right(ps.map(p => p[1]))}/${ps.length}`, `${right(ps.map(p => p[0]))}/${ps.length}`]);
  const d = right(delivered.map(p => p[0])) - right(delivered.map(p => p[1]));
  return [`### Planner (kind right on the same ${delivered.length} cards)`, '', table(['set', 'old right', 'new right'], perSet), '', table(['depth', 'old right', 'new right'], perDepth), '',
    `Plan-kind changes: ${flips.length}; collateral (a card that is now outside its accepted labels): ${collateral.length}. Noise floor on identical planner runs: about 1 type and 5-12 kind flips (ledger).`, '',
    ...flips.slice(0, 60).map(([n, o]) => `- ${key(n)}: ${o.plan?.kind} -> ${n.plan?.kind}, label ${lab(o)} -> ${lab(n)}${n.score === 'wrong' && o.score !== 'wrong' ? ' COLLATERAL' : ''}`), '',
    verdict('PLANNER', d > 3 ? 'improved' : d < -3 || collateral.length > 3 ? 'regressed' : 'flat', `kind right ${d >= 0 ? '+' : ''}${d} on ${delivered.length} cards, ${collateral.length} collateral`)].join('\n');
}

// ---- 2 prompt -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const SETUP = /^(init|initial|choose|start|select|set up|pick)/i;
const cycleSetup = cs => { const cyc = cs.flatMap(c => (c.diagrams || []).filter(d => d.kind === 'cycle').map(d => (diagramOf(d).steps || [])[0])).map(s => (typeof s === 'string' ? s : s?.label || '')); return [count(cyc, s => SETUP.test(s)), cyc.length]; };
const flowDecisions = cs => { const f = cs.flatMap(c => (c.diagrams || []).filter(d => d.kind === 'flow').map(diagramOf)).filter(g => (g.nodes || []).some(n => n.role === 'decision')); return [count(f, g => (g.nodes || []).filter(n => n.role === 'decision').every(n => (g.edges || []).filter(e => e.from === n.id && e.label).length >= 2)), f.length]; };
const batchCard = (dir, nn) => { const d = dir && existsSync(dir) ? readdirSync(dir).find(x => x.startsWith(nn + '-')) : null; const f = d && join(dir, d, 'visual-1.json'); return f && existsSync(f) ? { title: (json(f).diagram || json(f)).title || '', spec: JSON.stringify(json(f).diagram || json(f)).slice(0, 3500), prompt: (readFileSync(join(dir, d, 'card.md'), 'utf8').match(/^- Prompt: (.*)$/m) || [])[1] || d } : null; };
const STEP = 'Does the visual contain the step or quantity the question is about: the action that produces the result (decrypt with the private key; the veto override; the frame popped at the base case), or the derived values (precision and recall from the four cells)? A visual that shows only the setup is no. Answer by calling record_step with answer yes or no and a one-line reason.';
async function decisive(card) {
  const call = keyTransport(), tool = { name: 'record_step', description: 'Record the verdict.', input_schema: { type: 'object', additionalProperties: false, required: ['answer', 'reason'], properties: { answer: { type: 'string', enum: ['yes', 'no'] }, reason: { type: 'string' } } } };
  const res = await call({ model: JUDGE_MODEL, max_tokens: 1000, output_config: { effort: 'low' }, system: `decisive-step-v1. ${STEP}`, tools: [tool], tool_choice: { type: 'auto', disable_parallel_tool_use: true }, messages: [{ role: 'user', content: `Question: ${card.prompt}\nVisual title: ${card.title}\nVisual spec: ${card.spec}` }] });
  const body = await res.json(), u = body.usage || {};
  return { ...(body.content || []).find(b => b.type === 'tool_use')?.input, cost: (u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output };
}
async function prompt(nw, old, o) {
  const out = ['### Prompt (decisive step, cycle setup, flow decisions)', ''];
  let spent = 0, yes = [0, 0], judged = 0;
  const ids = [['01', 'public-key encryption'], ['07', 'bill becomes law'], ['08', 'call stack'], ['10', 'confusion matrix']];
  if (!o['batch-after'] || !existsSync(o['batch-after'])) out.push(NA('no batch-01-after export; regenerate the ten prompts with the review-batch export (C:/s/spec/review/) into docs/features/explain/review/batch-01-after/ and pass --batch-after'), '');
  else if (!o.judge) out.push('Decisive-step judge not run (pass --judge; about US$0.05).', '');
  else {
    const rows = [];
    for (const [nn, name] of ids) { const b = batchCard(o['batch-before'], nn), a = batchCard(o['batch-after'], nn); if (!b || !a) { rows.push([nn, name, '-', '-']); continue; } const [rb, ra] = [await decisive(b), await decisive(a)]; spent += rb.cost + ra.cost; judged++; yes[0] += rb.answer === 'yes'; yes[1] += ra.answer === 'yes'; rows.push([nn, name, `${rb.answer}: ${rb.reason}`, `${ra.answer}: ${ra.reason}`]); }
    out.push(table(['card', 'prompt', 'before', 'after'], rows), '', `Decisive step present: ${yes[0]} -> ${yes[1]} of ${judged} (judge cost US$${spent.toFixed(3)}).`, '');
  }
  const [co, cn] = [cycleSetup(old), cycleSetup(nw)], [fo, fn] = [flowDecisions(old), flowDecisions(nw)];
  out.push(`Cycles whose first step is a setup step: ${co[0]}/${co[1]} -> ${cn[0]}/${cn[1]}. Flows with a decision whose decisions all have two or more labelled branches: ${fo[0]}/${fo[1]} -> ${fn[0]}/${fn[1]}.`);
  const km = batchCard(o['batch-after'], '04'), ht = batchCard(o['batch-after'], '02');
  if (km) out.push(`Batch-01-after card 04 (k-means) first step: ${JSON.stringify((JSON.parse(km.spec).steps || [])[0])}.`);
  if (ht) out.push(`Batch-01-after card 02 (hash table) title names the operation: ${/look-?up|insert|search|retriev/i.test(ht.title) ? 'yes' : 'no'} ("${ht.title}").`);
  const d = (cn[1] ? cn[0] / cn[1] : 0) - (co[1] ? co[0] / co[1] : 0);
  out.push('', verdict('PROMPT', judged && yes[1] < yes[0] ? 'regressed' : d > 0.05 || (judged && yes[1] > yes[0]) ? 'improved' : d < -0.05 ? 'regressed' : 'flat', `${judged ? `decisive step ${yes[0]}->${yes[1]} of ${judged}; ` : 'decisive step not judged; '}cycle setup ${co[0]}/${co[1]} -> ${cn[0]}/${cn[1]}`));
  return out.join('\n');
}

// ---- 3 server -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const lead = /^[\s,;:\-*>"'\u2022]/;
function server(nw, old, o) {
  const [cn, co] = [causes(nw), causes(old)], [sn, so] = [sumCorr(nw), sumCorr(old)];
  const names = k => [...new Set([...Object.keys(k[0]), ...Object.keys(k[1])])].sort();
  const dropped = ls => (ls ? Object.entries(ls.reduce((a, e) => ((a[e.reason || '?'] = (a[e.reason || '?'] || 0) + 1), a), {})).map(([r, n]) => `${r}: ${n}`).join(', ') || '0' : NA('no app log'));
  const [qn, qo] = [rawCards(o.nwDir), rawCards(o.oldDir)];
  const q = b => (b ? `${count(b.flatMap(x => (x.interactions?.questions || []).map(y => y.text || y)), t => lead.test(String(t)))} of ${count(b.flatMap(x => x.interactions?.questions || []))}` : NA('no raw cards'));
  const trees = cs => cs.flatMap(c => (c.diagrams || []).filter(d => d.kind === 'tree').map(d => diagramOf(d).layout || 'outline')).reduce((a, l) => ((a[l] = (a[l] || 0) + 1), a), {});
  const [rn, ro] = [count(nw, c => c.repaired), count(old, c => c.repaired)];
  return ['### Server (repairs, corrections, dropped elements, tree layouts)', '', `Repaired cards: ${ro}/${old.length} -> ${rn}/${nw.length}.`, '', table(['repair cause (first attempt)', 'old', 'new'], names([co, cn]).map(k => [k.slice(0, 90), co[k] || 0, cn[k] || 0])), '',
    table(['correction', 'old', 'new'], names([so, sn]).map(k => [k, so[k] || 0, sn[k] || 0])), '',
    `Dropped-element log lines by reason: old ${dropped(lines(o['log-old'], 'explanation_diagram_dropped_element'))}; new ${dropped(lines(o['log-new'], 'explanation_diagram_dropped_element'))}.`,
    `Follow-up questions starting with punctuation: old ${q(qo)}; new ${q(qn)}. Tree layouts (old / new): ${JSON.stringify(trees(old))} / ${JSON.stringify(trees(nw))}.`, '',
    verdict('SERVER', rn > ro + 3 ? 'regressed' : rn < ro - 3 ? 'improved' : 'flat', `repairs ${ro} -> ${rn}`)].join('\n');
}

// ---- 4 Codex ------------------------------------------------------------------------------------------------------------------------------------------------------------------
function codex(nw, old) {
  const ill = nw.filter(c => c.set === 'illustrations'), lineSeries = cs => cs.flatMap(c => (c.diagrams || []).filter(d => d.kind === 'coordinate-plot').flatMap(d => (diagramOf(d).series || []).filter(s => s.kind === 'line' && (s.points || []).length >= 3)));
  const blocks = cs => count(cs.flatMap(c => c.diagrams || []), d => d.kind === 'block-stack');
  const out = ['### Codex (illustration kinds, smooth curves, walkthrough)', '', `Line series with 3 or more points (drawn as curves by the renderer): ${lineSeries(old).length} -> ${lineSeries(nw).length}. block-stack diagrams: ${blocks(old)} -> ${blocks(nw)}.`];
  if (!ill.length) out.push('', NA('the illustrations set is not in the new run'), '', verdict('CODEX', 'flat', 'no illustrations set in the run'));
  else { const r = count(ill, c => c.score === 'right'); out.push('', table(['prompt', 'depth', 'kind drawn', 'label', 'faithful'], ill.map(c => [c.id, c.depth || '-', (c.diagrams || []).map(d => d.kind).join('+') || (c.mix || []).join('+'), lab(c), (c.diagrams || []).map(d => d.faithful?.verdict || '-').join('/')])), '', verdict('CODEX', r >= ill.length * 0.7 ? 'improved' : 'regressed', `illustrations right kind ${r}/${ill.length}`)); }
  return out.join('\n');
}

// ---- 5 prose pass -------------------------------------------------------------------------------------------------------------------------------------------------------------
function prose(o) {
  const [nw, old] = ['prose-new', 'prose-old'].map(k => (o[k] && existsSync(join(o[k], 'prose-results.json')) ? json(join(o[k], 'prose-results.json')) : null));
  if (!nw || !old) return ['### Prose pass', '', NA('no new prose run (pass --prose-new and --prose-old)'), '', verdict('PROSE', 'flat', 'no prose run')].join('\n');
  const D = ['overview', 'standard', 'deep'], n = x => x ?? 0, yes = (r, d) => r.rubric[d].yes, per = (r, d, q) => r.rubric[d].perQuestion[q];
  const detailedRight = n(nw.persona.deep.level.right), pointed = D.map(d => per(nw, d, 'visual-pointed-at')), brief = [per(old, 'overview', 'vocabulary'), per(nw, 'overview', 'vocabulary')], bal = [yes(old, 'standard'), yes(nw, 'standard')];
  const pass = [detailedRight >= 4, pointed.every(v => v >= 4), brief[1] >= brief[0], bal[1] >= bal[0]];
  return ['### Prose pass (held-out gini + tcp-handshake)', '', table(['depth', 'rubric yes old', 'rubric yes new', 'opens concrete', 'visual pointed at', 'persona right', 'too basic'], D.map(d => [d, `${yes(old, d)}/${old.rubric[d].possible}`, `${yes(nw, d)}/${nw.rubric[d].possible}`, `${per(old, d, 'opens-concrete')} -> ${per(nw, d, 'opens-concrete')}`, `${per(old, d, 'visual-pointed-at')} -> ${per(nw, d, 'visual-pointed-at')}`, `${old.persona[d].level.right} -> ${nw.persona[d].level.right}`, `${old.persona[d].level['too basic']} -> ${nw.persona[d].level['too basic']}`])), '',
    `Blind ordering hits per run: old ${old.blind.map(b => `${b.hits}/${b.judged}`).join(', ')}; new ${nw.blind.map(b => `${b.hits}/${b.judged}`).join(', ')}. Owner pass criteria: Detailed persona right >= 4/6: ${pass[0] ? 'PASS' : 'FAIL'} (${detailedRight}); visual pointed at >= 4/6 at every depth: ${pass[1] ? 'PASS' : 'FAIL'} (${pointed.join('/')}); Brief vocabulary not worse: ${pass[2] ? 'PASS' : 'FAIL'} (${brief.join(' -> ')}); Balanced not down: ${pass[3] ? 'PASS' : 'FAIL'} (${bal.join(' -> ')}).`, '',
    verdict('PROSE', pass.every(Boolean) ? 'improved' : bal[1] < bal[0] || brief[1] < brief[0] ? 'regressed' : 'flat', `${count(pass, Boolean)}/4 owner criteria pass`)].join('\n');
}

// ---- commits of a regressed layer --------------------------------------------------------------------------------------------------------------------------------------------
const LAYERS = { PLANNER: /planner|kind criteria|secondVisual/i, PROMPT: /prompt|guidance|catalogue|clause|sentence|contract|depth line/i, SERVER: /correction|server|sequence|tree_|question|simplified|fallback|literal|line breaks/i, CODEX: /codex|reference|snapshot|plot|curve|illustration|walkthrough/i, PROSE: /prose pass|prose-pass/i };
function commits(o) {
  const regressed = verdicts.filter(v => v.word === 'regressed').map(v => v.layer);
  if (!regressed.length) return 'No layer regressed: nothing to revert.';
  let log = [];
  try { log = execFileSync('git', ['-C', o.repo, 'log', '--format=%h %s', o.ref, '--not', o.since], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { return `Regressed: ${regressed.join(', ')}; ${NA('git log failed: ' + String(e.message).slice(0, 80))}`; }
  return regressed.map(l => `Regressed layer ${l}: revert these one at a time before 117:\n${log.filter(x => LAYERS[l].test(x)).map(x => `  - ${x}`).join('\n') || '  (no commit matched)'}`).join('\n');
}

export async function layerReport(o) {
  const old = cardsOf(o.old), nw = cardsOf(o.new);
  if (!old) throw new Error('--old <run dir> with a results.json is required');
  o.nwDir = o.new; o.oldDir = o.old; verdicts.length = 0;
  const head = [`# Per-layer report`, '', `New run: ${o.new}. Old run (clean-up): ${o.old}.${o.base ? ` 116 baseline: ${o.base}.` : ''} Compared on the same cards (set, prompt, depth, run).`, ''];
  if (!nw) return [...head, NA('no new run (--new none): every layer needs the new full-candidate run; the prose section can still read its own dirs'), '', prose(o)].join('\n');
  const sections = [planner(nw, old), await prompt(nw, old, o), server(nw, old, o), codex(nw, old), prose(o)];
  return [...head, ...sections.flatMap(s => [s, '']), '### Verdicts', '', ...verdicts.map(v => `- ${v.layer}: ${v.word} (${v.why})`), '', commits(o)].join('\n');
}

async function main() {
  const { values: a } = parseArgs({ options: { new: { type: 'string' }, old: { type: 'string' }, base: { type: 'string' }, 'batch-before': { type: 'string' }, 'batch-after': { type: 'string' }, 'prose-new': { type: 'string' }, 'prose-old': { type: 'string' }, 'log-new': { type: 'string' }, 'log-old': { type: 'string' }, repo: { type: 'string', default: 'C:/s/explain-117' }, ref: { type: 'string', default: 'release/explain-117' }, since: { type: 'string', default: '76d4486c6' }, judge: { type: 'boolean' }, out: { type: 'string' } } });
  const text = await layerReport({ ...a, new: a.new || 'none', 'batch-before': a['batch-before'] || 'docs/features/explain/review/batch-01' });
  if (a.out) writeFileSync(resolve(a.out), text); else console.log(text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
