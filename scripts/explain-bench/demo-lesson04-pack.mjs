// Review pack for the demo-lesson04 run (2026-11-09): one folder per card under docs/features/explain/review/demo-lesson04/, in the batch-02 format
// (card.md, pipeline.json, visual-n.json/.svg/.png at 440 px, card.png) plus reference-408.svg of the expected reference, index.md and a REVIEW.md skeleton. No verdicts are written.
// Usage: node scripts/explain-bench/demo-lesson04-pack.mjs --run <bench run dir> [--run <dir> ...] [--out <pack dir>] [--tree <stack worktree: renderer, card layout>]
//          [--base <stack URL> --vars <its .dev.vars>: also screenshot card.png on the stack] [--no-png] [--refs-dir <checkout of the Codex branch>] [--refs-ref <git ref, default rabbit-hole/chatgpt/explain-phase02-library>]
// Each run dir is a bench.mjs output dir (results.json written by report.mjs with --judge-only factual; meta.raw holds the stored responses). Later --run dirs override earlier ones per (prompt, depth),
// so the five later references are added by a second bench run without re-running the rest. No --run: dry run, prints the plan and which reference files are found, writes nothing.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { loadSet } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../..');
const REF_DIR = 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations';
const FENCE = /```(rh-diagram|rh-illustration)\n([\s\S]*?)\n```/g;
const json = f => JSON.parse(readFileSync(f, 'utf8'));

// Reference ids: Balanced = <id>, Detailed = <id>-detailed, Brief = <id>-brief; the selector may log either form, so ids are compared by base.
export const variantId = (id, depth) => (depth === 'deep' ? `${id}-detailed` : depth === 'overview' ? `${id}-brief` : id);
export const baseId = id => String(id).replace(/--part.*$/, '').replace(/-(brief|detailed)$/, '');
export const selectorCheck = (ids, want) => (ids ? { hit: ids.some(x => baseId(x) === want), first: ids.length > 0 && baseId(ids[0]) === want } : { hit: null, first: null });
const yn = v => (v === null || v === undefined ? 'not logged' : v ? 'yes' : 'no');

