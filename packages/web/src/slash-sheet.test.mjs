import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EXAMPLES, parseSlash, pickerSections } from './learn-slash.js';
import { BRIEFS, BRIEF_COMMANDS, CAD_EXAMPLE, COOLING_EXAMPLE, IMAGE_EXAMPLE, MOTION_CLIP, NOTEBOOK_EXAMPLE, PREVIEWS, SAMPLES, SAMPLE_NOTE, WEBPAGE_EXAMPLE, WIKI_EXAMPLE, YOUTUBE_EXAMPLE, briefView, previewBlock, previewOf } from './slash-sheet.js';
import { resolveProgram } from './explain-program/program-card.js';
import { cadArtifact } from './cad-client.js';
import { inspectGlb as inspectModel } from './three-d-asset.js';
import { inspectGlb } from './three-d-asset.js';
import { buildSlash3dGlb } from '../scripts/make-slash-3d-glb.mjs';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { filterSections } from './command-search.js';
import { REMOVED_COMMANDS, SLASH, typedOf } from './agent/slash.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';

// Owner spec 2026-10-29 (C:/Users/cyudhist/Desktop/RH_SLASH_COMMANDS_CLEANUP_SPEC.md sections 7, 8 and 9): View > Slash Commands lists
// the picker's 18 commands in its three sections, each with its title, description, example and one preview on the example's subject.
const names = sections => sections.flatMap(section => section.items.map(item => item.name));
// Where Motion and image generation are offered: every public command is listed.
const all = pickerSections('/', { motionDev: true, imageGeneration: true });
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const asset = path => existsSync(new URL(`../public${path}`, import.meta.url));
const sheet = read('./SlashCommandsSheet.jsx'), stage = read('./SlashCommandPreview.jsx');
const argsOf = name => parseSlash(EXAMPLES[name]).args;

test('the window reads the picker sections: 18 commands, each with an example and exactly one preview of its own', () => {
  assert.deepEqual(all.map(section => section.title), ['Learn', 'Create', 'Search']);
  const listed = names(all);
  assert.equal(listed.length, 18);
  assert.deepEqual(Object.keys(PREVIEWS).sort(), [...listed].sort(), 'one preview per listed command, and none for anything else');
  assert.deepEqual(SLASH.map(command => command.name).sort(), [...listed].sort(), 'the registry, the picker and the window agree');
  for (const name of listed) {
    assert.ok(EXAMPLES[name] === `/${typedOf(name)}` || EXAMPLES[name].startsWith(`/${typedOf(name)} `), `/${typedOf(name)} example: ${EXAMPLES[name]}`);
    assert.ok(['card', 'notebook', 'goal', 'finder', 'youtube', 'wiki', 'webpage', 'none'].includes(previewOf(name).kind), name);
  }
  assert.match(sheet, /const sections = pickerSections\('\/'\);/, 'the window lists what this build offers, from the picker');
});

test('the removed commands have no preview, example or brief, and the window keeps no list of its own', () => {
  for (const name of [...REMOVED_COMMANDS, 'dive', 'whiteboard', 'video']) {
    assert.equal(PREVIEWS[name], undefined, name);
    assert.equal(BRIEFS[name], undefined, name);
    assert.equal(EXAMPLES[name], undefined, name);
    assert.ok(!names(all).includes(name), name);
  }
  // No Can make tabs, no fake goal chat, no other command's sample.
  assert.doesNotMatch(sheet + stage, /Can make|role="tablist"|ChatPreview|CHAT_EXAMPLES|sheetCards|\.sample\(\)|SceneExamples/);
});

