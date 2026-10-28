// Deleting from the Rabbit Holes navigator (Dive.jsx askDelete). A pending hole lives only while the learner is
// in it (sweepPending discards one left behind) and children are server rows, so the only pending level the
// navigator can delete is the current hole, which climbs back to its parent. Kept holes go through the server.
// This guards the source: the local pending-children state was removed in 4b764cb0 and a stale call to its
// setter outlived it; no pending-child delete path may come back without that state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./Dive.jsx', import.meta.url), 'utf8');
const body = name => {
  const start = source.indexOf(`const ${name} = async`);
  assert.ok(start > 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n  };\n', start));
};

test('deleting the current pending hole discards it and climbs back to its parent, and does nothing else', () => {
  const pendingBranch = body('askDelete').match(/if \(level\.pending\) \{([\s\S]*?)\n {4}\}/)[1];
  assert.match(pendingBranch, /discardHole\(/);
  assert.match(pendingBranch, /if \(level\.app === here\.app\) climb\(treeRef\.current\.path\.length - 2\);/);
  assert.doesNotMatch(pendingBranch, /\belse\b/, 'no alternate pending-child delete path');
  assert.doesNotMatch(pendingBranch, /\bset[A-Z]\w*\(/, 'no local state for pending children');
});

test('a kept hole is still deleted through the server, with the subtree warning', () => {
  const remove = body('askDelete');
  assert.match(remove, /api\(`\/api\/canvases\/dives\?app=\$\{encodeURIComponent\(level\.app\)\}&board=main`\)/);
  assert.match(remove, /method: 'DELETE'/);
  assert.match(remove, /setConfirm\(\{ level, descendants: failure\.data\.descendants, back \}\)/);
});

// Owner, 2026-10-27: the right-click menu's Delete Rabbit Hole opens this same dialog. Cancel only closes it and gives the focus
// back: no request and no local change. Only Yes, delete runs doDelete.
test('the delete dialog is the owner\'s wording, and Cancel sends nothing and changes nothing', () => {
  const dialog = source.slice(source.indexOf('confirmDialog: confirm &&'), source.indexOf('suggestionCard:'));
  assert.match(dialog, /title="Delete this Rabbit Hole\?"/);
  assert.match(dialog, /confirmLabel="Yes, delete"/);
  assert.match(dialog, /onConfirm=\{doDelete\}/);
  const cancel = dialog.slice(dialog.indexOf('onCancel='), dialog.indexOf('onConfirm='));
  assert.doesNotMatch(cancel, /api\(|discardHole|go\(|load\(|navigate/, 'no request, no local change, no navigation');
  assert.match(cancel, /setConfirm\(null\)/);
  assert.match(cancel, /back\.focus/);
  // The menu reaches the same askDelete as the navigator: a card's hole with that card as the focus to return to, or the hole open now.
  const remove = source.slice(source.indexOf('remove: name =>'), source.indexOf('navigator: {'));
  assert.match(remove, /askDelete\(\{ \.\.\.child, app: child\.name, kind: 'canvas' \}, document\.querySelector/);
  assert.match(remove, /askDelete\(current\)/);
});

test('children are server rows only, and no local pending-holes state exists', () => {
  assert.match(source, /const children = tree\?\.children \|\| \[\];/);
  assert.doesNotMatch(source, /localHoles|setLocalHoles/);
});
