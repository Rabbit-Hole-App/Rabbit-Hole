// One Chat prompt's outputs (UI changes brief sections 1 and 5): the shape the outputs route stores (chat-outputs-route.js) and
// the Chat builds (web/src/chat-output-refs.js), validated the same way on both sides. Pure, no imports, so the web bundle takes it.
//
// One output: { v: 1, cardId, kind, title, jobId?, thumb?, startedAt?, snapshot? }
//   thumb: a same-origin, cookie-scoped file path (/api/learn/files/... or /api/learn/cad/jobs/...), which never expires, or null.
//   snapshot: { v: 1, block } - what restores a deleted card without generating it again: the card's own fields, no binary data
//     and no blob: or data: URLs. Past SNAPSHOT_MAX_BYTES (UTF-8 JSON) or holding such a URL it is dropped and the output is
//     marked unavailable ('too_large' | 'unstable'); its cardId still navigates to a card that exists.
export const OUTPUTS_MAX = 12, SNAPSHOT_MAX_BYTES = 32 * 1024, TITLE_MAX = 200;
export const ID = /^[A-Za-z0-9_:.-]{1,200}$/, KIND = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export const THUMB = /^\/api\/learn\/(?:files|cad\/jobs)\/[A-Za-z0-9_\-./%]{1,500}(?:\?[A-Za-z0-9_\-=&%.]{0,300})?$/;
const unstable = value => (typeof value === 'string' ? /^(?:blob|data):/i.test(value.trim())
  : value && typeof value === 'object' ? Object.values(value).some(unstable) : false);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

// { value } or { error }: one output as stored. Unknown fields are dropped.
export function checkOutput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Each output must be an object' };
  const { v, cardId, kind, title = '', jobId = null, thumb = null, startedAt = null, snapshot = null } = raw;
  if (v !== 1) return { error: 'output v must be 1' };
  if (typeof cardId !== 'string' || !ID.test(cardId)) return { error: 'cardId must be 1-200 letters, digits, _ : . or -' };
  if (typeof kind !== 'string' || !KIND.test(kind)) return { error: 'kind must be a card type' };
  if (typeof title !== 'string') return { error: 'title must be text' };
  if (jobId !== null && !(typeof jobId === 'string' && ID.test(jobId))) return { error: 'jobId must be an id or null' };
  if (thumb !== null && !(typeof thumb === 'string' && THUMB.test(thumb) && !thumb.split(/[/?]/).includes('..'))) return { error: 'thumb must be a same-origin file path or null' };
  if (startedAt !== null && !(typeof startedAt === 'string' && startedAt.length <= 40 && Number.isFinite(Date.parse(startedAt)))) return { error: 'startedAt must be an ISO time or null' };
  const value = { v: 1, cardId, kind, title: title.trim().slice(0, TITLE_MAX), jobId, thumb, startedAt, snapshot: null };
  if (snapshot === null) return { value };
  const block = snapshot?.block;
  if (typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.v !== 1 || !block || typeof block !== 'object' || Array.isArray(block)) return { error: 'snapshot must be { v: 1, block }' };
  if (block.id !== cardId || typeof block.type !== 'string' || !KIND.test(block.type)) return { error: 'snapshot.block must be this card (its id and type)' };
  if (bytes(snapshot) > SNAPSHOT_MAX_BYTES) return { value: { ...value, unavailable: 'too_large' } };
  if (unstable(block)) return { value: { ...value, unavailable: 'unstable' } };
  return { value: { ...value, snapshot: { v: 1, block } } };
}

// The message's outputs after this write: an output already kept (same cardId) is replaced in its place, a new one appended.
export function mergeOutputs(current, incoming) {
  const list = Array.isArray(current) ? current.filter(entry => entry && typeof entry.cardId === 'string') : [];
  for (const output of incoming) {
    const at = list.findIndex(entry => entry.cardId === output.cardId);
    if (at >= 0) list[at] = output; else list.push(output);
  }
  return list;
}

