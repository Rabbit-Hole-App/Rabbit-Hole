// Gemini's OpenAI-compatible stream (chat.completion.chunk SSE) -> the Anthropic-style SSE the chat reads, event by event as the chunks arrive (owner 2026-11-08:
// real token streaming; the first version replayed the finished answer, ask.js sseFromMessage). Pure: a byte stream in, a byte stream out.
// message_start comes at once, text deltas as the model writes them, and the usage the final chunk carries goes out in message_delta before message_stop, so
// learn-spend.js spendTransport settles exactly as it does for any event stream (an incomplete stream keeps its reservation; a cancel settles as cancelled).
// Tool calls: each becomes one tool_use block whose input arrives as input_json_delta; the thought signature (extra_content) rides on the block start, as the
// non-streamed path (fromOpenAI) carries it, so a following turn replays it. An error in the stream errors the output stream (the chat's reader throws and shows its one-line error).
export function anthropicStreamFromOpenAI(upstream, model) {
  const enc = new TextEncoder(), dec = new TextDecoder(), reader = upstream.getReader();
  const event = (type, data) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  let pending = '', next = 0, open = null, call = null, usage = null, finish = null, calls = 0, out = [];
  const close = () => { if (open) { out.push(event('content_block_stop', { index: open.index })); open = null; } };
  const text = piece => {
    if (open?.kind !== 'text') { close(); open = { kind: 'text', index: next++ }; out.push(event('content_block_start', { index: open.index, content_block: { type: 'text', text: '' } })); }
    out.push(event('content_block_delta', { index: open.index, delta: { type: 'text_delta', text: piece } }));
  };
  const tool = tc => {
    // shortcut: a tool call's extra_content (thought signature) is read from the chunk that starts the call, where Gemini sends it with the whole call; one sent later is not attached.
    const fresh = !call || (tc.index !== undefined ? tc.index !== call.upstream : !!tc.id && tc.id !== call.id);
    if (fresh) {
      close(); calls++;
      call = { id: tc.id || `t_${crypto.randomUUID().slice(0, 8)}`, upstream: tc.index }; open = { kind: 'tool', index: next++ };
      out.push(event('content_block_start', { index: open.index, content_block: { type: 'tool_use', id: call.id, name: tc.function?.name || '', input: {}, ...(tc.extra_content ? { extra_content: tc.extra_content } : {}) } }));
    }
    if (tc.function?.arguments) out.push(event('content_block_delta', { index: open.index, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } }));
  };
  const chunk = data => {
    const item = Array.isArray(data) ? data[0] : data; // Gemini answers an error as [{ error }]
    if (item?.error) throw new Error(item.error.message || 'The model stream failed.');
    if (item?.usage) usage = item.usage;
    const choice = item?.choices?.[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.content) text(String(delta.content));
    for (const tc of delta.tool_calls || []) tool(tc);
    if (choice.finish_reason) finish = choice.finish_reason;
  };
  const feed = text => {
    pending += text;
    const events = pending.split(/\r?\n\r?\n/); pending = events.pop();
    for (const raw of events) {
      const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      let value; try { value = JSON.parse(data); } catch { throw new Error('The model stream carried an event that could not be read.'); }
      chunk(value);
    }
  };
  const last = () => {
    close();
    const u = usage || {};
    out.push(event('message_delta', { delta: { stop_reason: calls ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn' },
      usage: usage ? { input_tokens: u.prompt_tokens, output_tokens: Math.max(u.completion_tokens ?? 0, (u.total_tokens ?? 0) - (u.prompt_tokens ?? 0)) } : {} })); // as the non-streamed path: thinking may sit outside completion_tokens
    out.push(event('message_stop', {}));
  };
  const flush = controller => { for (const bytes of out) controller.enqueue(bytes); out = []; };
  return new ReadableStream({
    start(controller) { controller.enqueue(event('message_start', { message: { model, usage: {} } })); },
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { feed(`${dec.decode()}\n\n`); last(); flush(controller); controller.close(); return; }
          feed(dec.decode(value, { stream: true }));
          if (out.length) { flush(controller); return; }
        }
      } catch (error) { try { await reader.cancel(error); } catch { /* keep the original error */ } controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}