export async function pack(o) {
  const set = loadSet('demo-lesson04'), root = o.tree ? resolve(o.tree) : REPO, out = resolve(o.out);
  // Latest run wins per (prompt id, depth).
  const got = new Map();
  for (const dir of o.runs.map(d => resolve(d))) {
    const res = json(join(dir, 'results.json'));
    for (const c of res.cards.filter(x => x.set === 'demo-lesson04')) {
      const dep = c.depth || 'standard', file = join(res.meta.raw, `demo-lesson04-r${c.run}${c.depth ? `-${c.depth}` : ''}`, 'cards', `${c.id}.json`);
      got.set(`${c.id}|${dep}`, { c, saved: existsSync(file) ? json(file) : null, run: res.meta.runId });
    }
  }
  // Reference files: a checkout (--refs-dir) or git show of the Codex branch (fetched by the runner), so later commits are picked up.
  const refFile = (id, name) => {
    if (o.refsDir) { const f = join(resolve(o.refsDir), 'illustrations', id, name); return existsSync(f) ? readFileSync(f, 'utf8') : null; }
    try { return execFileSync('git', ['show', `${o.refsRef}:${REF_DIR}/${id}/${name}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
  const req = createRequire(join(root, 'packages/web/package.json')), { renderToStaticMarkup } = req('react-dom/server');
  const { renderTutorDiagram } = await import(pathToFileURL(join(root, 'packages/web/src/tutor-diagrams/TutorDiagram.js')).href);
  const svgOf = (spec, w) => { try { return renderToStaticMarkup(renderTutorDiagram(spec, w).element) + '\n'; } catch (e) { return `<!-- render failed: ${String(e.message).slice(0, 160)} -->\n`; } };

  const rows = [];
  for (const p of set.prompts) for (const dep of p.askDepths) {
    const refId = variantId(p.referenceId, dep), refSpecText = refFile(refId, 'spec.json'), refSpec = refSpecText ? JSON.parse(refSpecText) : null;
    const refSvg = refFile(refId, '408.svg') ?? (refSpec ? svgOf(refSpec, 408) : null);
    const wantKind = p.referenceKind !== 'pending' ? p.referenceKind : refSpec?.diagram?.kind ?? 'pending';
    const g = got.get(`${p.id}|${dep}`), c = g?.c ?? null, b = g?.saved?.response?.block ?? null, row = g?.saved?.row ?? null, ids = c?.references?.ids ?? null;
    const d0 = c?.diagrams?.[0] ?? null, pc = c?.planCheck ?? null, sel = selectorCheck(ids, p.referenceId);
    rows.push({ p, dep, name: `${p.n}-${p.referenceId.replace(/^ml-trees-/, '')}${dep === 'deep' ? '-detailed' : ''}`, refId, refSvg, refSpec, wantKind, c, b, row, ids, ...sel, run: g?.run ?? null,
      modelKind: d0?.kind ?? (c?.hasPicture ? 'picture' : c?.delivered ? 'none' : c ? 'FAILED' : null), planKind: pc?.planKind ?? c?.plan?.kind ?? null, offered: pc?.offered ?? null,
      kindMatch: wantKind === 'pending' || !c ? null : d0?.kind === wantKind,
      plannerMatch: wantKind === 'pending' || !pc ? null : pc.offered ? pc.offered.includes(wantKind) : pc.planKind === wantKind,
      factual: c?.judge?.factual ?? null, factualError: (c?.judge?.factual?.errors || []).length > 0 });
  }
  if (!o.runs.length) { for (const r of rows) console.log(`${r.name.padEnd(36)} ${r.dep.padEnd(8)} expects ${r.refId} (${r.wantKind}); reference ${r.refSvg ? 'found' : 'NOT FOUND'}`); return { rows, written: false }; }

  mkdirSync(out, { recursive: true });
  const stack = o.base && o.vars ? await openStack(o, root) : null;
  const shot = !o.noPng || stack ? await (async () => { const { chromium } = createRequire('C:/Users/cyudhist/Desktop/workspace/tutor-r6/package.json')('playwright'); return chromium.launch({ headless: true }); })() : null;
  for (const r of rows.filter(x => x.c)) {
    const dir = join(out, r.name); mkdirSync(dir, { recursive: true });
    const { c, b, row } = r, vis = []; let body = '', last = 0, m;
    FENCE.lastIndex = 0;
    while (b && (m = FENCE.exec(b.body))) { const n = vis.length + 1; let spec = null; try { spec = JSON.parse(m[2]); } catch { /* kept as text */ } vis.push({ n, type: m[1] === 'rh-diagram' ? 'diagram' : 'picture', spec }); body += b.body.slice(last, m.index) + `[[visual:${n}]]`; last = m.index + m[0].length; }
    if (b) body += b.body.slice(last);
    for (const v of vis) {
      writeFileSync(join(dir, `visual-${v.n}.json`), JSON.stringify(v.spec, null, 1) + '\n');
      if (v.type !== 'diagram' || !v.spec) continue;
      const svg = svgOf(v.spec, 440); writeFileSync(join(dir, `visual-${v.n}.svg`), svg);
      if (shot && !o.noPng) await pngOf(shot, svg, join(dir, `visual-${v.n}.png`));
    }
    if (r.refSvg) writeFileSync(join(dir, 'reference-408.svg'), r.refSvg);
    if (r.refSpec) writeFileSync(join(dir, 'reference-spec.json'), JSON.stringify(r.refSpec, null, 1) + '\n');
    const cardPng = b && stack ? await cardShot(stack, shot, b, r.p.prompt, join(dir, 'card.png')) : null;
    const plan = c.plan, f = r.factual, tok = c.tokens, calls = (row?.modelCalls || []).map(x => x.ms);
    writeFileSync(join(dir, 'pipeline.json'), JSON.stringify({ run: r.run, plan, raw: c.raw, row, response: { profile: row?.profile, attempts: row?.attempts, repaired: c.repaired }, tokens: tok, totalMs: c.totalMs, costUsd: c.costUsd }, null, 1) + '\n');
    writeFileSync(join(dir, 'card.md'), [`# ${b?.title ?? '(no card delivered)'}`, '',
      `- Prompt: ${r.p.prompt}`, `- Depth: ${r.dep === 'deep' ? 'Detailed (bench key deep)' : 'Balanced (bench key standard)'}`,
      `- Expected reference: ${r.refId}; expected kind: ${r.wantKind}${r.wantKind === 'pending' ? ' (reference not available yet)' : ''}`,
      `- Selector hit (expected reference among the references sent to the author): ${yn(r.hit)}; first pick (expected reference sent first): ${yn(r.first)}`,
      `- References sent to the author (attempt 0, selector order): ${r.ids ? r.ids.join(', ') || 'none' : 'not logged (no --log)'}`,
      `- Planner kind: ${r.planKind ?? 'none'}${plan && plan.fixed === false && r.offered ? ` (not fixed; offered ${r.offered.join(' | ')})` : plan?.fixed ? ' (fixed)' : ''}; planner kind = expected: ${yn(r.plannerMatch)}`,
      `- Model kind (first diagram): ${r.modelKind}; all visuals: ${vis.map(v => (v.type === 'diagram' ? v.spec?.diagram?.kind : 'picture')).join(', ') || 'none'}; model kind = expected: ${yn(r.kindMatch)}`,
      `- Picture routing: planner pictures ${plan?.pictures ?? 'n/a'}; pictures in the card ${vis.filter(v => v.type === 'picture').length}; dropped ${c.picturesDropped ? c.picturesDropped.join(', ') || 'none' : 'not logged'}`,
      `- Repaired: ${c.repaired ? 'yes' : 'no'}${(c.repairCauses || []).length ? ` (${c.repairCauses.map(x => x.cause).join(', ')})` : ''}; visual fallback: ${c.visualFallback ? JSON.stringify(c.visualFallback) : 'no'}; server corrections: ${JSON.stringify(c.corrections ?? null)}`,
      `- Authored by ${c.authoredBy?.provider ?? b?.authoredBy?.provider ?? '-'} / ${c.authoredBy?.model ?? b?.authoredBy?.model ?? '-'}`,
      `- Time ${c.totalMs ?? '-'} ms${calls.length ? ` (model call(s) ${calls.join(' + ')} ms)` : ''}; tokens in/out ${tok ? `${tok.input}/${tok.output}` : '-'}; cost US$${c.costUsd ?? '-'}`,
      `- Factual (factual-v2): ${f ? `${f.score}/5, error ${r.factualError ? 'yes' : 'no'}${f.notes?.length ? ` - ${f.notes.join(' ')}` : ''}` : 'not judged'}`, '',
      ...(cardPng ? ['![card](card.png)', ''] : []),
      '| model (440 px) | reference (408 px) |', '|---|---|', `| ${vis.filter(v => v.type === 'diagram' && v.spec).map(v => `![visual ${v.n}](visual-${v.n}.svg)`).join(' ') || 'no diagram'} | ${r.refSvg ? '![reference](reference-408.svg)' : 'reference not available'} |`, '',
      '## Body (as saved, visual markers in place)', '', body.trim(), '',
      '## Visuals', '', ...vis.map(v => (v.type === 'diagram' ? `- [[visual:${v.n}]] diagram, kind **${v.spec?.diagram?.kind}**, title "${v.spec?.diagram?.title ?? ''}", caption "${v.spec?.diagram?.caption ?? ''}" ([spec](visual-${v.n}.json), [svg](visual-${v.n}.svg), [png](visual-${v.n}.png))` : `- [[visual:${v.n}]] PICTURE: caption "${v.spec?.caption ?? ''}", prompt "${v.spec?.prompt ?? ''}" ([spec](visual-${v.n}.json))`)), '',
      '## Follow-up questions', '', ...(b?.interactions?.questions || []).map((q, i) => `${i + 1}. ${q.text}`), ''].join('\n'));
    console.log(`${r.name} ${r.dep} kind ${r.modelKind} (expected ${r.wantKind}) hit ${yn(r.hit)} first ${yn(r.first)} visuals ${vis.length}${cardPng ? ' card.png' : ''}`);
  }
  if (shot) await shot.close();
  for (const r of rows.filter(x => !x.c && x.refSvg)) { const dir = join(out, r.name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'reference-408.svg'), r.refSvg); }

  const ran = rows.filter(r => r.c), known = ran.filter(r => r.kindMatch !== null), judged = ran.filter(r => r.factual), pc = (n, d) => (d ? `${n}/${d}` : '-');
  const cell = r => (r.c ? [r.modelKind, yn(r.hit), yn(r.first), (r.ids || []).join(' ') || '-', r.planKind ?? '-', r.factual ? `${r.factual.score}${r.factualError ? ' ERROR' : ''}` : '-', r.c.repaired ? 'yes' : 'no', `${r.c.totalMs} ms`, r.c.tokens ? `${r.c.tokens.input}/${r.c.tokens.output}` : '-'] : ['not run', '', '', '', '', '', '', '', '']);
  writeFileSync(join(out, 'index.md'), ['# Review pack demo-lesson04', '',
    `The 13 Lesson 04 demo prompts, one run each, Balanced (bench key standard); prompts 03 and 08 also at Detailed (bench key deep). Set scripts/explain-bench/sets/demo-lesson04.json, judge factual-v2 only. Runs: ${[...new Set(ran.map(r => r.run))].join(', ')}. Nothing edited: what is here is what the pipeline produced.`, '',
    '| # | Prompt | Depth | Expected reference | Expected kind | Model kind | Selector hit | First pick | References sent (order) | Planner kind | Factual (1-5) | Repaired | Time | Tokens in/out |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => { const k = cell(r); return `| ${r.p.n} | ${r.c ? `[${r.p.prompt}](${r.name}/card.md)` : r.p.prompt} | ${r.dep === 'deep' ? 'Detailed' : 'Balanced'} | ${r.refId} | ${r.wantKind} | ${k[0]} | ${k[1]} | ${k[2]} | ${k[3]} | ${k[4]} | ${k[5]} | ${k[6]} | ${k[7]} | ${k[8]} |`; }), '',
    `Cards run ${ran.length} of ${rows.length}; delivered ${pc(ran.filter(r => r.c.delivered).length, ran.length)}; selector hit ${pc(ran.filter(r => r.hit).length, ran.filter(r => r.hit !== null).length)}; first pick ${pc(ran.filter(r => r.first).length, ran.filter(r => r.first !== null).length)}; model kind = expected ${pc(known.filter(r => r.kindMatch).length, known.length)} (cards with a known expected kind); factual error ${pc(judged.filter(r => r.factualError).length, judged.length)}; repaired ${ran.filter(r => r.c.repaired).length}; planner routed to picture ${ran.filter(r => r.c.plan?.pictures > 0).length}; cost US$${ran.reduce((s, r) => s + (r.c.costUsd || 0), 0).toFixed(4)}.`, ''].join('\n'));
  writeFileSync(join(out, 'REVIEW.md'), ['# Review of demo-lesson04', '', 'To be filled by the lead after reading every card.md and visual. Columns: **kind** = the drawn kind against the expected one; **complete** = what the reference shows is on the visual; **labels** = placeholders, duplicates, maths outside `$...$`; **numbers** = values on the visual against the prose; **points** = the prose tells the reader what to look for.', '',
    '| # | Card | Kind | Complete | Labels | Numbers | Points at visual |', '|---|---|---|---|---|---|---|', ...rows.map(r => `| ${r.p.n}${r.dep === 'deep' ? ' D' : ''} | ${r.c ? `[${r.p.referenceId}](${r.name}/card.md)` : r.p.referenceId} | | | | | |`), ''].join('\n'));
  return { rows, written: true };
}

