// /whiteboard smoke through the routes, no browser (roadmap W1 acceptance; W6.5 reuses it). One signed-in dev test user, one fresh canvas per case:
//   node scripts/whiteboard/whiteboard-smoke.mjs [--base <review clone url>] [--cases 10,30,60,refusal,edit,cancel]
// A video case: create -> plan -> read the signed proposal from the Chat thread -> approve -> poll -> result -> download the MP4 and ffprobe it.
// Prints the plan text, the "up to N credits" value (proposal usage), the stage timeline, the manifest's timings line, the ffprobe fields and the
// usage summary before and after each case. DEV ONLY: the session comes from rabbit-hole-cp-dev /test/session (RABBIT_HOLE_DEV_TEST_BYPASS read by
// name from the credentials file, never printed). These are real model, Fish and renderer calls and cost real (dev) credits.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'https://rabbit-hole-web-dev-wb-integrate.tryrabbithole.workers.dev');
const CASES = arg('--cases', '10,30,60,refusal,edit,cancel').split(',');
const DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', UA = { 'User-Agent': 'rabbit-hole-whiteboard-smoke/1' }, EMAIL = 'whiteboard-smoke@example.com';
const PROMPT = 'explain gradient descent with one worked example';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(...a);

const credentials = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const bypass = (credentials.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (!bypass) { say('STOP: RABBIT_HOLE_DEV_TEST_BYPASS is missing'); process.exit(2); }
const minted = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret: bypass }) });
const session = (await minted.json().catch(() => ({}))).session;
if (!session) { say(`STOP: no dev session (HTTP ${minted.status})`); process.exit(1); }
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null), res: r };
};
const usage = async () => { const r = await api('GET', '/api/learn/usage'); return r.data ? JSON.stringify(r.data).slice(0, 360) : `HTTP ${r.status}`; };

