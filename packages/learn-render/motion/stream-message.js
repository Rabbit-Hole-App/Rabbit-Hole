// A Messages API response as one message object, whether it arrived as JSON or as a server-sent
// event stream. Long stages (the Author) stream so a many-minute generation never waits on a
// silent connection; they still need the whole message (thinking blocks with signatures for an
// append-only re-ask, the tool input, usage, stop_reason), so the stream is rebuilt here.
//
// M7A (owner decision 2026-10-05): how a response ended is classified (contracts.js RESPONSE_ENDS),
// so only an interrupted transport is ever retried. The stream is read as it arrives: a response
// that breaks off still yields what had arrived (its usage, for the cost record).
export class StreamEnded extends Error {
  constructor(kind, detail, partial = null) {
    super(`${kind}: ${detail}`);
    Object.assign(this, { name: 'StreamEnded', kind, detail, partial });
  }
}

const finish = message => { if (message) message.content = message.content.filter(Boolean); return message; };

export async function readMessage(response) {
  if (!/text\/event-stream/.test(response.headers.get('content-type') || '')) {
    let text;
    try { text = await response.text(); } catch (error) { throw new StreamEnded('transport_interrupted', error.message); }
    try { return JSON.parse(text); } catch { throw new StreamEnded('transport_interrupted', 'the response body was cut off (not valid JSON)'); }
  }
  let message = null, stopped = false;
  const partial = new Map(); // block index -> accumulated tool input JSON
  const take = chunk => {
    const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data) return;
    const event = JSON.parse(data);
    switch (event.type) {
      case 'message_start': message = { ...event.message, content: [] }; break;
      case 'content_block_start': message.content[event.index] = { ...event.content_block }; if (event.content_block.type === 'tool_use') partial.set(event.index, ''); break;
      case 'content_block_delta': {
        const block = message.content[event.index], d = event.delta;
        if (d.type === 'text_delta') block.text = (block.text || '') + d.text;
        else if (d.type === 'thinking_delta') block.thinking = (block.thinking || '') + d.thinking;
        else if (d.type === 'signature_delta') block.signature = (block.signature || '') + d.signature;
        else if (d.type === 'input_json_delta') partial.set(event.index, partial.get(event.index) + d.partial_json);
        break;
      }
      case 'content_block_stop':
        if (partial.has(event.index)) {
          const json = partial.get(event.index);
          // An unparseable tool input is kept as text: the stage reports it as malformed.
          try { message.content[event.index].input = json ? JSON.parse(json) : {}; } catch { message.content[event.index].input = { __unparsed: json.slice(0, 200) }; }
        }
        break;
      case 'message_delta':
        Object.assign(message, event.delta);
        message.usage = { ...message.usage, ...event.usage };
        break;
      case 'message_stop': stopped = true; break;
      case 'error': throw new StreamEnded('provider_error', `${event.error?.type}: ${event.error?.message}`, finish(message));
      default: break; // ping
    }
  };
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let cut = buffer.search(/\r?\n\r?\n/); cut >= 0; cut = buffer.search(/\r?\n\r?\n/)) {
        take(buffer.slice(0, cut));
        buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, '');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) take(buffer);
  } catch (error) {
    if (error instanceof StreamEnded) throw error;
    throw new StreamEnded('transport_interrupted', String(error?.message || error).split('\n')[0], finish(message));
  }
  if (!message) throw new StreamEnded('transport_interrupted', 'the stream ended without a message');
  if (!stopped) throw new StreamEnded('transport_interrupted', 'the stream ended before message_stop', finish(message));
  return finish(message);
}

// How a stage's model response ended. `error` is what calling or reading threw; `response` a
// non-OK HTTP response; `message` the complete message. One of contracts.js RESPONSE_ENDS.
// Gateway and proxy timeouts; a bad gateway is a broken transport; every other status is the provider's.
const GATEWAY_TIMEOUT = new Set([408, 504, 522, 524]), BROKEN = new Set([502, 520]);
export function classifyEnd({ error = null, response = null, message = null, tool = null } = {}) {
  if (error instanceof StreamEnded) return { kind: error.kind, detail: error.detail };
  if (error) {
    const text = `${error.name || ''} ${error.code || ''} ${error.cause?.code || ''} ${error.message || ''}`;
    return /timeout|TIMEOUT|timed out/i.test(text) ? { kind: 'gateway_timeout', detail: String(error.message || error).split('\n')[0] } : { kind: 'transport_interrupted', detail: String(error.message || error).split('\n')[0] };
  }
  // x-termination: how a local transport ended the call (subscription-call.mjs: deadline, elapsed, reason).
  const termination = response?.headers?.get?.('x-termination');
  if (response && !response.ok) return { kind: GATEWAY_TIMEOUT.has(response.status) ? 'gateway_timeout' : BROKEN.has(response.status) ? 'transport_interrupted' : 'provider_error', detail: `HTTP ${response.status}${termination ? `: ${termination}` : ''}` };
  if (message?.stop_reason === 'max_tokens') return { kind: 'max_tokens', detail: 'the response hit max_tokens' };
  if (message?.stop_reason === 'refusal') return { kind: 'refusal', detail: message.stop_details?.category || 'refusal' };
  const use = tool && (message?.content || []).find(b => b.type === 'tool_use' && b.name === tool);
  if (tool && (!use || use.input?.__unparsed !== undefined)) return { kind: 'malformed_tool_arguments', detail: use ? 'the tool input is not valid JSON' : `no ${tool} call (stop_reason ${message?.stop_reason})` };
  return { kind: 'complete', detail: message?.stop_reason ?? 'end_turn' };
}
