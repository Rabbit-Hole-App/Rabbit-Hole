// Standalone mount of the real AdaptiveCanvas with the inline AI editor, for e2e/inline-ai-check.mjs. MOCKED: the transport
// below stands in for the worker, JEV and the model - its answers are scripted, its stream is real bytes through the
// app's own SSE parser (readGeneration), and nothing leaves the machine. Vite dev serves it from disk; it is never a
// vite.config.js entry, so it never ships. ?board=<key> picks the board; ?readonly=1 view-only; ?flush=<ms> the coalescing
// window (0: render every chunk, the A2 baseline); ?motion=0 turns Motion off.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdaptiveCanvas from '../src/AdaptiveCanvas.jsx';
import { NextStepsCard } from '../src/ask.jsx';
import { readGeneration } from '../src/inline-ai-transport.js';
import { checkDecision, checkRequest, fixedRoute, generationPrompt, INLINE_SLASH, settle } from '../src/inline-ai-decide.js';
import { ERRORS, HANDLERS, MOTION } from './inline-ai-handler-fixtures.js';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const readOnly = params.get('readonly') === '1';
const motionOn = params.get('motion') !== '0';
const delay = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
});

// The scripted provider's knobs and its record of every call (content stays in the page; nothing is sent anywhere).
const mock = window.__inlineMock = {
  calls: [], telemetry: [], routeAnswers: {}, decideAnswers: {}, decideError: null, tokens: new Map(), routeMs: 120, firstMs: 200, chunkMs: 35, chunkWords: 1, hold: null, failNext: null, artifactAnswer: null, routeError: null, cancelled: 0,
};
// A note grounded in the context the request carried: its target, its stored connections and whether they are complete.
const name = text => (/^\d+$/.test(String(text).trim()) ? `node ${String(text).trim()}` : `“${String(text).trim()}”`);
function scriptedNote(context) {
  const target = context.target.objects;
  if (target.length > 1) return `${target.map(entry => name(entry.text)).join(' and ')} belong together${context.target.group?.label ? ` in “${context.target.group.label}”` : ''}: ${context.connections.filter(link => link.kind === 'connection').length ? 'they are connected in order.' : 'they share a group.'}`;
  const one = target[0], words = id => (context.related.find(entry => entry.id === id) || {}).text;
  if (one.flattened) return 'This is one flattened image of a tree; its circles are part of the picture, not objects on the canvas.';
  const incoming = context.connections.filter(link => link.of === one.id && link.direction === 'incoming' && link.kind === 'connection');
  const outgoing = context.connections.filter(link => link.of === one.id && link.direction === 'outgoing' && link.kind === 'connection');
  if (incoming.length && !outgoing.length && context.complete[one.id]) {
    const siblings = context.related.filter(entry => entry.relation === 'sibling').map(entry => name(entry.text));
    return `${name(one.text)[0].toUpperCase()}${name(one.text).slice(1)} is a child of ${name(words(incoming[0].other))}${siblings.length ? `, beside ${siblings.join(' and ')}` : ''}. In the tree shown, it is also a leaf because it has no children.`;
  }
  if (incoming.length && outgoing.length) return `${name(one.text)} follows ${name(words(incoming[0].other))}${incoming[0].label ? ` (${incoming[0].label})` : ''} and leads to ${name(words(outgoing[0].other))}${outgoing[0].label ? ` (${outgoing[0].label})` : ''}.`;
  return `${name(one.range?.text ?? one.text)} is selected on its own here.`;
}
function scriptedEdit(prompt, context) {
  const objects = context.target.objects, p = prompt.toLowerCase();
  if (objects[0]?.range) {
    const quoted = prompt.match(/"([^"]+)"/)?.[1];
    return { summary: 'Rewrote the selected words', ops: [{ op: 'replace_range', id: objects[0].id, from: objects[0].range.from, to: objects[0].range.to, text: quoted || objects[0].range.text.toUpperCase() }] };
  }
  if (/larger|bigger/.test(p)) return { summary: 'Larger labels', ops: objects.map(entry => ({ op: 'set_style', id: entry.id, style: { fontSize: 24 } })) };
  if (/fix/.test(p)) return { summary: 'Fixed the loop and the return', ops: objects.map(entry => ({ op: 'replace_text', id: entry.id, text: entry.text.replace('s =+ x', 's += x').replace('retrun', 'return') })) };
  if (/delete|neighbour|everything/.test(p)) return { summary: 'Needs more than the selection', ops: [], limitation: 'Renaming the other nodes needs them selected too.' };
  if (/shorter/.test(p)) return { summary: 'Shorter', ops: objects.map(entry => ({ op: 'replace_text', id: entry.id, text: entry.text.split(/(?<=\.)\s/)[0] })) };
  return { summary: 'Edited', ops: objects.map(entry => ({ op: 'replace_text', id: entry.id, text: `${entry.text} (edited)` })) };
}
// The answer as the worker sends it: meta, then timed chunks, then done - real bytes, aborted with the request.
function sseStream(result, { streamText, editText, signal }) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        send('meta', { streaming: true });
        await delay(mock.firstMs, signal);
        if (mock.hold) await mock.hold.promise;
        if (signal?.aborted) throw new Error('aborted');
        // A style-only edit has no words to stream: it arrives whole, as the worker's would.
        const words = streamText != null || editText ? (streamText ?? editText.text).split(/(?<=\s)/) : [];
        let sent = '';
        for (let i = 0; i < words.length; i += mock.chunkWords) {
          const piece = words.slice(i, i + mock.chunkWords).join('');
          sent += piece;
          if (streamText != null) send('delta', { text: piece }); else send('preview', { id: editText.id, text: sent });
          await delay(mock.chunkMs, signal);
        }
        if (mock.failNext === 'stream') { mock.failNext = null; send('error', { error: 'The answer stopped before it was complete.', code: 'stream' }); }
        else send('done', { result, usage: { input_tokens: 0, output_tokens: 0 }, ms: { first: mock.firstMs, total: 0 } });
        controller.close();
      } catch { mock.cancelled += 1; try { controller.error(new Error('aborted')); } catch { /* closed */ } }
    },
  });
}
// The worker's check and generation, scripted: /decide runs the shared free checks and fixed routes (inline-ai-decide.js),
// then a scripted verdict stands in for JEV; a proceed is a token bound to this request id, capability and exact request,
// and /generate refuses anything else - as the worker does.
const verdictFor = request => {
  if (mock.decideAnswers[request.prompt]) return mock.decideAnswers[request.prompt];
  const routed = mock.routeAnswers[request.prompt];
  if (routed && routed.confidence < 0.6) return { decision: 'clarify', missing: ['format'] };
  const choice = routed?.choice || (request.kind === 'creation' && /diagram|draw|map|flow/i.test(request.prompt) ? 'shapes' : 'note');
  return { decision: 'proceed', capability: INLINE_SLASH[choice] || choice };
};
const checkToken = ({ requestId, request, token }) => {
  const kept = mock.tokens.get(requestId);
  if (!kept || kept.token !== token || kept.request !== JSON.stringify(request)) throw Object.assign(new Error('This request wasn\'t checked first. Send it again.'), { code: 'not_validated', status: 403 });
  return kept.capability;
};
const scriptedDiagram = prompt => ({ layout: { arrange: 'layered', flow: 'down' }, shapes: [{ id: 'a', label: 'Start' }, { id: 'b', label: String(prompt).replace(/^\/\w+\s*/, '').slice(0, 30) || 'Step' }, { id: 'c', label: 'End' }],
  connectors: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], groups: [] });
