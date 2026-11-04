// An in-memory fake of the dev preview's Animation job API, for sgd-qualify.mjs --dry-run and its tests: the routes the product serves
// (canvases, boards, jobs create/get/choose/approve/cancel, Chat proposal messages, results, usage), advanced one step per job read. No network,
// no credential, no model. Costs are canned credits per call; a scenario names how a job ends.
//
//   const fake = createFake({ scenarioFor, allowance, used });  fake.callFor(email) -> call(method, path, body) -> { status, data }
import { createHash } from 'node:crypto';

const COST = { brief: 6.2, author: 25, review: 12, repair: 20 };
const ev = (role, cost = COST[role]) => ({ role, cost });
// events: the calls after Generate, in order; end: how the job finishes; charged: what the learner is charged on a failed end (AN-17: zero).
export const SCENARIOS = {
  accept: { events: [ev('author'), ev('review')], end: 'ready' },
  repair: { events: [ev('author'), ev('review'), ev('repair'), ev('review')], end: 'ready', repairs: 1 },
  reject: { events: [ev('author'), ev('review'), ev('repair'), ev('review')], end: 'rounds', repairs: 1 },
  overrun: { events: [ev('author', 60)], end: 'ready' }, // one author call far above its typical: the guard cancels the job
  hang: { events: [], hang: true, end: 'ready' }, // authoring never finishes: a timeout, a stop or a cancel ends it
  choice: { events: [ev('author'), ev('review')], end: 'ready', choice: true },
  gap: { gap: true },
  control: { events: [ev('author'), ev('review')], end: 'ready', title: 'Why one-to-one tutoring beats a classroom', plan: 'a plan about tutoring and a bell curve' },
  'control-sgd': { events: [ev('author'), ev('review')], end: 'ready', plan: 'a plan that follows gradient descent on a loss surface with two learning rates' },
};
// The dry run's canned story: 8 of the first 9 accepted (one after a repair), one rejected, the wrong-subject control reports a gap.
export const DRY_RUN = prompt => (/2 sigma/.test(prompt) ? 'gap' : /^show me why a high/.test(prompt) ? 'repair' : /^compare learning rate/.test(prompt) ? 'reject' : 'accept');

