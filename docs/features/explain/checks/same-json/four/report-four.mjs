// M1 report builder: reads results.jsonl (arms before = main b29b6bdd7, after = feat/same-json-four tip) and writes REPORT-body.md (tables) and lost-asks.md (every lost ask with all its events verbatim).
// It counts; it does not judge whether a number is right. No file deletion, no child process, no network call.
// usage: node report-four.mjs results.jsonl outDir
import fs from 'node:fs';
const [RES, OUT = 'out'] = process.argv.slice(2);
const rows = fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ARMS = ['before', 'after'], NAME = { before: 'MAIN', after: 'BRANCH' };
const DEPTHS = ['brief', 'balanced', 'detailed'];
const TAGS = { 'ml-sampling-top-k': 'top-k' };
for (const r of rows) r.tag = TAGS[r.refId] ?? r.refId;
const main = rows.filter(r => r.set === 'four'), fallback = rows.filter(r => r.set === 'fallback');
const tags = [...new Map(main.map(r => [r.tag, r])).values()].map(r => ({ tag: r.tag, prompt: r.prompt }));
const nums = (o, acc = []) => { if (typeof o === 'number') acc.push(o); else if (Array.isArray(o)) o.forEach(x => nums(x, acc)); else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => { if (k !== 'variables') nums(v, acc); }); return acc; };
const labels = (o, acc = []) => { if (Array.isArray(o)) o.forEach(x => labels(x, acc)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'variables') continue; if (typeof v === 'string' && /^(label|name|heading|title|text|caption|unit|value)$/.test(k)) acc.push(v); else labels(v, acc); } return acc; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '...' : s);
const valueSig = r => JSON.stringify((r.diagrams ?? []).map(d => nums(d)));
const labelSig = r => JSON.stringify([...new Set((r.diagrams ?? []).flatMap(d => labels(d)))].sort());
const cardSig = r => JSON.stringify([r.title, r.diagrams, r.body]);
const repairsOf = r => (r.attempts ?? []).reduce((a, x) => a + (x.repairs ?? 0), 0);
const errors = r => (r.events ?? []).filter(e => e.event === 'learn_artifact_invalid').map(e => String(e.error));
const rejectedBy = (r, p) => errors(r).some(e => e.startsWith(p));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const spend = rs => rs.reduce((s, r) => s + (r.costMicros || 0) + 200, 0) / 1e6;
const moved = r => !!r.movedToNextProvider || (r.delivered && r.authoredBy?.provider && r.authoredBy.provider !== 'google' && r.profile === 'google-low');
const out = [], P = s => out.push(s);

