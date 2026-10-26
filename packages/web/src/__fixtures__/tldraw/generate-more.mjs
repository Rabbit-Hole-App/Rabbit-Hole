// More legacy-whiteboard fixtures for the migration lane (docs/features/tldraw-removal.md, workstream B4), written the way
// generate.mjs writes its two: with the REAL tldraw 5.4.2 schema and store (MIT packages @tldraw/tlschema, @tldraw/store,
// @tldraw/validate), so every record but the deliberately foreign ones was validated by tldraw's own put().
// Run once from packages/web: node src/__fixtures__/tldraw/generate-more.mjs. The unit tests read the committed JSON and need no
// tldraw; these packages are used here only and are not a dependency of anything that ships.
// ponytail: once the last tldraw import is gone this generator cannot run again; the fixtures stay as they are.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from '@tldraw/store';
import { T } from '@tldraw/validate';
import { DocumentRecordType, PageRecordType, TLDOCUMENT_ID, b64Vecs, createTLSchema, defaultShapeSchemas, toRichText } from '@tldraw/tlschema';

const here = new URL('.', import.meta.url);
const custom = props => ({ props });
const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    'three-d-viewer': custom({ w: T.number, h: T.number, modelUrl: T.string, camera: T.jsonValue, autoRotate: T.boolean, animation: T.jsonValue, animationTime: T.number }),
    'interactive-graph': custom({ w: T.number, h: T.number, spec: T.jsonValue, state: T.jsonValue, app: T.string }),
    'learn-video-pending': custom({ w: T.number, h: T.number, status: T.string, caption: T.string, error: T.string, retryable: T.boolean }),
  },
});

