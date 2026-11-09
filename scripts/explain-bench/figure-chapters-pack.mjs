// Review pack and per-arm numbers for the figure-chapters live acceptance run (2026-11-09).
// Usage: node scripts/explain-bench/figure-chapters-pack.mjs --r <arm R scored run dir> --zero <arm 0 scored run dir> --out <pack dir>
// Each run dir is a report.mjs output (results.json with the judge verdicts; its meta.raw holds the stored responses). Writes, for every arm-R card, card.md, model-spec.json,
// model-408.svg and reference-408.svg (the worked reference rendered by the same production renderer at 408 px, as illustration-previews.mjs does for <id>/408.svg), plus REVIEW.md and stats.json.
// No verdict is written beyond the tables: the owner audits the cards.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSet, quantile } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), TD = join(HERE, '../../packages/web/src/tutor-diagrams');
const { renderTutorDiagram } = await import(pathToFileURL(join(TD, 'TutorDiagram.js')).href);
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const svgOf = spec => { try { return renderToStaticMarkup(renderTutorDiagram(spec, 408).element) + '\n'; } catch (e) { return `<!-- render failed: ${String(e.message).slice(0, 160)} -->\n`; } };
const RANK = { none: 0, not: 1, partly: 2, fully: 3 };
const pct = (n, d) => (d ? `${n}/${d} (${Math.round(1000 * n / d) / 10}%)` : '-');
const mean = xs => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

// One row per prompt of the set: the scored card of this arm joined with the set's reference facts.
export function arm(dir, set) {
  const res = json(join(resolve(dir), 'results.json')), rawRoot = join(res.meta.raw, 'figure-chapters-r1-standard', 'cards');
  const rows = set.prompts.map((p, i) => {
    const c = res.cards.find(x => x.id === p.id), saved = (() => { try { return json(join(rawRoot, `${p.id}.json`)); } catch { return null; } })();
    const d0 = c?.diagrams?.[0] ?? null, ids = c?.references?.ids ?? null, pc = c?.planCheck ?? null, offered = pc?.offered ?? null;
    return { n: String(i + 1).padStart(2, '0'), p, c, saved, block: saved?.response?.block ?? null,
      hit: ids ? ids.some(x => x === p.referenceId || x.startsWith(`${p.referenceId}--part`)) : null, ids,
      planKind: pc?.planKind ?? c?.plan?.kind ?? null, plannerWas: c?.plan?.kindSource ? c.plan.plannerKind : null, planFixed: c?.plan?.fixed ?? null, offered,
      planMatch: pc ? (offered ? offered.includes(p.referenceKind) : pc.planKind === p.referenceKind) : null,
      routedToPicture: (c?.plan?.pictures ?? 0) > 0, modelKind: d0?.kind ?? (c?.hasPicture ? 'picture' : c?.delivered ? 'none' : 'FAILED'), kindMatch: d0?.kind === p.referenceKind,
      structure: d0?.faithful?.verdict ?? 'none', structureReason: d0?.faithful?.reason ?? '', factual: c?.judge?.factual ?? null, factualError: (c?.judge?.factual?.errors || []).length > 0 };
  });
  return { res, rows };
}

export function stats({ res, rows }) {
  const got = rows.filter(r => r.c?.delivered), ms = got.map(r => r.c.totalMs), tin = got.map(r => r.c.tokens?.input).filter(Number.isFinite), tout = got.map(r => r.c.tokens?.output).filter(Number.isFinite);
  const judged = got.filter(r => r.factual), dist = { fully: 0, partly: 0, not: 0, none: 0 };
  for (const r of rows) dist[r.structure] = (dist[r.structure] || 0) + 1;
  const planned = rows.filter(r => r.planMatch !== null), author = rows.filter(r => r.c?.authoredBy ?? r.saved?.row?.authoredBy);
  const prov = r => (r.c?.authoredBy ?? r.saved?.row?.authoredBy)?.provider ?? null;
  return { cards: rows.length, delivered: got.length, failed: rows.filter(r => !r.c?.delivered).map(r => `${r.p.id}: ${r.c?.failure ?? 'no row'}`),
    selectorHit: pct(rows.filter(r => r.hit).length, rows.length), kindMatch: pct(rows.filter(r => r.kindMatch).length, rows.length), plannerKindMatch: pct(rows.filter(r => r.planMatch).length, planned.length),
    kindMissByStage: { plannerWrong: rows.filter(r => !r.kindMatch && r.planMatch === false).length, authorWrongPlannerRight: rows.filter(r => !r.kindMatch && r.planMatch === true).length, noPlan: rows.filter(r => !r.kindMatch && r.planMatch === null).length },
    structure: dist, structureFully: pct(dist.fully, rows.length), factualError: pct(judged.filter(r => r.factualError).length, judged.length), factualMean: judged.length ? +(judged.reduce((s, r) => s + r.factual.score, 0) / judged.length).toFixed(2) : null,
    repairedCards: got.filter(r => r.c.repaired || (r.c.repairCauses || []).length).length, visualFallbackCards: got.filter(r => r.c.visualFallback).length,
    modelFallbackCards: got.filter(r => prov(r) && prov(r) !== 'google').length, providers: Object.fromEntries([...new Set(got.map(prov))].map(k => [k, got.filter(r => prov(r) === k).length])),
    routedToPicture: rows.filter(r => r.routedToPicture).map(r => r.p.id), cardsWithPicture: rows.filter(r => r.c?.hasPicture).map(r => r.p.id),
    ms: { p50: quantile(ms, 0.5), p90: quantile(ms, 0.9), mean: mean(ms) }, authorInputTokensMean: mean(tin), authorOutputTokensMean: mean(tout), tokenCards: tin.length,
    spendUsd: +rows.reduce((s, r) => s + (r.c?.costUsd || 0), 0).toFixed(4), judge: res.judge ? { calls: res.judge.calls, cached: res.judge.cached, spentUsd: res.judge.spent, rubrics: Object.fromEntries(Object.entries(res.judge.rubrics || {}).map(([k, v]) => [k, v.version])) } : null,
    avgRefsSent: mean(rows.map(r => r.ids?.length).filter(Number.isFinite)) };
}

