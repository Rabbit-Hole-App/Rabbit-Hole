import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceReference,singleSourcePath,INLINE_PARTS} from '../src/source-references.js';
test('inline citations preserve file and line ranges across code formatting and dash styles',()=>{
  for(const value of ['model.py:62-64','model.py:62–64','`model.py:62—64`'])assert.deepEqual(sourceReference(value),{path:'model.py',start:62,end:64});
  assert.deepEqual(sourceReference('line 45','model.py'),{path:'model.py',start:45,end:45});
  assert.equal(sourceReference('line 45'),null);assert.equal(sourceReference('model.py:0'),null);assert.equal(sourceReference('model.py:9-2'),null);
  assert.equal(singleSourcePath('self.flash (line 45) Sources: model.py:62–64'),'model.py');
  assert.equal(singleSourcePath('model.py:1 and train.py:2'),null);
  assert('self.flash (line 45), model.py:62–64'.split(INLINE_PARTS).includes('line 45'));
  assert('self.flash (line 45), model.py:62–64'.split(INLINE_PARTS).includes('model.py:62–64'));
});
