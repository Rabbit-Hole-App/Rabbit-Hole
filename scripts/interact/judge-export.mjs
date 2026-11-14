// Owner-authorised (2026-11-13, brief 9 section 1): write the shadow judge's findings of every ledger row that has a judge verdict, from what already exists. No model call, no rerun.
//   - the four template jobs: GET job detail (?detail=1) from the dev clone as the look account (read only; the bypass key is read by name from small-deploy/.env, never printed)
//   - earlier jobs: the saved job-<id>-final-full.json under docs/features/interact/evidence (no network); a job with no saved detail is listed as unreadable
// Writes evidence/2026-11-13-template/judge/<plan>.json for the template cards, judge/earlier/<jobId>.json for the rest, and judge/findings.md (per card, majors first, verbatim).
//   node scripts/interact/judge-export.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE = join(ROOT, 'docs/features/interact/evidence'), OUT = join(EVIDENCE, '2026-11-13-template/judge');
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const look = JSON.parse(readFileSync('C:/s/spec/interact-real/look-canvas.json', 'utf8'));
const rows = readFileSync(join(ROOT, 'docs/features/interact/benchmarks/ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const judged = rows.filter(r => r.judgeVerdict);
mkdirSync(join(OUT, 'earlier'), { recursive: true });

const secret = (readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: look.email, secret }) })).json()).session;
const liveDetail = async id => { const r = await fetch(`${BASE}/api/learn/explain/jobs/${id}?detail=1&board=${look.boardId}`, { headers: { ...UA, cookie: `small_session=${session}` } }); return r.ok ? r.json() : null; };
const savedDetail = id => {
  const stack = [EVIDENCE];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(join(dir, e.name));
      else if (e.name === `job-${id}-final-full.json`) return JSON.parse(readFileSync(join(dir, e.name), 'utf8'));
    }
  }
  return null;
};

const out = [], unreadable = [];
for (const row of judged) {
  const template = row.buildKind === 'template';
  const detail = template ? await liveDetail(row.jobId) : savedDetail(row.jobId);
  const judge = detail?.diagnostics?.bench?.judge;
  if (!judge) { unreadable.push(row.jobId); continue; }
  const record = { jobId: row.jobId, plan: row.oracleId, depth: row.depth, profile: row.profile, buildKind: row.buildKind ?? 'model', judgeModel: judge.model, verdict: judge.verdict, costMicros: judge.costMicros ?? null, ms: judge.ms ?? null, findings: judge.findings ?? [] };
  writeFileSync(template ? join(OUT, `${row.oracleId}.json`) : join(OUT, 'earlier', `${row.jobId}.json`), JSON.stringify(record, null, 2) + '\n');
  out.push(record);
}

const order = { major: 0, minor: 1 };
const section = r => {
  const sorted = [...r.findings].sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
  const lines = sorted.map((f, i) => `${i + 1}. **${f.severity}** · capture \`${f.capture ?? '-'}\` · ${f.category ?? '-'}${f.object ? ` · object \`${f.object}\`` : ''}\n   ${String(f.message).replace(/\n/g, ' ')}`);
  return `## ${r.plan} (${r.depth}, ${r.profile}, ${r.buildKind}) job ${r.jobId}\n\nVerdict **${r.verdict}**, ${r.findings.length} findings (${r.findings.filter(f => f.severity === 'major').length} major), judge ${r.judgeModel}.\n\n${lines.join('\n') || '(none)'}\n`;
};
const body = [...out.filter(r => r.buildKind === 'template'), ...out.filter(r => r.buildKind !== 'template')].map(section).join('\n');
writeFileSync(join(OUT, 'findings.md'), `# Shadow judge findings\n\nExported by scripts/interact/judge-export.mjs from the job details (verbatim, majors first). The four template cards first, then earlier ledger rows that carry a judge verdict.\n${unreadable.length ? `\nNo longer readable (no saved detail): ${unreadable.join(', ')}\n` : ''}\n${body}`);
console.log(`judged rows ${judged.length}; exported ${out.length}; unreadable ${unreadable.length ? unreadable.join(', ') : 'none'}`);
