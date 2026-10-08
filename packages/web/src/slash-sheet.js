// View > Slash commands (SlashCommandsSheet.jsx): the demo each command shows, and the sheet's search. Pure, so
// the tests pin that every command has a demo. The demos keep one thread - the sigmoid, softmax and nanoGPT - and
// each command's e.g. line (learn-slash.js EXAMPLES) asks for exactly the card or answer shown beside it.
import { cardsFor } from './learn-slash.js';
import { code } from './nanogpt/sources.js';

// A chat command adds no card: its answer arrives in the chat, about the card the learner selected (`about`).
// `answer` is an illustrative tutor answer to the command's e.g. line. /dive answers nothing: it says what happens.
export const CHAT_EXAMPLES = {
  deeper: { about: 'An id is an index, not a meaning',
    answer: 'The lookup is a matrix product with a one-hot vector: if $x$ is the one-hot vector for id 42, then $x^\\top W_{te}$ is row 42 of $W_{te}$ ($65 \\times 384$). Training only updates rows whose ids appeared in the batch, which is why rare tokens learn slowly.' },
  dive: { about: 'Softmax over the vocabulary', note: 'Opens a Rabbit Hole under the card you select. It writes no chat answer and adds no card here.', footer: 'What happens on the canvas.',
    answer: 'Opens an empty Rabbit Hole named **softmax** under the selected card. It is kept once you put something on it, and the card gets a red outline you can enter it from. With no card selected, select one and the dive completes.' },
  simplify: { about: 'Softmax over the vocabulary',
    answer: 'Softmax turns a list of scores into chances that add up to 1. A bigger score gets a bigger share, and every option keeps at least a little.' },
  // The same scores as /animate's clip, so the two agree to the digit.
  example: { about: 'Softmax over the vocabulary',
    answer: 'Scores $[2, 1, 0, -1]$. Exponentiate: $[7.39, 2.72, 1.00, 0.37]$, which sum to $11.48$. Divide by the sum: $[0.64, 0.24, 0.09, 0.03]$. The top score takes about two thirds, and the lowest still keeps 3%.' },
  ask: { about: 'karpathy/nanoGPT',
    answer: '`wte` is the token embedding table (`model.py`): one learned row of 384 numbers per vocabulary id. Each input id is looked up there before anything else runs.' },
  teach: { about: 'karpathy/nanoGPT',
    answer: 'Causal masking stops a position from looking ahead: attention scores for later positions are set to $-\\infty$ before softmax, so each token mixes information only from itself and earlier tokens. Next, the mask drawn as a triangle.' },
};

// /source acts on a card rather than making one: the sheet opens the Sources & evidence of its own /explain card.
export const SOURCE_NOTE = 'Opens the Sources & evidence of the card you select. It adds no card of its own.';

// The cards the sheet shows for a command: what it makes (learn-slash.js cardsFor). /motion (development builds only)
// makes a video card through its own action, so it names that card here.
const SHEET_CARDS = { motion: [{ primitive: 'motion', card: 'videoGenerate' }] };
export const sheetCards = name => SHEET_CARDS[name] || cardsFor(name);

// What the right pane shows: the cards a command makes, the card /source opens, or an example exchange.
export const demoOf = name => (sheetCards(name).length ? 'cards' : name === 'source' ? 'sources' : CHAT_EXAMPLES[name] ? 'chat' : null);

const XS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const round = value => Math.round(value * 1000) / 1000;
// The committed finished clip /animate and /motion show (packages/web/public/landing): softmax sharing out the whole by
// score, 25 s, the landing page's /motion explainer.
const CLIP = '/landing/softmax-overview-v1.mp4';