const stat = rs => {
  const D = rs.filter(r => r.delivered && r.diagrams?.length), known = rs.filter(r => r.firstAttemptValid != null);
  return { n: rs.length, delivered: rs.filter(r => r.delivered).length, lost: rs.filter(r => !r.delivered).length, valid1: known.filter(r => r.firstAttemptValid).length, known: known.length, repairs: rs.reduce((a, r) => a + repairsOf(r), 0),
    values: new Set(D.map(valueSig)).size, labels: new Set(D.map(labelSig)).size, cards: new Set(D.map(cardSig)).size,
    prose: rs.filter(r => rejectedBy(r, 'explanation_bad_prose_number')).length, qmark: rs.filter(r => rejectedBy(r, 'explanation_bad_placeholder')).length, calc: rs.filter(r => rejectedBy(r, 'explanation_bad_calculation')).length,
    moved: rs.filter(moved).length, ms: rs.map(r => r.ms).filter(Number.isFinite), cost: spend(rs) };
};
P('## Measurement\n');
P(`Profile google-low (fallback set: fireworks-low), planner on, a different seed for every ask (bench-<idx>-<ask>), each reference by its own first prompt, at Brief, Balanced and Detailed, five asks each. MAIN = main b29b6bdd7, BRANCH = feat/same-json-four 08eab4313. ${main.length} main-set runs (${main.filter(r => r.arm === 'before').length} MAIN, ${main.filter(r => r.arm === 'after').length} BRANCH) and ${fallback.length} fallback-model runs (BRANCH only). Settled cost: main set US$${spend(main).toFixed(3)}, fallback US$${spend(fallback).toFixed(3)}, total US$${spend(rows).toFixed(3)}; stop line US$1.00. The machine was not otherwise quiet (other lanes ran suites and guards at the same time), so the milliseconds are comparable between the arms (they alternate) and not against older runs.\n`);
P('Columns, out of 5 asks: **delivered**; **valid first time**; **repairs** (summed); **value sets** (the numbers of every diagram in spec order, the variables list apart), **label sets**, **whole cards** among the delivered cards; **lost** = asks with no card; **rej-prose** = asks where an attempt was refused by the prose-number check, **rej-?** = by the "?" check, **rej-calc** = by the function step; **fallback** = asks where the first provider failed and the next provider was tried (movedToNextProvider). **Read this with the next paragraph: on this run the Fireworks model answered NOT_FOUND ("Model not found, inaccessible, and/or not deployed") on every call, so a moved ask that Gemini could not answer was lost, and a fireworks-low ask was answered by Gemini after Fireworks failed.**\n');
P('| reference | depth | arm | delivered | valid first time | repairs | value sets | label sets | whole cards | lost | rej-prose | rej-? | rej-calc | fallback |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const zero = () => ({ n: 0, delivered: 0, lost: 0, valid1: 0, known: 0, repairs: 0, prose: 0, qmark: 0, calc: 0, moved: 0 });
for (const t of tags) for (const depth of DEPTHS) for (const arm of ARMS) {
  const rs = main.filter(r => r.tag === t.tag && r.depth === depth && r.arm === arm), s = stat(rs);
  P(`| ${t.tag} | ${depth} | ${NAME[arm]} | ${s.delivered}/${s.n} | ${s.valid1}/${s.known} | ${s.repairs} | ${s.values} | ${s.labels} | ${s.cards} | ${s.lost} | ${s.prose} | ${s.qmark} | ${s.calc} | ${s.moved} |`);
}
const block = (title, rsOf) => {
  P(`\n**${title}**\n`);
  P('| arm | asks | delivered | lost | valid first time | repairs | rej-prose | rej-? | rej-calc | to the fallback provider | median ms | p90 ms | settled cost (US$) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const arm of ARMS) { const s = stat(rsOf().filter(r => r.arm === arm)); P(`| ${NAME[arm]} | ${s.n} | ${s.delivered} | ${s.lost} | ${s.valid1}/${s.known} | ${s.repairs} | ${s.prose} | ${s.qmark} | ${s.calc} | ${s.moved} | ${pct(s.ms, 0.5)} | ${pct(s.ms, 0.9)} | ${s.cost.toFixed(3)} |`); }
};
block('Totals, all five references (75 asks per arm)', () => main);
block('The four declared references only (60 asks per arm), for comparison with build 2 of the full build (delivered 60/60, valid first time 49/60, 5 moved to the fallback, median 2600 ms, p90 5398 ms; main in that build: 60/60, 59/60, 0, 2245 ms, 2846 ms)', () => main.filter(r => r.tag !== 'top-k'));
block('top-k only (15 asks per arm; parked: BRANCH is expected to behave as MAIN)', () => main.filter(r => r.tag === 'top-k'));
const tm = stat(main.filter(r => r.arm === 'before')), ta = stat(main.filter(r => r.arm === 'after'));
const diff = tm.delivered - ta.delivered;
P(`\n**Pass line (BRANCH delivers at least MAIN minus 1 of 75): ${diff <= 1 ? 'MET' : 'NOT MET'}** — MAIN delivered ${tm.delivered} of ${tm.n}, BRANCH ${ta.delivered} of ${ta.n} (${diff > 0 ? 'BRANCH below MAIN by ' + diff : diff === 0 ? 'equal' : 'BRANCH above MAIN by ' + (-diff)}).\n`);

P('## Rescued visuals (decision (a)): trace.rescuedVisual on BRANCH\n');
P('One entry per rescued item per answer; the entries accumulate across a repair or fallback answer of the same ask (the verifier saw this), so the table gives both the entries and the asks.\n');
const resc = rows.filter(r => r.arm === 'after' && Array.isArray(r.rescuedVisual) && r.rescuedVisual.length);
const by = {};
for (const r of resc) for (const e of r.rescuedVisual) { const k = `${r.tag}|${e.tag}`; by[k] ??= { entries: 0, asks: new Set() }; by[k].entries++; by[k].asks.add(r.idx); }
P('| reference | rescued tag | entries | asks | asks delivered |\n|---|---|---|---|---|');
for (const [k, v] of Object.entries(by).sort()) { const [ref, tag] = k.split('|'); P(`| ${ref} | ${tag} | ${v.entries} | ${v.asks.size} | ${[...v.asks].filter(i => rows.find(r => r.idx === i && r.arm === 'after')?.delivered).length} |`); }
if (!Object.keys(by).length) P('| (none) | | 0 | 0 | 0 |');
P(`\nBRANCH asks with a rescue entry: ${resc.length} of ${rows.filter(r => r.arm === 'after').length}. MAIN has no such field (the rescue does not exist there); MAIN asks where Gemini wrote a mis-tagged visual cannot be told from the record except through a lost or dropped visual.\n`);

P('## The fallback model (BRANCH only, two asks per declared reference, profile fireworks-low)\n');
P('| reference | ask | seed | delivered | valid first time | server step | refused by |\n|---|---|---|---|---|---|---|');
const stepText = r => { const c = r.calculation?.[0]; if (!c || typeof c !== 'object') return 'none recorded'; return `inputs ${Object.entries(c.inputs ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}; ${(c.overwritten ?? []).length ? 'overwrote ' + c.overwritten.join(', ') : 'overwrote nothing'}`; };
for (const r of [...fallback].sort((a, b) => a.idx - b.idx)) P(`| ${r.tag} | ${r.rep} | ${r.requestSeed} | ${r.delivered ? 'yes' : 'no card'} | ${r.firstAttemptValid} | ${cut(stepText(r), 120).replace(/\|/g, '/')} | ${[...new Set(errors(r).map(e => e.slice(0, 80)))].join(' // ').replace(/\|/g, '/') || '-'} |`);
const fs2 = stat(fallback); P(`\nFallback: delivered ${fs2.delivered}/${fs2.n}, lost ${fs2.lost}, rej-prose ${fs2.prose}, rej-? ${fs2.qmark}, rej-calc ${fs2.calc}.\n`);

P('## Every ask\n');
P('One line per ask: server step (BRANCH), a refusal if any, then title, labels and values. Counted, not judged.\n');
for (const t of tags) {
  P(`### ${t.tag}: ${t.prompt}\n`);
  for (const depth of DEPTHS) for (const arm of ARMS) {
    P(`**${NAME[arm]}, ${depth}**\n`);
    for (const r of main.filter(x => x.tag === t.tag && x.depth === depth && x.arm === arm).sort((a, b) => a.rep - b.rep)) {
      const errs = errors(r), extra = [arm === 'after' ? stepText(r) : null, errs.length ? `refused: ${[...new Set(errs.map(e => e.replace(/\|/g, '/').slice(0, 130)))].join(' // ')}` : null, r.rescuedVisual?.length ? `rescued ${r.rescuedVisual.map(e => e.tag).join(',')}` : null, moved(r) ? 'FALLBACK PROVIDER' : null].filter(Boolean).join('; ');
      const head = `- ask ${r.rep} (seed ${r.requestSeed ?? '-'}, ${r.ms} ms${extra ? '; ' + extra : ''}):`;
      if (!r.delivered || !r.diagrams?.length) { P(`${head} **${r.delivered ? 'card without a diagram' : 'no card: ' + r.errorCode}**`); continue; }
      P(`${head} **${r.title}** | ${r.diagrams.map(d => `${d.kind}: ${cut(labels(d).join(' / '), 150)}`).join(' || ')} | values ${r.diagrams.map(d => cut(nums(d).join(', '), 130)).join(' || ')}`);
    }
    P('');
  }
}
P('### The fallback asks\n');
for (const r of [...fallback].sort((a, b) => a.idx - b.idx)) P(!r.delivered || !r.diagrams?.length ? `- ${r.tag} ask ${r.rep} (seed ${r.requestSeed}): **${r.delivered ? 'card without a diagram' : 'no card: ' + r.errorCode}**` : `- ${r.tag} ask ${r.rep} (seed ${r.requestSeed}): ${stepText(r)} | **${r.title}** | ${r.diagrams.map(d => `${d.kind}: ${cut(labels(d).join(' / '), 150)}`).join(' || ')} | values ${r.diagrams.map(d => cut(nums(d).join(', '), 130)).join(' || ')}`);
P('');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + '/REPORT-body.md', out.join('\n') + '\n');

const lost = rows.filter(r => !r.delivered);
const L = ['# Every lost ask with all its events, verbatim\n', `${lost.length} asks without a card (all arms, all sets). Each block: idx, arm, set, reference, depth, ask, seed, error code, failure message, attempts, then the events array exactly as recorded.\n`];
for (const r of lost) L.push(`## idx ${r.idx}, ${NAME[r.arm] ?? r.arm}, ${r.set}, ${r.tag}, ${r.depth}, ask ${r.rep}, seed ${r.requestSeed ?? '-'}\n\nerrorCode: ${r.errorCode}\n\nfailureMessage: ${r.failureMessage}\n\nattempts: ${JSON.stringify(r.attempts)}\n\nevents:\n\n\`\`\`json\n${JSON.stringify(r.events, null, 1)}\n\`\`\`\n`);
if (!lost.length) L.push('(no lost ask)\n');
fs.writeFileSync(OUT + '/lost-asks.md', L.join('\n'));
console.log(`wrote ${OUT}/REPORT-body.md (${out.length} lines) and lost-asks.md (${lost.length} lost); MAIN delivered ${tm.delivered}/${tm.n}, BRANCH ${ta.delivered}/${ta.n}`);
