import { CircleHelp, Clapperboard, Play, Sparkles, Telescope } from 'lucide-react';
import { SLASH } from './agent/slash.js';

// One fixed identity per slash command (owner, 2026-10-06 and 2026-10-08; docs/features/slash-command-tones.md): a light
// tint, the command's text colour and a subtle border of the same hue - every command in the registry its own, never two
// alike. Never a dynamic colour, never the primary blue, never red; the literal /command text always stays. The tokens
// (--cmd-*) live in index.css, with a dark value each. Only Auto stays neutral. The five modes also carry an icon.
// UI only: no routing reads this.
export const COMMAND_ICONS = { ask: CircleHelp, teach: Sparkles, research: Telescope, do: Play, motion: Clapperboard };
export const COMMAND_TONES = SLASH.map((command) => command.name);
const TONED = new Set(COMMAND_TONES);
export const commandTone = name => (TONED.has(name) ? name : null);

// The command as text, with its tint (and icon, for a mode): the / picker rows and the Slash commands sheet.
export function CommandMark({ name, className = '' }) {
  const Icon = COMMAND_ICONS[name];
  if (!commandTone(name)) return <span className={`shrink-0 font-medium ${className}`}>/{name}</span>;
  return (
    <span data-command-tone={name} className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 font-medium ${className}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}/{name}
    </span>
  );
}

export function CommandIcon({ name, size = 13 }) {
  const Icon = COMMAND_ICONS[name];
  return Icon ? <Icon size={size} aria-hidden="true" className="shrink-0" /> : null;
}
