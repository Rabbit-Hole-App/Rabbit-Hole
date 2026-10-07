# Slash-command tones

Owner rule, 2026-10-06. This is UI only: Tutor routing and Learning behaviour do not read it.

| Command | Family | Icon (lucide) |
|---|---|---|
| `/ask` | cyan | CircleHelp |
| `/teach` | violet | Sparkles |
| `/research` | amber / gold (Home/Library and project surfaces; not a Canvas command) | Telescope |
| `/do` | green (Home/Library and project surfaces; not a Canvas command) | Play |
| `/motion` | magenta | Clapperboard |
| Auto, every other command | neutral | none |

## Treatment

- **The pill:** a light tint, the family's text colour, and a subtle border of the same family. Never a saturated fill, a glow, or the primary blue (`--color-accent`), and never red, which stays for errors and destructive actions.
- **Tokens:** `--cmd-<name>-bg`, `-fg` and `-line` in `index.css`, with a dark value for each in `.dark`.
- **Text:** each text colour clears 4.5:1 on its tint in both themes. The literal `/command` text always stays and the icon sits beside it, so colour is never the only difference.
- **Fixed map:** the colours come from `CommandTone.jsx` `COMMAND_ICONS` plus `[data-command-tone]`. They are never assigned dynamically.

## Where

The same command looks the same everywhere:
- the composer pill, with icon and `/ask`;
- the / picker rows;
- the Slash commands sheet's list and its preview title.

There is no separate command echo: a sent `/ask` shows the learner's words.

**Auto** is the quiet default: the neutral `COMPOSER_PILL`, unchanged. Typing without a command stays the main experience.

**With a selected card,** the context strip (canvas-card-selection.md) stays neutral, and only the slash pill carries the command colour. The composer itself is never tinted.

## Tests

`packages/web/src/slash-command-tones.test.mjs` checks:
- contrast in both themes;
- each family's hue, which is never red and never the accent;
- the same mark in the picker, the pill and the sheet;
- Auto and the strip staying neutral.
