// Owner 2026-10-21: no "..." or "…" anywhere in the UI, including server error, message and progress text the web renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
// file + a snippet of the allowed line, and why: model prompts, truncation, or text never shown in the web UI.
const ALLOW = [
  ['cad-model.js', '{"brief":{"title":"..."', 'model prompt JSON template'],
  ['chat-answer-meta.js', '<answer_meta>', 'model prompt JSON template'],
  ['chat-answer-meta.js', '"cells":["..."]', 'model prompt JSON template'],
  ['index.js', 'add schedule = "..." to small.toml', 'TOML placeholder the user fills in (CLI error)'],
  ['learn-ask-context.js', 'const cut =', 'truncates context sent to the model'],
  ['learn-codebase-source-map.js', 'const clip =', 'truncates source text sent to the model'],
  ['slack.js', "r.status === 'running' ? '…'", 'Slack message, not the web UI'],
  ['slack.js', 'usage: /small run <app> --input value …', 'Slack usage text, not the web UI'],
];
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
const ending = /[^\s[({,=:?](…|\.\.\.)['"`]/;

test('no server string in control-plane/src ends in an ellipsis', () => {
  const found = [];
  for (const file of files(root).filter(f => /\.m?js$/.test(f))) {
    const name = relative(root, file).split(sep).join('/');
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!ending.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (ALLOW.some(([f, snippet]) => f === name && line.includes(snippet))) return;
      found.push(`${name}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, [], 'remove the trailing "..." or "…" (or allowlist a prompt or truncation with its reason)');
});
