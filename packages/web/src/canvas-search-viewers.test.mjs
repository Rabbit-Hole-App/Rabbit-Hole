import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('both read-only viewers expose scoped Search while preserving their comments and canvas', () => {
  for (const name of ['./SharedBoardPage.jsx', './comments/MemberBoardPage.jsx']) {
    const source = read(name);
    assert.match(source, /<SearchContentProvider key=\{search.scopeKey\} registry=\{search.registry\}>/);
    // SHARE-01: both mount the one shared shell's right panel (SharedCanvasShell.jsx), which holds Search and Comments.
    assert.match(source, /<SharedPanel panel=\{panel\} permissions=\{permissions\} search=\{search\}[^\n]*comments=\{comments\}/);
    assert.match(source, /comments.openPin\(result.target.id\)/);
    assert.match(source, /readOnly/);
    assert.doesNotMatch(source, /setSearchOpen.*resolveThread/);
  }
  const shell = read('./SharedCanvasShell.jsx');
  assert.match(shell, /<CanvasSearchPanel \{\.\.\.search.panel\}/);
  assert.match(shell, /<ResizableSidePanel/);
  assert.match(shell, /<CommentsPanel \{\.\.\.comments.panelProps\}/);
  assert.match(shell, /slashOpensFind\(document.activeElement\)/);
});
test('shared Search reuses the authorized comments family and only existing filtered child portals', () => {
  const source = read('./SharedBoardPage.jsx');
  assert.match(source, /commentsBase: commentsInfo \? commentsBase : null/);
  assert.match(source, /Object.entries\(holes\?\.portals \|\| \{\}\)/);
  assert.match(source, /scopeKey: `shared:\$\{token\}/);
  assert.doesNotMatch(source, /useCanvasLinks\(/, 'a plain share must not request owner/member reference APIs');
});
test('member Search uses its member comments family and existing filtered link resolver', () => {
  const source = read('./comments/MemberBoardPage.jsx');
  assert.match(source, /scopeKey: `member:\$\{boardId\}/);
  assert.match(source, /commentsBase: board \? base : null, links/);
  assert.match(source, /refLinks.go\(reference.href\)/);
});