const fac = r => (r.factual ? `${r.factual.score}${r.factualError ? ' ERROR' : ''}` : '-');
const table = (rows, link) => ['| # | reference id | source | intended kind | planner kind | model kind | selector hit | structure | factual (1-5) |', '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.n} | ${link ? `[${r.p.referenceId}](${r.n}-${r.p.referenceId}/card.md)` : r.p.referenceId} | ${r.p.chapter} | ${r.p.want} | ${r.planKind ?? '-'}${r.plannerWas ? ` (override; planner said ${r.plannerWas})` : ''}${r.offered ? ` (offered ${r.offered.join(' / ')})` : ''} | ${r.modelKind} | ${r.hit === null ? '-' : r.hit ? 'yes' : 'no'} | ${r.structure} | ${fac(r)} |`)].join('\n');
const statRows = (R, Z) => [['cards delivered', s => `${s.delivered}/${s.cards}`], ['selector hit', s => s.selectorHit], ['kind match (first diagram = reference kind)', s => s.kindMatch], ['planner kind match', s => s.plannerKindMatch],
  ['kind misses: planner wrong / author wrong, planner right / no plan', s => `${s.kindMissByStage.plannerWrong} / ${s.kindMissByStage.authorWrongPlannerRight} / ${s.kindMissByStage.noPlan}`],
  ['structure (judge faithful-ref-v1): fully / partly / not / none', s => `${s.structure.fully} / ${s.structure.partly} / ${s.structure.not} / ${s.structure.none}`], ['structure fully', s => s.structureFully], ['factual error (factual-v2)', s => s.factualError], ['factual mean score', s => s.factualMean],
  ['repaired cards', s => s.repairedCards], ['visual fallback cards', s => s.visualFallbackCards], ['cards authored by a non-Google provider (model fallback)', s => s.modelFallbackCards], ['planner routed to picture', s => s.routedToPicture.length], ['cards with a picture', s => s.cardsWithPicture.length],
  ['latency p50 / p90 (ms)', s => `${s.ms.p50} / ${s.ms.p90}`], ['mean author input tokens', s => s.authorInputTokensMean], ['mean author output tokens', s => s.authorOutputTokensMean], ['mean references sent', s => s.avgRefsSent], ['generation spend (US$)', s => s.spendUsd], ['judge spend (US$)', s => s.judge?.spentUsd]]
  .map(([k, f]) => `| ${k} | ${f(R)} | ${f(Z)} |`);

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('figure-chapters-pack.mjs')) {
  const { values: a } = parseArgs({ options: { r: { type: 'string' }, zero: { type: 'string' }, out: { type: 'string' } } });
  if (!a.r || !a.zero || !a.out) { console.error('usage: --r <arm R run dir> --zero <arm 0 run dir> --out <pack dir>'); process.exit(2); }
  const set = loadSet('figure-chapters'), R = arm(a.r, set), Z = arm(a.zero, set), sR = stats(R), sZ = stats(Z), out = resolve(a.out);
  mkdirSync(out, { recursive: true });
  for (const r of R.rows) {
    const dir = join(out, `${r.n}-${r.p.referenceId}`); mkdirSync(dir, { recursive: true });
    const c = r.c, b = r.block, diagrams = c?.diagrams ?? [];
    diagrams.forEach((d, i) => { const name = i ? `model-spec-${i + 1}` : 'model-spec'; const doc = { version: 1, diagram: d.spec }; writeFileSync(join(dir, `${name}.json`), JSON.stringify(doc, null, 1) + '\n'); writeFileSync(join(dir, i ? `model-408-${i + 1}.svg` : 'model-408.svg'), svgOf(doc)); });
    writeFileSync(join(dir, 'reference-spec.json'), JSON.stringify(r.p.referenceSpec, null, 1) + '\n'); writeFileSync(join(dir, 'reference-408.svg'), svgOf(r.p.referenceSpec));
    const f = r.factual;
    writeFileSync(join(dir, 'card.md'), [`# ${b?.title ?? '(no card delivered)'}`, '', `- Prompt (reference.prompts[0]): ${r.p.prompt}`, `- Reference id: ${r.p.referenceId} (source: ${r.p.chapter})`, `- Intended kind (reference.spec.diagram.kind): ${r.p.want}`,
      `- Planner kind: ${r.planKind ?? 'none'}${r.plannerWas ? ` (reference override; the planner said ${r.plannerWas})` : ''}${r.planFixed === false && r.offered ? ` (not fixed; offered ${r.offered.join(' | ')})` : r.planFixed ? ' (fixed)' : ''}; planner routed to picture: ${r.routedToPicture ? 'yes' : 'no'}`,
      `- Model kind (first diagram): ${r.modelKind}; all diagrams: ${diagrams.map(d => d.kind).join(', ') || 'none'}`, `- Selector hit (intended reference among the references sent): ${r.hit === null ? 'not logged' : r.hit ? 'yes' : 'no'}`,
      `- References sent to the author (attempt 0): ${r.ids ? r.ids.join(', ') || 'none' : 'not logged'}`,
      `- Structure (faithful-ref-v1, reference vs model spec): ${r.structure}${r.structureReason ? ` - ${r.structureReason}` : ''}`, `- Factual (factual-v2): ${f ? `${f.score}/5, error ${r.factualError ? 'yes' : 'no'}${f.notes?.length ? ` - ${f.notes.join(' ')}` : ''}` : 'not judged'}`,
      `- Repaired: ${c?.repaired ? 'yes' : 'no'}${(c?.repairCauses || []).length ? ` (${c.repairCauses.map(x => x.cause).join(', ')})` : ''}; visual fallback: ${c?.visualFallback ? JSON.stringify(c.visualFallback) : 'no'}; authored by ${(c?.authoredBy ?? r.saved?.row?.authoredBy)?.provider ?? '-'} / ${(c?.authoredBy ?? r.saved?.row?.authoredBy)?.model ?? '-'}`,
      `- Time ${c?.totalMs ?? '-'} ms; author tokens in/out ${c?.tokens ? `${c.tokens.input}/${c.tokens.output}` : '-'}; cost US$${c?.costUsd ?? '-'}`, '',
      '| model (408 px) | reference (408 px) |', '|---|---|', `| ![model](model-408.svg) | ![reference](reference-408.svg) |`, '', '## Card body (as saved)', '', b?.body ?? '', ''].join('\n'));
  }
  const worst = [...R.rows].sort((x, y) => (RANK[x.structure] - RANK[y.structure]) || (Number(x.kindMatch) - Number(y.kindMatch)) || ((x.factual?.score ?? 9) - (y.factual?.score ?? 9)) || (x.n < y.n ? -1 : 1)).slice(0, 10);
  writeFileSync(join(out, 'REVIEW.md'), ['# Figure-chapter references, live /explain, review pack figure-chapters-01', '',
    `Set: scripts/explain-bench/sets/figure-chapters.json (48 prompts, 6 per chapter, seed ${'figure-chapters-2026-11-09'}). One pass per arm, Balanced (bench depth key standard). Arm R = full reference library; arm 0 = the same code with EXPLANATION_EXCLUDE_FIGURE_CHAPTERS=on (the 212 figure-chapter references removed from the selector pool).`,
    `Arm R run: ${R.res.meta.runId}; arm 0 run: ${Z.res.meta.runId}. Structure = judge faithful-ref-v1 (faithful-v2 with the reference spec as the Core), first diagram only; fully is the threshold. Per-card files exist for arm R only: card.md, model-spec.json, model-408.svg, reference-408.svg, reference-spec.json.`, '',
    '## Per-arm numbers', '', '| metric | arm R | arm 0 |', '|---|---|---|', ...statRows(sR, sZ), '', '## Arm R', '', table(R.rows, true), '', '## Arm 0 (no per-card files)', '', table(Z.rows, false), '',
    '## Ten lowest structure scores, arm R (structure, then kind miss, then factual)', '', ...worst.map(r => `- ${r.n} ${r.p.referenceId}: structure ${r.structure}, intended ${r.p.want}, model ${r.modelKind}, factual ${fac(r)}`), ''].join('\n'));
  writeFileSync(join(out, 'stats.json'), JSON.stringify({ armR: sR, arm0: sZ, worstR: worst.map(r => ({ n: r.n, id: r.p.referenceId, structure: r.structure, reason: r.structureReason, intended: r.p.want, model: r.modelKind, planner: r.planKind, factual: fac(r) })) }, null, 1) + '\n');
  console.log(JSON.stringify({ armR: sR, arm0: sZ }, null, 1));
}
