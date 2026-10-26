// Writes the legacy-whiteboard fixtures with the REAL tldraw 5.4.2 schema and store (MIT packages @tldraw/tlschema, @tldraw/store,
// @tldraw/validate), so each file is a snapshot tldraw itself would have saved, validated record by record on put().
// Run once from packages/web: node src/__fixtures__/tldraw/generate.mjs. The unit test reads the committed JSON and needs no
// tldraw. ponytail: once the last tldraw import is gone this generator cannot run again; the fixtures stay as they are.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from '@tldraw/store';
import { T } from '@tldraw/validate';
import { DocumentRecordType, PageRecordType, TLDOCUMENT_ID, b64Vecs, createTLSchema, defaultShapeSchemas, toRichText } from '@tldraw/tlschema';

const here = new URL('.', import.meta.url);
const custom = props => ({ props });
// The app's three own shape types (ThreeDShape.jsx, InteractiveGraphShape.jsx, LearnVideoShape.jsx), props as they declare them.
const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    'three-d-viewer': custom({ w: T.number, h: T.number, modelUrl: T.string, camera: T.jsonValue, autoRotate: T.boolean, animation: T.jsonValue, animationTime: T.number }),
    'interactive-graph': custom({ w: T.number, h: T.number, spec: T.jsonValue, state: T.jsonValue, app: T.string }),
    'learn-video-pending': custom({ w: T.number, h: T.number, status: T.string, caption: T.string, error: T.string, retryable: T.boolean }),
  },
});

const page = PageRecordType.create({ id: PageRecordType.createId('page'), name: 'Page 1', index: 'a1' });
const page2 = PageRecordType.create({ id: PageRecordType.createId('second'), name: 'Page 2', index: 'a2' });
const id = name => `shape:${name}`;
const base = (name, type, x, y, props, extra = {}) => ({ id: id(name), typeName: 'shape', type, x, y, rotation: 0, index: extra.index || 'a1', parentId: page.id, isLocked: false, opacity: 1, props, meta: {}, ...extra });
const style = { color: 'black', size: 'm', dash: 'draw', fill: 'none' };
const rich = text => toRichText(text);
const segment = (points, dim) => ({ type: 'free', path: b64Vecs.encodePoints(points, dim), ...(dim ? { dim } : {}) });
const wave = Array.from({ length: 24 }, (_, i) => ({ x: i * 6, y: Math.sin(i / 3) * 20, z: 0.5 }));

