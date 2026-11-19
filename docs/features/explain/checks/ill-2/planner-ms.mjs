// planner ms distribution from every saved source that carries a per-call planner time (read-only)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1)); return s[i]; };
const share = (a, t) => a.length ? `${a.filter(x => x > t).length} of ${a.length} (${(100 * a.filter(x => x > t).length / a.length).toFixed(1)} %)` : '-';
const row = (name, a, extra = '') => `| ${name} | ${a.length} | ${q(a, .5)} | ${q(a, .9)} | ${q(a, .99)} | ${a.length ? Math.max(...a) : '-'} | ${share(a, 1200)} | ${share(a, 1500)} | ${share(a, 2000)} | ${share(a, 2500)} |${extra}`;
const out = [];
const sources = {};

// A1: 8878 app logs (every *app.log in the persist dir): completed plans (author_raw attempt 0 plan.ms) and planner_failed events
const PERSIST = 'C:/s/spec/owner-local/persist';
const logCompleted = [], logFailed = [], reasons = {};
let files = 0, firstM = Infinity, lastM = 0;
for (const f of fs.readdirSync(PERSIST).filter(x => /app\.log$/.test(x))) {
  const p = path.join(PERSIST, f); files++; const st = fs.statSync(p); firstM = Math.min(firstM, st.mtimeMs); lastM = Math.max(lastM, st.mtimeMs);
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (line.includes('"explanation_planner_failed"')) {
      const m = line.match(/\{.*\}/); if (!m) continue; try { const j = JSON.parse(m[0]); logFailed.push(j.ms ?? null); reasons[j.reason ?? '?'] = (reasons[j.reason ?? '?'] || 0) + 1; } catch { /* partial line */ }
    } else if (line.includes('"explanation_author_raw"') && line.includes('"attempt":0')) {
      const m = line.match(/"plan":\{.*?"ms":(\d+)\}/); if (m) logCompleted.push(Number(m[1]));
    }
  }
}
sources.logs = { files, first: new Date(firstM).toISOString(), last: new Date(lastM).toISOString(), completed: logCompleted, failed: logFailed.filter(x => x != null), reasons };

// A2: 8878 R2 archive records (one per delivered /explain card): trace.plan.ms; plan null => planner failed or disabled
const R2 = `${PERSIST}/local/v3/r2`;
const db = new DatabaseSync(`${R2}/miniflare-R2BucketObject/746c97696fbbb9cf5581f88be52d0dab2857cc3278d166048e6396b80b3dcc16.sqlite`, { readOnly: true });
const arch = { ms: [], nullPlan: 0, n: 0, byDay: {} };
for (const r of db.prepare("select key,blob_id,uploaded from _mf_objects where key like 'explain-archive/%'").all()) {
  let j; try { j = JSON.parse(fs.readFileSync(`${R2}/rabbit-hole-dev-learn-media/blobs/${r.blob_id}`, 'utf8')); } catch { continue; }
  arch.n++; const ms = j.trace?.plan?.ms ?? j.plan?.ms ?? null; const day = new Date(r.uploaded).toISOString().slice(0, 10);
  const d = (arch.byDay[day] ||= { n: 0, ms: [], nullPlan: 0 }); d.n++;
  if (typeof ms === 'number') { arch.ms.push(ms); d.ms.push(ms); } else { arch.nullPlan++; d.nullPlan++; }
}
sources.archive = arch;

// B: bench records: planner failures (events) over all runs (planner on, jev)
const bench = [];
const scan = (file, label) => {
  if (!fs.existsSync(file)) return;
  let runs = 0, failed = 0; const fms = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    let r; try { r = JSON.parse(l); } catch { continue; }
    runs++;
    const ev = Array.isArray(r.events) ? r.events : (() => { try { return JSON.parse(r.events); } catch { return []; } })();
    for (const e of ev) if (e.event === 'explanation_planner_failed') { failed++; if (typeof e.ms === 'number') fms.push(e.ms); }
  }
  bench.push({ label, runs, failed, fms });
};
scan('C:/s/sprint2-evidence/var-1-bench/results.jsonl', 'VAR-1 bench pass 1 (Nov 18 13:30-14:20 PT, machine otherwise quiet; includes the gpt-oss-only rerun slice)');
scan('C:/s/sprint2-evidence/var-1-bench/results-combined.jsonl', 'VAR-1 bench Gemini set (items 0-154 first pass + rerun 14:19-14:37 PT; SAME-1 run in parallel 14:30-14:45)');
scan('C:/s/film-evidence/docs/features/explain/checks/same-1/measure/results.jsonl', 'SAME-1 measurement (Nov 18 about 14:05-14:45 PT, in parallel with the VAR-1 rerun for part of it)');
sources.bench = bench;