test('copy: title, subtitle, search, Use example, View brief / View result and the sample note are the spec\'s', () => {
  assert.match(sheet, /export const TITLE = 'Slash Commands';/);
  assert.match(sheet, /export const SUBTITLE = 'Choose a command to see what it does and try an example\.';/);
  assert.match(sheet, /export const FIND = 'Find a command';/);
  assert.match(sheet, />Use example<\/Button>/);
  assert.match(sheet, /\{showing === 'brief' \? 'View result' : 'View brief'\}/);
  assert.equal(SAMPLE_NOTE, 'Example preview. Nothing is generated or saved here.');
  assert.match(sheet, /aria-labelledby="slash-commands-title"/);
  assert.doesNotMatch(sheet + stage, /…|\.\.\.['"`<]/, 'no ellipsis in the window\'s words');
});

test('the 11 generators each have a brief on the example\'s subject; the brief card can neither generate nor save', () => {
  assert.deepEqual(BRIEF_COMMANDS, ['explain', 'practice', 'quiz', 'flashcards', 'code', 'graph', 'diagram', 'generate-image', 'motion', 'cad', '3d']);
  assert.deepEqual(Object.keys(BRIEFS).sort(), [...BRIEF_COMMANDS].sort());
  const titles = Object.fromEntries(BRIEF_COMMANDS.map(name => [name, BRIEFS[name].title]));
  // Owner, 2026-10-29 (C:/s/spec/slash-window/BRIEF-EXAMPLES.md): /explain and /cad briefs match their saved results.
  assert.deepEqual(titles, { explain: 'How a hot coffee cools in a room', practice: 'Explain why the sky is blue', quiz: "Newton's second law", flashcards: 'Spanish verbs for travel',
    code: 'Reverse a linked list', graph: 'Sine and cosine', diagram: 'A request and response', 'generate-image': 'A red lighthouse at dusk',
    motion: 'How softmax turns scores into weights', cad: 'Plate with four through holes and a top pocket', '3d': 'Perspective projection' });
  assert.equal(BRIEFS.quiz.description, 'One multiple-choice question about force, mass and acceleration, with feedback after you answer.');
  assert.equal(BRIEFS.cad.description, 'A 60 × 40 × 5 mm plate with four 4 mm through holes and a centred 20 × 10 mm pocket, 3 mm deep, cut from the top face.');
  for (const name of BRIEF_COMMANDS) {
    const view = briefView(name, EXAMPLES[name]);
    assert.deepEqual(view.allowed_actions, [], `${name}: no Generate, Edit, Save or Cancel`);
    assert.equal(view.original_request, EXAMPLES[name]);
    assert.equal(view.usage, undefined, `${name}: no price is stated for a help brief`);
  }
  assert.equal(briefView('goal', EXAMPLES.goal), null, 'direct and search commands have no brief');
  // Motion's settings are the example's own (15 s), Audio off; CAD's parameters are its real job's.
  assert.deepEqual(BRIEFS.motion.settings, { aspect_ratio: '16:9', duration_seconds: 15, audio: false });
  assert.deepEqual(BRIEFS.cad.settings.parameters, CAD_EXAMPLE.block.manifest.parameters);
  assert.deepEqual(BRIEFS.cad.groups.parameters.defs.map(def => def.display), ['60 mm', '40 mm', '5 mm', '4 mm', '10 mm', '10 mm', '20 mm', '10 mm', '3 mm']);
  // A generator shows its result first; one with no matching saved result shows its brief and says why (View result disabled).
  assert.match(sheet, /const resultless = generator && preview\?\.kind === 'none';/);
  assert.match(sheet, /disabled=\{resultless\}/);
  assert.match(stage, /<GenerationProposalCard view=\{view\} isolate/);
  assert.doesNotMatch(stage, /onGenerate|onSave=/, 'the brief card is given nothing to generate or save with');
});

test('each preview shows the example\'s subject', () => {
  const block = name => previewBlock(PREVIEWS[name]);
  assert.match(EXAMPLES.explain, /hot coffee cools in a cold room/);
  assert.equal(block('explain').title, 'How a hot coffee cools in a room');
  assert.equal(block('practice').mode, 'explain_back');
  assert.equal(block('practice').prompt, 'Why does the sky look blue? Explain it in your own words.');
  assert.equal(block('practice').hint, 'Think about what happens to sunlight as it passes through the air.');
  assert.equal(block('quiz').question, 'The same net force acts on two objects. One has twice the mass of the other. How does its acceleration compare?');
  assert.deepEqual(block('quiz').options.map(option => option.text), ['Half as large', 'The same', 'Twice as large']);
  assert.match(block('quiz').why, /\$a = F\/m\$/, 'the equation goes through the math renderer');
  assert.deepEqual(block('flashcards').cards.map(card => `${card.front} ${card.back}`), ['ir to go', 'querer to want', 'necesitar to need']);
  assert.equal(PREVIEWS.goal.draft.toLowerCase(), argsOf('goal'));
  const code = block('code').code.split('\n');
  assert.ok(code.length >= 8 && code.length <= 12 && code.every(line => line.length <= 60), `${code.length} short lines, no horizontal scroll`);
  assert.ok(code.includes('def reverse(head):') && code.includes('    return prev'));
  assert.equal(block('code').output, undefined, 'no fabricated output: nobody ran it');
  validateGraph(block('graph').spec);
  assert.deepEqual(block('graph').spec.traces.map(trace => trace.label), ['y = sin(x)', 'y = cos(x)']);
  const sin = block('graph').spec.traces[0];
  assert.ok(sin.x.every((x, index) => Math.abs(Math.sin(x) - sin.y[index]) < 1e-3), 'computed values of the function, not data');
  for (const narrow of [false, true]) {
    const flow = previewBlock(PREVIEWS.diagram, { narrow });
    assert.deepEqual(flow.spec.nodes.map(node => node.label), ['Browser sends request', 'Server handles request', 'Server sends response', 'Browser renders page']);
    assert.equal(flow.spec.direction, narrow ? 'DOWN' : 'RIGHT');
  }
  assert.equal(PREVIEWS.notebook.kind, 'notebook');
  assert.match(PREVIEWS.notebook.note, /\/notebook itself starts an empty one/, 'the populated notebook is an illustration; the command is unchanged');
  // /photos cat: real Pexels results with their photographers, the first one shown; no Generate offer in this preview.
  assert.equal(EXAMPLES.image, '/photos cat');
  assert.equal(block('image').prompt, argsOf('image'));
  assert.equal(block('image').mode, 'search');
  assert.equal(block('image').variants.length, 3);
  for (const photo of block('image').variants) {
    assert.match(photo.src, /^https:\/\/images\.pexels\.com\//);
    assert.match(photo.credit.url, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.ok(photo.credit.photographer && /cat/i.test(photo.alt), photo.alt);
  }
  assert.equal(block('image').src, block('image').variants[0].src);
  assert.match(stage, /const IMAGE_RESULT = '\[&_\[data-image-generate\]\]:hidden \[&_\[data-image-generate-unavailable\]\]:hidden';/);
  assert.match(stage, /\$\{type === 'image' \? IMAGE_RESULT : ''\}/);
  // /youtube: 3Blue1Brown's video in the YouTube card, YouTube's own player (nothing plays until Play).
  assert.match(EXAMPLES.youtube, /attention in transformers.*3blue1brown/i);
  assert.deepEqual([YOUTUBE_EXAMPLE.videoId, YOUTUBE_EXAMPLE.channel, YOUTUBE_EXAMPLE.title], ['eMlx5fFNoYc', '3Blue1Brown', 'Attention in transformers, step-by-step | Deep Learning Chapter 6']);
  assert.match(stage, /<YouTubeMoment block=\{block\} selected appName=\{appName\} onChange=\{setBlock\} \/>/);
  assert.doesNotMatch(read('./AdaptiveCanvas.jsx'), /autoplay/, 'the player never starts by itself');
  // arXiv 1706.03762's real record with its authors and the opening of its abstract.
  assert.deepEqual([PREVIEWS.arxiv.source, PREVIEWS.arxiv.query], ['arxiv', argsOf('arxiv')]);
  assert.deepEqual(PREVIEWS.arxiv.results.map(result => [result.title, result.subtitle, result.exact]), [['Attention Is All You Need', 'Ashish Vaswani, Noam Shazeer, Niki Parmar et al. · arXiv:1706.03762v7', true]]);
  assert.match(PREVIEWS.arxiv.results[0].why, /^The dominant sequence transduction models/);
  // /wikipedia: the Transformer article's stored lead in the Wikipedia card's reader, with its source and licence.
  assert.equal(argsOf('wikipedia'), WIKI_EXAMPLE.url);
  assert.equal(WIKI_EXAMPLE.url, 'https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)');
  assert.equal(WIKI_EXAMPLE.licence.url, 'https://creativecommons.org/licenses/by-sa/4.0/deed.en');
  assert.ok(WIKI_EXAMPLE.html.includes('data-mw-section-id="0"') && !WIKI_EXAMPLE.html.includes('data-mw-section-id="1"'), 'the lead section only');
  assert.match(stage, /<LearnWiki app=\{appName\} compact article=\{\{ title: preview\.block\.title, section: 0 \}\} saved=\{preview\.saved\}/);
  assert.equal(EXAMPLES.browser, '/browser https://jalammar.github.io/illustrated-transformer/');
  // Every listed command now shows a saved result (owner, 2026-10-29): no "no saved result" statement is left.
  assert.deepEqual(Object.keys(PREVIEWS).filter(name => PREVIEWS[name].kind === 'none'), []);
});

// Owner, 2026-10-29: /image reuses an accepted generated image with its provenance; nothing is generated for the window.
test('/image shows the accepted acceptance image byte for byte, with its job, prompt and model', () => {
  const block = previewBlock(PREVIEWS['generate-image']);
  assert.deepEqual([block.type, block.mode, block.src, block.prompt], ['image', 'generate', IMAGE_EXAMPLE.src, 'A small red lighthouse on a rock at dusk, flat illustration.']);
  assert.equal(block.credit.url, '', 'labelled AI-generated by the card, never as a found photo');
  const bytes = readFileSync(new URL(`../public${IMAGE_EXAMPLE.src}`, import.meta.url));
  assert.equal(bytes.length, IMAGE_EXAMPLE.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), IMAGE_EXAMPLE.sha256);
  assert.equal(IMAGE_EXAMPLE.sha256, '9bffc47d6de1a7b820621a98f60526c0a75ac2b394823eecd4d05996fc487333');
  assert.deepEqual([IMAGE_EXAMPLE.job, IMAGE_EXAMPLE.date, IMAGE_EXAMPLE.model], ['img-gp-f02c94e1e592f12e', '2026-10-27', 'gpt-image-2.5-flare']);
  assert.match(EXAMPLES['generate-image'], /^\/image a small red lighthouse on a rock at dusk, flat illustration$/);
  assert.deepEqual(BRIEFS['generate-image'].settings, { model: 'gpt-image-2.5-flare', quality: 'low', aspect_ratio: '1:1', resolution: '1K' });
});

// Owner, 2026-10-29: /browser shows the real Illustrated Transformer capture (made through the webpage card's route and its safety
// screen) in the webpage card, every committed file the one the capture's manifest names.
test('/browser shows the screened Illustrated Transformer capture in the webpage card, every file matching its manifest', () => {
  const { result, manifest } = WEBPAGE_EXAMPLE;
  assert.equal(manifest.url, 'https://jalammar.github.io/illustrated-transformer/');
  assert.match(result.title, /^The Illustrated Transformer/);
  assert.equal(result.screening.status, 'passed');
  assert.equal(result.fileRef.source.id, result.capture.manifestId);
  const preview = PREVIEWS.browser;
  assert.deepEqual([preview.block.url, preview.block.capture, preview.block.fileRef], [manifest.url, result.capture, result.fileRef]);
  const hash = file => createHash('sha256').update(readFileSync(new URL(`../public/lesson-assets/slash-webpage/${file}`, import.meta.url))).digest('hex');
  assert.equal(manifest.tiles.length, 15);
  for (const tile of manifest.tiles) assert.equal(hash(preview.files[tile.key]), tile.sha256, `tile ${tile.index}`);
  assert.equal(hash(preview.files[manifest.text.key]), manifest.text.sha256, 'text runs');
  assert.equal(result.capture.truncated.height, true, 'the capture stops at the route limit; the card says Truncated');
  assert.match(stage, /<WebpageCard block=\{block\} appName=\{appName\} selected readOnly readFile=\{read\}/);
  assert.match(stage, /fetch\(`\/lesson-assets\/slash-webpage\/\$\{name\}`, \{ signal \}\)/);
});

// Owner, 2026-10-29: /explain shows the saved cooling explanation's real accepted program. The window's copy is the genuine
// recorded answer (run sandbox-ex1-b), and ProgramScene's own resolver accepts it from the fixture client: identity, bundle and
// source hashes all verified, nothing fetched.
test('/explain resolves the genuine saved cooling program from its bundled copy, through the card\'s own checks', async () => {
  const recorded = JSON.parse(read('./explain-program/testdata/sandbox-ex1-b-job.json'));
  assert.deepEqual(COOLING_EXAMPLE.block, recorded.block);
  assert.equal(PREVIEWS.explain.block, COOLING_EXAMPLE.block);
  assert.equal(PREVIEWS.explain.program, COOLING_EXAMPLE.result);
  // The run's own request (sandbox-ex1-b prompt.txt: a hot coffee cooling in a cold room, the room temperature to change), in one line.
  assert.equal(argsOf('explain'), 'how a hot coffee cools in a cold room, and let me change the room temperature');
  const out = await resolveProgram(previewBlock(PREVIEWS.explain), { client: { result: async () => structuredClone(PREVIEWS.explain.program) } });
  assert.equal(out.ok, true, out.error?.message);
  assert.equal(out.artifact.bundleHash, '62c202e9826cd30b8e9a49d5c4a896d19011ad4466c75574c306cdc420db434e');
  assert.deepEqual(out.artifact.manifest.inputs.map(input => input.id), ['room']);
  assert.deepEqual(PREVIEWS.explain.size(), { width: 660, height: 620 }, 'about 660 px wide');
  assert.match(stage, /programExample: \{ client: \{ result: async \(\) => structuredClone\(preview\.program\) \} \}/);
  assert.match(read('./explain-program/ProgramScene.jsx'), /const client = example \? example\.client : token/);
});

// Owner, 2026-10-29: /notebook shows the real JupyterLab notebook on a small saved notebook: a heading, a readable code cell with
// its execution count, and its computed output and plot.
test('/notebook opens the real notebook site on a short executed notebook, replaced fresh each time and never saved', () => {
  const cells = NOTEBOOK_EXAMPLE.cells;
  assert.equal(cells[0].cell_type, 'markdown');
  assert.match(cells[0].source, /^# How a hot coffee cools/);
  assert.equal(cells[1].execution_count, 1);
  assert.ok(cells[1].source.split('\n').length <= 14 && cells[1].source.split('\n').every(line => line.length <= 60), 'short readable lines');
  assert.ok(cells[1].outputs.some(output => output.data?.['image/png']), 'a computed plot');
  assert.ok(cells[1].outputs.some(output => /After 30 minutes: 35\.6 °C/.test([].concat(output.text).join(''))), 'a computed result');
  assert.equal(NOTEBOOK_EXAMPLE.metadata.kernelspec.name, 'python', 'the canvas notebook\'s Pyodide kernel');
  assert.equal(PREVIEWS.notebook.block.ipynb, NOTEBOOK_EXAMPLE);
  assert.match(EXAMPLES.notebook, /^\/notebook$/);
  const notebook = read('./NotebookCard.jsx');
  assert.match(notebook, /if \(preview\) \{ send\('init', \{ \.\.\.initial\.current, workspace: \{ \[initial\.current\.ipynb_path\]: \{ type: 'notebook', format: 'json', content: block\.ipynb \} \}, fresh: true \}\); return; \}/);
  assert.match(notebook, /if \(preview\) \{ if \(type === 'loaded'\) \{ ready\.current = true; setLoaded\(true\); \} return; \}/, 'nothing reported back, saved or exported');
});

// Owner, 2026-10-29: /cad shows a real generated model in the real CAD viewer, result first, with View brief.
test('/cad shows the real CAD revision cr_9a3fa75c in the CAD card, its model committed byte for byte', () => {
  const { block } = CAD_EXAMPLE;
  assert.equal(PREVIEWS.cad.card, 'cad');
  assert.equal(block.manifest.revisionId, 'cr_9a3fa75c9b7b46d9b90c7cfc60e9577f');
  assert.equal(block.manifest.validation.passed, true);
  const glb = cadArtifact(block.manifest, 'glb');
  assert.equal(glb.url, '/lesson-assets/slash-cad-plate-9a3fa75c.glb');
  const bytes = readFileSync(new URL(`../public${glb.url}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), glb.sha256);
  assert.equal(glb.sha256, '380fcf0c7530a5d29b42f938d31625e156c5efdab59e99971bead93409b1bedd');
  assert.ok(inspectModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
  assert.match(EXAMPLES.cad, /60 x 40 x 5 mm plate with four 4 mm through holes/);
  assert.equal(block.jobId, undefined, 'no job: the card never polls, edits or generates');
});


test('/motion plays its real committed Motion video, byte for byte, with that job\'s own request and metadata', () => {
  const clip = SAMPLES.motion.videoGenerate;
  assert.equal(PREVIEWS.motion.block, clip);
  assert.equal(clip.src, MOTION_CLIP);
  assert.equal(createHash('sha256').update(readFileSync(new URL(`../public${MOTION_CLIP}`, import.meta.url))).digest('hex'), '6af0b4b2cdf6ef0b97d6d0ffb11ba53a03ecb7b898ae2771f74725615b437c46');
  assert.equal(EXAMPLES.motion, '/motion 15s explain me softmax func');
  assert.deepEqual([clip.operation.request, clip.title, clip.motion.duration_seconds, clip.motion.renderer], [EXAMPLES.motion, 'Softmax: Turning Attention Scores into Weights', 15, 'remotion']);
  assert.deepEqual(clip.motion.source_refs.map(ref => `${ref.path}:${ref.start_line}-${ref.end_line}`), ['model.py:44-45', 'model.py:48-50', 'model.py:62-64', 'model.py:65-71']);
  assert.match(stage, /fetch\(src\)/, 'the clip is read from this origin into a seekable blob');
});

test('/3d shows its scene card ready on the committed, verified model (owner, 2026-10-20)', async () => {
  const sample = SAMPLES['3d'].scene;
  assert.equal(PREVIEWS['3d'].block, sample);
  assert.equal(sample.status, 'ready');
  assert.equal(sample.modelUrl, '/lesson-assets/slash-3d-frustum.glb');
  assert.ok(asset(sample.modelUrl), 'the model is committed and served by this origin');
  const file = readFileSync(new URL(`../public${sample.modelUrl}`, import.meta.url));
  assert.deepEqual(new Uint8Array(file), buildSlash3dGlb());
  assert.ok(file.length < 64 * 1024, `${file.length} bytes`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.length);
  assert.deepEqual(inspectGlb(buffer).nodes.map(node => node.name), ['frustum', 'frame', 'cube', 'ray']);
  const line = EXAMPLES['3d'].toLowerCase(), brief = sample.brief.toLowerCase();
  for (const word of ['frustum', 'cube', 'ray']) assert.ok(line.includes(word) && brief.includes(word) && BRIEFS['3d'].description.toLowerCase().includes(word), word);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  assert.deepEqual(gltf.animations.map(clip => [clip.name, clip.duration, clip.tracks.length]), [['sweep', 3, 2]]);
  const bounds = new Box3().setFromObject(gltf.scene);
  assert.deepEqual([...bounds.min.toArray(), ...bounds.max.toArray()].map(value => Math.round(value * 100) / 100), [-2.98, -1.87, -4, 2.98, 1.87, 1]);
});

test('previews are isolated: no live search, capture, grading, save, kernel or paid start from the window', () => {
  // Learning Goals runs on coaching of its own whose every save says nothing is saved; never the account's.
  assert.match(stage, /act: async \(\) => \{ throw Object\.assign\(new Error\('Example preview\. Nothing is saved here\.'\), \{ code: 'local' \}\); \}/);
  assert.match(stage, /<GoalManager scope=\{scope\} coaching=\{coaching\} seed=\{seed\}/);
  // The finder's presentation only: no SearchBar (it searches on open and remembers the source).
  assert.match(stage, /import \{ FinderPanel \} from '\.\/SearchBar\.jsx';/);
  assert.doesNotMatch(stage, /<SearchBar\b/);
  assert.match(stage, /onSubmit=\{\(\) => \{\}\}/, 'Enter in the finder does not search');
  // The notebook card in preview: never registered with the canvas, never exporting its workspace.
  assert.match(stage, /<NotebookBody preview /);
  const notebook = read('./NotebookCard.jsx');
  assert.equal((notebook.match(/if \(preview\) return undefined;/g) || []).length, 1, 'no workspace export');
  assert.match(notebook, /useEffect\(\(\)=>preview\?undefined:registerNotebookEditor/);
  // Controls that would reach a provider are inert; the photo card never searches on Enter.
  for (const control of ['data-photo-search', 'data-image-generate', 'data-generate-video', 'data-generate-scene', 'data-paid-generate']) assert.ok(stage.includes(`[${control}]`), control);
  assert.match(stage, /\{\.\.\.\(type === 'image' \? noEnter : \{\}\)\}/);
  // Practice's feedback is canned and local, labelled as an example, never a grade of the answer.
  assert.match(PREVIEWS.practice.feedback, /^VERDICT: partial\nExample feedback, not a grade of what you wrote:/);
  assert.doesNotMatch(stage + sheet, /\bapi\(|\/api\//, 'the window calls no route of its own');
  // Each preview sits just under the command's details, never centred in the stage with a gap above it (owner, 2026-10-29).
  assert.match(stage, /data-slash-stage[^\n]*items-start justify-center/);
});

test('measured fit: the stage is measured and the card is capped by it, never drawn at canvas size in a scroller', () => {
  assert.match(stage, /new ResizeObserver\(read\)/);
  assert.match(stage, /const width = Math\.max\(240, Math\.min\(nativeW, room\.w\) - cut\.w\);/);
  assert.match(stage, /const height = nativeH \? Math\.max\(200, Math\.min\(nativeH, room\.h\) - cut\.h\) : undefined;/);
  assert.match(stage, /data-slash-stage/);
  assert.doesNotMatch(sheet + stage, /overflow-auto/, 'no outer scroller around the preview');
  // One example at a time: the brief and the result share the stage.
  assert.match(sheet, /<SlashCommandPreview key=\{`\$\{name\}:\$\{showing\}`\}/);
  // Geometry targets (section 7.2): 16px margin and padding, at most 1120px wide, a 224px command column, a 16px gap, 12px pane padding.
  assert.match(sheet, /h-\[calc\(100dvh-32px\)\] w-\[min\(1120px,calc\(100vw-32px\)\)\]/);
  assert.match(sheet, /className="flex w-56 shrink-0 flex-col"/);
  assert.match(sheet, /rounded-xl border border-line bg-hover\/40 p-3/);
  // Below 900px the column becomes a search and a selector above the preview.
  assert.match(sheet, /const NARROW = '\(max-width: 899px\)';/);
  assert.match(sheet, /<select aria-label="Command" data-slash-select/);
});

test('Use example puts the example in the composer as an editable draft: its pill and words, never sent', () => {
  // The draft's pill is the command's stable id (name), never the typed word of its example (/photos is id image).
  assert.match(sheet, /onClick=\{\(\) => onUseExample\(\{ command: name, text: parseSlash\(example\)\?\.args \|\| '' \}\)\}/);
  assert.match(sheet, /data-slash-use-example=\{name\}/);
  // The page closes the window and prepares the Chat composer's draft (contract A6: prepare never sends, a written draft is kept).
  assert.match(read('./LearnPage.jsx'), /onUseExample=\{draft => \{ setSlashHelpOpen\(false\); chat\.composer\.prepare\(draft\); \}\}/);
  assert.match(read('./chat-draft.js'), /prepare: \(\{ text, command \} = \{\}\) => \{ apply\(\{ type: 'prepare', text, command \}\); focus\(\); \}/);
  // View > Slash Commands opens the same window.
  assert.match(read('./LearnPage.jsx'), /onSlashCommands: \(\) => setSlashHelpOpen\(true\)/);
  for (const [name, line] of Object.entries(EXAMPLES)) assert.equal(parseSlash(line).name, typedOf(name), line);
});

test('the window search filters by name and title, ignores a leading /, and can match nothing', () => {
  assert.equal(filterSections(all, ''), all);
  assert.deepEqual(names(filterSections(all, '/gra')), ['graph', 'diagram']);
  assert.deepEqual(names(filterSections(all, 'FLASH')), ['flashcards']);
  assert.deepEqual(names(filterSections(all, 'search')), ['image', 'youtube', 'arxiv', 'wikipedia']);
  assert.deepEqual(filterSections(all, 'zzz'), []);
  assert.deepEqual(filterSections(all, 'notebook').map(section => section.title), ['Create']);
  assert.match(sheet, /if \(event\.key === 'Enter' && shown\.length\) \{ event\.preventDefault\(\); choose\(shown\[0\]\.items\[0\]\.name\); \}/);
  assert.match(sheet, /if \(latest\.current\.query\) setQuery\(''\); else latest\.current\.onClose\(\);/);
  assert.match(sheet, />No commands match</);
});
