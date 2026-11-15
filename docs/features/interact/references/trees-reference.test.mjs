// Deterministic reference checks, not browser/visual acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('./',import.meta.url), read=n=>readFileSync(new URL(n,root),'utf8');
import {inspect} from './trees-reference-harness.mjs';
const all=readdirSync(root).filter(f=>/^(overview|standard|deep)-.*\.composition\.json$/.test(f)).filter(f=>JSON.parse(read(f)).data?.treeReference===true);
const selected=all.filter(f=>!process.env.TREES_ONLY||f.endsWith('-'+process.env.TREES_ONLY+'.composition.json'));
const expected=process.env.TREES_ONLY?3:Math.max(3,all.length);
test('three depth references exist for every authored tree prompt',()=>assert.equal(selected.length,expected));
for(const f of selected)test(f, t=>{const c=JSON.parse(read(f));const html=read(f.replace('.composition.json','.html')),approved=read('overview-stepper-merge-sort.html');assert.equal(html.match(/@font-face\{[^}]+\}/)[0],approved.match(/@font-face\{[^}]+\}/)[0]);assert.equal(html.match(/:root\{[^}]+\}/)[0],approved.match(/:root\{[^}]+\}/)[0]);const out=inspect(read(f.replace('.composition.json','.html')),c);t.diagnostic(`${out.cases} cases; densest ${out.max}`)});
