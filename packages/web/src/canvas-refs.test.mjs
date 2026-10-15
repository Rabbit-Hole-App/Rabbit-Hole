import test from 'node:test';
import assert from 'node:assert/strict';
import { refHref } from './canvas-refs.js';

test('refHref adds the card to an owner, project or member canvas URL, replacing an older one', () => {
  assert.equal(refHref('/apps/canvas-0000abcd', 'c1'), '/apps/canvas-0000abcd?card=c1');
  assert.equal(refHref('/apps/repo-x?tab=learn&canvas=canvas-0000abcd', 'k exp'), '/apps/repo-x?tab=learn&canvas=canvas-0000abcd&card=k+exp');
  assert.equal(refHref('/c/0b5e0d6e-0000-4000-8000-000000000000?card=old', 'new'), '/c/0b5e0d6e-0000-4000-8000-000000000000?card=new');
});
