// Executes the standalone reference scripts through a minimal document adapter.
// This checks state/data/handlers and SVG bounds, not browser rendering or fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const subjects = ['merge-sort', 'tcp-handshake', 'mitosis'];
const depths = ['overview', 'standard', 'deep'];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const script = (html, id) => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
export function mount(html) {
  const nodes = new Map();
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attributes = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
    nodes.set(attributes.id, { attributes, value: attributes.value ?? '', innerHTML: '', textContent: '', listeners: {}, disabled: false,
      setAttribute(k,v) { this.attributes[k]=String(v); }, addEventListener(k,handler) { this.listeners[k]=handler; } });
  }
  const context = { document: { getElementById: id=>nodes.get(id)??null } };
  runInNewContext(`${script(html,'scene-model')}\n${script(html,'scene-view')}`,context);
  return { nodes, Scene:runInNewContext('Scene',context),
    click: id=>nodes.get(id).listeners.click(),
    step: value=>nodes.get('step').listeners.input({target:{value}}),
    svg: ()=>nodes.get('objects').innerHTML };
}
const attrs = source => Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
const normalized = x=>JSON.parse(JSON.stringify(x));

test('nine reference HTML files and data compositions exist before review', () => {
  for (const subject of subjects) for(const depth of depths) {
    const id = `${depth}-stepper-${subject}`;
    assert.ok(existsSync(new URL(`${id}.html`,import.meta.url)),id);
    assert.ok(existsSync(new URL(`${id}.composition.json`,import.meta.url)),`${id} composition`);
  }
});

for (const subject of subjects) for (const [di,depth] of depths.entries()) {
  const id = `${depth}-stepper-${subject}`;
  test(`${id}: all state and option bindings resolve, with bounded counts and a stable picture`,()=>{
    const html=read(`${id}.html`), ui=mount(html), scene=ui.Scene;
    assert.equal(scene.depth,['brief','balanced','detailed'][di]);
    assert.equal(Boolean(scene.parameter),di>0);
    assert.equal(scene.variants.length,di?scene.parameter.options.length:1);
    for (const [oi,v] of scene.variants.entries()) {
      if (di) ui.click(`option-${oi}`);
      assert.ok(v.states.length >= [3,4,6][di] && v.states.length <= [4,6,8][di]);
      assert.ok(v.regions.length>=3 && v.regions.length<=10);
      const known=new Set(v.regions.map(r=>r.id)); assert.equal(known.size,v.regions.length);
      assert.equal(new Set(v.states.map(s=>s.id)).size,v.states.length);
      for(const l of v.links) assert.ok(known.has(l.from)&&known.has(l.to));
      const geometry=[];
      for(const [si,s] of v.states.entries()) {
        assert.ok(s.active.length); for(const r of s.active) assert.ok(known.has(r),r);
        assert.ok(s.active.includes(s.calloutRegion),'callout anchors to one scalar active region');
        assert.ok(s.active.some(r=>s.sentence.toLowerCase().includes(v.regions.find(p=>p.id===r).label.toLowerCase())),`${id}/${s.id} names its active part`);
        assert.ok(s.sentence.length<=140); if(di===2) assert.ok(s.why?.length);
        ui.step(si); const svg=ui.svg();
        const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]); assert.equal(new Set(ids).size,ids.length,'unique drawn ids');
        const drawn=[...svg.matchAll(/<g\b([^<>]*\bdata-region="[^"]+"[^<>]*)>/g)].map(m=>attrs(m[1]));
        assert.deepEqual(drawn.filter(r=>r['data-active']==='true').map(r=>r['data-region']).sort(),Array.from(s.active).sort());
        for(const r of known) assert.ok(drawn.some(d=>d['data-region']===r),`bound region ${r} is drawn`);
        assert.equal(ui.nodes.get('previous').disabled,si===0);assert.equal(ui.nodes.get('next').disabled,si===v.states.length-1);
        assert.equal(ui.nodes.get('step-value').textContent,`${si+1} of ${v.states.length}`);
        assert.equal(ui.nodes.get('scene-state').textContent,s.label);
        assert.equal(svg.includes('legend.previous.label'),di>0);assert.equal(svg.includes('trace.label'),di===2);
        const boxes=[...svg.matchAll(/<rect\b([^<>]+)>/g)].map(m=>attrs(m[1]));
        const callout=boxes.find(r=>r.id==='callout.active.box');
        assert.ok(Number(callout.y)+Number(callout.height)<=284,`${id}/${oi}/${s.id} callout must clear readouts`);
        for(const b of boxes) {
          assert.ok(Number(b.x)>=0 && Number(b.x)+Number(b.width)<=640,`${b.id} horizontal bounds`);
          assert.ok(Number(b.y)>=0 && Number(b.y)+Number(b.height)<=Number(ui.nodes.get('drawing').attributes.height),`${b.id} vertical bounds`);
        }
        geometry.push(boxes.filter(b=>b.id?.startsWith('part.')).map(b=>[b.id,b.x,b.y,b.width,b.height]));
      }
      for(const row of geometry) assert.deepEqual(row,geometry[0],'part geometry stays fixed while stepping');
    }
  });
  test(`${id}: composition is the actual reference data and controls Reset and clamp`,()=>{
    const html=read(`${id}.html`), ui=mount(html), scene=ui.Scene;
    const data=JSON.parse(read(`${id}.composition.json`));
    assert.deepEqual(data.data.variants,normalized(scene.variants));
    assert.equal(data.layout.width,640);assert.equal(data.aha.stateId,scene.aha.stateId);
    assert.ok(!JSON.stringify(data).includes('function'));
    const initial=ui.svg();ui.click('previous');assert.equal(ui.svg(),initial);
    for(let i=0;i<scene.variants[0].states.length+2;i++)ui.click('next');
    const last=ui.svg();ui.click('next');assert.equal(ui.svg(),last);
    if(di)ui.click('option-1');ui.step(1);ui.click('reset');assert.equal(ui.svg(),initial);
    assert.equal(ui.nodes.get('step').value,0);assert.equal(ui.nodes.get('previous').disabled,true);
    if(di)assert.equal(ui.nodes.get('option-0').attributes['aria-pressed'],'true');
  });
}

