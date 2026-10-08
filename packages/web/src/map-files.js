// The Main canvas's Files panel, the owner's 2026-10-08 clarification (docs/features/repository-browser.md "Files in Learn"):
// a selection offers Ask in chat and Copy; the chat's repository chip shows the passage; code copied from a file, or code
// pasted from anywhere, asks Code card or Jupyter notebook before it lands on the canvas. Pure, so the rules are tested.

// The chip's second line and preview, from Learn's repository context (agent/scope.js wireContext) and the selected text:
// the file's path, its lines (or Whole file), and the passage's first lines. null for a symbol or no context.
const span = (start, end) => (end > start ? `${start}–${end}` : `${start}`);
export function contextPassage(context, excerpt = null, max = 3) {
  const path = context?.range?.path || context?.path;
  if (!path) return null;
  const range = context.range;
  const lines = typeof excerpt === 'string' && range ? excerpt.split('\n') : [];
  return { path, lines: range ? `${range.end > range.start ? 'lines' : 'line'} ${span(range.start, range.end)}` : 'Whole file', excerpt: lines.slice(0, max).map((text, i) => ({ n: range.start + i, text })), more: lines.length > max };
}

// Text copied from a repository file (the panel's Copy, or Ctrl+C in any source reader) is always code: its path rides beside
// it in this tab, so a paste onto the canvas keeps the file's name and language. Matched by the text itself, so anything
// copied after it wins. `storage` returns the store, read inside the try: a blocked store throws on access.
const COPIED = 'small.files.copied';
const same = (a, b) => String(a).replace(/\r\n/g, '\n').trim() === String(b).replace(/\r\n/g, '\n').trim();
export function rememberCodeCopy(storage, copy) {
  try { storage().setItem(COPIED, JSON.stringify({ text: copy.text, path: copy.path, ...(copy.repo ? { repo: copy.repo, commit: copy.commit, start: copy.start, end: copy.end } : {}) })); } catch { /* the paste falls back to the heuristic */ }
}
export function copiedCode(storage, text) {
  let copy = null;
  try { copy = JSON.parse(storage().getItem(COPIED) || 'null'); } catch { copy = null; }
  return copy?.text && String(text || '').trim() && same(copy.text, text) ? copy : null;
}

const LANGUAGES = { py: 'python', ipynb: 'python', js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', rs: 'rust', go: 'go', java: 'java', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', rb: 'ruby', sh: 'bash', sql: 'sql', json: 'json', md: 'markdown' };
export const languageOf = (path) => (path ? LANGUAGES[String(path).split('.').pop().toLowerCase()] || null : null);
