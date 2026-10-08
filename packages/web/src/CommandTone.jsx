import { SLASH } from './agent/slash.js';

// One fixed identity per slash command (owner, 2026-10-06 and 2026-10-08; docs/features/slash-command-tones.md): a light
// tint, the command's text colour and a subtle border of the same hue - every command in the registry its own, never two
// alike. Never a dynamic colour, never the primary blue, never red; the literal /command text always stays. The tokens
// (--cmd-*) live in index.css, with a dark value each. Only Auto stays neutral. No command carries an icon (owner, 2026-10-08:
// "the pill /ask and /teach has icons next to them -> remove the icons"): every mark is its coloured /name.
// UI only: no routing reads this.
export const COMMAND_TONES = SLASH.map((command) => command.name);
const TONED = new Set(COMMAND_TONES);
export const commandTone = name => (TONED.has(name) ? name : null);

// The command as text, with its tint: the / picker rows and the Slash commands sheets.
export function CommandMark({ name, className = '' }) {
  if (!commandTone(name)) return <span className={`shrink-0 font-medium ${className}`}>/{name}</span>;
  return <span data-command-tone={name} className={`inline-flex shrink-0 items-center rounded-md border px-1.5 font-medium ${className}`}>/{name}</span>;
}
