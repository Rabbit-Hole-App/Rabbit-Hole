import { CircleHelp, Clapperboard, Play, Sparkles, Telescope } from 'lucide-react';

// One fixed identity per slash-command family (owner, 2026-10-06; docs/features/slash-command-tones.md): a light
// tint, the family's text colour, a subtle border of the same family, and its icon. Never a dynamic colour, never the
// primary blue, never red; the literal /command text always stays. The tokens (--cmd-*) live in index.css, with a
// dark value each. Every other command, and Auto, stays neutral. UI only: no routing reads this.
export const COMMAND_ICONS = { ask: CircleHelp, teach: Sparkles, research: Telescope, do: Play, motion: Clapperboard };
export const commandTone = name => (Object.hasOwn(COMMAND_ICONS, name) ? name : null);

// The command as text, with its icon and tint when it has a family: the / picker rows and the Slash commands sheet.
export function CommandMark({ name, className = '' }) {
  const Icon = COMMAND_ICONS[name];
  if (!Icon) return <span className={`shrink-0 font-medium ${className}`}>/{name}</span>;
  return (
    <span data-command-tone={name} className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 font-medium ${className}`}>
      <Icon size={12} aria-hidden="true" />/{name}
    </span>
  );
}

export function CommandIcon({ name, size = 13 }) {
  const Icon = COMMAND_ICONS[name];
  return Icon ? <Icon size={size} aria-hidden="true" className="shrink-0" /> : null;
}
