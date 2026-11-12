// Owner 2026-10-21: no "..." or "…" anywhere in the UI. Fails on a string literal or JSX text ending in an ellipsis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// file + a snippet of the allowed line, and why: truncation of user content, code or lesson content, not UI copy.
const ALLOW = [
  ['AdaptiveCanvas.jsx', "titles.length > 2 ? '…'", 'truncates a list of user card titles'],
  ['agent/commands.js', 'noDefaultBranch', 'example URL ending in a path placeholder'],
  ['ask.jsx', 'data-context-excerpt', 'truncates a quoted user excerpt'],
  ['canvas-find.js', "(from ? '…' : '')", 'cut find snippet of user text'],
  ['card-plan.js', '"none: …"', 'validator message for authoring, not UI'],
  ['chat-context.js', 'range.quote.slice(0, 24)', 'truncates a quoted user range'],
  ['inline-ai-context.js', 'const shorten', 'truncates text sent to the model'],
  ['inline-ai-session.js', 'op.text.slice(0, each)', 'truncates edit text sent to the model'],
  ['InlineAiEditor.jsx', 'const short =', 'truncates a user selection label'],
  ['LearningBlocks.jsx', "starter: 'def encode(s)", 'Python Ellipsis in a code starter'],
  ['nanogpt/card-gates.mjs', 'object.label.slice(0, 40)', 'authoring gate message, not UI'],
  ['nanogpt/cards/c02-block-anatomy.js', "'x + …'", 'lesson diagram content'],
  ['nanogpt/cards/c04-block-stack.js', "'Block 2', '…'", 'lesson diagram content: elided blocks'],
  ['nanogpt/cards/c25-autoregressive-conditioning.js', "['…',", 'lesson token: earlier text'],
  ['nanogpt/cards/c25-autoregressive-conditioning.js', "// '…' shifts", 'code comment'],
  ['nanogpt/depth/architecture/guided.js', 'start-up count', 'lesson content'],
  ['RepositoryGraph.jsx', "n.label.slice(0,27)+'…'", 'SVG text truncation of a file name (no CSS ellipsis in SVG)'],
  ['RepositorySource.jsx', 'commit.slice(0,7)', 'commit hash, not an ellipsis'],
  ['selection-ref.js', "names.slice(0, 2).join(', ')", 'truncates a list of user card names'],
];
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
const ending = /[^\s[({,=:?](…|\.\.\.)(['"`<]|\s*$)/;

test('no user-visible string in packages/web/src ends in an ellipsis', () => {
  const found = [];
  for (const file of files(root).filter(f => /\.(jsx?|mjs)$/.test(f) && !/\.test\./.test(f))) {
    const name = relative(root, file).split(sep).join('/');
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!ending.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (ALLOW.some(([f, snippet]) => f === name && line.includes(snippet))) return;
      found.push(`${name}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, [], 'remove the trailing "..." or "…" (or allowlist a truncation with its reason)');
});
