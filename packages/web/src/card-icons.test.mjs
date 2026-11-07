// The card icon map (card-icons.js; owner 2026-11-07: every card type has its own modern icon, not the Explanation card's dot).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lucide from 'lucide-react';
import { COMMAND_CARDS, FILE_KIND_ICONS, TYPE_ICONS, cardIconOf } from './card-icons.js';
import { MATERIAL_TOOLS, SLASH } from './agent/slash.js';

// Every card type in docs/features/explain-on-canvas/card-rename-audit.md (BLOCK_TYPES keys plus the cards with their own component).
const TYPES = ['explanation', 'challenge', 'explainBack', 'quiz', 'flashcards', 'table', 'snippet', 'code', 'repo-code', 'graph', 'plot', 'vector', 'mathAnimation',
  'flow', 'mermaid', 'walkthrough', 'pipeline', 'knowledge', 'repo-graph', 'animation', 'animationAxis', 'animationResidual', 'animationSigmoid', 'referenceAttention',
  'whiteboard', 'whiteboardVideo', 'animation3d', 'model3d', 'scene', 'cad', 'image', 'imageGenerate', 'video', 'videoGenerate', 'audio', 'paper', 'pdf', 'slide',
  'wiki', 'webpage', 'notebook', 'canvas-ref', 'divider', 'heading'];
const FILE_KINDS = ['text', 'markdown', 'table', 'workbook', 'document', 'presentation', 'image', 'audio', 'video', 'model'];

test('every card type maps to a real lucide icon, and an unknown type still gets one', () => {
  for (const type of TYPES) assert.ok(TYPE_ICONS[type], `${type} has an icon`);
  for (const kind of FILE_KINDS) assert.ok(FILE_KIND_ICONS[kind], `file kind ${kind} has an icon`);
  const real = new Set(Object.values(lucide));
  for (const icon of [...Object.values(TYPE_ICONS), ...Object.values(FILE_KIND_ICONS)]) assert.ok(real.has(icon), 'every mapped icon is a lucide export');
  assert.equal(typeof cardIconOf({ type: 'a-future-card' }), typeof lucide.Shapes);
  assert.equal(cardIconOf({ type: 'a-future-card' }), lucide.Shapes);
  assert.equal(cardIconOf(null), lucide.Shapes);
});

test('the families are distinct: no two unrelated card types share an icon', () => {
  const FAMILIES = [['challenge', 'explainBack'], ['animation', 'animationAxis', 'animationResidual', 'animationSigmoid'], ['image', 'imageGenerate'], ['video', 'videoGenerate'], ['paper', 'pdf']];
  const seen = new Map();
  for (const type of TYPES) {
    const family = FAMILIES.find(group => group.includes(type))?.[0] || type;
    const icon = TYPE_ICONS[type];
    if (seen.has(icon)) assert.equal(seen.get(icon), family, `${type} shares an icon with ${seen.get(icon)}`);
    else seen.set(icon, family);
  }
});

test('a file card is keyed by its kind, a PDF excerpt is a quote, and the Explanation card is no longer a dot', () => {
  assert.equal(cardIconOf({ type: 'file', kind: 'markdown' }), lucide.FileText);
  assert.equal(cardIconOf({ type: 'file', kind: 'workbook' }), lucide.FileSpreadsheet);
  assert.equal(cardIconOf({ type: 'file', kind: 'presentation' }), lucide.Presentation);
  assert.equal(cardIconOf({ type: 'file', kind: 'something-new' }), lucide.FileText);
  assert.equal(cardIconOf({ type: 'explanation', excerpt: { kind: 'text' } }), lucide.Quote);
  assert.equal(cardIconOf({ type: 'explanation' }), lucide.Lightbulb);
});

// Slash command -> card type -> icon (owner 2026-11-07): every card a command creates has its own icon, and two command families never share one unless they
// share a card type. A new command added to agent/slash.js without a COMMAND_CARDS row fails here.
const ALL = [...SLASH, ...MATERIAL_TOOLS].map(command => command.name);

test('every slash command and Tutor material tool has a row naming the card types it creates', () => {
  assert.equal(new Set(ALL).size, ALL.length, 'command names are unique');
  assert.deepEqual(ALL.filter(name => !(name in COMMAND_CARDS)), [], 'a command with no COMMAND_CARDS row');
  assert.deepEqual(Object.keys(COMMAND_CARDS).filter(name => !ALL.includes(name)), [], 'a row for a command that is not in agent/slash.js');
  assert.deepEqual(COMMAND_CARDS.goal, [], 'goal opens the goal manager and creates no card');
});

test('every card a command creates resolves to its own icon, never the default', () => {
  for (const [name, types] of Object.entries(COMMAND_CARDS)) {
    for (const type of types) assert.ok(TYPE_ICONS[type] && cardIconOf({ type }) !== lucide.Shapes, name + ' -> ' + type + ' has no icon');
  }
});

// A palette key (BLOCK_TYPES) and the block type it saves as are one card: Generate video saves as a 'video' block, a generated image as an 'image' block.
const SAVED_AS = { videoGenerate: 'video', imageGenerate: 'image', explainBack: 'challenge' };
test('two command families share an icon only when they share a card type', () => {
  const commands = Object.entries(COMMAND_CARDS).filter(([, types]) => types.length).map(([name, types]) => [name, types.map(type => SAVED_AS[type] || type)]);
  for (let a = 0; a < commands.length; a += 1) {
    for (let b = a + 1; b < commands.length; b += 1) {
      const [nameA, typesA] = commands[a], [nameB, typesB] = commands[b];
      if (typesA.some(type => typesB.includes(type))) continue; // the same card type: the same icon is right
      const iconsA = new Set(typesA.map(type => cardIconOf({ type }))), shared = typesB.filter(type => iconsA.has(cardIconOf({ type })));
      assert.deepEqual(shared, [], nameA + ' and ' + nameB + ' share an icon through different card types');
    }
  }
});