// Fractional index keys that sort in creation order: 'a0'..'az' then 'b00'..
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const index = n => (n < 62 ? `a${DIGITS[n]}` : `b${DIGITS[Math.floor((n - 62) / 62)]}${DIGITS[(n - 62) % 62]}`);
const rich = text => toRichText(text);
const style = { color: 'black', size: 'm', dash: 'draw', fill: 'none' };
const geoProps = (geo, w, h, extra = {}) => ({ geo, dash: 'draw', url: '', w, h, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'black', fill: 'none', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: rich(''), ...extra });
const textProps = (text, extra = {}) => ({ color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 200, richText: rich(text), scale: 1, autoSize: true, ...extra });
const arrowProps = (start, end, extra = {}) => ({ kind: 'arc', labelColor: 'black', color: 'black', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw', start, end, bend: 0, richText: rich(''), labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5, ...extra });
const drawProps = (points, extra = {}) => ({ ...style, segments: [{ type: 'free', path: b64Vecs.encodePoints(points.map(p => ({ z: 0.5, ...p }))) }], isComplete: true, isClosed: false, isPen: false, scale: 1, scaleX: 1, scaleY: 1, ...extra });
const binding = (arrow, terminal, to, anchor = { x: 0.5, y: 0.5 }, isPrecise = false) => ({ id: `binding:${arrow}-${terminal}`, typeName: 'binding', type: 'arrow', fromId: `shape:${arrow}`, toId: `shape:${to}`, meta: {}, props: { terminal, normalizedAnchor: anchor, isExact: false, isPrecise, snap: 'none' } });

// A board builder: add(name, type, x, y, props, extra) appends in paint order; the page holds everything unless a parent is given.
function board(name) {
  const page = PageRecordType.create({ id: PageRecordType.createId('page'), name: 'Page 1', index: 'a1' });
  const records = [], shapes = [];
  const add = (id, type, x, y, props, extra = {}) => { shapes.push({ id: `shape:${id}`, typeName: 'shape', type, x, y, rotation: 0, index: index(shapes.length), parentId: page.id, isLocked: false, opacity: 1, props, meta: {}, ...extra, ...(extra.parentId ? { parentId: `shape:${extra.parentId}` } : {}) }); };
  const finish = (more = []) => {
    const store = new Store({ schema, props: { defaultName: '', assets: {}, onMount() {} } });
    store.put([DocumentRecordType.create({ id: TLDOCUMENT_ID }), page, ...shapes, ...records, ...more]);
    const document = store.getStoreSnapshot();
    return { document, session: { version: 1, currentPageId: page.id, exportBackground: true, isFocusMode: false, isDebugMode: false, isToolLocked: false, isGridMode: false, pageStates: [{ pageId: page.id, camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [], focusedGroupId: null }] } };
  };
  return { add, records, finish };
}
const write = (name, value, indent = 1) => { const text = `${JSON.stringify(value, null, indent)}\n`; writeFileSync(fileURLToPath(new URL(name, here)), text); console.log('wrote', name, text.length, 'characters,', Object.keys(value.document.store).length, 'records'); };
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// ---- 1. arrows, groups and rotation: every approximation rule has a shape here ----
{
  const b = board('arrows-groups');
  b.add('rect90', 'geo', 100, 40, geoProps('rectangle', 120, 60, { richText: rich('quarter turn') }), { rotation: Math.PI / 2 });
  b.add('rect30', 'geo', 300, 40, geoProps('rectangle', 120, 60, { color: 'red', richText: rich('thirty') }), { rotation: Math.PI / 6 });
  b.add('tri180', 'geo', 500, 40, geoProps('triangle', 80, 70, { color: 'green' }), { rotation: Math.PI });
  b.add('hex180', 'geo', 640, 40, geoProps('hexagon', 90, 70, { color: 'violet' }), { rotation: Math.PI });
  b.add('text90', 'text', 800, 40, textProps('turned words'), { rotation: Math.PI / 2 });
  b.add('pen-turned', 'draw', 900, 40, drawProps([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]), { rotation: Math.PI / 2 });
  b.add('ba', 'geo', 40, 260, geoProps('rectangle', 120, 70, { richText: rich('A') }));
  b.add('bb', 'geo', 340, 260, geoProps('ellipse', 140, 90, { color: 'blue', richText: rich('B') }));
  b.add('bc', 'geo', 340, 460, geoProps('rectangle', 120, 70, { richText: rich('C') }));
  b.add('glued', 'arrow', 0, 0, arrowProps({ x: 100, y: 295 }, { x: 410, y: 305 }, { color: 'blue' }));
  b.add('precise', 'arrow', 0, 0, arrowProps({ x: 100, y: 540 }, { x: 355, y: 520 }, { color: 'red' }));
  b.add('elbow', 'arrow', 600, 260, arrowProps({ x: 0, y: 0 }, { x: 160, y: 90 }, { kind: 'elbow' }));
  b.add('bowl', 'arrow', 600, 420, arrowProps({ x: 0, y: 0 }, { x: 200, y: 0 }, { bend: -50, arrowheadStart: 'diamond', arrowheadEnd: 'square' }));
  b.add('bowr', 'arrow', 600, 520, arrowProps({ x: 0, y: 0 }, { x: 200, y: 0 }, { bend: 30, arrowheadStart: 'inverted', arrowheadEnd: 'pipe' }));
  b.records.push(binding('glued', 'start', 'ba'), binding('glued', 'end', 'bb'), binding('precise', 'end', 'bc', { x: 0.25, y: 0.75 }, true));
  b.add('g1', 'group', 900, 260, {});
  b.add('g1-pen', 'draw', 0, 0, drawProps([{ x: 0, y: 0 }, { x: 30, y: 20 }, { x: 60, y: 0 }]), { parentId: 'g1' });
  b.add('g1-box', 'geo', 0, 40, geoProps('rectangle', 60, 40), { parentId: 'g1' });
  b.add('g2', 'group', 1100, 260, {}, { rotation: Math.PI / 2 });
  b.add('g3', 'group', 10, 10, {}, { parentId: 'g2' });
  b.add('deep', 'geo', 0, 0, geoProps('diamond', 70, 50, { color: 'orange', richText: rich('nested') }), { parentId: 'g3' });
  // Many arrows and groups: a ring of free arrows and twenty groups of three.
  for (let i = 0; i < 48; i++) b.add(`ring-${i}`, 'arrow', 40 + (i % 12) * 60, 700 + Math.floor(i / 12) * 50, arrowProps({ x: 0, y: 0 }, { x: 40, y: 20 }, { bend: i % 3 === 0 ? 20 : 0, size: 's' }));
  for (let g = 0; g < 20; g++) {
    b.add(`grp-${g}`, 'group', 40 + (g % 10) * 100, 1000 + Math.floor(g / 10) * 100, {});
    for (let k = 0; k < 3; k++) b.add(`grp-${g}-${k}`, 'geo', k * 25, 0, geoProps('rectangle', 20, 20, { size: 's' }), { parentId: `grp-${g}` });
  }
  write('arrows-groups.json', b.finish());
}

// ---- 2. assets and media: images, video, embed, bookmark, and an image inside a frame ----
{
  const b = board('assets-images');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAH3WRdwAAAABJRU5ErkJggg==';
  const asset = (id, type, props) => ({ id: `asset:${id}`, typeName: 'asset', type, meta: {}, props });
  b.records.push(
    asset('photo', 'image', { w: 640, h: 480, name: 'photo.jpg', isAnimated: false, mimeType: 'image/jpeg', src: 'https://images.example.test/photo.jpg', fileSize: 1234 }),
    asset('tiny', 'image', { w: 1, h: 1, name: 'tiny.png', isAnimated: false, mimeType: 'image/png', src: png, fileSize: 70 }),
    asset('clip', 'video', { w: 320, h: 180, name: 'clip.mp4', isAnimated: true, mimeType: 'video/mp4', src: 'https://videos.example.test/clip.mp4', fileSize: 99 }),
    asset('orphan', 'image', { w: 10, h: 10, name: 'unused.png', isAnimated: false, mimeType: 'image/png', src: png, fileSize: 70 }),
  );
  b.add('photo', 'image', 40, 40, { w: 320, h: 240, playing: true, url: 'https://example.test/source', assetId: 'asset:photo', crop: null, flipX: false, flipY: false, altText: 'a landscape' }, { meta: { author: 'assistant', explanationId: 'exp-1', objectId: 'obj-1', kind: 'image' } });
  b.add('mark-box', 'geo', 60, 60, geoProps('rectangle', 100, 60, { color: 'red' }), { meta: { author: 'assistant', explanationId: 'exp-1', objectId: 'obj-1', kind: 'image' } });
  b.add('mark-arrow', 'arrow', 200, 120, arrowProps({ x: 0, y: 0 }, { x: 80, y: 60 }, { color: 'red' }), { meta: { author: 'assistant', explanationId: 'exp-1', objectId: 'obj-1', kind: 'image' } });
  b.add('cropped', 'image', 400, 40, { w: 120, h: 90, playing: true, url: '', assetId: 'asset:tiny', crop: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 0.5, y: 0.5 } }, flipX: false, flipY: false, altText: '' });
  b.add('video', 'video', 560, 40, { w: 320, h: 180, time: 0, playing: false, autoplay: false, url: '', assetId: 'asset:clip', altText: 'a clip' });
  b.add('embed', 'embed', 40, 320, { w: 400, h: 225, url: 'https://www.youtube.com/embed/abc' });
  b.add('bookmark', 'bookmark', 480, 320, { w: 300, h: 320, assetId: null, url: 'https://example.test/article' });
  b.add('box', 'frame', 40, 600, { w: 300, h: 200, name: 'Figure 1', color: 'black' });
  b.add('in-frame', 'image', 20, 20, { w: 100, h: 80, playing: true, url: '', assetId: 'asset:tiny', crop: null, flipX: false, flipY: false, altText: 'inside' }, { parentId: 'box' });
  b.add('caption', 'text', 40, 820, textProps('A caption written by the learner', { size: 's' }));
  b.add('lost', 'image', 400, 600, { w: 90, h: 60, playing: true, url: '', assetId: null, crop: null, flipX: false, flipY: false, altText: 'asset missing' });
  write('assets-images.json', b.finish());
}

