// View > Slash commands (SlashCommandsSheet.jsx): the demo each command shows, what it does, and the sheet's search. Pure, so
// the tests pin that every command has a demo. Each command's e.g. line (learn-slash.js EXAMPLES) is a different topic; a card
// shown beside it is a sample of the card the command makes (owner, 2026-10-20).
import { cardsFor } from './learn-slash.js';

// /dive adds no card and writes no chat answer: the sheet says what happens on the canvas.
export const CHAT_EXAMPLES = {
  dive: { about: 'A topic, or the card you select', note: 'Opens a Rabbit Hole. It writes no chat answer and adds no card here.', footer: 'What happens on the canvas.',
    answer: 'With no card selected, opens a Rabbit Hole about **how cells produce ATP**. With a card selected, `/dive` alone opens that card\'s Rabbit Hole, or starts one under it; the card gets a green outline you can enter it from. With neither, it asks what to go deeper into.' },
};

// What a command does, in one word the sheet shows beside it: it creates a card, opens a Rabbit Hole, or searches (owner,
// 2026-10-20). Media say where their content comes from: found and credited, or made by AI.
const SEARCHES = new Set(['image', 'youtube', 'arxiv', 'wikipedia']);
export const effectOf = name => (name === 'dive' ? 'Opens a Rabbit Hole' : SEARCHES.has(name) ? 'Searches' : 'Creates a card');
export const MEDIA = { image: 'Sourced', youtube: 'Sourced', video: 'AI-generated', 'generate-image': 'AI-generated', motion: 'AI-generated' };

// /youtube, /arxiv and /wikipedia open the source finder on their source with what follows them, and search at once; the
// learner previews the results there and adds one. They make no card themselves and call no model.
const FINDS = { youtube: 'YouTube videos', arxiv: 'arXiv papers: a topic, or an arXiv ID or link', wikipedia: 'Wikipedia articles' };
export const FINDER_NOTES = Object.fromEntries(Object.entries(FINDS).map(([name, what]) => [name, `Opens Search on ${what}, with what you type after the command, and searches at once. Preview the results there: nothing is added until you add one to the canvas.`]));

// The cards the sheet shows for a command: what it makes (learn-slash.js cardsFor). /motion (development and review builds)
// makes a video card through its own action, so it names that card here; /generate-image (listed only while image
// generation is on) makes the Image generate card.
const SHEET_CARDS = { motion: [{ primitive: 'motion', card: 'videoGenerate' }], 'generate-image': [{ primitive: 'image_generate', card: 'imageGenerate' }] };
export const sheetCards = name => SHEET_CARDS[name] || cardsFor(name);

// What the right pane shows: the cards a command makes, what a source search does, or what /dive does.
export const demoOf = name => (name === 'cad' ? 'cad' : sheetCards(name).length ? 'cards' : FINDER_NOTES[name] ? 'finder' : CHAT_EXAMPLES[name] ? 'chat' : null);

// /motion's example is a real Motion video, committed so it never expires and opening the window generates nothing: the
// final.mp4 of the verified job 8a2015a4 (rabbit-hole-motion-v1-harness-spec.md, "M7B production-exact API smoke": ready, final
// validation passed, sha256 6af0b4b2...437c46), made from exactly learn-slash.js EXAMPLES.motion. Its title, duration, renderer
// and sources are that job's own.
export const MOTION_CLIP = '/lesson-assets/motion-softmax-8a2015a4.mp4';
const ref = (id, start, end) => ({ id, kind: 'code', repository: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291', path: 'model.py', start_line: start, end_line: end });

// The sheet's own sample for a command's card, laid over the card's + palette sample (BLOCK_TYPES): /motion's finished video.
// Any other card shows its + sample.
export const SAMPLES = {
  motion: {
    videoGenerate: { title: 'Softmax: Turning Attention Scores into Weights', caption: '', status: 'ready', src: MOTION_CLIP, variants: [{ src: MOTION_CLIP }], variant: 0,
      operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } },
      motion: { duration_seconds: 15, renderer: 'remotion', source_refs: [ref('S1', 44, 45), ref('S2', 48, 50), ref('S3', 62, 64), ref('S4', 65, 71)] } },
  },
  // A finished /3d request: the scene card's own sample (Perspective projection) in its ready state. Its model is that
  // sample's scene built offline (scripts/make-slash-3d-glb.mjs), committed and served by this origin: no job, no model. Its
  // brief says what that model shows (the sample's operation caption), as the e.g. line (learn-slash.js) asks for it.
  '3d': { scene: { status: 'ready', modelUrl: '/lesson-assets/slash-3d-frustum.glb', brief: 'A camera frustum, a cube inside it, and a ray sweeping across.' } },
};
// The line above a sample card: every card is a sample, and /motion's is a real Motion video of its example.
export const SAMPLE_NOTES = { motion: 'A real Motion video, made from this example. Yours is made from what you type.' };

// Paid media with no committed finished file: a picture of the finished card, labelled as one (public/lesson-assets).
export const ILLUSTRATIONS = {
  videoGenerate: { kicker: 'Video', src: '/lesson-assets/slash-video-prism.svg', alt: 'A white beam enters a glass prism and fans out into a spectrum',
    note: 'Illustration. On the canvas, Generate (paid) makes the real clip.' },
};
// The picture stands in only for a sample with no finished media of its own: a clip (src) or a model (modelUrl) is shown by
// the card itself, and a viewer that fails says so in the card rather than fall back to a picture.
export const illustrationFor = (type, block) => (ILLUSTRATIONS[type] && !block.src && !block.modelUrl ? ILLUSTRATIONS[type] : null);
