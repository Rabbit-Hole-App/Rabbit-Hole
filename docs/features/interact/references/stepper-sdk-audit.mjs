// Read-only preflight for the approved references. This is not a Frame compiler,
// a production acceptance test, or permission to change the frozen SDK.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { CONTRACT_LIMITS, Frame } from '../../../../packages/web/src/explain-program/contract.js';
import { programSdkSource } from '../../../../packages/web/src/explain-program/sdk.js';
import { isBody } from '../../../../packages/web/src/explain-program/frame-look.js';
import { programInputWidget } from '../../../../packages/web/src/explain-program/program-card.js';

const subjects = ['merge-sort', 'tcp-handshake', 'mitosis'];
const depths = ['overview', 'standard', 'deep'];
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const script = (html, id) => {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(match, id); return match[1];
};
const attributes = source => Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
function mount(html) {
  const nodes = new Map();
  for (const m of html.slice(0, html.indexOf('<script')).matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attrs = attributes(m[2]);
    nodes.set(attrs.id, { attributes: attrs, value: attrs.value ?? '', innerHTML: '', textContent: '', listeners: {},
      setAttribute(k,v) { this.attributes[k] = String(v); }, addEventListener(k,f) { this.listeners[k] = f; } });
  }
  const context = { document: { getElementById: id => nodes.get(id) ?? null } };
  runInNewContext(`${script(html, 'scene-model')}\n${script(html, 'scene-view')}`, context);
  return { scene: runInNewContext('Scene', context),
    option: index => nodes.get(`option-${index}`).listeners.click(),
    step: index => nodes.get('step').listeners.input({ target: { value: index } }),
    svg: () => nodes.get('objects').innerHTML };
}
const marks = svg => [...svg.matchAll(/<(rect|circle|polyline|polygon|text|line|path|ellipse)\b/g)].length;
function nativeArrowSavings(svg) {
  let count = 0;
  const pair = /<polyline\b([^>]*)>(?:<\/polyline>)?\s*<polygon\b[^>]*data-tutor-arrowhead[^>]*>(?:<\/polygon>)?/g;
  for (const m of svg.matchAll(pair)) {
    const points = attributes(m[1]).points?.trim().split(/\s+/).map(p => p.split(',').map(Number));
    if (points?.length === 2) count++;
  }
  return count;
}
function pointsIn(svg) {
  const counts = [...svg.matchAll(/<polyline\b([^>]*)>/g)].map(m => attributes(m[1]).points.trim().split(/\s+/).length);
  return { total: counts.reduce((a,b) => a+b, 0), longest: Math.max(0, ...counts) };
}

export function audit() {
  const rows = [];
  let allCases = 0;
  for (const subject of subjects) for (const depth of depths) {
    const ui = mount(read(`${depth}-stepper-${subject}.html`)), scene = ui.scene;
    const row = { subject, depth: scene.depth, stateCounts: Array.from(scene.variants, v => v.states.length),
      cases: 0, svgMarks: 0, primitiveFrameEstimate: 0, pictureMarks: 0, pictureFrameEstimate: 0,
      polylinePoints: 0, pointsOnOnePath: 0, calloutLines: 0,
      compactVariantBytes: Buffer.byteLength(JSON.stringify(scene.variants), 'utf8') };
    for (let option = 0; option < scene.variants.length; option++) {
      if (scene.parameter) ui.option(option);
      for (let step = 0; step < scene.variants[option].states.length; step++) {
        ui.step(step); const svg = ui.svg(); row.cases++; allCases++;
        const prefix = svg.slice(0, svg.search(/<polyline\b[^>]*\bid="callout\.anchor"/));
        const picture = prefix.replace(/<rect\b[^>]*\bid="rail\.[^"]+"[^>]*>[\s\S]*?<\/rect>/g, '');
        assert.ok(prefix.length && prefix.length < svg.length, 'the picture ends before its callout leader');
        const points = pointsIn(svg);
        row.svgMarks = Math.max(row.svgMarks, marks(svg));
        row.primitiveFrameEstimate = Math.max(row.primitiveFrameEstimate, marks(svg) - nativeArrowSavings(svg));
        row.pictureMarks = Math.max(row.pictureMarks, marks(picture));
        row.pictureFrameEstimate = Math.max(row.pictureFrameEstimate, marks(picture) - nativeArrowSavings(picture));
        row.polylinePoints = Math.max(row.polylinePoints, points.total);
        row.pointsOnOnePath = Math.max(row.pointsOnOnePath, points.longest);
        row.calloutLines = Math.max(row.calloutLines, [...svg.matchAll(/<text\b[^>]*\bid="callout\.active\.(?:title|s\d+|why\d+)"/g)].length);
      }
    }
    rows.push(row);
  }

  const sdk = runInNewContext(`${programSdkSource('sdk-8')}\nsdk;`);
  const frame = objects => ({ width: 640, height: 430, objects });
  const circle = sdk.circle('cell.outer', 80, 80, 62, { role: 'neutral' });
  assert.equal(Frame.safeParse(frame([circle])).success, true);
  const objects = Array.from({ length: CONTRACT_LIMITS.objects + 1 }, (_, i) => sdk.box(`mark.${i}`, 20, 20, 8, 8));
  const tooMany = Frame.safeParse(frame(objects));
  assert.equal(tooMany.success, false);
  assert.ok(tooMany.error.issues.some(i => i.path[0] === 'objects' && i.code === 'too_big'));
  const refusedStyleKeys = ['dashed', 'size', 'fill'];
  for (const key of refusedStyleKeys) {
    const result = Frame.safeParse(frame([{ ...circle, [key]: key === 'dashed' ? true : key === 'size' ? 14 : '#fffefa' }]));
    assert.equal(result.success, false, key);
    assert.ok(result.error.issues.some(i => i.code === 'unrecognized_keys' && i.keys.includes(key)));
  }
  const requestedCalloutLines = Array.from({ length: 9 }, (_, i) => `line ${i}`);
  assert.equal(sdk.callout(444, 66, requestedCalloutLines, { id: 'callout.phase' }).length, 4);
  assert.equal(isBody(circle), true, 'a neutral large circle still receives body treatment');
  const input = { type: 'index', id: 'step', label: 'Step', default: 0, presentation: 'slider',
    items: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, label: `State ${i}` })) };
  assert.equal(programInputWidget(input).data.items.length, 5);
  assert.equal(programInputWidget(input, { option: 'loss' }).data.items.length, 5);
  return { sdk: 'sdk-8', limits: { objects: CONTRACT_LIMITS.objects, sourceBytes: CONTRACT_LIMITS.sourceBytes,
    manifestBytes: CONTRACT_LIMITS.manifestBytes, pointsPerObject: CONTRACT_LIMITS.pointsPerObject, pointsTotal: CONTRACT_LIMITS.pointsTotal },
    cases: allCases, rows,
    probes: { frameOverCapRejected: true, refusedStyleKeys, calloutRequestedLines: requestedCalloutLines.length,
      calloutReturnedLines: 4, neutralCircleIsBody: true, indexItemsWithoutVariant: 5, indexItemsWithVariant: 5 },
    interpretation: 'Primitive lowering estimate, not a proof against every possible semantic encoding. Full variant bytes are naive payload size, not optimized program source.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(JSON.stringify(audit(), null, 2) + '\n');