// ---- 3. the seeded sigmoid board, drawn the way sigmoid-board.js draws it ----
{
  const b = board('sigmoid-board');
  const LEFT = 140, RIGHT = 620, BOTTOM = 330, TOP = 90;
  const px = x => LEFT + ((x + 6) / 12) * (RIGHT - LEFT), py = y => BOTTOM - y * (BOTTOM - TOP), sigmoid = x => 1 / (1 + Math.exp(-x));
  const meta = (semanticId, label) => ({ author: 'lesson', semanticId, label });
  const pen = (id, points, extra, semanticId) => b.add(id, 'draw', 0, 0, drawProps(points.map(p => ({ ...p, z: 0.5 })), { size: 's', ...extra }), { meta: meta(semanticId, semanticId) });
  const words = (id, text, x, y, extra, semanticId) => b.add(id, 'text', x, y, textProps(text, { size: 's', ...extra }), { meta: meta(semanticId, semanticId) });
  const curve = Array.from({ length: 61 }, (_, step) => { const x = -6 + (step / 60) * 12; return { x: px(x), y: py(sigmoid(x)) }; });
  words('title', 'The sigmoid squashes any score into a probability', LEFT - 20, 34, { size: 'm' }, 'title');
  pen('axes-x', [{ x: LEFT - 20, y: py(0) }, { x: RIGHT + 20, y: py(0) }], { color: 'grey' }, 'axes-x');
  pen('axes-y', [{ x: px(0), y: TOP - 20 }, { x: px(0), y: BOTTOM + 20 }], { color: 'grey' }, 'axes-y');
  pen('limit-right', [{ x: LEFT - 20, y: py(1) }, { x: RIGHT + 20, y: py(1) }], { color: 'grey', dash: 'dotted' }, 'limit-right');
  pen('midpoint', [{ x: LEFT - 20, y: py(0.5) }, { x: RIGHT + 20, y: py(0.5) }], { color: 'grey', dash: 'dashed' }, 'midpoint');
  pen('curve', curve, { color: 'blue', size: 'm' }, 'curve');
  words('equation', 'σ(x) = 1 / (1 + e⁻ˣ)', RIGHT - 130, TOP - 60, { color: 'blue', size: 'm' }, 'equation');
  words('one', '1', px(0) - 26, py(1) - 12, {}, 'limit-right');
  words('half', '0.5', px(0) - 42, py(0.5) - 12, {}, 'midpoint');
  words('zero', '0', px(0) - 26, py(0) - 12, {}, 'limit-left');
  words('x', 'x', RIGHT + 24, py(0) - 12, { color: 'grey' }, 'axes-x');
  write('sigmoid-board.json', b.finish());
}