// The sheet's own sample for a command's card, laid over the card's + palette sample (BLOCK_TYPES): /compare's
// comparisons, /animate's finished clip and the sources /source opens. Any other card shows its + sample.
export const SAMPLES = {
  compare: {
    table: { title: 'Sigmoid vs tanh', caption: 'Two squashing functions side by side.',
      // String.raw: in a plain string '\s' is 's' and '\t' is a tab.
      columns: ['', String.raw`Sigmoid $\sigma(x)$`, String.raw`Tanh $\tanh(x)$`],
      rows: [['Output range', '$(0, 1)$', '$(-1, 1)$'], ['Value at 0', '$0.5$', '$0$'], ['Largest slope', '$0.25$ at $x = 0$', '$1$ at $x = 0$'],
        ['Relation', String.raw`$\sigma(x) = \tfrac{1}{2}(1 + \tanh(x/2))$`, String.raw`$\tanh(x) = 2\sigma(2x) - 1$`]] },
    graph: { title: 'Sigmoid vs tanh', brief: String.raw`Both squash any input. Tanh is the sigmoid stretched to $(-1, 1)$: $\tanh(x) = 2\sigma(2x) - 1$.`,
      spec: { op: 'interactive_plot', id: 'sigmoid-vs-tanh', renderer: 'desmos', concept: 'sigmoid vs tanh',
        expressions: [{ id: 'sigmoid', expression: String.raw`y=\frac{1}{1+e^{-x}}`, label: 'sigmoid' }, { id: 'tanh', expression: String.raw`y=\tanh(x)`, label: 'tanh' }],
        xAxis: { label: 'x', min: -6, max: 6 }, yAxis: { label: 'y', min: -1.2, max: 1.2 } }, state: {} },
    plot: { title: 'Sigmoid vs tanh, sampled', brief: 'Both functions at whole-number inputs: hover a point to read it, click the legend to hide one.',
      spec: { op: 'interactive_plot', id: 'sigmoid-vs-tanh-samples', renderer: 'plotly', concept: 'sigmoid vs tanh',
        traces: [{ id: 'sigmoid', label: 'sigmoid', type: 'line', x: XS, y: XS.map(x => round(1 / (1 + Math.exp(-x)))) },
          { id: 'tanh', label: 'tanh', type: 'line', x: XS, y: XS.map(x => round(Math.tanh(x))) }],
        xAxis: { label: 'x', min: -4, max: 4 }, yAxis: { label: 'y', min: -1.1, max: 1.1 } }, state: {} },
    flow: { title: 'Sigmoid vs tanh',
      spec: { direction: 'DOWN',
        nodes: [
          { id: 'x', label: 'input x', detail: 'any real number', tone: 'input' },
          { id: 'sigmoid', label: 'sigmoid', detail: '1 / (1 + e^-x)', tone: 'step' },
          { id: 'tanh', label: 'tanh', detail: '2 sigmoid(2x) - 1', tone: 'step' },
          { id: 'unit', label: 'between 0 and 1', detail: '0.5 at x = 0', tone: 'output' },
          { id: 'signed', label: 'between -1 and 1', detail: '0 at x = 0', tone: 'output' },
        ],
        edges: [{ source: 'x', target: 'sigmoid' }, { source: 'x', target: 'tanh' }, { source: 'sigmoid', target: 'unit' }, { source: 'tanh', target: 'signed' }] } },
    mermaid: { title: 'Sigmoid vs tanh',
      code: ['flowchart LR', '  input["input x"] --> sig["sigmoid"]', '  input --> tnh["tanh"]', '  sig --> unit["between 0 and 1, 0.5 at 0"]',
        '  tnh --> signed["between −1 and 1, 0 at 0"]', '  sig -.->|stretched and shifted| tnh'].join('\n') },
  },
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
  source: {
    explanation: { sources: [
      code('model.py', 127, 127, 'The token table: "wte = nn.Embedding(config.vocab_size, config.n_embd)" - one learned row per token id.'),
      code('model.py', 177, 177, 'The lookup in forward: "tok_emb = self.transformer.wte(idx)" - every id in idx is replaced by its row.'),
      { kind: 'paper', title: 'Attention Is All You Need', arxiv: '1706.03762', note: 'Learned token embeddings feed the Transformer.' },
      { kind: 'calculation', status: 'Calculated toy example', title: 'Row 42', note: 'The numbers in the worked example are illustrative, not read from a trained model.' },
    ] },
  },
};

// Paid media with no committed finished file: a picture of the finished card, labelled as one (public/lesson-assets).
export const ILLUSTRATIONS = {
  videoGenerate: { kicker: 'Video', src: '/lesson-assets/slash-video-prism.svg', alt: 'A white beam enters a glass prism and fans out into a spectrum',
    note: 'Illustration. On the canvas, Generate (paid) makes the real clip.' },
  scene: { kicker: '3D model', src: '/lesson-assets/slash-3d-frustum.svg', alt: 'A camera frustum with a cube inside it and a ray from the camera to the cube',
    note: 'Illustration. On the canvas, Generate (paid) builds the real scene for the 3D viewer.' },
};
