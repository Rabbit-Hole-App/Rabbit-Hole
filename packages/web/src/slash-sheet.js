// View > Slash Commands (SlashCommandsSheet.jsx): each command's preview, owned by that command and linked to its example
// (learn-slash.js EXAMPLES; owner spec 2026-10-29 section 8). Pure, so the tests pin that every listed command has exactly one
// preview on the same subject as its example, and that none falls back to another command's sample (BLOCK_TYPES' + palette
// samples are never used here). Everything in this file is help/demo data: fake ids, canned feedback and fixtures stay in the
// window and never reach a route, a model or the account.
//
// A preview is one of:
//   { kind: 'card', card, block }  a canvas card drawn by the canvas's own body (LearningBlocks.jsx); card names its BLOCK_TYPES size
//   { kind: 'notebook', block }     the real notebook card (NotebookCard.jsx preview): JupyterLab on the notebook site, opened on a
//                                   saved notebook that replaces the preview's workspace each time; nothing is saved or reported back
//   { kind: 'goal', draft }         Progress's Learning Goals (GoalManager.jsx) on isolated state, the draft in New goal, unsaved
//   { kind: 'finder', source, query, results }  the source finder's presentation (SearchBar.jsx FinderPanel) on fixture results
//   { kind: 'youtube', block }      the YouTube card (AdaptiveCanvas.jsx YouTubeMoment): YouTube's own player, playing only on Play
//   { kind: 'wiki', block, saved }  the Wikipedia card's reader (LearnWiki.jsx) on a stored answer of the wiki route
//   { kind: 'none', reason }        no matching saved result exists: said plainly (a generator then shows its brief)
// note: one line under the preview, where the preview needs one.
import COOLING from './slash-examples/explain-cooling.json' with { type: 'json' };
import NOTEBOOK from './slash-examples/notebook-cooling.json' with { type: 'json' };
import CAD_PLATE from './slash-examples/cad-plate.json' with { type: 'json' };
import WIKI from './slash-examples/wiki-transformer.json' with { type: 'json' };
import PHOTOS from './slash-examples/photos-cat.json' with { type: 'json' };

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

// /explain's example (owner, 2026-10-29): the genuine accepted program of /explain run sandbox-ex1-b (job ej_307b2e1a, result
// er_a5e59350, bundle 62c202e9; the same recorded answer as explain-program/testdata/sandbox-ex1-b-job.json): the saved card and
// the result route's answer for it. ProgramScene resolves it through its own checks (identity, bundle and source hashes) from this
// copy instead of the route, and runs it in its sandbox: Play, the scrubber and the room temperature work; nothing is generated.
export const COOLING_EXAMPLE = COOLING;
// /notebook's example (owner, 2026-10-29): a short notebook executed once for real (nbclient and ipykernel, then given the canvas
// notebook's Pyodide kernelspec; C:/s/spec/slash-window/notebook/make.py), its output and plot computed, not drawn.
export const NOTEBOOK_EXAMPLE = NOTEBOOK;
// /cad's example: the real CAD revision cr_9a3fa75c (dev CAD acceptance 2026-10-17, "meaningful features" with its accepted edit,
// validation passed), its model.glb committed byte for byte (sha256 380fcf0c...1bedd) and served by this origin.
export const CAD_EXAMPLE = CAD_PLATE;
// /wikipedia's example: the wiki route's answer for the article (fetched once from the dev worker, 2026-10-29), its HTML cut to the
// lead section (revision in WIKI.revision). Text CC BY-SA 4.0, credited in the card's own footer.
export const WIKI_EXAMPLE = WIKI;
// /youtube's example: 3Blue1Brown's video as the YouTube card holds it; title, channel and length from YouTube's oEmbed and watch
// page (2026-10-28, C:/s/spec/landing-rabbit-holes/sources.json). The card embeds YouTube's own player: nothing plays until Play.
export const YOUTUBE_EXAMPLE = { type: 'video', id: 'slash-help-youtube', videoId: 'eMlx5fFNoYc', title: 'Attention in transformers, step-by-step | Deep Learning Chapter 6',
  channel: '3Blue1Brown', start: 0, end: null, duration: 1569 };

// Sine and cosine sampled at 97 points over two periods: computed values of the two functions, not measured data. The Graph card's
// Plotly renderer draws them with their legend and both axes inside the card (Desmos's expression list would take the window).
const XS = Array.from({ length: 97 }, (unused, index) => Number((-2 * Math.PI + index * Math.PI / 24).toFixed(4)));
const wave = fn => XS.map(x => Number(fn(x).toFixed(4)));

// The genuine arXiv record for the example's id, as the finder's exact-id lookup returned it (dev search route, 2026-10-29: key, title,
// the eight authors, pdfUrl), with the authors line the finder's search rows carry and the opening of the abstract (arxiv.js
// readArxivPaper, 2026-10-29) in place of "Exactly the paper you pasted.", so the window shows what the paper is.
const ATTENTION = {
  key: '1706.03762v7', title: 'Attention Is All You Need', subtitle: 'Ashish Vaswani, Noam Shazeer, Niki Parmar et al. · arXiv:1706.03762v7', exact: true, thumbnail: null,
  why: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
  item: { id: '1706.03762v7', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762v7',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Lukasz Kaiser', 'Illia Polosukhin'] },
};
// /photos cat: the three photos Pexels returned for "cat" (control-plane pexels.js searchPexels, 2026-10-29), each with its
// photographer and Pexels page, as the photo card keeps a chosen photo (LearningBlocks ImageBody choose). The pictures load from
// Pexels, as on the canvas.
const CAT = PHOTOS.photos.map(photo => ({ src: photo.src, alt: photo.alt, credit: { photographer: photo.photographer, url: photo.url } }));

