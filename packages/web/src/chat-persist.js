import { api } from './api.js';

// Chat persistence across canvases and Rabbit Holes (owner brief 2026-10-14). The one module that calls Lane B's routes,
// so a change to their shape is an edit here only:
//   POST /api/learn/chat/threads/<threadId>/messages { app, client_id, role, content, status?, mode?, title?, command? }
//     -> { threadId, messageId, clientId, duplicate }. An unknown canvaschat- id is created for this user and canvas; the
//     same client_id in the same thread again writes nothing (duplicate). 404/409: not this user's canvas or thread.
//   GET /api/learn/chat/active?app=[&slot=toc] -> { threadId | null };  PUT /api/learn/chat/active { app, thread_id, slot? }.
//   slot 'toc': the Table of contents' own conversation (owner brief 2026-10-16 item 7), its open thread kept apart from Chat's.
// app is the canvas name, the ref History lists by (chat-threads.js threadsUrl).
export const newThreadId = () => `canvaschat-${crypto.randomUUID()}`;
export const activeUrl = (app, slot = null) => `/api/learn/chat/active?app=${encodeURIComponent(app)}${slot ? `&slot=${slot}` : ''}`;

// The canvas's active thread, or null: none set, deleted, or a canvas the route does not keep one for (404, e.g. a hole
// that has no canvas row yet), where the caller falls back to its default. Any other failure throws.
export async function activeThread(app, call = api, slot = null) {
  try { return (await call(activeUrl(app, slot))).threadId ?? null; }
  catch (error) { if (error.status === 404) return null; throw error; }
}
export const rememberThread = (app, threadId, call = api, slot = null) => call('/api/learn/chat/active', { method: 'PUT', body: JSON.stringify({ app, thread_id: threadId, ...(slot ? { slot } : {}) }) });

// A failed save is sent again with the same body, so the same client_id: the server writes it once. A 4xx is final.
// ponytail: retries live in this tab only; a reload while a save is failing loses it. Add an outbox if saves fail in practice.
export const SAVE_WAITS = [1000, 3000, 9000];
export async function retried(run, waits = SAVE_WAITS) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); } catch (error) {
      if (attempt >= waits.length || (error.status >= 400 && error.status < 500)) throw error;
      await new Promise(done => setTimeout(done, waits[attempt]));
    }
  }
}

// One message POST. Never two in flight for one client_id: the server finds a retry by its client_id but cannot stop two
// concurrent inserts of it, so each request for a client_id starts only after the one before it has settled. A 200
// duplicate is a success like a 201.
const inFlight = new Map();
// A message still on its way to the server: a reload now could lose it (CAD viewer's Reload to update, chunk-reload.js).
export const chatSaving = () => inFlight.size > 0;
export function saveMessage({ threadId, ...body }, call = api) {
  const key = `${threadId}:${body.client_id}`;
  const sent = (inFlight.get(key) || Promise.resolve()).catch(() => {}).then(() => call(`/api/learn/chat/threads/${encodeURIComponent(threadId)}/messages`, { method: 'POST', body: JSON.stringify(body) }));
  inFlight.set(key, sent);
  sent.finally(() => { if (inFlight.get(key) === sent) inFlight.delete(key); }).catch(() => {});
  return sent;
}

// One Auto (Tutor) turn's saves, bound when it is sent to the canvas and thread it was sent from: a late reply (the learner
// has gone to another canvas or thread meanwhile) is saved there, never where they are now. No model is called.
// user(content): the question, before the Tutor generates; onAsked runs once it is saved. assistant(content, status): the
// reply as shown ('done'), or a Stop ('interrupted'), always after the question - a question whose saves all failed is sent
// once more first. Each message has its own client id, `<turnId>-u` and `<turnId>-a`.
export function turnSaver({ app, threadId, turnId, mode = 'auto', title = null, onAsked = null, call = api, waits = SAVE_WAITS }) {
  const post = (suffix, body) => retried(() => saveMessage({ threadId, app, client_id: `${turnId}-${suffix}`, mode, ...body }, call), waits);
  let question = '', asked = null, sent = {};
  const ask = () => post('u', { role: 'user', content: question, ...sent, ...(title ? { title } : {}) });
  return {
    app, threadId,
    // command: the / command a saved command line ran (UI changes brief 1), kept on the message as an Ask turn's is.
    user(content, { command = null } = {}) {
      question = content;
      if (command) sent = { command };
      asked = ask();
      asked.then(() => onAsked?.(), error => console.info('[chat] question not saved:', error.message));
      return asked;
    },
    async assistant(content, status = 'done') {
      await asked.catch(ask);
      return post('a', { role: 'assistant', content, status });
    },
  };
}