async function canvas(label) {
  const made = await api('POST', '/api/canvases', { title: `Whiteboard smoke ${label} ${new Date().toISOString()}` });
  const app = made.data?.name;
  const board = app && await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
  if (!board?.data?.board_id) throw new Error(`canvas not made (HTTP ${made.status})`);
  return { app, boardId: board.data.board_id };
}
async function create(ctx, seconds, prompt = PROMPT) {
  const r = await api('POST', '/api/learn/whiteboard/jobs', { boardId: ctx.boardId, requestId: randomUUID(), cardId: randomUUID(), prompt, durationSeconds: seconds });
  if (r.status >= 300) throw new Error(`create HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data.job;
}
const status = (ctx, id) => api('GET', `/api/learn/whiteboard/jobs/${encodeURIComponent(id)}?board=${encodeURIComponent(ctx.boardId)}`).then(r => r.data);
const timeline = [];
async function until(ctx, id, done, label, limitMs = 40 * 60000) {
  const t0 = Date.now();
  for (let last = null; Date.now() - t0 < limitMs; await sleep(3000)) {
    const d = await status(ctx, id), job = d?.job;
    if (job?.stage !== last) { last = job?.stage; timeline.push(`${label}: ${job?.stage} at +${((Date.now() - t0) / 1000).toFixed(0)}s`); say(`  [${label}] stage ${job?.stage} +${((Date.now() - t0) / 1000).toFixed(0)}s`); }
    if (job && done(job)) return d;
  }
  throw new Error(`${label}: timed out`);
}
async function proposalOf(ctx) {
  // The job posts its plan into the canvas's open Chat thread (it makes one the open thread when there is none): read it back as the UI does.
  const active = await api('GET', `/api/learn/chat/active?app=${encodeURIComponent(ctx.app)}`);
  const t = active.data?.threadId ? await api('GET', `/api/ask/threads/${encodeURIComponent(active.data.threadId)}`) : { data: null };
  const msgs = t.data?.messages ?? [];
  const withProposal = [...msgs].reverse().find(m => m.meta?.proposal?.proposal_id);
  return { proposal: withProposal?.meta?.proposal ?? null, text: msgs.map(m => m.content).filter(Boolean).slice(-3) };
}
const planText = job => `goal: ${job.plan?.goal}\n${(job.plan?.scenes ?? []).map((s, i) => `  Scene ${i + 1} (${((s.endFrame - s.startFrame) / 30)} s): ${s.learningPoint}`).join('\n')}`;

async function ffprobe(file) {
  try {
    const { RenderInternals } = await import('@remotion/renderer');
    const run = args => RenderInternals.callFf({ bin: 'ffprobe', args, indent: false, logLevel: 'error', binariesDirectory: null });
    const v = JSON.parse((await run(['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,pix_fmt,color_space,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', file])).stdout).streams[0];
    const a = JSON.parse((await run(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'json', file])).stdout).streams?.[0]?.codec_name ?? null;
    return { ...v, audio: a };
  } catch (error) { return { error: String(error.message).slice(0, 200) }; }
}

async function videoCase(seconds) {
  say(`\n=== ${seconds} s video ===`);
  const ctx = await canvas(`${seconds}s`), before = await usage(), t0 = Date.now();
  const job = await create(ctx, seconds);
  const planned = await until(ctx, job.id, j => ['awaiting_approval', 'failed', 'cancelled'].includes(j.stage), `${seconds}s plan`);
  if (planned.job.stage !== 'awaiting_approval') { say('  NOT PLANNED:', JSON.stringify(planned.job.failure ?? planned.job.stage)); return { ok: false }; }
  const { proposal, text } = await proposalOf(ctx);
  say(planText(planned.job)); say('  chat text rows:', text.length, JSON.stringify(text).slice(0, 200));
  say(`  proposal usage: ${JSON.stringify(proposal?.usage)} -> "up to ${proposal?.usage?.max_credits} credits" (estimate ${proposal?.usage?.estimate_credits})`);
  if (!proposal) return { ok: false };
  const generateAt = Date.now();
  const approved = await api('POST', `/api/learn/whiteboard/jobs/${job.id}/approve`, { boardId: ctx.boardId, proposal });
  if (approved.status >= 300) { say('  APPROVE FAILED', approved.status, JSON.stringify(approved.data).slice(0, 300)); return { ok: false }; }
  const done = await until(ctx, job.id, j => ['ready', 'failed', 'cancelled'].includes(j.stage), `${seconds}s generate`, 45 * 60000);
  const wall = (Date.now() - generateAt) / 1000;
  say(`  generate to ${done.job.stage}: ${wall.toFixed(0)} s wall; total with plan ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (done.job.stage !== 'ready') { say('  FAILED:', JSON.stringify(done.job.failure)); say('  usage before:', before, '\n  usage after: ', await usage()); return { ok: false }; }
  say('  block:', JSON.stringify(done.block)); say('  timings:', JSON.stringify(done.job.timings ?? done.timings));
  const result = await api('GET', `/api/learn/whiteboard/results/${encodeURIComponent(done.block.artifactId)}?board=${encodeURIComponent(ctx.boardId)}`);
  say('  result timings:', JSON.stringify(result.data?.timings ?? result.data?.result?.timings));
  const ws = new URL(BASE).hostname;   // the asset route authorizes with the session; the workspace header is the personal one
  const asset = await fetch(`${BASE}/api/learn/whiteboard/assets?app=${ctx.app}&workspace=${encodeURIComponent('')}&artifact=${encodeURIComponent(done.block.artifactId)}&kind=final`, { headers: { ...UA, cookie: `small_session=${session}` } });
  if (!asset.ok) say(`  asset route HTTP ${asset.status} (workspace parameter may be required; ${ws})`);
  else { const file = join(mkdtempSync(join(tmpdir(), 'wb-smoke-')), `${seconds}s.mp4`); writeFileSync(file, Buffer.from(await asset.arrayBuffer())); say(`  MP4 ${file}: ${(await ffprobe(file)) && JSON.stringify(await ffprobe(file))}`); }
  say('  usage before:', before, '\n  usage after: ', await usage());
  return { ok: true };
}

async function refusalCase() {
  say('\n=== refusal: "make a game I can play" ===');
  const ctx = await canvas('refusal'), before = await usage();
  const job = await create(ctx, 60, 'make a game I can play');
  const d = await until(ctx, job.id, j => !['queued', 'planning'].includes(j.stage), 'refusal');
  const { text } = await proposalOf(ctx);
  say('  stage:', d.job.stage, JSON.stringify(d.job.outcome ?? d.job.unsupported ?? d.job.failure)); say('  chat:', JSON.stringify(text).slice(0, 500));
  say('  usage before:', before, '\n  usage after: ', await usage());
}
async function editCase() {
  say('\n=== Edit (refine) ===');
  const ctx = await canvas('edit'), before = await usage();
  const job = await create(ctx, 30);
  await until(ctx, job.id, j => j.stage === 'awaiting_approval', 'edit plan');
  const refined = await api('POST', `/api/learn/whiteboard/jobs/${job.id}/refine`, { boardId: ctx.boardId, message: 'Make it simpler and use smaller numbers.' });
  say('  refine HTTP', refined.status);
  const d = await until(ctx, job.id, j => j.stage === 'awaiting_approval' && (j.plan?.revision ?? 1) >= 2, 'edit replan');
  say(`  plan revision ${d.job.plan.revision}\n${planText(d.job)}`);
  say('  usage before:', before, '\n  usage after: ', await usage());
}
async function cancelCase() {
  say('\n=== Cancel before Generate ===');
  const ctx = await canvas('cancel'), before = await usage();
  const job = await create(ctx, 30);
  await until(ctx, job.id, j => j.stage === 'awaiting_approval', 'cancel plan');
  const c = await api('POST', `/api/learn/whiteboard/jobs/${job.id}/cancel`, { boardId: ctx.boardId });
  const d = await status(ctx, job.id);
  say('  cancel HTTP', c.status, 'stage now', d.job.stage);
  say('  usage before:', before, '\n  usage after: ', await usage());
}

let failed = 0;
for (const c of CASES) {
  try {
    if (/^\d+$/.test(c)) { const r = await videoCase(Number(c)); if (!r.ok) failed++; }
    else if (c === 'refusal') await refusalCase();
    else if (c === 'edit') await editCase();
    else if (c === 'cancel') await cancelCase();
  } catch (error) { failed++; say(`  ERROR in case ${c}: ${error.message}`); }
}
say(`\nSMOKE ${failed ? 'FAILED' : 'OK'} (${failed} failing case(s))`);
process.exit(failed ? 1 : 0);
