// A fake roadmap job server for the keyless roadmap checks (Tutor ladder R4): a small state machine over the recorded contract
// fixtures (docs/features/explain-on-canvas/contracts/fixtures), installed with context.route. It serves what the real routes will
// serve, checks the revision like the real guard (409 with the current view when stale), and records every call. No model, no money.
import { readFileSync } from 'node:fs';

const DIR = new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url);
const fx = name => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
const body = name => fx(name).response.body;
const NONE = { roadmap: null, question: null, limitation: null, plan: null, steps: [], proposal: null, results: [], nextStepReady: false, poll: { afterMs: 500, etag: 'rv-0' } };
const generated = () => { const v = JSON.parse(JSON.stringify(body('accept-proposal-response-generating'))); v.results[0].generation = 'generated'; v.results[0].billing = 'settled'; return v; };
// stage -> the view GET returns
const VIEWS = { none: () => NONE, draft: () => body('create-response-draft'), proposed: () => body('status-proposed-plan'), pending: () => body('status-active-proposal-pending'),
  generating: () => body('accept-proposal-response-generating'), generated, delivered: () => body('status-delivered-next-ready'), cancelled: () => body('status-cancelled-paused'),
  completed: () => body('status-completed'), failed: () => body('status-failed-card'), held: () => body('status-held-for-checking'), questioning: () => body('status-questioning') };
// `<stage> --action--> <stage>`; the first match wins. generating moves on by itself after one GET (generation finished).
const NEXT = { none: { create: 'draft' }, draft: { poll: 'proposed' }, proposed: { 'accept-plan': 'pending', end: 'completed' }, pending: { accept: 'generating', cancel: 'cancelled', end: 'completed' },
  generating: { poll: 'generated' }, generated: { ack: 'delivered' }, delivered: { cancel: 'cancelled', end: 'completed' }, cancelled: { propose: 'pending', end: 'completed' }, failed: { retry: 'generating', replace: 'pending', omit: 'cancelled' }, questioning: { answer: 'proposed' } };

// options: stage (start), invitation (offer one), enabled (false: every route answers 404 roadmap_disabled).
export function fakeRoadmapServer({ stage = 'none', invitation = false, enabled = true } = {}) {
  const server = { stage, invitation, enabled, calls: [], dismissed: [] };
  const view = () => VIEWS[server.stage]();
  const move = action => { const to = NEXT[server.stage]?.[action]; if (to) server.stage = to; return !!to; };
  server.count = suffix => server.calls.filter(c => c.method === 'POST' && c.path.endsWith(suffix)).length;
  server.handler = async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/learn/roadmap', ''), method = request.method();
    const post = method === 'POST' ? request.postDataJSON() : null;
    server.calls.push({ method, path, body: post });
    if (!server.enabled) return route.fulfill({ status: 404, json: { error: 'Not found', code: 'roadmap_disabled' } });
    if (method === 'GET' && path.startsWith('/invitations')) return route.fulfill({ json: server.invitation && !server.dismissed.length ? body('invitation-offered') : { invitation: null } });
    if (method === 'GET' && (path === '' || path === '/')) { const out = view(); if (server.stage === 'draft' || server.stage === 'generating') move('poll'); return route.fulfill({ json: out }); }
    if (method === 'POST' && /\/invitations\/[^/]+\/dismiss$/.test(path)) { server.dismissed.push(path); return route.fulfill({ json: body('invitation-dismiss') }); }
    if (method === 'POST' && /\/results\/[^/]+\/deliver$/.test(path)) return route.fulfill({ json: body('result-deliver-response') });
    const action = method === 'POST' ? (path === '' || path === '/' ? 'create' : path.match(/\/(accept-plan|accept|cancel|end|answer|ack|removed)$/)?.[1] || (path.endsWith('/steps/propose') ? 'propose' : path.match(/\/steps\/[^/]+\/(retry|replace|omit)$/)?.[1])) : null;
    if (!action) return route.fulfill({ status: 404, json: { error: 'Not available', code: 'not_found' } });
    const current = view();
    if (action !== 'create' && post.revision !== undefined && current.roadmap && post.revision !== current.roadmap.revision) return route.fulfill({ status: 409, json: { error: 'This roadmap changed. Showing the latest.', code: 'stale_revision', current } });
    move(action);
    return route.fulfill({ status: action === 'accept' || action === 'create' ? 202 : 200, json: view() });
  };
  return server;
}