// ---- 4. metadata and foreign records: a Tutor explanation with its full meta, old author names, locks, opacity, unknown records ----
{
  const b = board('metadata-unknown');
  const tutor = { author: 'assistant', explanationId: 'f3a1c2d4-0000-4000-8000-000000000001', objectId: 'explanation-f3a1c2d4-0', label: 'Gradient descent', originalText: 'Step downhill along the slope.', kind: 'diagram', renderStatus: 'complete', runId: 'run-1', lessonId: 'lesson-1', relatedObjectIds: ['explanation-f3a1c2d4-1'] };
  b.add('t-title', 'text', 0, 0, textProps('Gradient descent'), { meta: tutor });
  b.add('t-node', 'geo', 0, 70, geoProps('rectangle', 170, 160, { color: 'blue', fill: 'semi', size: 's', font: 'sans', richText: rich('step') }), { meta: tutor });
  b.add('t-arrow', 'arrow', 178, 150, arrowProps({ x: 0, y: 0 }, { x: 60, y: 0 }, { color: 'blue', size: 's' }), { meta: tutor });
  b.add('t-draw', 'draw', 300, 0, drawProps([{ x: 0, y: 0 }, { x: 40, y: 40 }], { color: 'red' }), { meta: { ...tutor, kind: 'image' } });
  b.add('legacy-tutor', 'note', 400, 0, { color: 'yellow', labelColor: 'black', size: 'm', font: 'draw', fontSizeAdjustment: 0, align: 'middle', verticalAlign: 'middle', growY: 0, url: '', richText: rich('older author name'), scale: 1, textLastEditedBy: null }, { meta: { author: 'tutor' } });
  b.add('learner-note', 'text', 400, 300, textProps('mine'), { meta: { author: 'learner' } });
  b.add('locked', 'geo', 40, 300, geoProps('cloud', 120, 80, { color: 'light-blue', fill: 'solid', richText: rich('locked cloud') }), { isLocked: true });
  b.add('faint', 'geo', 200, 300, geoProps('heart', 80, 80, { color: 'light-red', fill: 'fill' }), { opacity: 0.5, meta: { custom: { nested: [1, 2, { deep: true }] }, note: '<b>raw</b> & "quoted"' } });
  b.add('pattern', 'geo', 40, 420, geoProps('rectangle', 100, 60, { fill: 'pattern', color: 'green' }));
  b.add('chart', 'interactive-graph', 400, 420, { w: 300, h: 200, spec: { renderer: 'desmos', title: 'Loss surface' }, state: {}, app: 'learn' }, { meta: { ...tutor, graphOperation: true, kind: 'graph' } });
  const built = b.finish();
  // Foreign records tldraw's validators would refuse, as a newer or other build might have saved them: kept to prove they are counted, never hidden.
  built.document.store['shape:from-the-future'] = { ...built.document.store['shape:t-node'], id: 'shape:from-the-future', type: 'hologram', index: 'aZ', props: { w: 10, h: 10 } };
  built.document.store['mystery:record'] = { id: 'mystery:record', typeName: 'mystery', payload: { anything: true } };
  write('metadata-unknown.json', built);
}

// ---- 5. a block near the 400,000-character cap: the exact conversion is far larger than the cap, so thinning must engage ----
{
  const b = board('near-cap');
  const random = seeded(2026);
  const stroke = (id, x, y, count, amplitude, jitter) => {
    const points = Array.from({ length: count }, (_, i) => ({ x: i * 0.7 + (random() - 0.5) * jitter, y: Math.sin(i / 25) * amplitude + Math.sin(i / 7) * amplitude * 0.15 + (random() - 0.5) * jitter, z: 0.5 }));
    b.add(id, 'draw', x, y, drawProps(points, { color: ['black', 'blue', 'red', 'green'][Math.floor(random() * 4)] }));
  };
  let count = 0;
  while (true) {
    stroke(`s${count}`, 40 + (count % 4) * 220, 60 + Math.floor(count / 4) * 70, 300, 20, 0.35);
    count += 1;
    const length = JSON.stringify(b.finish().document).length;
    if (length > 392_000) break;
  }
  b.add('label', 'text', 40, 10, textProps('A page of handwriting'));
  const built = b.finish();
  write('near-cap.json', built, 0);
  console.log('snapshot characters', JSON.stringify({ document: built.document, session: built.session }).length);
}
