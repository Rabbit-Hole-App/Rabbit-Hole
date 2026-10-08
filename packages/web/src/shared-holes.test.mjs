import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedTree } from './shared-holes.js';
import { navigatorRows } from './dive.js';

const map = {
  path: [{ title: 'Attention', href: '/b/root-token' }, { title: 'Softmax', href: '/b/soft-token' }],
  children: [{ title: 'Deeper', href: '/b/deep-token', origin_block_id: 'b7' }],
};

test('the shared map becomes the navigator\'s tree and the hole portals, every level a link of its own', () => {
  const { tree, portals } = sharedTree(map);
  assert.deepEqual(tree.path.map(l => [l.title, l.href, l.kind]), [['Attention', '/b/root-token', 'view'], ['Softmax', '/b/soft-token', 'view']]);
  assert.deepEqual(tree.children, [{ name: '/b/deep-token', title: 'Deeper' }]);
  assert.deepEqual(portals, { b7: { name: '/b/deep-token', title: 'Deeper', pending: false } });
  assert.deepEqual(navigatorRows(tree).map(r => r.role), ['ancestor', 'current', 'child']);
});

test('no map when there is nothing above or below, or nothing was answered', () => {
  for (const nothing of [null, undefined, { path: [], children: [] }, { path: [{ title: 'Alone', href: '/b/x' }], children: [] }]) assert.equal(sharedTree(nothing), null);
  assert.ok(sharedTree({ path: [{ title: 'Alone', href: '/b/x' }], children: map.children }));
});

test('the shared page wires the map read-only: no rename, no delete, and a level opens its own link', () => {
  const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /<DiveNavigator tree=\{holes\.tree\} climb=\{index => goTo\(holes\.tree\.path\[index\]\.href\)\} enter=\{goTo\} \/>/);
  assert.doesNotMatch(page, /askDelete|rename=/);
  assert.match(page, /\/api\/learn\/boards\/shared\/\$\{encodeURIComponent\(token\)\}\/holes/);
  const dive = readFileSync(new URL('./Dive.jsx', import.meta.url), 'utf8');
  assert.match(dive, /index > 0 && askDelete && <button/);
  assert.match(dive, /\{askDelete && <button type="button" aria-label=\{`Delete \$\{child\.title\}`\}/);
});
