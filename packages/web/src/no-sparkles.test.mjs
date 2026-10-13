// Brand rule (ui.jsx:716, owner 2026-10-13: "never lucide Sparkles"): no file in the web app imports lucide-react's
// Sparkles. AI actions use the product mark (AppIcon) or no icon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('no web source imports Sparkles from lucide-react', () => {
  const root = new URL('./', import.meta.url);
  const found = [];
  for (const name of readdirSync(root, { recursive: true })) {
    const file = String(name).split('\\').join('/');
    if (!/\.(js|jsx|mjs)$/.test(file) || file.endsWith('no-sparkles.test.mjs')) continue;
    const source = readFileSync(new URL(file, root), 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) if (/\bSparkles\b/.test(match[1])) found.push(file);
  }
  assert.deepEqual(found, []);
});