export const PREVIEWS = {
  // size: about 660 px wide (owner, 2026-10-29), the drawing fitted whole inside it (ProgramScene programExample).
  explain: { kind: 'card', card: 'animation', block: COOLING.block, program: COOLING.result, size: () => ({ width: 660, height: 620 }), note: 'A saved answer made by /explain for this request.' },
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
  notebook: { kind: 'notebook', block: { id: 'slash-help-notebook', type: 'notebook', notebook_id: 'slash-help-notebook', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', ipynb: NOTEBOOK },
    note: 'An example notebook. /notebook itself starts an empty one.' },
  'generate-image': { kind: 'none', reason: 'No saved image matches this example, so only its brief is shown. The window never generates one.' },
  motion: { kind: 'card', card: 'videoGenerate', block: SAMPLES.motion.videoGenerate, note: 'A real Motion video, made from this example.' },
  cad: { kind: 'card', card: 'cad', block: CAD_PLATE.block, note: 'A real model made by /cad. Interact to orbit and zoom it.' },
  '3d': { kind: 'card', card: 'scene', block: SAMPLES['3d'].scene, viewer: true },
  browser: { kind: 'none', reason: 'No saved capture of this page ships with the window, and it never captures one. On the canvas, the command captures the page as a webpage card you can read, highlight and ask about.' },
  // The photo card after /photos cat, its first result chosen; the arrows step through the other two.
  image: { kind: 'card', card: 'image', block: { type: 'image', mode: 'search', title: 'Cat', caption: '', prompt: 'cat', ...CAT[0], variants: CAT, variant: 0 },
    note: 'Real Pexels results for this search, saved. This window does not search again.' },
  youtube: { kind: 'youtube', block: YOUTUBE_EXAMPLE, note: 'A 3Blue1Brown video in the YouTube card. Nothing plays until you press Play.' },
  arxiv: { kind: 'finder', source: 'arxiv', query: '1706.03762', results: [ATTENTION], note: 'The real arXiv record for this id. Add to canvas opens the paper on the canvas; here it adds nothing.' },
  wikipedia: { kind: 'wiki', block: { type: 'wiki', id: 'slash-help-wikipedia', title: WIKI.title }, saved: WIKI, note: "The article's opening section, saved. Links in it open the live article." },
};
export const previewOf = name => PREVIEWS[name] || null;
// The block a card preview draws, as a fresh copy (a narrow stage lays a diagram out top to bottom).
export const previewBlock = (preview, { narrow = false } = {}) => structuredClone(typeof preview.block === 'function' ? preview.block(narrow) : preview.block);

// The brief each generator would show before Generate (spec section 8), drawn by the shared confirmation card. Settings are only
// those the command's schema declares (generation-confirmation-schema.js), at their defaults or the example's own values.
export const BRIEFS = {
  explain: { title: 'How a hot coffee cools in a room', description: 'Show a cup of hot coffee cooling down over time in a cold room, with the room temperature as a control to change.' },
  practice: { title: 'Explain why the sky is blue', description: 'Explain the idea in your own words, then get feedback on the reasoning in your answer.' },
  quiz: { title: "Newton's second law", description: 'One multiple-choice question about force, mass and acceleration, with feedback after you answer.' },
  flashcards: { title: 'Spanish verbs for travel', description: 'A short deck for practising useful travel verbs, with their meanings on the reverse.' },
  code: { title: 'Reverse a linked list', description: 'A short Python function that reverses a linked list, with a brief explanation of the pointer updates.' },
  graph: { title: 'Sine and cosine', description: 'Plot sine and cosine on the same axes so their shapes and phase difference can be compared.' },
  diagram: { title: 'A request and response', description: 'Show a browser sending a request, the server handling it and the browser receiving and displaying the response.' },
  'generate-image': { title: 'Watercolor mountain landscape', description: 'A watercolor landscape with mountains, a soft sky and visible paint texture.', settings: { model: 'gpt-image-2.5-sunburst' } },
  motion: { title: 'How softmax turns scores into weights', description: 'Show scores being transformed into positive weights that add up to one.', settings: { aspect_ratio: '16:9', duration_seconds: 15, audio: false } },
  // The real job's own brief (cr_9a3fa75c, slash-examples/cad-plate.json): its title, units and parameters.
  cad: { title: CAD_PLATE.brief.title, description: 'A 60 × 40 × 5 mm plate with four 4 mm through holes and a centred 20 × 10 mm pocket, 3 mm deep, cut from the top face.',
    settings: { units: CAD_PLATE.brief.units, parameters: CAD_PLATE.brief.parameters },
    groups: { parameters: { legend: 'Parameters', defs: Object.entries(CAD_PLATE.brief.parameters).map(([id, value]) => ({ id, label: id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), unit: 'mm', display: `${value} mm`, tag: 'Requested' })) } } },
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
