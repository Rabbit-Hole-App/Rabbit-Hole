// Brand rules (ui.jsx AppIcon, owner 2026-10-13): no file in the web app imports lucide-react's Sparkles ("never lucide
// Sparkles"), and the Rabbit Hole product mark (AppIcon) is brand identity only: "never use the icon for rabbit hole for
// features". A feature gets a descriptive lucide icon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const sources = () => readdirSync(root, { recursive: true }).map(name => String(name).split('\\').join('/'))
  .filter(file => /\.(js|jsx|mjs)$/.test(file) && !file.endsWith('no-sparkles.test.mjs'))
  .map(file => [file, readFileSync(new URL(file, root), 'utf8')]);

test('no web source imports Sparkles from lucide-react', () => {
  const found = [];
  for (const [file, source] of sources()) {
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) if (/\bSparkles\b/.test(match[1])) found.push(file);
  }
  assert.deepEqual(found, []);
});

test('no web source passes the product mark (AppIcon) as a feature icon', () => {
  const found = [];
  for (const [file, source] of sources()) {
    if (/\bicon\s*(=\s*\{\s*|:\s*)AppIcon\b/.test(source)) found.push(file);
  }
  assert.deepEqual(found, []);
});
