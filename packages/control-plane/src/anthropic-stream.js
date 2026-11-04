// A Messages API answer read as a stream and put back together as the one message a non-streaming call returns, so a caller that does
// `await response.json()` (callAnimationRole) is unchanged. Only a caller that asks (ask.js anthropicTransport, env.MODEL_STREAM) gets it:
// the animation author and repair, whose single request outlived a gateway's timeout (524 after 126 s, FX-AN-041; AN-17, FX-AN-044).
//
// Failure is always a Response with the status that kind of failure has, never a throw, so the caller's existing status handling applies:
// the provider's error events keep their kind (overloaded_error 529 ...), a stream that ends before message_stop is 502, and a call that
// does not finish by its deadline is 504 (our own). What was generated before a cut-off is lost: usage arrives only in message_delta, so
// such a call settles as any failed call (learn-spend.js), and the platform ledger keeps its reservation.

const STATUS = { overloaded_error: 529, rate_limit_error: 429, api_error: 500, invalid_request_error: 400, authentication_error: 401, permission_error: 403,
  not_found_error: 404, request_too_large: 413, timeout_error: 504 };

class StreamFailure extends Error {
  constructor(type, message, status = STATUS[type] ?? 502) { super(message); this.type = type; this.status = status; }
}
const failed = (type, message, status = STATUS[type] ?? 502) => Response.json({ type: 'error', error: { type, message } }, { status });

// body: the response's byte stream -> the message. Throws StreamFailure for an error event or a stream that does not complete.
export async function messageFromStream(body) {
  const message = { content: [] }, pieces = [], decoder = new TextDecoder();
  let pending = '', complete = false;
  const on = value => {
    const block = message.content[value.index], delta = value.delta;
    switch (value.type) {
      case 'message_start': Object.assign(message, value.message, { content: [] }); break;
      case 'content_block_start': message.content[value.index] = { ...value.content_block }; pieces[value.index] = ''; break;
      case 'content_block_delta':
        if (!block) break;
        if (delta.type === 'text_delta') block.text += delta.text;
        else if (delta.type === 'input_json_delta') pieces[value.index] += delta.partial_json;
        else if (delta.type === 'thinking_delta') block.thinking += delta.thinking;
        else if (delta.type === 'signature_delta') block.signature = delta.signature;
        else if (delta.type === 'citations_delta') (block.citations ??= []).push(delta.citation);
        break;
      case 'content_block_stop':
        // A tool call's input is parsed once it is whole. One that was cut off (max_tokens) stays the text received: callAnimationRole records
        // it as the diagnostic (partialTool) and an unusable input is an invalid turn, never a guessed object.
        if (block && 'input' in block) { try { block.input = pieces[value.index] === '' ? {} : JSON.parse(pieces[value.index]); } catch { block.input = pieces[value.index]; } }
        break;
      case 'message_delta': Object.assign(message, value.delta); message.usage = { ...message.usage, ...value.usage }; break;
      case 'message_stop': complete = true; break;
      case 'error': throw new StreamFailure(value.error?.type, value.error?.message || 'The model stream failed.');
      default: break; // ping and event types added later
    }
  };
  const read = text => {
    pending += text;
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop();
    for (const event of events) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data) continue;
      let value;
      try { value = JSON.parse(data); } catch { throw new StreamFailure('api_error', 'The model stream carried an event that could not be read.', 502); }
      on(value);
    }
  };
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    read(decoder.decode(value, { stream: true }));
  }
  read(`${decoder.decode()}\n\n`);
  if (!complete) throw new StreamFailure('api_error', 'The model stream ended before the answer was complete.', 502);
  return message;
}

// send(signal, streaming) makes the request. A streaming role (stream: true) is answered as one JSON message; any other keeps its single
// request. Either is aborted at deadlineMs. A provider failure answer (not ok) and an answer that is not a stream pass through as they came.
// shortcut: the deadline is for the whole call, not between chunks; the largest answer a role allows takes about 210 s at the measured speed.
export async function streamedMessage(send, { stream = true, deadlineMs }) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadlineMs);
  const late = () => failed('timeout_error', `The model did not finish within ${Math.round(deadlineMs / 1000)} seconds.`);
  try {
    let response;
    try { response = await send(controller.signal, stream); } catch (error) { if (controller.signal.aborted) return late(); throw error; }
    if (!stream || !response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) return response;
    try {
      const requestId = response.headers.get('request-id');
      return Response.json(await messageFromStream(response.body), requestId ? { headers: { 'request-id': requestId } } : undefined);
    } catch (error) {
      if (controller.signal.aborted) return late();
      const failure = error instanceof StreamFailure ? error : new StreamFailure('api_error', 'The model stream was interrupted.', 502);
      console.warn('anthropic stream error', failure.status, failure.type, failure.message.slice(0, 200));
      return failed(failure.type, failure.message, failure.status);
    }
  } finally { clearTimeout(timer); }
}