test('all reference depths retain approved font, palette, 640px scene and card order',()=>{
  const approved=read('overview-toss-and-drop.html');
  for(const subject of subjects)for(const [di,depth]of depths.entries()){
    const html=read(`${depth}-stepper-${subject}.html`);
    assert.equal(html.match(/@font-face\{[^}]+\}/)[0],approved.match(/@font-face\{[^}]+\}/)[0]);
    assert.equal(html.match(/:root\{[^}]+\}/)[0],approved.match(/:root\{[^}]+\}/)[0]);
    assert.ok(html.includes('width="640"'));assert.equal((html.match(/type="range"/g)||[]).length,1);
    assert.ok(html.indexOf('id="concept"')<html.indexOf('id="instructions"'));assert.ok(html.indexOf('id="instructions"')<html.indexOf('id="experiment"'));
    assert.ok(html.indexOf('id="drawing"')<html.indexOf('class="experiment-controls'));
    assert.doesNotMatch(html,/<button[^>]*>[^<]*(?:…|\.\.\.)/);
    assert.ok(!html.includes('id="play"'));
    assert.equal((html.match(/class="button secondary choice"/g)||[]).length,di?2:0);
  }
});

test('callout routes avoid every subject rectangle interior in the real generated SVG', () => {
  for (const subject of subjects) for (const [di, depth] of depths.entries()) {
    const id = `${depth}-stepper-${subject}`, ui = mount(read(`${id}.html`));
    for (const [oi, variant] of ui.Scene.variants.entries()) {
      if (di) ui.click(`option-${oi}`);
      for (const [si, state] of variant.states.entries()) {
        ui.step(si);
        const svg = ui.svg();
        const route = [...svg.matchAll(/<polyline\b([^<>]+)>/g)]
          .map(match => attrs(match[1])).find(line => line.id === 'callout.anchor');
        assert.ok(route, `${id}/${oi}/${state.id}: callout route is drawn`);
        const points = route.points.trim().split(/\s+/).map(point => point.split(',').map(Number));
        const boxes = [...svg.matchAll(/<rect\b([^<>]+)>/g)].map(match => attrs(match[1]))
          .filter(box => box.id?.startsWith('part.') || ['client.box', 'server.box', 'connected.box'].includes(box.id));
        for (let i = 1; i < points.length; i++) {
          const [[ax, ay], [bx, by]] = [points[i - 1], points[i]];
          assert.ok(ax === bx || ay === by, `${id}/${oi}/${state.id}: axis-aligned callout segment`);
          for (const box of boxes) {
            const left = Number(box.x), right = left + Number(box.width);
            const top = Number(box.y), bottom = top + Number(box.height);
            // Strict inequalities allow a target-boundary touch. A collision
            // needs a positive segment overlap with the rectangle interior.
            const crosses = ax === bx
              ? ax > left && ax < right && Math.max(Math.min(ay, by), top) < Math.min(Math.max(ay, by), bottom)
              : ay > top && ay < bottom && Math.max(Math.min(ax, bx), left) < Math.min(Math.max(ax, bx), right);
            assert.equal(crosses, false, `${id}/${oi}/${state.id}: callout segment ${i} crosses ${box.id}`);
          }
        }
      }
    }
  }
});
