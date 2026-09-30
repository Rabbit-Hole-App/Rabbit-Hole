import { wsHeaders } from '../api.js';
import { endpointFor } from './scope.js';

// What /api/ask and /api/learn/ask send (control-plane ask.js:362-454; ask.jsx:530-545 handles
// the same set, 'paper' at :534).
const EVENTS = new Set(['chunk', 'progress', 'graph', 'proposal', 'papers', 'paper', 'wiki', 'video', 'outline', 'done', 'error']);

// The body ask.jsx:466-485 builds for these scopes. A project question carries the selected
// node and the commit it was selected on; the server 409s a mismatched thread (repositories.js:177).
export function askBody({ scope, message, threadId = null, model = 'auto' }) {
  return {
    scope: endpointFor(scope).scope,
    ...(scope.kind === 'project' && scope.selected ? { repository_context: { commit: scope.selected.commit, nodeId: scope.selected.id, label: scope.selected.label } } : {}),
    message,
    thread_id: threadId,
    ...(model !== 'auto' ? { model } : {}),
  };
}

// One frame per blank line, one event: and one data: line each (ask.js:362).
function frames(buffer) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop();
  const events = [];
  for (const part of parts) {
    const type = (part.match(/^event: (.+)$/m) || [])[1];
    const data = (part.match(/^data: (.+)$/m) || [])[1];
    if (type && data) events.push({ type, data: JSON.parse(data) });
  }
  return { events, rest };
}

// POST and stream, as ask.jsx:494-547 does. A JSON reply is {choose} or {error}; any other
// failure that is not a stream is an error, never silence. An attachment goes to /api/ask only:
// the dev worker handles /api/learn/ask as JSON (dev-worker.js:72). Abort rejects with AbortError.
export async function streamAsk({ path, body, file = null, signal, onEvent }) {
  let request;
  if (file) {
    const form = new FormData();
    form.append('body', JSON.stringify(body));
    form.append('file', file);
    request = { headers: wsHeaders(), body: form };
  } else {
    request = { headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify(body) };
  }
  const response = await fetch(path, { method: 'POST', signal, ...request });
  if ((response.headers.get('Content-Type') || '').includes('json')) {
    const data = await response.json();
    return data.choose ? onEvent('choose', data) : onEvent('error', { error: data.error || `HTTP ${response.status}` });
  }
  if (!response.ok) return onEvent('error', { error: `HTTP ${response.status}` });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const { events, rest } = frames(buffer + decoder.decode(value, { stream: true }));
    buffer = rest;
    for (const { type, data } of events) {
      if (EVENTS.has(type)) onEvent(type, data);
      else console.info('Agent Bar ignored event', type);
    }
  }
}
