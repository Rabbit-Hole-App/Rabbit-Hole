import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFrame } from './contract.js';
import { textBoxes, textOverlaps } from './frame-overlap.js';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { EVIDENCE_SOURCE } from './sdk-evidence.js';

const sdk = new Function(`${SDK_SOURCE}\n${EVIDENCE_SOURCE}\nreturn sdk;`)();
const viewport = { x: 12, y: 12, w: 220, h: 180 };
const token = {
  ...viewport,
  text: 'A 🐇 tracks red. Red tracks blue.',
  spans: [
    { id: 'first', start: 5, end: 11 },
    { id: 'second', start: 21, end: 27 },
    { id: 'rabbit', start: 2, end: 4 },
  ],
};
const evidence = {
  ...viewport,
  text: 'The log says: ice cooled the tray while the fan stayed off.',
  spans: [
    { id: 'cooling', start: 14, end: 33, citation: 'Lab notes, entry 2' },
    { id: 'fan', start: 34, end: 58, citation: 'Lab notes, entry 3' },
  ],
};

const label = object => object.text ?? object.runs?.map(run => run.text).join('');
const sourceText = objects => objects.filter(object => object.id.startsWith('demo:text:'));
const marks = (objects, span) => objects.filter(object => object.id.startsWith(`demo:span:${span}:`));
const details = (objects, kind) => objects
  .filter(object => object.id === `demo:${kind}` || object.id.startsWith(`demo:${kind}:`)).map(label).join('');

test('token selection distinguishes repeated text and uses original UTF-16 offsets', () => {
  const draw = selected => sdk.evidence('demo', { ...token, selected });
  const first = draw('first'), second = draw('second'), rabbit = draw('rabbit'), unselected = draw(null);
  assert.deepEqual(sourceText(first), sourceText(second), 'changing the selection must not move or reflow source text');
  assert.equal(sourceText(first).map(label).join(''), token.text);
  assert.notDeepEqual(marks(first, 'first'), marks(second, 'first'));
  assert.notDeepEqual(marks(first, 'second'), marks(second, 'second'));
  assert.deepEqual(marks(first, 'rabbit'), marks(second, 'rabbit'));
  assert.equal(details(first, 'excerpt'), 'tracks');
  assert.equal(details(second, 'excerpt'), 'tracks');
  assert.equal(details(second, 'citation'), 'UTF-16 offsets [21, 27)');
  assert.equal(details(rabbit, 'excerpt'), '🐇');
  assert.equal(details(unselected, 'excerpt'), '');
});

test('evidence spanning wrapped lines shows its own citation and exact excerpt within the frame', () => {
  const draw = selected => sdk.evidence('demo', { ...evidence, selected });
  const cooling = draw('cooling'), fan = draw('fan');
  const firstMarks = marks(cooling, 'cooling');
  assert.ok(firstMarks.length > 1, 'the selected span crosses a wrap');
  assert.equal(details(cooling, 'citation'), 'Lab notes, entry 2');
  assert.equal(details(cooling, 'excerpt'), 'ice cooled the tray');
  assert.equal(details(fan, 'citation'), 'Lab notes, entry 3');
  assert.equal(details(fan, 'excerpt'), 'while the fan stayed off');
  for (const objects of [cooling, fan]) {
    const frame = sdk.frame(objects, { width: 246, height: 206 });
    assert.equal(parseFrame(frame).ok, true);
    const normalized = normalizeFrame(frame);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.deepEqual(textOverlaps(frame), []);
    for (const { box } of textBoxes(frame)) {
      assert.ok(box.xMin >= viewport.x && box.xMax <= viewport.x + viewport.w);
      assert.ok(box.yMin >= viewport.y && box.yMax <= viewport.y + viewport.h);
    }
  }
});

test('evidence rejects ambiguous offsets, unsupported citations, and content that will not fit', () => {
  const draw = overrides => sdk.evidence('demo', { ...token, ...overrides });
  assert.throws(() => draw({ selected: 'missing' }), /selection/i);
  assert.throws(() => draw({ spans: [{ id: 'half', start: 2, end: 3 }] }), /offset/i);
  assert.throws(() => draw({ spans: [{ id: 'backwards', start: 7, end: 5 }] }), /offset/i);
  assert.throws(() => draw({ spans: [{ id: 'outside', start: 2, end: 40 }] }), /offset/i);
  assert.throws(() => draw({ spans: [token.spans[0], { id: 'overlap', start: 10, end: 12 }] }), /overlap/i);
  assert.throws(() => draw({ spans: [token.spans[0], { ...token.spans[1], id: 'first' }] }), /duplicate/i);
  assert.throws(() => draw({ spans: [{ ...token.spans[0], citation: 'https://invalid.example' }] }), /citation/i);
  assert.throws(() => draw({ spans: [{ ...token.spans[0], url: 'https://invalid.example' }] }), /field/i);
  assert.throws(() => draw({ w: 120, h: 80 }), /space/i);
  assert.throws(() => draw({ text: 'word '.repeat(130) }), /text/i);
  assert.throws(() => draw({ text: 'x\n'.repeat(61) + 'y', h: 1800, spans: [{ id: 'x', start: 0, end: 1 }] }), /objects/i);
});

test('evidence reserves enough height for the longest selection even when it is inactive', () => {
  const spec = {
    ...evidence, w: 200, h: 216,
    text: 'First. The longer passage includes every word in the second span.',
    spans: [{ id: 'short', start: 0, end: 5 }, { id: 'long', start: 7, end: 64 }],
  };
  assert.equal(details(sdk.evidence('demo', { ...spec, spans: spec.spans.slice(0, 1), selected: 'short' }), 'excerpt'), 'First');
  assert.throws(() => sdk.evidence('demo', { ...spec, selected: 'short' }), /space/i);
  assert.equal(details(sdk.evidence('demo', { ...spec, h: 280, selected: 'long' }), 'excerpt'),
    'The longer passage includes every word in the second span');
});

test('the existing scene renders literal template syntax and whitespace in a selected excerpt', () => {
  const objects = sdk.evidence('demo', {
    ...viewport, text: 'Use {{key}}\r\nwith  spaces.', selected: 'literal',
    spans: [{ id: 'literal', start: 4, end: 25, citation: 'Example template' }],
  });
  const result = normalizeFrame(sdk.frame(objects, { width: 246, height: 206 }));
  assert.equal(result.ok, true, result.issue);
  const lines = result.state.objects.filter(object => object.id.startsWith('demo:excerpt:'));
  assert.deepEqual(lines.map(object => object.label), ['{{key}}', 'with  spaces']);
  assert.ok(lines[0].y < lines[1].y);
});
