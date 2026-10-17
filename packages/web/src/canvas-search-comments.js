// Search only the messages returned by the existing permission-checked comments API.
// GETs do not mark threads read; opening the existing thread UI owns that action.
const check = signal => { if (signal?.aborted) throw new DOMException('Search scope changed', 'AbortError'); };
const messageText = message => message.deleted ? '' : (message.segments || []).map(segment => segment.text || (segment.mention?.handle ? `@${segment.mention.handle}` : '')).join('');
export async function readSearchComments(client, { signal, onProgress = () => {} } = {}) {
  const threads = [], seen = new Set();
  let cursor = null;
  do {
    check(signal);
    const page = await client.threads('all', 'all', cursor);
    check(signal);
    threads.push(...(page.threads || []));
    cursor = page.cursor || null;
    if (cursor && seen.has(cursor)) throw new Error('Comment pagination did not advance. Retry to refresh comments.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  const comments = new Map(), errors = [];
  let next = 0;
  const worker = async () => {
    while (next < threads.length) {
      check(signal);
      const thread = threads[next++];
      try {
        let before = null, messages = [], current = thread;
        const pages = new Set();
        do {
          check(signal);
          const page = await client.thread(thread.id, before);
          check(signal);
          current = page.thread || current;
          messages = [...(page.messages || []), ...messages];
          before = page.before || null;
          if (before && pages.has(before)) throw new Error('Comment pagination did not advance.');
          if (before) pages.add(before);
        } while (before);
        const visible = messages.filter(message => !message.deleted).map(message => ({ id: message.id, text: messageText(message) }));
        comments.set(thread.id, { id: thread.id, objectId: current.anchor?.object_id, anchor: current.anchor,
          title: current.anchor?.label ? `Comments on ${current.anchor.label}` : 'Canvas comments',
          resolved: current.status === 'resolved', messages: visible, text: visible.map(message => message.text).join('\n') });
      } catch (error) {
        check(signal);
        errors.push({ id: thread.id, message: error.message || 'Comments unavailable' });
      }
      check(signal);
      onProgress({ comments: threads.flatMap(thread => comments.has(thread.id) ? [comments.get(thread.id)] : []), errors: [...errors] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, threads.length) }, worker));
  check(signal);
  return { comments: threads.flatMap(thread => comments.has(thread.id) ? [comments.get(thread.id)] : []), errors };
}
