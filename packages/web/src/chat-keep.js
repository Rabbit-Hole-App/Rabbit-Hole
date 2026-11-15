import { wsHeaders } from './api.js';

// Create as card (owner 2026-11-13): asks the server (chat-keep-route.js, JEV) whether one finished chat reply is worth offering as a written /explain card.
// One decision per reply: remembered for this tab (sessionStorage, so a reload makes no second call) and shared by concurrent askers. A reply too short to be teaching
// material never calls. A failed or slow check answers false and is not remembered, so a later hover tries again.
// ponytail: the decision is per tab, not saved with the message; a second device asks again.
export const MIN_REPLY = 150;
const memo = new Map();
const keyOf = id => `rh.keep:${id}`;
const stored = id => { try { const value = globalThis.sessionStorage?.getItem(keyOf(id)); return value === 'yes' ? true : value === 'no' ? false : null; } catch { return null; } };
const remember = (id, ok) => { try { globalThis.sessionStorage?.setItem(keyOf(id), ok ? 'yes' : 'no'); } catch { /* storage blocked: this page remembers it */ } };

export async function keepAsCard({ app, id = null, question, reply }, post = (url, init) => fetch(url, init)) {
  if (!app || !String(question || '').trim() || String(reply || '').length < MIN_REPLY) return false;
  const key = id ?? `${String(question).slice(0, 80)}|${String(reply).length}`;
  const known = stored(key);
  if (known !== null) return known;
  if (!memo.has(key)) {
    memo.set(key, (async () => {
      try {
        const response = await post('/api/learn/chat/keep', { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ app, question: String(question).slice(0, 500), reply: String(reply).slice(0, 1500) }) });
        const decision = response.ok ? await response.json().catch(() => null) : null;
        if (decision && typeof decision.keep === 'boolean' && decision.via === 'jev') { remember(key, decision.keep); return decision.keep; }
      } catch { /* offline: nothing offered */ }
      memo.delete(key); // a failed check is not an answer: the next hover asks again
      return false;
    })());
  }
  return memo.get(key);
}