async function pngOf(browser, svg, file) {
  const page = await browser.newPage({ viewport: { width: 520, height: 800 } });
  await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
  await page.locator('svg').first().screenshot({ path: file });
  await page.close();
}

// card.png: the saved block put on a fresh canvas of a test user and photographed on the stack, as the batch-02 exporter does (card-layout.js and card-prompt.js from the stack's tree).
async function openStack(o, root) {
  const vars = readFileSync(o.vars, 'utf8'), secret = (vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1] || '').trim(), base = o.base.replace(/\/$/, '');
  const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `demo-lesson04-pack-${Date.now().toString(36)}@example.com`, secret }) })).json();
  if (!session) throw new Error('no test session');
  const api = async (method, path, body) => (await fetch(base + path, { method, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', origin: base }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => null);
  const canvas = (await api('POST', '/api/canvases', { title: 'demo-lesson04 pack' }))?.name;
  const { fullLength } = await import(pathToFileURL(join(root, 'packages/web/src/card-layout.js')).href), { withPrompt } = await import(pathToFileURL(join(root, 'packages/web/src/card-prompt.js')).href);
  return { base, session, api, canvas, fullLength, withPrompt };
}
async function cardShot(s, browser, b, prompt, file) {
  const block = s.fullLength({ ...s.withPrompt(b, prompt), id: randomUUID(), dx: 0, dy: 0 }, 440);
  await s.api('PUT', `/api/learn/boards/${s.canvas}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [block] } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 2000 }, colorScheme: 'light', deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'small_session', value: s.session, url: s.base }]);
  const page = await ctx.newPage(), card = page.locator(`[data-block-id="${block.id}"]`);
  await page.goto(`${s.base}/apps/${s.canvas}`);
  await card.waitFor({ timeout: 60000 });
  await page.locator(`[data-block-id="${block.id}"] svg[data-tutor-diagram], [data-block-id="${block.id}"] img`).first().waitFor({ timeout: 30000 }).catch(() => null);
  await new Promise(r => setTimeout(r, 2500));
  await card.screenshot({ path: file });
  await ctx.close();
  return file;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('demo-lesson04-pack.mjs')) {
  const { values: a } = parseArgs({ options: { run: { type: 'string', multiple: true }, out: { type: 'string' }, tree: { type: 'string' }, base: { type: 'string' }, vars: { type: 'string' }, 'no-png': { type: 'boolean' }, 'refs-dir': { type: 'string' }, 'refs-ref': { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  const r = await pack({ runs: a['dry-run'] ? [] : a.run || [], out: a.out || join(REPO, 'docs/features/explain/review/demo-lesson04'), tree: a.tree, base: a.base, vars: a.vars, noPng: a['no-png'], refsDir: a['refs-dir'], refsRef: a['refs-ref'] || 'rabbit-hole/chatgpt/explain-phase02-library' });
  console.log(r.written ? `pack written: ${r.rows.filter(x => x.c).length} cards` : 'dry run: nothing written');
}
