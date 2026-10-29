// View > Slash Commands (SlashCommandsSheet.jsx): each command's preview, owned by that command and linked to its example
// (learn-slash.js EXAMPLES; owner spec 2026-10-29 section 8). Pure, so the tests pin that every listed command has exactly one
// preview on the same subject as its example, and that none falls back to another command's sample (BLOCK_TYPES' + palette
// samples are never used here). Everything in this file is help/demo data: fake ids, canned feedback and fixtures stay in the
// window and never reach a route, a model or the account.
//
// A preview is one of:
//   { kind: 'card', card, block }  a canvas card drawn by the canvas's own body (LearningBlocks.jsx); card names its BLOCK_TYPES size
//   { kind: 'notebook' }            the notebook card's header with one empty cell (NotebookCard.jsx preview: no workspace, no kernel)
//   { kind: 'goal', draft }         Progress's Learning Goals (GoalManager.jsx) on isolated state, the draft in New goal, unsaved
//   { kind: 'finder', source, query, results }  the source finder's presentation (SearchBar.jsx FinderPanel) on fixture results
//   { kind: 'none', reason }        no matching saved result exists: said plainly (a generator then shows its brief)
// note: one line under the preview, where the preview needs one.
import { EXPLAIN_EXAMPLES } from './explain-examples.js';

// The generators (spec section 6): their preview shows the finished result, and View brief shows their brief in the shared
// confirmation card (GenerationProposalCard.jsx) with nothing it can generate or save.
export const BRIEF_COMMANDS = ['explain', 'practice', 'quiz', 'flashcards', 'code', 'graph', 'diagram', 'generate-image', 'motion', 'cad', '3d'];
export const SAMPLE_NOTE = 'Example preview. Nothing is generated or saved here.';

// /motion's example is a real Motion video, committed so it never expires and opening the window generates nothing: the
// final.mp4 of the verified job 8a2015a4 (rabbit-hole-motion-v1-harness-spec.md, "M7B production-exact API smoke": ready, final
// validation passed, sha256 6af0b4b2...437c46), made from exactly learn-slash.js EXAMPLES.motion. Its title, duration, renderer
// and sources are that job's own.
export const MOTION_CLIP = '/lesson-assets/motion-softmax-8a2015a4.mp4';
const ref = (id, start, end) => ({ id, kind: 'code', repository: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291', path: 'model.py', start_line: start, end_line: end });

// Finished media from committed files: /motion's video and /3d's scene (its model built offline by scripts/make-slash-3d-glb.mjs,
// served by this origin: no job, no model).
export const SAMPLES = {
  motion: {
    videoGenerate: { type: 'video', mode: 'generate', title: 'Softmax: Turning Attention Scores into Weights', caption: '', status: 'ready', src: MOTION_CLIP, variants: [{ src: MOTION_CLIP }], variant: 0,
      operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } },
      motion: { duration_seconds: 15, renderer: 'remotion', source_refs: [ref('S1', 44, 45), ref('S2', 48, 50), ref('S3', 62, 64), ref('S4', 65, 71)] } },
  },
  '3d': {
    scene: { type: 'scene', title: 'Perspective projection', status: 'ready', modelUrl: '/lesson-assets/slash-3d-frustum.glb', brief: 'A camera frustum, a cube inside it, and a ray sweeping across.',
      camera: {}, autoRotate: false, animation: { autoplay: true }, animationTime: 0 },
  },
};

// /explain how binary search works: a stored real /explain answer about exactly this (explain-examples/binary-search.json, made by
// /explain on 2026-10-21 and checked control by control). Its sorted list has ten values, not the eight the spec sketches: the
// stored answer is used as it came back rather than an authored or newly generated one.
const BINARY_SEARCH = EXPLAIN_EXAMPLES.find(example => example.id === 'binary-search');

// Sine and cosine sampled at 97 points over two periods: computed values of the two functions, not measured data. The Graph card's
// Plotly renderer draws them with their legend and both axes inside the card (Desmos's expression list would take the window).
const XS = Array.from({ length: 97 }, (unused, index) => Number((-2 * Math.PI + index * Math.PI / 24).toFixed(4)));
const wave = fn => XS.map(x => Number(fn(x).toFixed(4)));

