// (Kept in the repository for the next run: it also records the plan step's cost estimate.) One Learn section end to end on a dropped Markdown file, driven at the API level on the learn stack (8880): drop -> overview -> start -> plan -> accept -> brief -> compose -> make each item.
// What the browser does with each `perform` (placing cards, starting /explain jobs) is not done here; this reports what the Worker decides and makes. Local identity only; no key is read or printed.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8880', LOG = 'C:/s/spec/learn-local/persist/app.log', DOC = process.env.DOC || 'C:/s/learn-position/docs/features/learn-sections/codebase-index-spec.md', CANVAS = process.env.CANVAS || 'canvas-d0c00003';
const OUT = process.env.OUT || 'C:/s/learn-position/docs/features/learn-sections/run/document-section-run.json';
const t0 = Date.now(), at = () => Number(((Date.now() - t0) / 1000).toFixed(1)), events = [];
const post = async body => {
  const started = Date.now(), res = await fetch(`${BASE}/api/learn/codebase`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: CANVAS, board: 'main', ...body }) });
  return { status: res.status, seconds: Number(((Date.now() - started) / 1000).toFixed(1)), body: await res.json().catch(() => ({})) };
};
let offset = statSync(LOG).size; const logs = [];
const drain = () => { const size = statSync(LOG).size; if (size <= offset) return; const text = readFileSync(LOG, 'utf8').slice(offset); offset = size; for (const raw of text.split('\n')) { const i = raw.indexOf('{"event"'); if (i < 0) continue; try { logs.push(JSON.parse(raw.slice(i))); } catch { /* a partial line */ } } };
const mark = (what, extra = {}) => { const e = { t: at(), what, ...extra }; events.push(e); console.log(JSON.stringify(e)); };
const id = () => `a-${Math.random().toString(36).slice(2, 12)}`;
const act = async body => { let r = await post({ actionId: id(), expectedRevision: 0, ...body }); if (r.status === 409 && r.body?.state?.revision != null) r = await post({ actionId: id(), expectedRevision: r.body.state.revision, ...body }); return r; };

const text = readFileSync(DOC, 'utf8'), name = DOC.split('/').pop();
const drop = await post({ action: 'learn_index', layer: 'overview', source: { kind: 'markdown', name, text, blockId: 'run-1' } });
if (drop.status !== 200 || drop.body.status !== 'ready') { console.log('drop failed', drop.status, JSON.stringify(drop.body).slice(0, 300)); process.exit(1); }
const options = drop.body.index.options; mark('overview', { seconds: drop.seconds, usd: drop.body.index.meta?.usd, options: options.map(o => `${o.id} -> ${o.anchors.join(' ')}`) });
const choice = options.find(o => o.id === process.env.OPTION) || options[0], learn = { ...choice, depth: 'balanced' };
const started = await act({ action: 'start', goal: 'learn_concept', learn }); mark('start', { status: started.status, seconds: started.seconds, error: started.body?.error });
if (started.status !== 200) process.exit(1);
const plan = await post({ action: 'learn_plan', depth: 'balanced', learn: { ...learn, options: options.slice(0, 4) }, outline: [], outlineRevision: null, draft: null, edit: null });
mark('plan', { status: plan.status, seconds: plan.seconds, rows: plan.body?.rows?.length, error: plan.body?.error });
if (plan.status !== 200 || !plan.body.proposal) { console.log(JSON.stringify(plan.body).slice(0, 400)); process.exit(1); }
const saved = await post({ action: 'learn_plan_save', plan: { ops: plan.body.proposal.ops, revision: plan.body.proposal.base ?? 0, acceptedAt: new Date().toISOString(), text: plan.body.text } });
mark('plan accepted', { status: saved.status, error: saved.body?.error, outline: plan.body.proposal.ops.filter(o => o.op === 'add').map(o => `${o.level === 1 ? '' : '  '}${o.text}`) });
const SECTION = process.env.SECTION || '1.1';
const brief = await post({ action: 'learn_section_brief', sectionId: SECTION });
mark('brief', { status: brief.status, seconds: brief.seconds, beats: brief.body?.brief?.beats?.map(b => `${b.id}: ${b.idea}`), anchors: brief.body?.brief?.beats?.map(b => b.anchors), error: brief.body?.error || brief.body?.words });
if (!brief.body?.brief) process.exit(1);
const compose = await post({ action: 'learn_section_compose', sectionId: SECTION });
const items = compose.body?.composition?.items || [];
mark('compose', { status: compose.status, seconds: compose.seconds, items: items.map(i => `${i.id} ${i.beatId} ${i.command}${i.after ? ` after ${i.after}` : ''}`), error: compose.body?.error || compose.body?.words });
if (!items.length) process.exit(1);
const rows = [];
for (const item of [...items.map(i => i.id), 'notes']) {
  const made = await post({ action: 'learn_section_make', sectionId: SECTION, itemId: item });
  const command = items.find(i => i.id === item)?.command || 'document';
  const row = { item, command, seconds: made.seconds, outcome: made.body?.skipped ? 'skipped' : made.body?.perform ? 'made' : `error ${made.status} ${made.body?.error || ''}`, perform: made.body?.perform?.op, note: made.body?.skipped?.note, lead: made.body?.item?.lead?.slice(0, 160), words: made.body?.perform?.markdown ? made.body.perform.markdown.split(/\s+/).length : undefined, prompt: made.body?.perform?.prompt?.slice(0, 220) };
  rows.push(row); mark('make', row);
  if (made.body?.perform) await post({ action: 'learn_section_made', sectionId: SECTION, itemId: item, cardId: `card-${item}` });
}
await new Promise(r => setTimeout(r, 1500)); drain();
const costs = logs.filter(l => /^learn_section_(brief|compose|make)$/.test(l.event) || l.event === 'learn_index' || l.event === 'learn_plan');
writeFileSync(OUT, JSON.stringify({ document: name, canvas: CANVAS, section: SECTION, chose: choice.id, events, rows, serverLines: costs.map(l => ({ event: l.event, item: l.item, command: l.command, calls: l.calls, usd: l.usd, ...(l.estimate_usd ? { estimate_usd: l.estimate_usd, note: 'learn_plan logs the cost estimate of each call, not an actual' } : {}), outcome: l.outcome, errors: l.errors })) }, null, 2) + '\n');
console.log('total usd (brief+compose+make):', costs.filter(l => l.event !== 'learn_index' && l.event !== 'learn_plan').reduce((n, l) => n + (l.usd || 0), 0).toFixed(4), 'seconds', at());