const shapes = [
  base('pen', 'draw', 40, 60, { ...style, color: 'blue', segments: [segment(wave)], isComplete: true, isClosed: false, isPen: false, scale: 1, scaleX: 1, scaleY: 1 }, { index: 'a1', meta: { author: 'learner' } }),
  base('pen2d', 'draw', 40, 140, { ...style, color: 'red', dash: 'dashed', segments: [segment(wave.slice(0, 8), 2)], isComplete: true, isClosed: false, isPen: false, scale: 1, scaleX: 1, scaleY: 1 }, { index: 'a2' }),
  base('marker', 'highlight', 200, 60, { color: 'yellow', size: 'm', segments: [segment([{ x: 0, y: 0, z: 0.5 }, { x: 120, y: 4, z: 0.5 }])], isComplete: true, isPen: false, scale: 1, scaleX: 1, scaleY: 1 }, { index: 'a3' }),
  base('box', 'geo', 300, 40, { geo: 'rectangle', dash: 'draw', url: '', w: 160, h: 90, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'green', fill: 'semi', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: rich('Input') }, { index: 'a4', meta: { author: 'lesson' } }),
  base('star', 'geo', 520, 40, { geo: 'star', dash: 'solid', url: '', w: 100, h: 100, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'orange', fill: 'solid', size: 'l', font: 'sans', align: 'middle', verticalAlign: 'middle', richText: rich('') }, { index: 'a5' }),
  base('output', 'geo', 300, 220, { geo: 'ellipse', dash: 'draw', url: '', w: 160, h: 90, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'violet', fill: 'none', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: rich('Output\nprobability') }, { index: 'a6' }),
  base('title', 'text', 40, 0, { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 200, richText: rich('The sigmoid squashes a score'), scale: 1, autoSize: true }, { index: 'a7', meta: { author: 'assistant', semanticId: 'title' } }),
  base('sticky', 'note', 40, 260, { color: 'light-blue', labelColor: 'black', size: 'm', font: 'draw', fontSizeAdjustment: 0, align: 'middle', verticalAlign: 'middle', growY: 0, url: '', richText: rich('Remember: output is between 0 and 1'), scale: 1, textLastEditedBy: null }, { index: 'a8' }),
  base('bound-arrow', 'arrow', 0, 0, { kind: 'arc', labelColor: 'black', color: 'black', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw', start: { x: 380, y: 85 }, end: { x: 380, y: 265 }, bend: 0, richText: rich('squash'), labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5 }, { index: 'a9' }),
  base('curve-arrow', 'arrow', 40, 400, { kind: 'arc', labelColor: 'black', color: 'red', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'dot', arrowheadEnd: 'triangle', font: 'draw', start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, bend: 40, richText: rich(''), labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5 }, { index: 'aA' }),
  base('ruler', 'line', 300, 400, { color: 'grey', dash: 'dashed', size: 's', spline: 'line', points: { b: { id: 'b', index: 'a2', x: 150, y: 20 }, a: { id: 'a', index: 'a1', x: 0, y: 0 } }, scale: 1 }, { index: 'aB' }),
  base('frame', 'frame', 40, 480, { w: 260, h: 160, name: 'Worked example', color: 'black' }, { index: 'aC' }),
  base('inside', 'geo', 20, 30, { geo: 'diamond', dash: 'draw', url: '', w: 80, h: 80, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'light-red', fill: 'none', size: 's', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: rich('') }, { index: 'a1', parentId: id('frame') }),
  base('picture', 'image', 340, 480, { w: 64, h: 48, playing: true, url: '', assetId: 'asset:dot', crop: null, flipX: false, flipY: false, altText: 'a dot' }, { index: 'aD', rotation: 0.2 }),
  base('model', 'three-d-viewer', 700, 40, { w: 300, h: 210, modelUrl: 'https://example.test/model.glb', camera: {}, autoRotate: false, animation: { autoplay: false }, animationTime: 0 }, { index: 'aE', meta: { concept: 'Gradient descent surface', author: 'assistant' } }),
  base('graph', 'interactive-graph', 700, 280, { w: 300, h: 210, spec: { renderer: 'desmos', title: 'Logistic curve', concept: 'sigmoid' }, state: {}, app: 'learn' }, { index: 'aF' }),
  base('clip', 'learn-video-pending', 700, 520, { w: 300, h: 170, status: 'proposed', caption: 'How the curve flattens', error: '', retryable: true }, { index: 'aG' }),
  base('elsewhere', 'geo', 10, 10, { geo: 'rectangle', dash: 'draw', url: '', w: 50, h: 50, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'black', fill: 'none', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: rich('page two') }, { index: 'a1', parentId: page2.id }),
];
const asset = { id: 'asset:dot', typeName: 'asset', type: 'image', meta: {}, props: { w: 1, h: 1, name: 'dot.png', isAnimated: false, mimeType: 'image/png', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAH3WRdwAAAABJRU5ErkJggg==', fileSize: 70 } };
const bindings = ['start', 'end'].map(terminal => ({ id: `binding:${terminal}`, typeName: 'binding', type: 'arrow', fromId: id('bound-arrow'), toId: id(terminal === 'start' ? 'box' : 'output'), meta: {}, props: { terminal, normalizedAnchor: { x: 0.5, y: terminal === 'start' ? 1 : 0 }, isExact: false, isPrecise: false, snap: 'none' } }));

const store = new Store({ schema, props: { defaultName: '', assets: {}, onMount() {} } });
store.put([DocumentRecordType.create({ id: TLDOCUMENT_ID }), page, page2, ...shapes, asset, ...bindings]);
const document = store.getStoreSnapshot();
const write = (name, value) => writeFileSync(fileURLToPath(new URL(name, here)), `${JSON.stringify(value, null, 1)}\n`);
// A whiteboard block's `snapshot` is getSnapshot(store): the document plus the session (WhiteboardBlock.jsx).
write('whiteboard-editor.json', { document, session: { version: 1, currentPageId: page.id, exportBackground: true, isFocusMode: false, isDebugMode: false, isToolLocked: false, isGridMode: false, pageStates: [{ pageId: page.id, camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [], focusedGroupId: null }] } });
// A saved note is editor.getSnapshot().document filtered to one page and locked (learn-notes.js captureNotePage).
const keep = new Set([page.id, id('title'), id('box'), id('pen')]);
write('note-document.json', { document: { schema: document.schema, store: Object.fromEntries(Object.entries(document.store).filter(([key, record]) => record.typeName === 'document' || keep.has(key)).map(([key, record]) => [key, record.typeName === 'shape' ? { ...record, isLocked: true } : record])) } });
console.log('wrote whiteboard-editor.json and note-document.json', Object.keys(document.store).length, 'records');
