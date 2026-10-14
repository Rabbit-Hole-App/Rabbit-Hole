// Brand rules (ui.jsx AppIcon, owner 2026-10-13): no file in the web app imports a sparkle icon from lucide-react ("never
// lucide Sparkles") - Sparkles itself or any other export that draws it or a spark motif - and the Rabbit Hole product
// mark (AppIcon) is brand identity only: "never use the icon for rabbit hole for features". A feature gets a descriptive
// lucide icon (Wand, not Wand2 or WandSparkles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const sources = () => readdirSync(root, { recursive: true }).map(name => String(name).split('\\').join('/'))
  .filter(file => /\.(js|jsx|mjs)$/.test(file) && !file.endsWith('no-sparkles.test.mjs'))
  .map(file => [file, readFileSync(new URL(file, root), 'utf8')]);

// Every lucide-react (1.41.0) export that is a sparkle icon, under each name it has: Sparkles, Sparkle, Stars (an alias of
// Sparkles), WandSparkles and its alias Wand2, BroomSparkles, MopSparkles and PencilSparkles, each also as <Name>Icon and
// Lucide<Name>. Read from the package's export list: `Sparkles?|Stars` below also covers SparklesIcon, LucideSparkles, StarsIcon.
const SPARKLE_ICON = /^(Lucide)?(Sparkles?|Stars|WandSparkles|Wand2|BroomSparkles|MopSparkles|PencilSparkles)(Icon)?$/;

test('no web source imports a sparkle icon (Sparkles, WandSparkles, Wand2 or an alias) from lucide-react', () => {
  const found = [];
  for (const [file, source] of sources()) {
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
      for (const specifier of match[1].split(',')) {
        const name = specifier.trim().split(/\s+as\s+/)[0];
        if (SPARKLE_ICON.test(name)) found.push(`${file}: ${name}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('the sparkle-icon pattern catches each alias and leaves ordinary icons alone', () => {
  for (const name of ['Sparkles', 'SparklesIcon', 'LucideSparkles', 'Sparkle', 'SparkleIcon', 'Stars', 'StarsIcon', 'WandSparkles', 'WandSparklesIcon', 'Wand2', 'Wand2Icon', 'LucideWand2', 'BroomSparkles', 'MopSparkles', 'PencilSparkles']) {
    assert.ok(SPARKLE_ICON.test(name), name);
  }
  for (const name of ['Wand', 'WandIcon', 'Star', 'NotebookPen', 'MessageSquare', 'Pencil']) assert.ok(!SPARKLE_ICON.test(name), name);
});

test('no web source passes the product mark (AppIcon) as a feature icon', () => {
  const found = [];
  for (const [file, source] of sources()) {
    if (/\bicon\s*(=\s*\{\s*|:\s*)AppIcon\b/.test(source)) found.push(file);
  }
  assert.deepEqual(found, []);
});
