// A Quick edit draft (cad-controls brief section 2): parameter values typed but not yet built. Kept in this browser per
// account, card and accepted revision, so a reload keeps the draft and a new accepted revision starts clean. Never on the
// board: the shared canvas only ever holds accepted models.
import { useEffect, useState } from 'react';

export const draftKey = (account, cardId, revisionId) => `rh.cad-draft:${account || 'viewer'}:${cardId}:${revisionId || 'none'}`;
export function readDraft(storage, key) {
  try { const value = JSON.parse(storage?.getItem(key) || 'null'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function writeDraft(storage, key, draft) {
  try { if (Object.keys(draft).length) storage?.setItem(key, JSON.stringify(draft)); else storage?.removeItem(key); } catch { /* this page only */ }
}
// What an input's text means for a definition type: a number when it reads as one, otherwise the raw text, so validation
// says "must be a number" instead of silently keeping the old value.
export function draftInput(type, raw) {
  if (!['length', 'angle', 'number', 'count'].includes(type)) return raw;
  const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : raw;
}
// One edit: a value equal to the accepted one leaves the draft.
export function withDraft(draft, id, value, accepted) {
  const next = { ...draft };
  if (value === accepted) delete next[id]; else next[id] = value;
  return next;
}

const local = () => { try { return window.localStorage; } catch { return null; } };
export function useCadDraft(account, cardId, revisionId) {
  const key = draftKey(account, cardId, revisionId);
  const [draft, setDraft] = useState(() => readDraft(local(), key));
  useEffect(() => { setDraft(readDraft(local(), key)); }, [key]);
  const change = next => { setDraft(next); writeDraft(local(), key, next); };
  return [draft, change];
}