export function createFake({ scenarios = SCENARIOS, scenarioFor = () => 'accept', allowance = 2500, used = {}, diagnostics = true, planMarkers = null } = {}) {
  const jobs = new Map(), canvases = new Map(), requests = [], cancelled = [], chosen = [], messagesBy = new Map(), usedBy = { ...used };
  let seq = 0, msgSeq = 0, maxActive = 0;
  const active = () => [...jobs.values()].filter(j => !['ready', 'failed', 'cancelled'].includes(j.stage)).length;
  const credits = j => j.calls.reduce((t, c) => t + (c.status === 'running' ? 0 : c.cost), 0);
  const cents = j => Math.ceil(credits(j));
  const userUsed = email => (usedBy[email] || 0) + [...jobs.values()].filter(j => j.owner === email && !j.refund).reduce((t, j) => t + credits(j), 0);
  const post = (j, meta) => { const list = messagesBy.get(j.threadId) ?? []; list.push({ id: `m${(msgSeq += 1)}`, meta }); messagesBy.set(j.threadId, list); return list.at(-1); };
  const proposal = (j, version) => ({ proposal_id: `p-${j.id}-${version}`, version, command: 'animation', input: { job: j.id, plan_hash: j.planHash }, requirements: ['fake requirement'] });
  const postProposal = (j, version) => { const p = proposal(j, version); const m = post(j, { proposal: { ...p, requirements: undefined } }); j.proposals.set(m.id, p); };
  const settle = (j, c) => { c.status = 'settled'; c.costMicros = Math.round(c.cost * 1e4); };

  function advance(j) {
    if (['ready', 'failed', 'cancelled'].includes(j.stage)) return;
    const running = j.calls.find(c => c.status === 'running');
    if (j.stage === 'preparing') {
      if (!running) { j.calls.push({ role: 'brief', cost: COST.brief, status: 'running', costMicros: 0 }); return; }
      settle(j, running);
      if (j.scenario.gap) Object.assign(j, { stage: 'failed', stopReason: 'capability_gap', outcome: 'unsupported', failure: { message: 'That is not something an animation can show yet.' } });
      else {
        Object.assign(j, { stage: 'awaiting_approval', plan: { title: j.scenario.title ?? 'A plan', description: j.scenario.plan ?? planMarkers ?? 'a plan', archetype: null }, planHash: `ph-${j.id}` });
        if (j.scenario.choice) { j.choiceOpen = true; post(j, { animationChoice: { jobId: j.id, key: `k-${j.id}`, alternatives: [{ id: 'smaller' }, { id: 'keep' }], chosen: null } }); } else postProposal(j, 1);
      }
      return;
    }
    if (j.stage !== 'authoring' || j.scenario.hang) return;
    if (running) {
      settle(j, running);
      if (running.role === 'repair') j.repairs += 1;
      return;
    }
    const next = j.scenario.events[j.step];
    if (next) { j.step += 1; j.calls.push({ role: next.role, cost: next.cost, status: 'running', costMicros: 0 }); return; }
    if (j.scenario.end === 'ready') Object.assign(j, { stage: 'ready', stopReason: 'accepted', result: { resultId: `ar_${j.id}`, artifactHash: createHash('sha256').update(`artifact ${j.id}`).digest('hex') } });
    else { Object.assign(j, { stage: 'failed', stopReason: j.scenario.end, failure: { message: 'The animation did not pass review.' } }); j.refund = true; }
  }
  const publicJob = j => ({ id: j.id, boardId: j.boardId, cardId: j.cardId, stage: j.stage, terminal: ['ready', 'failed', 'cancelled'].includes(j.stage), repairs: j.repairs, stopReason: j.stopReason ?? null,
    failure: j.failure ?? null, outcome: j.outcome ?? null, choiceOpen: !!j.choiceOpen, threadId: j.threadId, usage: { credits: j.refund ? 0 : cents(j), unknown: false },
    result: j.result ?? null, ...(j.plan ? { plan: j.plan, planHash: j.planHash } : {}) });

  function route(email, method, path, body) {
    requests.push(`${email} ${method} ${path.split('?')[0]}`);
    const url = new URL(path, 'https://fake.preview'), p = url.pathname, ok = (data, status = 200) => ({ status, data });
    if (method === 'POST' && p === '/api/canvases') { const name = `canvas-${(seq += 1).toString(16).padStart(8, '0')}`; canvases.set(name, { owner: email, title: body.title, boardId: `b-${name}` }); return ok({ name }); }
    let m;
    if ((m = p.match(/^\/api\/learn\/boards\/([^/]+)\/main$/))) { const c = canvases.get(m[1]); return c?.owner === email ? ok({ board_id: c.boardId, state: {} }) : ok({ error: 'Not available' }, 404); }
    if (p === '/api/learn/usage') { const u = userUsed(email); return ok({ enforced: true, period: '2026-11', resetsAt: '2026-12-01T00:00:00.000Z', allowanceCredits: allowance, usedCredits: u, reservedCredits: 0, estimatedCredits: 0, remainingCredits: allowance - u, unknownAttempts: 0, byFeature: [] }); }
    if (p === '/api/learn/chat/active') return ok({ threadId: `th-${url.searchParams.get('app')}` });
    if ((m = p.match(/^\/api\/ask\/threads\/(.+)$/))) return ok({ messages: messagesBy.get(m[1]) ?? [] });
    if ((m = p.match(/^\/api\/learn\/chat\/messages\/([^/]+)\/proposal$/))) { for (const j of jobs.values()) if (j.proposals.has(m[1])) return ok({ proposal: j.proposals.get(m[1]) }); return ok({ error: 'gone' }, 404); }
    if ((m = p.match(/^\/api\/learn\/animation\/jobs\/results\/(.+)$/))) {
      const j = [...jobs.values()].find(x => x.result?.resultId === decodeURIComponent(m[1]));
      return j ? ok({ artifact: { artifactId: j.result.resultId, title: j.scenario.artifactTitle ?? j.scenario.title ?? 'Fake animation', description: j.scenario.plan ?? 'a fake scene' } }) : ok({ error: 'Not found' }, 404);
    }
    if (!p.startsWith('/api/learn/animation/jobs')) return ok({ error: 'Not found' }, 404);
    const rest = p.split('/').slice(5), boardId = method === 'GET' ? url.searchParams.get('board') : body?.boardId;
    const canvas = [...canvases.values()].find(c => c.boardId === boardId);
    if (!canvas || canvas.owner !== email) return ok({ error: 'Not available' }, 404);
    if (method === 'POST' && !rest.length) {
      const scenarioName = scenarioFor(body.prompt), id = `aj_${(seq += 1).toString(16).padStart(8, '0')}${'0'.repeat(24)}`;
      const j = { id, owner: email, boardId, cardId: body.cardId, prompt: body.prompt, features: body.features, stage: 'preparing', repairs: 0, calls: [], step: 0, scenario: scenarios[scenarioName], scenarioName, proposals: new Map(), threadId: `th-${[...canvases].find(([, c]) => c.boardId === boardId)[0]}` };
      jobs.set(id, j); maxActive = Math.max(maxActive, active());
      return ok({ job: publicJob(j) }, 202);
    }
    const j = jobs.get(rest[0]);
    if (!j || j.boardId !== boardId) return ok({ error: 'Not found' }, 404);
    if (method === 'GET') {
      advance(j);
      return ok({ job: publicJob(j), ...(diagnostics ? { diagnostics: { plan: j.plan, calls: j.calls.map(c => ({ role: c.role, status: c.status, costMicros: c.costMicros })), reviews: [{ attempt: 1 }], findings: [], candidates: j.repairs ? [{ repairs: 1, previousDraft: { program: { source: '// before repair' } } }] : [], draft: { program: { source: '// last draft' } }, artifactHash: j.result?.artifactHash ?? null } } : {}) });
    }
    if (rest[1] === 'cancel') { if (!['ready', 'failed', 'cancelled'].includes(j.stage)) { cancelled.push(j.id); j.stage = 'cancelled'; j.stopReason = 'stopped'; for (const c of j.calls) if (c.status === 'running') settle(j, c); } return ok({ job: publicJob(j) }); }
    if (rest[1] === 'choose') {
      if (!j.choiceOpen || body.key !== `k-${j.id}`) return ok({ error: 'plan_stale' }, 409);
      chosen.push(body.choice); j.choiceOpen = false; messagesBy.get(j.threadId).find(x => x.meta.animationChoice).meta.animationChoice.chosen = body.choice; postProposal(j, 1);
      return ok({ job: publicJob(j) });
    }
    if (rest[1] === 'approve') {
      if (j.stage !== 'awaiting_approval' || j.choiceOpen || body.proposal?.input?.job !== j.id) return ok({ error: 'plan_stale' }, 409);
      j.stage = 'authoring'; return ok({ job: publicJob(j) }, 202);
    }
    return ok({ error: 'Not found' }, 404);
  }
  return { callFor: email => async (method, path, body) => route(email, method, path, body), jobs, canvases, requests, cancelled, chosen, get maxActive() { return maxActive; }, usedBy };
}
