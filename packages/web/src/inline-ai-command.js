// The Ctrl+K editor's / commands (Release B, lead contract B4; owner decisions 1A, 2A, 4A; owner spec 2026-10-29 section 4): the
// picker's list, what a typed or picked command submits, and how the mode and a command go together. Pure, so typed and picked
// commands are tested to submit the same thing. The list is the shared registry's (agent/slash.js commandsFor('ctrlk'), the same 18
// as Chat); nothing here keeps a command list of its own.
// Ctrl+K is another way into Chat's command flow: an explicit command is handed to Chat's dispatcher as its typed line (handoff),
// which prepares any clarification or brief and attaches the result; nothing is generated here, and it never also runs inline.
// The source searches keep Ctrl+K's own finder (its result choice, placement and focus return); plain words keep the inline editor.
import { SLASH, commandsFor, descFor, resolveCommand, typedOf, unavailableCommand } from './agent/slash.js';
import { available } from './learn-slash.js';

// The commands this canvas's Ctrl+K offers now: the registry's, available as in Chat's picker (learn-slash.js available), source
// searches only where a source finder can open.
export function ctrlkCommands({ sources = true, motionDev } = {}) {
  return commandsFor('ctrlk', motionDev === undefined ? {} : { motionDev }).filter(available)
    .filter(command => command.kind !== 'source' || sources);
}

// The picker's search: what follows a leading / while the line is only that one word, else null (the list is closed).
export const pickerQuery = text => { const match = /^\/([\w-]*)$/.exec(String(text ?? '')); return match ? match[1].toLowerCase() : null; };

// The list for a search: typed names (and aliases) that start with it first, then names or descriptions that contain it.
export function filterCommands(commands, query) {
  const typed = String(query || '').toLowerCase();
  if (!typed) return commands;
  const words = command => [typedOf(command.name), ...(command.aliases || [])]; // typed names only: /image is not the photo search (id image)
  const line = command => `${words(command).join(' ')} ${descFor(command, 'ctrlk') || ''}`.toLowerCase();
  return [...commands.filter(command => words(command).some(word => word.startsWith(typed))), ...commands.filter(command => !words(command).some(word => word.startsWith(typed)) && line(command).includes(typed))];
}

// Whether a command shows its pill: /explain is the Explain mode itself, so it has none (owner 2A); every other command shows CommandPill.
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

// What one Send submits:
//   { handoff: { command, line } }  an explicit command: Chat runs `line` (`/typed words`) through its own dispatcher
//   { source: { source, query } }   a source search: Ctrl+K's finder opens (nothing is generated or sent)
//   { unsupported: name }           a typed command that is not offered (nothing is sent; never a different command)
//   { mode, command: null, text, prompt }  plain words for the inline editor (prompt is the line the request check reads)
// A picked command and the same command typed submit the same thing. motionDev defaults on: /motion where this canvas cannot run
// it is still handed over, and Chat says plainly that it is unavailable here.
export function submission({ mode, command = null, text = '' }, options = { motionDev: true }) {
  let name = command, words = String(text);
  if (!name) {
    const typed = resolveCommand(words, 'ctrlk', options);
    if (typed?.unsupported) return { unsupported: typed.unsupported };
    if (typed) { name = typed.command.name; words = typed.arg; }
  }
  if (!name) return { mode, command: null, text: words, prompt: words };
  words = words.trim();
  const entry = commandsFor('ctrlk', options).find(candidate => candidate.name === name);
  if (!entry) return { unsupported: typedOf(name) };
  if (entry.kind === 'source') return { source: { source: entry.source, query: words } };
  return { handoff: { command: name, line: `/${typedOf(name)}${words ? ` ${words}` : ''}` } };
}

// The one line said for a typed command Ctrl+K does not offer: a removed one says so (owner, 2026-10-20). name is what was TYPED.
export const unsupportedText = name => unavailableCommand(name) || `/${name} isn't available here.`;
// What Ctrl+K says when Chat could not take its command (another command is running there, or Chat did not open in time): the
// line stays in Ctrl+K to send again.
export const HANDOFF_REFUSED = 'Chat is busy with another command. Your command is still here: send it again in a moment.';
