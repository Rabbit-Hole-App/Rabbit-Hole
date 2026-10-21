// The Ctrl+K editor's / commands (Release B, lead contract B4; owner decisions 1A, 2A, 4A): the picker's list, what a
// typed or picked command submits, and how the mode and a command go together. Pure, so typed and picked commands are
// tested to submit the same thing. The list is the shared registry's (agent/slash.js commandsFor('ctrlk')); nothing here
// keeps a command list of its own.
import { SLASH, commandsFor, descFor, resolveCommand, unavailableCommand } from './agent/slash.js';

// The commands this canvas's Ctrl+K offers now: the registry's ctrlk entries, generation ones only where this canvas can
// run them (enabled: its inline routes; null: all), source searches only where a source finder can open.
export function ctrlkCommands({ enabled = null, sources = true, motionDev } = {}) {
  return commandsFor('ctrlk', motionDev === undefined ? {} : { motionDev })
    .filter(command => (command.kind === 'source' ? sources : enabled == null || enabled.includes(command.name)));
}

// The picker's search: what follows a leading / while the line is only that one word, else null (the list is closed).
export const pickerQuery = text => { const match = /^\/([\w-]*)$/.exec(String(text ?? '')); return match ? match[1].toLowerCase() : null; };

// The list for a search: names that start with it first, then names or descriptions that contain it.
export function filterCommands(commands, query) {
  const typed = String(query || '').toLowerCase();
  if (!typed) return commands;
  const line = command => `${command.name} ${descFor(command, 'ctrlk') || ''}`.toLowerCase();
  return [...commands.filter(command => command.name.startsWith(typed)), ...commands.filter(command => !command.name.startsWith(typed) && line(command).includes(typed))];
}

// Whether a command shows its pill: /explain is the Explain mode itself, so it has none (owner 2A); a generation or source
// command shows CommandPill.
export const showsPill = name => !!name && name !== 'explain';

// Picking a command from the list: a generation command selects Explain (owner 2A); a source search leaves the mode.
// Returns the editor's next { mode, command, text }; the words typed after it are kept.
export function pick({ mode, text = '' }, command) {
  return { mode: command.kind === 'generate' ? 'explain' : mode, command: command.name, text };
}

// Switching mode: Edit clears a generation command from the editor and so from what it sends (owner 2A); the words stay.
export function switchMode({ command, text }, mode) {
  const kind = SLASH.find(entry => entry.name === command)?.kind;
  return { mode, command: mode === 'edit' && kind === 'generate' ? null : command, text };
}

// What one Send submits: { mode, command: name | null, text, prompt } for the editor's session (prompt is the line the
// request check reads: `/name words` for a command, else the words), { source: { source, query } } for a source search
// (the finder opens; nothing is generated or sent), or { unsupported: name } for a typed command Ctrl+K does not offer
// (nothing is sent; never a different command). A picked command and the same command typed submit the same thing.
// motionDev defaults on: a Ctrl+K command this canvas cannot run now (Motion off) is still sent, and the request check
// says plainly that it is unavailable here, as before.
export function submission({ mode, command = null, text = '' }, options = { motionDev: true }) {
  let name = command, words = String(text);
  if (!name) {
    const typed = resolveCommand(words, 'ctrlk', options);
    if (typed?.unsupported) return { unsupported: typed.unsupported };
    if (typed) { name = typed.command.name; words = typed.arg; }
  }
  words = name ? words.trim() : words;
  const entry = name && commandsFor('ctrlk', options).find(candidate => candidate.name === name);
  if (name && !entry) return { unsupported: name };
  if (entry?.kind === 'source') return { source: { source: entry.source, query: words } };
  return { mode: entry?.kind === 'generate' ? 'explain' : mode, command: name || null, text: words, prompt: name ? `/${name}${words ? ` ${words}` : ''}` : words };
}

// The one line said for a typed command Ctrl+K does not offer: a removed one says so (owner, 2026-10-20).
export const unsupportedText = name => unavailableCommand(name) || `/${name} isn't available in Ctrl+K.`;
