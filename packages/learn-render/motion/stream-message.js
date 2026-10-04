// A Messages API response as one message object, whether it arrived as JSON or as a server-sent
// event stream. Long stages (the Author) stream so a many-minute generation never waits on a
// silent connection; they still need the whole message (thinking blocks with signatures for an
// append-only re-ask, the tool input, usage, stop_reason), so the stream is rebuilt here.
export async function readMessage(response) {
  if (!/text\/event-stream/.test(response.headers.get('content-type') || '')) return response.json();
  let message = null;
  const partial = new Map(); // block index -> accumulated tool input JSON
  for (const chunk of (await response.text()).split(/\r?\n\r?\n/)) {
    const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data) continue;
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
      case 'error': throw new Error(`stream error: ${event.error?.type}: ${event.error?.message}`);
      default: break; // ping, message_stop
    }
  }
  if (!message) throw new Error('stream ended without a message');
  message.content = message.content.filter(Boolean);
  return message;
}