// The genuine arXiv record for the example's id, in the shape the finder's exact-id lookup returns (control-plane learn-search.js
// directResult): title, id and the eight authors as arXiv lists them.
const ATTENTION = {
  key: '1706.03762', title: 'Attention Is All You Need', subtitle: 'arXiv:1706.03762', why: 'Exactly the paper you pasted.', exact: true, thumbnail: null,
  item: { id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Lukasz Kaiser', 'Illia Polosukhin'] },
};
const NO_SEARCH = 'This window does not search. Run the command to see real results; nothing is added until you choose Add to canvas.';

export const PREVIEWS = {
  explain: { kind: 'card', card: 'animation', block: { ...structuredClone(BINARY_SEARCH.block), id: 'slash-help-explain' }, note: 'A stored answer made by /explain for this question.' },
  practice: { kind: 'card', card: 'explainBack', block: { type: 'challenge', mode: 'explain_back',
    prompt: 'Why does the sky look blue? Explain it in your own words.',
    hint: 'Think about what happens to sunlight as it passes through the air.',
    expects: ['sunlight contains every colour', 'air molecules scatter short blue wavelengths much more than long red ones', 'scattered blue light reaches your eyes from every part of the sky'],
    reveal: '', answer: null },
    // Canned and local: shown after Submit so the card's feedback step can be seen. It never reads or grades the answer typed here.
    feedback: 'VERDICT: partial\nExample feedback, not a grade of what you wrote: a strong answer says that air molecules scatter short, blue wavelengths of sunlight much more than long, red ones, so blue light reaches your eyes from every direction.' },
  quiz: { kind: 'card', card: 'quiz', block: { type: 'quiz',
    question: 'The same net force acts on two objects. One has twice the mass of the other. How does its acceleration compare?',
    options: [{ key: 'A', text: 'Half as large', correct: true }, { key: 'B', text: 'The same' }, { key: 'C', text: 'Twice as large' }],
    why: 'With the same net force, acceleration is inversely proportional to mass: $a = F/m$.', choice: null } },
  flashcards: { kind: 'card', card: 'flashcards', block: { type: 'flashcards', cards: [{ front: 'ir', back: 'to go' }, { front: 'querer', back: 'to want' }, { front: 'necesitar', back: 'to need' }] } },
  goal: { kind: 'goal', draft: 'Read a balance sheet with confidence' },
  code: { kind: 'card', card: 'snippet', block: { type: 'snippet', title: 'Reverse a linked list',
    brief: 'Each step points the current node back at the previous one; when the walk ends, `prev` is the old tail, which is returned as the new head.',
    code: ['class Node:', '    def __init__(self, value, next=None):', '        self.value = value', '        self.next = next', 'def reverse(head):', '    prev = None', '    current = head', '    while current:', '        nxt = current.next', '        current.next = prev', '        prev, current = current, nxt', '    return prev'].join('\n') } },
  graph: { kind: 'card', card: 'graph', block: { type: 'graph', title: 'Sine and cosine', brief: 'Both curves on the same axes: cosine is sine shifted a quarter period to the left.',
    spec: { op: 'interactive_plot', id: 'slash-help-sine-cosine', renderer: 'plotly', concept: 'sine and cosine',
      traces: [{ id: 'sin', label: 'y = sin(x)', type: 'line', x: XS, y: wave(Math.sin) }, { id: 'cos', label: 'y = cos(x)', type: 'line', x: XS, y: wave(Math.cos) }],
      xAxis: { label: 'x', min: -6.3, max: 6.3 }, yAxis: { label: 'y', min: -1.3, max: 1.3 } }, state: {} } },
  // narrow: the stage is too narrow for four stages side by side, so the same diagram is laid out top to bottom.
  // size: four short stages read at full size side by side (the canvas's 560 x 520 flow card would shrink them to fit).
  diagram: { kind: 'card', card: 'flow', size: narrow => (narrow ? { width: 420, height: 520 } : { width: 900, height: 300 }), block: narrow => ({ type: 'flow', title: 'A request and response', spec: { direction: narrow ? 'DOWN' : 'RIGHT',
    nodes: [{ id: 'send', label: 'Browser sends request', tone: 'input' }, { id: 'handle', label: 'Server handles request', tone: 'step' }, { id: 'respond', label: 'Server sends response', tone: 'step' }, { id: 'render', label: 'Browser renders page', tone: 'output' }],
    edges: [{ source: 'send', target: 'handle' }, { source: 'handle', target: 'respond' }, { source: 'respond', target: 'render' }] } }) },
  notebook: { kind: 'notebook' },
  'generate-image': { kind: 'none', reason: 'No saved image matches this example, so only its brief is shown. The window never generates one.' },
  motion: { kind: 'card', card: 'videoGenerate', block: SAMPLES.motion.videoGenerate, note: 'A real Motion video, made from this example.' },
  cad: { kind: 'none', reason: 'No saved CAD model matches this example, so only its brief is shown. The window never generates one.' },
  '3d': { kind: 'card', card: 'scene', block: SAMPLES['3d'].scene, viewer: true },
  browser: { kind: 'none', reason: 'No saved capture of this page ships with the window, and it never captures one. On the canvas, the command captures the page as a webpage card you can read, highlight and ask about.' },
  // The photo-search card as /photos places it, before its search: the window does not search Pexels, so it shows no photos.
  image: { kind: 'card', card: 'image', block: { type: 'image', mode: 'search', title: 'Mount Fuji', src: '', alt: '', caption: '', prompt: 'Mount Fuji' }, note: NO_SEARCH },
  youtube: { kind: 'finder', source: 'youtube', query: 'binary search tutorial', results: null, note: NO_SEARCH },
  arxiv: { kind: 'finder', source: 'arxiv', query: '1706.03762', results: [ATTENTION], note: 'The real arXiv record for this id. Add to canvas is shown as it works; here it adds nothing.' },
  wikipedia: { kind: 'finder', source: 'wikipedia', query: 'Photosynthesis', results: null, note: NO_SEARCH },
};
export const previewOf = name => PREVIEWS[name] || null;
// The block a card preview draws, as a fresh copy (a narrow stage lays a diagram out top to bottom).
export const previewBlock = (preview, { narrow = false } = {}) => structuredClone(typeof preview.block === 'function' ? preview.block(narrow) : preview.block);

// The brief each generator would show before Generate (spec section 8), drawn by the shared confirmation card. Settings are only
// those the command's schema declares (generation-confirmation-schema.js), at their defaults or the example's own values.
export const BRIEFS = {
  explain: { title: 'How binary search works', description: 'Show how binary search finds a value in a sorted list by checking the middle and narrowing the remaining range.' },
  practice: { title: 'Explain why the sky is blue', description: 'Explain the idea in your own words, then get feedback on the reasoning in your answer.' },
  quiz: { title: "Newton's second law", description: 'One multiple-choice question about force, mass and acceleration, with feedback after you answer.' },
  flashcards: { title: 'Spanish verbs for travel', description: 'A short deck for practising useful travel verbs, with their meanings on the reverse.' },
  code: { title: 'Reverse a linked list', description: 'A short Python function that reverses a linked list, with a brief explanation of the pointer updates.' },
  graph: { title: 'Sine and cosine', description: 'Plot sine and cosine on the same axes so their shapes and phase difference can be compared.' },
  diagram: { title: 'A request and response', description: 'Show a browser sending a request, the server handling it and the browser receiving and displaying the response.' },
  'generate-image': { title: 'Watercolor mountain landscape', description: 'A watercolor landscape with mountains, a soft sky and visible paint texture.', settings: { model: 'gpt-image-2.5-sunburst' } },
  motion: { title: 'How softmax turns scores into weights', description: 'Show scores being transformed into positive weights that add up to one.', settings: { aspect_ratio: '16:9', duration_seconds: 15, audio: false } },
  cad: { title: 'Rectangular plate', description: 'A rectangular plate measuring 40 × 20 × 5 mm.', settings: { units: 'mm', parameters: { length: 40, width: 20, thickness: 5 } },
    groups: { parameters: { legend: 'Parameters', defs: [{ id: 'length', label: 'Length', unit: 'mm', display: '40 mm', tag: 'Requested' }, { id: 'width', label: 'Width', unit: 'mm', display: '20 mm', tag: 'Requested' }, { id: 'thickness', label: 'Thickness', unit: 'mm', display: '5 mm', tag: 'Requested' }] } } },
  '3d': { title: 'Perspective projection', description: 'A camera frustum, a cube inside it and a ray showing their spatial relationship.' },
};

// The logical proposal the confirmation card draws for a brief (schema proposalView's shape), with no action allowed: Generate shows
// disabled and there is no Edit, Save or Cancel. No price is stated (a help brief has no quote) and no validation runs.
export function briefView(name, example) {
  const brief = BRIEFS[name];
  if (!brief) return null;
  return {
    schema_version: 1, proposal_id: `slash-help-${name}`, revision: 1, command: name, original_request: example, title: brief.title, description: brief.description,
    settings: brief.settings || {}, references: [], requirements: [], assumptions: [], missing_information: [], limitations: [],
    notices: [], status: 'awaiting_review', validation_errors: [], allowed_actions: [],
  };
}