const transport = {
  async decide({ requestId, request, enabled: can }, { signal }) {
    mock.calls.push({ type: 'decide', requestId, request, prompt: request.prompt });
    await delay(mock.routeMs, signal);
    if (mock.decideError) { const code = mock.decideError; mock.decideError = null; return { error: 'Couldn\'t check this request. Try again.', code, retryable: true }; }
    const local = checkRequest(request);
    if (local?.error) return { error: local.error, code: 'invalid', retryable: false };
    if (local) return local;
    const fixed = fixedRoute(request, can);
    if (fixed?.decision) return fixed;
    const out = settle(fixed, verdictFor(request), can);
    if (out.decision === 'proceed') {
      out.token = `mock-${requestId}`;
      mock.tokens.set(requestId, { token: out.token, capability: out.route.capability, request: JSON.stringify(request) });
    }
    return { ...checkDecision(out), meta: { validator: 'jev' } };
  },
  async generate(input, { signal, onEvent }) {
    const route = checkToken(input), { request, requestId } = input;
    mock.calls.push({ type: 'generate', requestId, mode: request.mode, route, prompt: generationPrompt(request), context: request.context, kind: request.kind, revise: input.revise || null });
    if (mock.failNext === 'http') { mock.failNext = null; await delay(50, signal); throw Object.assign(new Error('The model failed. Try again.'), { code: 'http' }); }
    const prompt = generationPrompt(request);
    const result = route === 'edit' ? { kind: 'edit', ...scriptedEdit(prompt, request.context) }
      : route === 'shapes' ? { kind: 'diagram', spec: scriptedDiagram(prompt) }
      : { kind: 'note', text: request.kind === 'creation' ? `A short explanation of ${prompt.replace(/[.?!]+$/, '')}, written for this canvas.` : scriptedNote(request.context) };
    const stream = sseStream(result, { streamText: result.kind === 'note' ? result.text : null, editText: route === 'edit' && result.ops[0]?.text != null ? result.ops[0] : null, signal });
    return readGeneration(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), onEvent);
  },
  async card(input, { signal }) {
    const command = checkToken(input), { request } = input, args = generationPrompt(request);
    mock.calls.push({ type: 'artifact', command, args, context: request.context });
    await delay(mock.firstMs, signal);
    if (mock.hold) await mock.hold.promise;
    if (mock.artifactAnswer) { const answer = ERRORS[mock.artifactAnswer] || mock.artifactAnswer; mock.artifactAnswer = null; return answer; }
    return HANDLERS[command](args);
  },
  async artifact({ command, args, context }) {
    mock.calls.push({ type: 'artifact', command, args, context });
    return HANDLERS[command](args);
  },
};
const enabled = ['note', 'explain', 'code', 'diagram', 'graph', 'walkthrough', 'compare', 'animate', 'image', 'video', '3d', ...(motionOn ? ['motion'] : [])];
const config = {
  transport, enabled, mocked: true, flushMs: params.has('flush') ? Number(params.get('flush')) : 50, prepareOnOpen: params.get('prep') !== '0',
  motion: motionOn ? MOTION : null,
  extras: () => ({ title: 'Inline AI test board' }),
  sendTelemetry: rows => { mock.telemetry.push(...rows); },
};

function Harness() {
  const [board, setBoard] = useState(params.get('board') || 'inline-ai');
  const [exchanges, setExchanges] = useState([]);
  const api = useRef(null);
  window.canvasApi = api;
  window.__switchBoard = setBoard;
  window.__exchanges = exchanges;
  const state = readOnly ? JSON.parse(localStorage.getItem(`harness:${board}`) || '{}') : null;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <AdaptiveCanvas key={board} exchanges={exchanges} onMove={(id, dx, dy) => setExchanges(list => list.map(entry => entry.id === id ? { ...entry, dx, dy } : entry))}
        onAdd={list => setExchanges(previous => [...previous, ...list])} onRestore={setExchanges} onDelete={id => setExchanges(list => list.filter(entry => entry.id !== id))}
        apiRef={api} storageKey={readOnly ? null : `harness:${board}`} boardState={state} readOnly={readOnly} inlineAi={config}
        hooks={<NextStepsCard steps={{ status: 'loading' }} onPick={() => {}} />}
        composer={<textarea data-chat-composer aria-label="Composer stand-in" placeholder="Composer" className="h-10 w-full rounded border border-line px-2 text-sm" />} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
