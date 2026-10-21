# Slash-command tones

Owner rule, 2026-10-06. This is UI only: Tutor routing and Learning behaviour do not read it.

| Command | Family |
|---|---|
| `/ask` | cyan |
| `/teach` | violet |
| `/research` | amber / gold (Home/Library and project surfaces; not a Canvas command) |
| `/do` | green (Home/Library and project surfaces; not a Canvas command) |
| `/motion` | magenta |
| every other command (owner, 2026-10-08) | its own hue |
| Auto | neutral |

**No icons** (owner, 2026-10-08: "the pill /ask and /teach has icons next to them -> rmove the icons"):
- every command mark is just its coloured text: `/name` in the / pickers and both Slash commands sheets, and the
  command's label in a selected-command pill (below);
- this holds in the / pickers, both Slash commands sheets, the composer's command pill, Ctrl+K's and the Agent Bar's pill;
- the five modes lost theirs too (`/ask`, `/teach`, `/research`, `/do`, `/motion`), so no command looks different from the others.

**Every command has a colour** (owner, 2026-10-08):
- Each of the registry's commands (`agent/slash.js` `SLASH`, which Learn's picker reads too) has its own `--cmd-<name>-*`
  tokens. The 27 beyond the five are spread round the hue wheel, clear of red (15-345°) and the primary blue
  (198-226°), in two lightness tiers. No two commands share a text or tint colour, in either theme.
- `CommandTone.jsx` `COMMAND_TONES` is the registry's names.
- The Agent Bar's / picker rows and its pill wear the same mark as the canvas's.

**A selected command reads as its label, never `/name`** (owner, 2026-10-20: "`/simplify` becomes "Simplify" when
selected. This applies to every command"):
- The pill shows `commandLabel(name)` from `agent/slash.js`: the command's `label`, else its capitalised name (`/simplify`:
  Simplify, `/cad`: CAD, `/3d`: 3D, `/youtube`: Search YouTube, `/video`: Generate video). The label is never written in a
  pill component.
- This holds for every pill a chosen command becomes: the Chat composer and Ctrl+K (`CommandPill.jsx`) and the Home,
  Library and Project bar (`AgentBar.jsx`, modes and shortcuts). Its x is named `Remove <label>`.
- Typing syntax keeps its slash: the / picker rows, the Slash commands sheets, the typed line in the box, and the
  learner's submitted text (a sent command keeps its `/name` line). Routing reads the name, never the label.
- Status lines that name a running command (`Working on /cad…`, a reserved card's `Creating /cad…`) are not pills and
  keep the typed name.

## Treatment

- **The pill:** a light tint, the family's text colour, and a subtle border of the same family. Never a saturated fill, a glow, or the primary blue (`--color-accent`), and never red, which stays for errors and destructive actions.
- **Tokens:** `--cmd-<name>-bg`, `-fg` and `-line` in `index.css`, with a dark value for each in `.dark`.
- **Text:** each text colour clears 4.5:1 on its tint in both themes. The command's text always stays (`/name` in pickers and sheets, its label in a pill), so colour is never the only difference.
- **Fixed map:** the colours come from `CommandTone.jsx` `COMMAND_TONES` plus `[data-command-tone]`. They are never assigned dynamically.

## Where

The same command looks the same everywhere:
- the Chat composer's pill, `Ask` (its label), and Ctrl+K's pill;
- the / picker rows, `/ask`;
- the Slash commands sheet's list and its preview title;
- the Agent Bar's / picker rows and its command pill (`Ask`).

There is no separate command echo: a sent `/ask` shows the learner's words.

**Auto** is the quiet default: the neutral `COMPOSER_PILL`, unchanged. Typing without a command stays the main experience.

**With a selected card,** the context strip (canvas-card-selection.md) stays neutral, and only the slash pill carries the command colour. The composer itself is never tinted.

## Tests

`packages/web/src/slash-command-tones.test.mjs` checks every command in the registry, plus:
- contrast in both themes;
- each family's hue, which is never red and never the accent;
- the same mark in the picker, the pill and the sheet;
- Auto and the strip staying neutral.

`packages/web/src/command-pill.test.mjs` renders the pill for every registered command and holds its text to the
registry label, never empty and never starting with `/`, with the Agent Bar drawing the same label.
