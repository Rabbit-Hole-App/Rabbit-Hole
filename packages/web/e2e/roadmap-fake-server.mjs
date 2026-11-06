// A fake roadmap job server for the keyless roadmap checks (Tutor ladder R4): a small state machine over the recorded contract
// fixtures (docs/features/explain-on-canvas/contracts/fixtures), installed with context.route. It serves what the real routes will
// serve, checks the revision like the real guard (409 with the current view when stale), and records every call. No model, no money.
import { readFileSync } from 'node:fs';

const DIR = new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url);
const fx = name => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
const body = name => fx(name).response.body;
const NONE = { roadmap: null, question: null, limitation: null, plan: null, steps: [], proposal: null, results: [], nextStepReady: false, poll: { afterMs: 500, etag: 'rv-0' } };
const generated = () => { const v = JSON.parse(JSON.stringify(body('accept-proposal-response-generating'))); v.results[0].generation = 'generated'; v.results[0].billing = 'settled'; return v; };
// R6: delivered, with the next proposal not offered yet (the server has not composed it).
const quiet = () => { const v = JSON.parse(JSON.stringify(body('status-delivered-next-ready'))); v.proposal = null; v.nextStepReady = false; for (const s of v.steps) if (s.state === 'proposed') s.state = 'planned'; return v; };
// R5: the pending proposal after an Apply (version 2, the edited words).
const edited = () => { const v = JSON.parse(JSON.stringify(body('status-active-proposal-pending'))); v.proposal.version += 1; v.proposal.title = 'Edited title'; v.proposal.description = 'Edited description.'; v.roadmap.revision += 1; return v; };
// stage -> the view GET returns
const VIEWS = { none: () => NONE, draft: () => body('create-response-draft'), proposed: () => body('status-proposed-plan'), pending: () => body('status-active-proposal-pending'),
  generating: () => body('accept-proposal-response-generating'), generated, delivered: () => body('status-delivered-next-ready'), cancelled: () => body('status-cancelled-paused'),
  quiet, edited, completed: () => body('status-completed'), failed: () => body('status-failed-card'), held: () => body('status-held-for-checking'), questioning: () => body('status-questioning') };
// `<stage> --action--> <stage>`; the first match wins. generating moves on by itself after one GET (generation finished).
// 'accept-plan' -> 'pending' mirrors the REAL server, which offers the first proposal itself when the plan is accepted (control-plane roadmap-loop.test.js asserts it: once, no card, no charge). Nothing else here invents a proposal.
const NEXT = { none: { create: 'draft' }, draft: { poll: 'proposed' }, proposed: { 'accept-plan': 'pending', end: 'completed' }, pending: { accept: 'generating', cancel: 'cancelled', end: 'completed' }, edited: { accept: 'generating', cancel: 'cancelled', end: 'completed' },
  generating: { poll: 'generated' }, quiet: { propose: 'delivered', end: 'completed' }, generated: { ack: 'delivered' }, delivered: { cancel: 'cancelled', end: 'completed' }, cancelled: { propose: 'pending', end: 'completed' }, failed: { retry: 'generating', replace: 'pending', omit: 'cancelled' }, questioning: { answer: 'proposed' } };

// options: stage (start), invitation (offer one), enabled (false: every route answers 404 roadmap_disabled), auto (R6: an acknowledged delivery
// is followed by the server offering the next step on its own after `autoAfterReads` status reads, with no propose request).
// edit (R5): the server has ROADMAP_EDIT_ENABLED on, so every view carries `edit: true` (the Edit button renders only then).
export function fakeRoadmapServer({ stage = 'none', invitation = false, enabled = true, auto = false, autoAfterReads = 2, edit = false } = {}) {
  const server = { stage, invitation, enabled, auto, autoAfterReads, quietReads: 0, calls: [], dismissed: [] };
  const view = () => (edit ? { ...VIEWS[server.stage](), edit: true } : VIEWS[server.stage]());
  const move = action => { const to = NEXT[server.stage]?.[action]; if (to) server.stage = to; return !!to; };
  server.count = suffix => server.calls.filter(c => c.method === 'POST' && c.path.endsWith(suffix)).length;
  server.handler = async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/learn/roadmap', ''), method = request.method();
    const post = method === 'POST' ? request.postDataJSON() : null;
    server.calls.push({ method, path, body: post });
    if (!server.enabled) return route.fulfill({ status: 404, json: { error: 'Not found', code: 'roadmap_disabled' } });
    if (method === 'GET' && path.startsWith('/invitations')) return route.fulfill({ json: server.invitation && !server.dismissed.length ? body('invitation-offered') : { invitation: null } });
    if (method === 'GET' && (path === '' || path === '/')) { const out = view(); if (server.stage === 'draft' || server.stage === 'generating') move('poll'); if (server.stage === 'quiet' && (server.quietReads += 1) >= server.autoAfterReads) server.stage = 'delivered'; return route.fulfill({ json: out }); }
    if (method === 'POST' && /\/invitations\/[^/]+\/dismiss$/.test(path)) { server.dismissed.push(path); return route.fulfill({ json: body('invitation-dismiss') }); }
    if (method === 'POST' && /\/results\/[^/]+\/deliver$/.test(path)) return route.fulfill({ json: body('result-deliver-response') });
    // R5: preview, apply and discard an edit of the pending proposal. The preview does not change the view; Apply moves to the edited version.
    if (method === 'POST' && /\/proposals\/[^/]+\/drafts$/.test(path)) { const v = view(); return route.fulfill({ json: { draft: { draftId: 'pd_fake0001', revision: 1, proposalId: v.proposal.id, proposalVersion: v.proposal.version, title: 'Edited title', description: 'Edited description.', format: 'table', checkStatus: 'passed' }, ...v } }); }
    if (method === 'POST' && /\/drafts\/[^/]+\/apply$/.test(path)) { server.stage = 'edited'; return route.fulfill({ json: view() }); }
    if (method === 'POST' && /\/drafts\/[^/]+\/discard$/.test(path)) return route.fulfill({ json: { draftId: 'pd_fake0001', state: 'discarded' } });
    const action = method === 'POST' ? (path === '' || path === '/' ? 'create' : path.match(/\/(accept-plan|accept|cancel|end|answer|ack|removed)$/)?.[1] || (path.endsWith('/steps/propose') ? 'propose' : path.match(/\/steps\/[^/]+\/(retry|replace|omit)$/)?.[1])) : null;
    if (!action) return route.fulfill({ status: 404, json: { error: 'Not available', code: 'not_found' } });
    const current = view();
    if (action !== 'create' && post.revision !== undefined && current.roadmap && post.revision !== current.roadmap.revision) return route.fulfill({ status: 409, json: { error: 'This roadmap changed. Showing the latest.', code: 'stale_revision', current } });
    if (action === 'ack' && server.auto) server.stage = 'quiet'; else move(action);
    return route.fulfill({ status: action === 'accept' || action === 'create' ? 202 : 200, json: view() });
  };
  return server;
}
