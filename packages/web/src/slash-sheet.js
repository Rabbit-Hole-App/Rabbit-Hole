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
export const MEDIA = { image: 'Sourced', youtube: 'Sourced', video: 'AI-generated', 'generate-image': 'AI-generated' };

// /youtube, /arxiv and /wikipedia open the source finder on their source with what follows them, and search at once; the
// learner previews the results there and adds one. They make no card themselves and call no model.
const FINDS = { youtube: 'YouTube videos', arxiv: 'arXiv papers: a topic, or an arXiv ID or link', wikipedia: 'Wikipedia articles' };
export const FINDER_NOTES = Object.fromEntries(Object.entries(FINDS).map(([name, what]) => [name, `Opens Search on ${what}, with what you type after the command, and searches at once. Preview the results there: nothing is added until you add one to the canvas.`]));

// The cards the sheet shows for a command: what it makes (learn-slash.js cardsFor). /motion (development builds only)
// makes a video card through its own action, so it names that card here; /generate-image (listed only while image
// generation is on) makes the Image generate card.
const SHEET_CARDS = { motion: [{ primitive: 'motion', card: 'videoGenerate' }], 'generate-image': [{ primitive: 'image_generate', card: 'imageGenerate' }] };
// /explain shows its interactive visual first (L10, owner 2026-10-21: the window carries real interactive examples); the
// model is offered the same cards in the registry's order.
const FIRST = { explain: 'animation' };
export const sheetCards = name => {
  const cards = SHEET_CARDS[name] || cardsFor(name);
  return FIRST[name] ? [...cards.filter(entry => entry.card === FIRST[name]), ...cards.filter(entry => entry.card !== FIRST[name])] : cards;
};

// What the right pane shows: the cards a command makes, what a source search does, or what /dive does.
export const demoOf = name => (name === 'cad' ? 'cad' : sheetCards(name).length ? 'cards' : FINDER_NOTES[name] ? 'finder' : CHAT_EXAMPLES[name] ? 'chat' : null);

// The committed finished clip /animate and /motion show (packages/web/public/landing): softmax sharing out the whole by
// score, 25 s, the landing page's /motion explainer.
const CLIP = '/landing/softmax-overview-v1.mp4';

// The sheet's own sample for a command's card, laid over the card's + palette sample (BLOCK_TYPES): /animate's and /motion's
// finished clip. Any other card shows its + sample.
export const SAMPLES = {
  animate: {
    mathAnimation: { title: 'Softmax shares the whole by score', caption: 'Every score gets a share of 1: the highest the biggest share, the lowest still some.',
      status: 'ready', src: CLIP, variants: [{ src: CLIP }], variant: 0 },
  },
  // A finished /motion request: the brief's title and duration arrive with the video (learn-video-label.js); no renderer
  // or sources are claimed for this clip.
  motion: {
    videoGenerate: { title: 'Softmax shares the whole by score', caption: '', status: 'ready', src: CLIP, variants: [{ src: CLIP }], variant: 0,
      operation: { op: 'motion_request', request: '/motion 25s explain softmax', location: { concept: 'softmax' } }, motion: { duration_seconds: 25, source_refs: [] } },
  },
};

// A card's tab name in the sheet where the command's own word for it differs from the + palette's: /explain's scene card is
// its interactive visual (L10).
export const TAB_LABELS = { animation: 'Interactive visual' };

// Paid media with no committed finished file: a picture of the finished card, labelled as one (public/lesson-assets).
export const ILLUSTRATIONS = {
  videoGenerate: { kicker: 'Video', src: '/lesson-assets/slash-video-prism.svg', alt: 'A white beam enters a glass prism and fans out into a spectrum',
    note: 'Illustration. On the canvas, Generate (paid) makes the real clip.' },
  scene: { kicker: '3D model', src: '/lesson-assets/slash-3d-frustum.svg', alt: 'A camera frustum with a cube inside it and a ray from the camera to the cube',
    note: 'Illustration. On the canvas, Generate (paid) builds the real scene for the 3D viewer.' },
};
