import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EXAMPLES, mayConfirmPaid, parseSlash, pickerSections, searchSections } from './learn-slash.js';
import { CHAT_EXAMPLES, ILLUSTRATIONS, MEDIA, MOTION_CLIP, SAMPLES, SAMPLE_NOTES, demoOf, effectOf, illustrationFor, sheetCards } from './slash-sheet.js';
import { inspectGlb } from './three-d-asset.js';
import { buildSlash3dGlb } from '../scripts/make-slash-3d-glb.mjs';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { filterSections } from './command-search.js';
import { REMOVED_COMMANDS, SLASH, toolOf } from './agent/slash.js';

const commands = pickerSections('/').flatMap(section => section.items);
// A development or review build also offers /motion (agent/slash.js MOTION_DEV).
const devCommands = pickerSections('/', { motionDev: true }).flatMap(section => section.items);
const names = sections => sections.flatMap(section => section.items.map(item => item.name));
const asset = path => existsSync(new URL(`../public${path}`, import.meta.url));
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

// Owner, 2026-10-20: the window lists every retained command, says what each does, and keeps every one discoverable without /more.
test('every command in the sheet has a demo, an example, what it does and what it needs selected', () => {
  assert.equal(commands.length, 17);
  assert.equal(demoOf('cad'), 'cad', 'CAD describes its workflow without fabricated artifacts');
  assert.deepEqual(devCommands.map(({ name }) => name).filter(name => !commands.some(command => command.name === name)), ['motion']);
  for (const { name } of devCommands) {
    const demo = demoOf(name);
    assert.ok(demo, `/${name} has a demo`);
    assert.ok(EXAMPLES[name]?.startsWith(`/${name}`), `/${name} has an e.g. line`);
    assert.ok(toolOf(name).about, `/${name} says what it does`);
    assert.ok(['Creates a card', 'Opens a Rabbit Hole', 'Searches'].includes(effectOf(name)), `/${name}`);
    if (demo === 'chat') assert.ok(CHAT_EXAMPLES[name].about && CHAT_EXAMPLES[name].answer, `/${name} exchange`);
    if (demo === 'cards') assert.ok(sheetCards(name).length, `/${name} cards`);
  }
  assert.deepEqual(commands.filter(({ name }) => demoOf(name) === 'chat').map(({ name }) => name), ['dive']);
  // Searches, openings and cards, said plainly.
  assert.deepEqual(['image', 'youtube', 'arxiv', 'wikipedia'].map(effectOf), ['Searches', 'Searches', 'Searches', 'Searches']);
  assert.equal(effectOf('dive'), 'Opens a Rabbit Hole');
  assert.equal(effectOf('explain'), 'Creates a card');
  // Selection requirements: /dive, /practice and /quiz act on the selected card or a topic; a generator takes the card as context.
  for (const name of ['dive', 'practice', 'quiz']) assert.match(toolOf(name).about, /selected card/, name);
  for (const name of ['explain', 'code', 'graph', 'diagram', 'flashcards', 'video', '3d']) assert.match(toolOf(name).about, /With a card selected, it uses that card as context\./, name);
  // The owner's examples.
  assert.equal(EXAMPLES.explain, '/explain how binary search works');
  assert.equal(EXAMPLES.dive, '/dive how cells produce ATP');
  assert.match(CHAT_EXAMPLES.dive.answer, /With a card selected, `\/dive` alone opens that card's Rabbit Hole, or starts one under it/);
});

// Owner, 2026-10-20: separate media search from generation; sourced media and AI-generated media say which they are.
test('media: /image and /youtube search (sourced), /video and /generate-image generate (AI-generated)', () => {
  assert.deepEqual(MEDIA, { image: 'Sourced', youtube: 'Sourced', video: 'AI-generated', 'generate-image': 'AI-generated', motion: 'AI-generated' });
  assert.equal(EXAMPLES.image, '/image Mount Fuji');
  assert.equal(EXAMPLES['generate-image'], '/generate-image a watercolor mountain landscape');
  assert.equal(EXAMPLES.youtube, '/youtube binary search tutorial');
  assert.equal(EXAMPLES.video, '/video raindrops falling into a pond');
  assert.match(toolOf('image').about, /never generates/);
  assert.match(toolOf('video').about, /never searches/);
  // /generate-image is advertised only where image generation is on: not in this build's sheet.
  assert.ok(!devCommands.some(({ name }) => name === 'generate-image'));
  assert.deepEqual(sheetCards('generate-image').map(entry => entry.card), ['imageGenerate']);
  assert.equal(mayConfirmPaid('image'), false, 'a search never confirms a paid generation');
});

test('paid media always shows a finished example: a committed clip or a labelled picture, never a Generate card', () => {
  const paid = devCommands.filter(({ name }) => mayConfirmPaid(name)).map(({ name }) => name);
  assert.deepEqual(paid, ['motion', 'video', '3d']);
  // /motion plays a real Motion video (owner, 2026-10-20): the committed final.mp4 of the verified job 8a2015a4, byte for byte,
  // with that job's own request, title, duration, renderer and sources. Committed, so it never expires and nothing generates it.
  const clip = SAMPLES.motion.videoGenerate;
  assert.equal(clip.src, MOTION_CLIP);
  assert.equal(createHash('sha256').update(readFileSync(new URL(`../public${MOTION_CLIP}`, import.meta.url))).digest('hex'), '6af0b4b2cdf6ef0b97d6d0ffb11ba53a03ecb7b898ae2771f74725615b437c46');
  assert.equal(EXAMPLES.motion, '/motion 15s explain me softmax func');
  assert.deepEqual([clip.operation.request, clip.title, clip.motion.duration_seconds, clip.motion.renderer], [EXAMPLES.motion, 'Softmax: Turning Attention Scores into Weights', 15, 'remotion']);
  assert.deepEqual(clip.motion.source_refs.map(ref => `${ref.path}:${ref.start_line}-${ref.end_line}`), ['model.py:44-45', 'model.py:48-50', 'model.py:62-64', 'model.py:65-71']);
  assert.match(SAMPLE_NOTES.motion, /^A real Motion video, made from this example./);
  // A picture stands in only where the sample has no clip or model of its own: /motion plays its clip on the video card /video
  // pictures, and /3d shows its model (illustrationFor).
  assert.match(read('./SlashCommandsSheet.jsx'), /const picture = illustrationFor\(type, block\);/);
  for (const name of paid) {
    for (const { card } of sheetCards(name)) {
      const finished = SAMPLES[name]?.[card];
      assert.ok(finished?.status === 'ready' || ILLUSTRATIONS[card], `/${name} ${card} is finished`);
      assert.ok(asset(finished?.status === 'ready' ? finished.src || finished.modelUrl : ILLUSTRATIONS[card].src), `/${name} ${card} asset is committed`);
    }
  }
});

test('/3d shows its scene card ready on a committed, verified model, never the picture (owner, 2026-10-20)', async () => {
  assert.deepEqual(sheetCards('3d'), [{ primitive: 'blender_scene', card: 'scene' }]);
  // The scene card reads modelUrl, not src: the sample is ready with a model, so the viewer shows it and the picture never does.
  const sample = SAMPLES['3d'].scene;
  assert.equal(sample.status, 'ready');
  assert.equal(sample.src, undefined);
  assert.equal(sample.modelUrl, '/lesson-assets/slash-3d-frustum.glb');
  assert.ok(asset(sample.modelUrl), 'the model is committed and served by this origin');
  assert.equal(illustrationFor('scene', { ...sample }), null);
  assert.equal(ILLUSTRATIONS.scene, undefined, 'no picture is left for /3d to fall back to');
  // The rule for every card: finished media of the sample's own (a clip's src or a model's modelUrl) wins over a picture.
  assert.equal(illustrationFor('videoGenerate', {}), ILLUSTRATIONS.videoGenerate);
  assert.equal(illustrationFor('videoGenerate', { src: '/clip.mp4' }), null);
  assert.equal(illustrationFor('videoGenerate', { modelUrl: '/model.glb' }), null);
  // The committed GLB is exactly what its generator builds (scripts/make-slash-3d-glb.mjs, offline, no model), passes the
  // viewer's own GLB check, stays small and parses in three: the frustum, its frame, the cube and the ray, with the sample's
  // 3 s sweep.
  const file = readFileSync(new URL(`../public${sample.modelUrl}`, import.meta.url));
  assert.deepEqual(new Uint8Array(file), buildSlash3dGlb());
  assert.ok(file.length < 64 * 1024, `${file.length} bytes`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.length);
  assert.deepEqual(inspectGlb(buffer).nodes.map(node => node.name), ['frustum', 'frame', 'cube', 'ray']);
  // The e.g. line asks for what this model shows (as /animate's asks for the softmax clip): the sample's concept and every
  // object it draws but the coordinate frame's axes, never another subject (it once said the solar system).
  // The card's own title and brief say the same.
  const line = EXAMPLES['3d'].toLowerCase(), brief = sample.brief.toLowerCase();
  for (const word of ['frustum', 'cube', 'ray']) assert.ok(line.includes(word) && brief.includes(word), `the /3d example and the card's brief name ${word}: ${EXAMPLES['3d']} / ${sample.brief}`);
  assert.ok(line.includes('perspective projection'), EXAMPLES['3d']);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const drawn = [];
  gltf.scene.traverse(object => { if (object.isMesh || object.isLine) drawn.push(object.isLineSegments ? 'lines' : 'mesh'); });
  assert.deepEqual(drawn, ['lines', 'mesh', 'lines', 'lines', 'lines', 'mesh', 'mesh']);
  assert.deepEqual(gltf.animations.map(clip => [clip.name, clip.duration, clip.tracks.length]), [['sweep', 3, 2]]);
  const bounds = new Box3().setFromObject(gltf.scene);
  assert.deepEqual([...bounds.min.toArray(), ...bounds.max.toArray()].map(value => Math.round(value * 100) / 100), [-2.98, -1.87, -4, 2.98, 1.87, 1]);
});

test('the examples cover different topics, never one thread; a card beside one is labelled a sample', () => {
  const lines = Object.values(EXAMPLES);
  assert.equal(new Set(lines).size, lines.length);
  // /motion shows its real softmax video, so its line is the request that made it; nothing else repeats that thread.
  assert.deepEqual(Object.entries(EXAMPLES).filter(([, line]) => /softmax|sigmoid|nanoGPT|token/i.test(line)).map(([name]) => name).sort(), ['motion']);
  assert.match(read('./SlashCommandsSheet.jsx'), /data-slash-sample[^>]*>\{SAMPLE_NOTES\[name\] \|\| 'A sample card\. Yours is made from what you type\.'\}</);
  // Menu labels share one form: a short phrase in sentence case, no full stop.
  for (const { name, desc } of commands) assert.match(desc, /^[A-Z][a-z]+(?: [^ ]+){0,5}$/, `/${name}: ${desc}`);
});

// Owner, 2026-10-20: a selectable example prepares an editable draft (its command pill and words) and never sends.
test('Use example puts the example in the composer as an editable draft: its pill and words, never sent', () => {
  const sheet = read('./SlashCommandsSheet.jsx');
  assert.match(sheet, /onClick=\{\(\) => onUseExample\(\{ command: example\.name, text: example\.args \}\)\}/);
  assert.match(sheet, /data-slash-use-example=\{name\}/);
  // The page closes the sheet and prepares the Chat composer's draft (contract A6: prepare never sends).
  assert.match(read('./LearnPage.jsx'), /onUseExample=\{draft => \{ setSlashHelpOpen\(false\); chat\.composer\.prepare\(draft\); \}\}/);
  assert.match(read('./chat-draft.js'), /prepare: \(\{ text, command \} = \{\}\) => \{ apply\(\{ type: 'prepare', text, command \}\); focus\(\); \}/);
  for (const [name, line] of Object.entries(EXAMPLES)) assert.equal(parseSlash(line).name, name, line);
});

test('the removed commands appear nowhere in the window: not listed, no example, no demo', () => {
  for (const name of REMOVED_COMMANDS) {
    assert.ok(!names(pickerSections('/', { motionDev: true })).includes(name), name);
    assert.equal(EXAMPLES[name], undefined, name);
    assert.equal(CHAT_EXAMPLES[name], undefined, name);
    assert.equal(SAMPLES[name], undefined, name);
    assert.deepEqual(names(searchSections(name)).filter(found => found === name), [], name);
  }
});

test('the sheet search filters by name and description, ignores a leading /, and can match nothing', () => {
  const all = pickerSections('/');
  assert.equal(filterSections(all, ''), all);
  assert.equal(filterSections(all, ' / '), all);
  assert.deepEqual(names(filterSections(all, '/gra')), ['graph', 'diagram']);
  assert.deepEqual(names(filterSections(all, 'FLASH')), ['flashcards']);
  assert.deepEqual(names(filterSections(all, 'plot')), ['graph']);
  assert.deepEqual(names(filterSections(all, 'rabbit')), ['dive']);
  assert.deepEqual(filterSections(all, 'zzz'), []);
  // A section with no match is dropped; the rest keep their titles.
  assert.deepEqual(filterSections(all, 'notebook').map(section => section.title), ['Create']);
});

test('the sheet search: focused on open, Enter takes the first match, Esc clears before it closes', () => {
  const list = read('./CommandList.jsx');
  assert.match(list, /<Input type="search" autoFocus data-slash-search/);
  assert.match(list, /event\.key === 'Enter' && shown\.length\) \{ event\.preventDefault\(\); onChoose\(shown\[0\]\.items\[0\]\.name\)/);
  assert.match(list, /if \(query\) setQuery\(''\); else onClose\(\);/);
  assert.match(list, />No commands match</);
  assert.match(read('./SlashCommandsSheet.jsx'), /<CommandList sections=\{sections\} current=\{name\} onChoose=\{choose\} onClose=\{onClose\} row="data-slash-help"/);
  assert.doesNotMatch(list, /slash-sheet\.js|learn-slash\.js|LearningBlocks/);
});

test('Auto opens the Chat palette on a search field: the sheet\'s search, More learning tools included, keys kept in the field', () => {
  // The canvas palette searches the bare / menu by name and description; a More learning tools match shows open, under its title.
  assert.deepEqual(searchSections('/whi').map(section => [section.title, section.collapsible, section.items.map(item => item.name)]), [['More learning tools', false, ['whiteboard']]]);
  assert.deepEqual(names(searchSections('plot')), ['graph']);
  assert.deepEqual(searchSections('zzz'), []);
  const palette = read('./LearnSlash.jsx');
  const ask = read('./ask.jsx');
  // Auto (not a typed /) opens the field; it is the sheet's own field (CommandSearch: autoFocus, type="search").
  assert.match(ask, /const openPalette = \(\) => \{[^\n]*slashRef\.current\?\.search\(\); \};/);
  assert.match(palette, /<CommandSearch className="flex-1" value=\{query\}/);
  assert.match(palette, /const sections = busy \? null : query \? searchSections\(query\) : pickerSections\(input\);/);
  // Up/down and Enter run the palette's own keys; Esc clears a typed search before it closes; an empty search says so.
  assert.match(palette, /if \(event\.key !== 'Escape'\) return apiRef\.current\.onKeyDown\(event\);/);
  assert.match(palette, /if \(query\) setQuery\(''\); else \{ setInput\(''\); composerRef\?\.current\?\.focus\(\); \}/);
  assert.match(palette, /'No commands match'/);
  // No layout jump while filtering: the canvas palette is a fixed height while searching.
  assert.match(palette, /query === null \? 'max-h-80' : 'h-80'/);
});

// r28 audit (owner, 2026-10-08), as of the 2026-10-20 cleanup: every command in the registry is offered by the Chat picker
// with a demo in its sheet, or named here with the reason it is not. A command cannot be offered without a demo, nor vanish.
const NOT_OFFERED = {
  'generate-image': 'needs image generation, which is off (agent/slash.js IMAGE_GENERATION); never turned on by this cleanup',
};

test('registry, picker and sheet agree: every offered command has a demo; every other command is excluded by name', () => {
  const offered = new Set(devCommands.map(({ name }) => name));
  for (const { name } of SLASH) assert.ok(offered.has(name) !== !!NOT_OFFERED[name], `/${name}: ${offered.has(name) ? 'offered, but listed as not offered' : 'not offered and not listed with a reason'}`);
  for (const name of offered) assert.ok(demoOf(name), `/${name}`);
});
