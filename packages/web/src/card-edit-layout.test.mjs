import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveCardEditLayout } from './card-layout.js';
test('an implicitly sized Scrollable card keeps its measured box and column footprint for an edit', () => {
 const original={id:'a',type:'explanation',body:'long',dx:20,dy:30};
 const held=preserveCardEditLayout(original,{w:560,h:420});
 assert.deepEqual(held.cardLayout,{mode:'scrollable',scrollableSize:{w:560,h:420},fullWidth:560,slot:{w:560,h:420}});
 assert.equal(held.body,'long');assert.equal(held.dx,20);assert.equal(held.dy,30);assert.equal(original.cardLayout,undefined);
});
test('editing preserves existing Full content preferences and unsupported card geometry', () => {
 const full={type:'explanation',cardLayout:{mode:'full',fullWidth:800,scrollableSize:{w:560,h:300},slot:{w:560,h:300}}};
 assert.equal(preserveCardEditLayout(full,{w:800,h:6000}),full);
 const unsupported={type:'graph',w:700,h:500};assert.equal(preserveCardEditLayout(unsupported,{w:700,h:500}),unsupported);
 assert.equal(preserveCardEditLayout({type:'explanation'},null).cardLayout,undefined);
});
