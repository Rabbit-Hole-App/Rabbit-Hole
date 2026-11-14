// Read-only poller for the /interactive clone run. HTTP only. Secret read by name, never printed.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2];
const st = JSON.parse(readFileSync('C:/s/spec/interact-real/current.json', 'utf8'));
mkdirSync(OUT, { recursive: true });
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const mint = async () => (await (await fetch('https://rabbit-hole-cp-dev.tryrabbithole.workers.dev/test/session', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: st.email, secret }) })).json()).session;
let session = await mint();
const get = async p => { let r = await fetch(st.base + p, { headers: { ...UA, cookie: `small_session=${session}` } }); if (r.status === 401) { session = await mint(); r = await fetch(st.base + p, { headers: { ...UA, cookie: `small_session=${session}` } }); } return { status: r.status, body: await r.json().catch(() => null) }; };
let jobId = process.argv[3] || null, last = '', first = true;
const DONE = new Set(['ready', 'failed', 'cancelled', 'canceled', 'stopped']);
for (;;) {
  if (!jobId) {
    const l = await get(`/api/learn/explain/jobs?board=${st.boardId}`);
    const arr = Array.isArray(l.body) ? l.body : (l.body?.jobs || []);
    jobId = arr[arr.length - 1]?.id || arr[0]?.id || null;
    if (!jobId) { await new Promise(r => setTimeout(r, 5000)); continue; }
    console.log('job', jobId);
  }
  const r = await get(`/api/learn/explain/jobs/${jobId}?board=${st.boardId}&detail=1`);
  const body = r.body || {}; const j = body.job || {}; const dg = body.diagnostics || {};
  const line = JSON.stringify({ t: new Date().toISOString(), http: r.status, stage: j.stage, attempt: j.attempt, round: j.round, designState: j.designState, rev: j.designRevision, terminal: j.terminal, calls: dg.calls?.length, planHash: dg.design?.planHash || j.designPlanHash, failure: j.failure?.code || j.failure?.message, stop: j.stopReason });
  appendFileSync(`${OUT}/poll.log`, line + '\n');
  writeFileSync(`${OUT}/job-${jobId}-latest.json`, JSON.stringify(body, null, 2));
  if (first) { console.log(`flow=${JSON.stringify(j.flow)} stage=${j.stage}`); first = false; }
  const key = j.stage + '|' + j.designState + '|' + dg.calls?.length; if (key !== last) { console.log(line); last = key; }
  if (body.scenePlan && !globalThis.planSaved) { writeFileSync(`${OUT}/plan.json`, JSON.stringify(body.scenePlan, null, 2)); globalThis.planSaved = true; console.log('scenePlan saved to plan.json'); }
  if (j.terminal || DONE.has(j.stage)) { writeFileSync(`${OUT}/job-${jobId}-final.json`, JSON.stringify(body, null, 2)); console.log('terminal', j.stage); break; }
  await new Promise(r => setTimeout(r, 10000));
}
