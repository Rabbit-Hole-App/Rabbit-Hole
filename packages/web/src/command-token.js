import { SLASH } from './agent/slash.js';

// UI-16 (owner, 2026-10-21): the chosen / command is one inline token at the start of the composer's text, and a sent
// message shows the same pill read-only. The command stays structured state beside the text (chat-draft.js); these are
// the token's pure rules, so command-token.test.mjs covers them without a browser.

// Backspace with the caret at the very start of the text (nothing selected) removes the token, even when text follows;
// anywhere else it edits the text.
export const removesToken = ({ key }, { command, selectionStart, selectionEnd }) =>
  !!command && key === 'Backspace' && selectionStart === 0 && selectionEnd === 0;

// Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo.
export function historyKey({ key, ctrlKey, metaKey, shiftKey, altKey }) {
  if (!(ctrlKey || metaKey) || altKey) return null;
  const k = String(key).toLowerCase();
  return k === 'z' ? (shiftKey ? 'redo' : 'undo') : k === 'y' && !shiftKey ? 'redo' : null;
}

// Each token change (pick, switch, x, Backspace) is one undo step { scope, text, from, to } that keeps the text. Undo and
// Redo apply a step only while the composer still shows the state that step left (same thread, text and command), so the
// pill and the command always change together; otherwise the field's own text undo runs (travel answers null).
export const NO_STEPS = { undo: [], redo: [] };
export const recordStep = (steps, step) => (step.from === step.to ? steps : { undo: [...steps.undo.slice(-49), step], redo: [] });
export function travel(steps, direction, { scope = null, text, command }) {
  const [from, to] = direction === 'undo' ? ['undo', 'redo'] : ['redo', 'undo'];
  const step = steps[from].at(-1);
  const shows = direction === 'undo' ? step?.to : step?.from;
  if (!step || step.scope !== scope || step.text !== text || (shows ?? null) !== (command ?? null)) return null;
  return { steps: { [from]: steps[from].slice(0, -1), [to]: [...steps[to], step] }, command: direction === 'undo' ? step.from : step.to };
}

// A sent user message's pill: the saved command (the message's command metadata) or, for an older message without it, a
// registered command at the very start of the text. A matching leading /name is shown as the pill, never twice; the rest
// is the text exactly as typed. A /command inside prose or code is never at the very start, so it stays plain text.
const NAMES = new Set(SLASH.map(command => command.name));
export function sentCommand({ content, command } = {}) {
  const text = String(content ?? '');
  const lead = text.match(/^\/([\w-]+)(?:\s+|$)/), leadName = lead?.[1].toLowerCase();
  const name = command || (NAMES.has(leadName) ? leadName : null);
  if (!name) return { command: null, text };
  return { command: name, text: leadName === name ? text.slice(lead[0].length) : text };
}