// C: offline planner benches (jev-planner rows.json: per-plan ms, run on a quiet machine on Nov 8, same 1200 ms limit in the code of the day? see caveat)
const jev = [];
for (const d of ['2026-11-09T0221', '2026-11-09T0225', 'v2-20261108']) {
  const f = `C:/s/spec/benchmarks/jev-planner/${d}/rows.json`; if (!fs.existsSync(f)) continue;
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')); const ms = (Array.isArray(rows) ? rows : rows.rows).map(r => r.ms).filter(x => typeof x === 'number');
  jev.push({ d, n: ms.length, ms });
}
sources.jev = jev;

out.push('# ILL-2 order 2: planner time distribution (numbers only)\n');
out.push('Planner = the TypeSafe jev call in explanation-planner.js (PLANNER_TIMEOUT_MS = 1200, explanation-planner.js:12). A call that hits the limit is aborted and logged `explanation_planner_failed` with the elapsed ms (it is CENSORED: its true answer time is unknown, the logged ms is the abort time, about 1200 plus overhead). So no completed call can exceed about 1200 ms in these sources; shares above 1,500 / 2,000 / 2,500 ms are therefore 0 by construction wherever the limit was 1200, and the real tail beyond 1200 is NOT measurable from them. The only measure of the tail is the timeout rate itself.\n');
out.push('## Completed calls (planner answered)\n');
out.push('| source | n | p50 | p90 | p99 | max | > 1,200 | > 1,500 | > 2,000 | > 2,500 |\n|---|---|---|---|---|---|---|---|---|---|');
out.push(row('8878 R2 archive trace.plan.ms (115 records, Nov 15 to Nov 18)', sources.archive.ms));
out.push(row(`8878 app logs, explanation_author_raw attempt 0 plan.ms (${sources.logs.files} log files)`, sources.logs.completed));
for (const j of sources.jev) out.push(row(`offline planner bench jev-planner/${j.d} (Nov 8, quiet machine)`, j.ms));
out.push('\n## Timeouts and failures (censored calls)\n');
out.push('| source | calls | planner_failed | share failed | failed-call ms (min / p50 / max) | reasons |\n|---|---|---|---|---|---|');
const lf = sources.logs.failed; const lcomp = sources.logs.completed.length;
out.push(`| 8878 app logs (planner_failed events vs author_raw attempt-0 completed) | ${lf.length + lcomp} | ${lf.length} | ${(100 * lf.length / (lf.length + lcomp || 1)).toFixed(1)} % | ${lf.length ? `${Math.min(...lf)} / ${q(lf, .5)} / ${Math.max(...lf)}` : '-'} | ${JSON.stringify(sources.logs.reasons)} |`);
out.push(`| 8878 R2 archive (plan null vs plan with ms) | ${sources.archive.n} | ${sources.archive.nullPlan} (plan null: timeout, error or planner off) | ${(100 * sources.archive.nullPlan / (sources.archive.n || 1)).toFixed(1)} % | - | - |`);
for (const b of sources.bench) out.push(`| bench: ${b.label} | ${b.runs} runs | ${b.failed} | ${(100 * b.failed / (b.runs || 1)).toFixed(1)} % | ${b.fms.length ? `${Math.min(...b.fms)} / ${q(b.fms, .5)} / ${Math.max(...b.fms)}` : '-'} | - |`);
out.push('\n## 8878 archive by day (uploaded date, UTC)\n');
out.push('| day | records | plan ms n | p50 | p90 | max | plan null |\n|---|---|---|---|---|---|---|');
for (const [day, d] of Object.entries(sources.archive.byDay).sort()) out.push(`| ${day} | ${d.n} | ${d.ms.length} | ${q(d.ms, .5) ?? '-'} | ${q(d.ms, .9) ?? '-'} | ${d.ms.length ? Math.max(...d.ms) : '-'} | ${d.nullPlan} |`);
out.push(`\nLog files span file mtimes ${sources.logs.first} to ${sources.logs.last} (the log lines carry no timestamps).`);
fs.writeFileSync('C:/s/gen1-prep/planner-ms-body.md', out.join('\n') + '\n');
console.log(out.join('\n'));
