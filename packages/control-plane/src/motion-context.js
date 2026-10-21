// motion_request.context (owner brief 2026-10-21 message 7 item 4; interface frozen in motion-activation-brief.md):
//   { selection?: { cardId, kind, title?, text, sourceRefs? } }
// The selected card, as plain text from the browser (canvas content is browser-only). It never carries repository
// evidence, except a repository card's own sourceRefs [{commit, path, start, end}], which the resolver may cite and
// nothing else. The web, the Worker, the orchestrator and the resolver all read it through this one validator.
export const SELECTION_TEXT_MAX = 4000;
export const REPOSITORY_CARD = 'repo-code'; // code-card.js: a repository card's block type
const REFS_MAX = 8;
const REF_LINES_MAX = 300;
const SHA = /^[0-9a-f]{40}$/;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new Error(`motion_request.context: ${message}`); };
const onlyKeys = (value, keys, at) => { const extra = Object.keys(value).find(k => !keys.includes(k)); if (extra) fail(`${at}unknown field ${extra}`); };
const string = (value, max, at, required) => {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) fail(`${at}: a${required ? ' non-empty' : ''} string of at most ${max} characters`);
};

// -> the context normalized, or null when there is none. Throws on anything else.
export function validateMotionContext(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value)) fail('an object is required');
  onlyKeys(value, ['selection'], '');
  const s = value.selection;
  if (s === undefined) return null;
  if (!plain(s)) fail('selection: an object is required');
  onlyKeys(s, ['cardId', 'kind', 'title', 'text', 'sourceRefs'], 'selection: ');
  string(s.cardId, 200, 'selection.cardId', true);
  string(s.kind, 200, 'selection.kind', true);
  string(s.title, 300, 'selection.title', false);
  const refs = s.sourceRefs === undefined ? null : sourceRefs(s);
  // A card is its text; only a repository card may stand on its refs alone (it stores no text).
  string(s.text, SELECTION_TEXT_MAX, 'selection.text', !refs);
  return { selection: { cardId: s.cardId, kind: s.kind, ...(s.title ? { title: s.title } : {}), text: s.text ?? '', ...(refs ? { sourceRefs: refs } : {}) } };
}

function sourceRefs(s) {
  if (s.kind !== REPOSITORY_CARD) fail(`selection.sourceRefs: only a repository card (kind ${REPOSITORY_CARD}) carries source refs`);
  if (!Array.isArray(s.sourceRefs) || !s.sourceRefs.length || s.sourceRefs.length > REFS_MAX) fail(`selection.sourceRefs: 1 to ${REFS_MAX} refs`);
  return s.sourceRefs.map((r, i) => {
    const at = `selection.sourceRefs[${i}]`;
    if (!plain(r)) fail(`${at}: an object is required`);
    onlyKeys(r, ['commit', 'path', 'start', 'end'], `${at}: `);
    if (!SHA.test(r.commit || '') || r.commit !== s.sourceRefs[0].commit) fail(`${at}.commit: the card's one full 40-hex commit`);
    if (typeof r.path !== 'string' || !r.path || r.path.length > 300 || r.path.includes('..') || /^[/\\]|\\/.test(r.path)) fail(`${at}.path: a relative repository path`);
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1 || r.end < r.start || r.end - r.start >= REF_LINES_MAX) fail(`${at}: lines start..end, at most ${REF_LINES_MAX}`);
    return { commit: r.commit, path: r.path, start: r.start, end: r.end };
  });
}
