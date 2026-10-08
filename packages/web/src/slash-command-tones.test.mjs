// Slash-command identities (owner, 2026-10-06; docs/features/slash-command-tones.md): one fixed family per command,
// the same everywhere, readable in both themes, never the primary blue, never red, and the literal /command kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = read('./index.css');
const darkStart = css.indexOf('.dark {');
const THEMES = { light: css.slice(0, darkStart), dark: css.slice(darkStart, css.indexOf('}', darkStart)) };
const token = (theme, name) => THEMES[theme].match(new RegExp(`^\\s*${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'mi'))?.[1];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = hex => { const [r, g, b] = rgb(hex).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = hex => {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const FAMILIES = { ask: [170, 200], teach: [250, 285], research: [25, 55], do: [120, 160], motion: [280, 310] };

test('each command family has its own tint, text and border, readable in both themes', () => {
  for (const theme of ['light', 'dark']) {
    for (const name of Object.keys(FAMILIES)) {
      const bg = token(theme, `--cmd-${name}-bg`), fg = token(theme, `--cmd-${name}-fg`), line = token(theme, `--cmd-${name}-line`);
      assert.ok(bg && fg && line, `${theme} /${name} tokens`);
      assert.ok(contrast(fg, bg) >= 4.5, `${theme} /${name}: ${contrast(fg, bg).toFixed(2)}:1`);
    }
  }
});

test('the families are the owner\'s: cyan, violet, amber, green, magenta - never the primary blue, never red', () => {
  const accent = token('light', '--color-accent');
  for (const [name, [low, high]] of Object.entries(FAMILIES)) {
    for (const theme of ['light', 'dark']) {
      const fg = token(theme, `--cmd-${name}-fg`), h = hue(fg);
      assert.ok(h >= low && h <= high, `${theme} /${name} hue ${h?.toFixed(0)} in ${low}-${high}`);
      assert.ok(h > 15 && h < 345, `${theme} /${name} is not red`);
      assert.notEqual(fg, accent);
    }
  }
});

test('the same command looks the same everywhere: the / picker, the composer pill, the Slash commands sheet', async () => {
  const { COMMAND_ICONS, commandTone } = await import('./CommandTone.jsx').catch(() => ({}));
  // CommandTone.jsx is JSX; the map is read from its source when node cannot load it.
  const source = read('./CommandTone.jsx');
  assert.match(source, /export const COMMAND_ICONS = \{ ask: CircleHelp, teach: Sparkles, research: Telescope, do: Play, motion: Clapperboard \};/);
  assert.match(source, /export const COMMAND_TONES = SLASH\.map\(\(command\) => command\.name\);/, 'every command in the registry is toned');
  if (commandTone) { assert.equal(commandTone('ask'), 'ask'); assert.equal(commandTone('quiz'), 'quiz'); assert.equal(commandTone('auto'), null); assert.equal(Object.keys(COMMAND_ICONS).length, 5); }
  assert.match(read('./LearnSlash.jsx'), /<CommandMark name=\{item\.name\} className="text-ink" \/>/);
  // Both Slash commands sheets list commands through CommandList.jsx (the canvas's and the Agent Bar's).
  assert.match(read('./CommandList.jsx'), /<CommandMark name=\{item\.name\} \/>/);
  for (const sheet of ['./SlashCommandsSheet.jsx', './agent/BarCommandsSheet.jsx']) assert.match(read(sheet), /<CommandList sections=\{sections\} current=\{name\}/, sheet);
  const ask = read('./ask.jsx');
  assert.match(ask, /data-command-pill data-command-tone=\{commandTone\(command\) \|\| undefined\}/);
  assert.match(ask, /<CommandIcon name=\{command\} \/>\/\{command\}<\/button>/, 'the literal /command stays beside the icon');
  // Auto stays the quiet neutral pill; the selected-card strip stays neutral too.
  assert.match(ask, /className=\{cn\(dock \? COMPOSER_PILL : [^}]+\}>Auto<\/button>/);
  assert.match(ask, /data-canvas-target \{\.\.\.\(canvasTarget\.card[^\n]+className="mb-1\.5 inline-flex max-w-full items-center gap-1\.5 rounded-full border border-line bg-hover/);
  assert.match(css, /\[data-command-tone\] \{ background-color: var\(--cmd-bg\); color: var\(--cmd-fg\); border-color: var\(--cmd-line\); \}/);
});

// Owner, 2026-10-08: every /command its own colour - one token set per command in the registry, readable in both
// themes, never red, never the primary blue, and never two commands alike.
test('every command in the registry has its own colour in both themes; no two share one', async () => {
  const { SLASH } = await import('./agent/slash.js');
  const names = SLASH.map((command) => command.name);
  assert.ok(names.length >= 30, `${names.length} commands`);
  const accent = token('light', '--color-accent');
  for (const theme of ['light', 'dark']) {
    const seen = new Map();
    for (const name of names) {
      const bg = token(theme, `--cmd-${name}-bg`), fg = token(theme, `--cmd-${name}-fg`), line = token(theme, `--cmd-${name}-line`);
      assert.ok(bg && fg && line, `${theme} /${name} tokens`);
      assert.ok(contrast(fg, bg) >= 4.5, `${theme} /${name}: ${contrast(fg, bg).toFixed(2)}:1`);
      const h = hue(fg);
      assert.ok(h > 15 && h < 345, `${theme} /${name} is not red (${h?.toFixed(0)})`);
      assert.notEqual(fg, accent, `${theme} /${name} is not the primary blue`);
      for (const value of [fg, bg]) { assert.ok(!seen.has(value), `${theme} /${name} shares ${value} with /${seen.get(value)}`); seen.set(value, name); }
    }
  }
  for (const name of names) assert.ok(css.includes(`[data-command-tone="${name}"] { --cmd-bg: var(--cmd-${name}-bg); --cmd-fg: var(--cmd-${name}-fg); --cmd-line: var(--cmd-${name}-line); }`), `/${name} rule`);
  // The bar's picker rows and pills wear the same mark as the canvas's.
  const bar = read('./agent/AgentBar.jsx');
  assert.match(bar, /\{can\.ok \? <CommandMark name=\{m\} \/> : <span className="font-medium text-ink-3">\/\{m\}<\/span>\}/);
  assert.match(bar, /data-command-pill data-command-tone=\{commandTone\(mode\) \|\| undefined\}/);
  assert.match(bar, /data-command-pill data-command-tone=\{commandTone\(shortcut\) \|\| undefined\}/);
  assert.match(bar, /className=\{COMPOSER_PILL\}>Auto<\/button>/, 'Auto stays neutral');
});
