import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Code, Loader2, Play, RotateCcw, Search, Sparkles, Volume2, X } from 'lucide-react';
import { Md } from './ask.jsx';
import { api, wsHeaders } from './api.js';
import { cacheAsset, cachedAsset } from './learn-asset-cache.js';
import { colorLine } from './code.jsx';
import { CodeBlock } from './ui.jsx';
import { runPython } from './pyodide-runner.js';
import { graphRenderers } from './graph-renderers.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';
import SpeakAnswer from './SpeakAnswer.jsx';
import LearnPaper from './LearnPaper.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import FlowDiagram from './FlowDiagram.jsx';
import AnimatedScene from './AnimatedScene.jsx';
const WhiteboardBlock = lazy(() => import('./WhiteboardBlock.jsx'));
import { fromTemplate, getSceneState } from './animation-scene.js';
import InteractiveScene, { sceneSummary } from './InteractiveScene.jsx';
import MermaidDiagram, { MermaidSource } from './MermaidDiagram.jsx';
import { sceneAssetUrl, sceneList, startScene, startVideo, videoAssetUrl, videoList } from './learn-scene-client.js';

// Lesson component library for the adaptive canvas (spec: docs/
// adaptive-learning-canvas-spec.md §12). Each entry renders inside the shared
// CanvasNode chrome; samples carry nanoGPT-flavored fixture content so the
// dev-only Insert menu can exercise the look before any lesson is assembled.
// Quiz and flashcards are the shapes the tutor agent will emit as the learner
// progresses; ghost entries sit directly on the canvas with no visible box
// until hovered.


// Small inline figure so the Image sample never depends on an outside host.
const SIGMOID_FIGURE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMjAgMTgwIiB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCI+PHJlY3Qgd2lkdGg9IjMyMCIgaGVpZ2h0PSIxODAiIGZpbGw9IiNmZmZmZmYiLz48bGluZSB4MT0iMjQiIHkxPSIxNTAiIHgyPSIzMDAiIHkyPSIxNTAiIHN0cm9rZT0iI2M5YzljNSIgc3Ryb2tlLXdpZHRoPSIxIi8+PGxpbmUgeDE9IjE2MiIgeTE9IjI0IiB4Mj0iMTYyIiB5Mj0iMTYyIiBzdHJva2U9IiNjOWM5YzUiIHN0cm9rZS13aWR0aD0iMSIvPjxwYXRoIGQ9Ik0yNCAxNDggQzEwNCAxNDggMTI4IDE0MCAxNjIgODcgQzE5NiAzNCAyMjAgMjYgMzAwIDI2IiBmaWxsPSJub25lIiBzdHJva2U9IiMyMzgzZTIiIHN0cm9rZS13aWR0aD0iMyIvPjxjaXJjbGUgY3g9IjE2MiIgY3k9Ijg3IiByPSI0IiBmaWxsPSIjMjM4M2UyIi8+PHRleHQgeD0iMTcwIiB5PSIzNiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTEiIGZpbGw9IiMzNzM1MmYiPjEuMDwvdGV4dD48dGV4dCB4PSIxNzAiIHk9Ijg0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMSIgZmlsbD0iIzM3MzUyZiI+MC41PC90ZXh0Pjx0ZXh0IHg9IjE3MCIgeT0iMTY0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMSIgZmlsbD0iIzM3MzUyZiI+MC4wPC90ZXh0Pjwvc3ZnPg==';

export const BLOCK_TYPES = {
  challenge: {
    label: 'Challenge',
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'challenge',
      dx: 0,
      dy: 0,
      prompt: 'nanoGPT receives token IDs — plain integers like `42`. What has to happen between these integers and next-token predictions?',
      hint: 'Commit a guess before we look — the tutor reads it and says what you already have.',
      expects: ['each token id selects a learned embedding row', 'position information is added to the token vector', 'transformer blocks mix the vectors', 'a final linear layer scores every vocabulary token'],
      reveal: 'Hold that thought. The next blocks walk the real path: token IDs pick embedding rows, positions add where each token sits, the transformer tower mixes them, and the LM head scores every vocabulary token.',
      answer: null,
    }),
  },
  explainBack: {
    // The other half of a challenge: evidence of understanding, judged after
    // the learner has worked through the material.
    label: 'Explain back',
    width: 440,
    autoMax: 560,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'challenge',
      mode: 'explain_back',
      dx: 0,
      dy: 0,
      prompt: 'In your own words: what happens between token id `2` entering nanoGPT and the model producing next-token scores?',
      hint: 'Two or three sentences. The tutor judges it against the key ideas, so say what each step does.',
      expects: ['the id selects a row of the embedding table', 'a position embedding is added', 'transformer blocks mix the vectors across positions', 'the LM head turns the final vector into one score per vocabulary token'],
      reveal: '',
      answer: null,
    }),
  },
  explanation: {
    label: 'Explanation',
    width: 440,
    autoMax: 520,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'explanation',
      dx: 0,
      dy: 0,
      title: 'An id is an index, not a meaning',
      body: 'Token ids are positions in the vocabulary, nothing more: `42` is not "bigger" than `41` in any useful sense. `wte` turns each id into a learned vector, and every later step works only with those vectors.\n\nThe table is defined in `model.py:127` — one row per vocabulary token, $65 \\times 384$ in the char model.',
      // Layer 2 of the spec: deeper material that stays folded until asked for.
      more: [
        { label: 'Worked example', text: 'Token id $42$ selects row $42$: `wte.weight[42]` → `[0.17, -0.81, 0.42, …]`. Change the id to $43$ and a completely different row comes out — the vectors are not ordered by id.' },
        { label: 'Common misconception', text: 'Bigger vocabulary does not mean wider vectors. `vocab_size` is the number of rows; `n_embd` is the row width. They move independently.' },
      ],
    }),
  },
  quiz: {
    label: 'Quiz',
    ghost: true,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'quiz',
      dx: 0,
      dy: 0,
      question: 'If $\\sigma(x) = \\frac{1}{1+e^{-x}}$, what is the derivative $\\sigma\'(x)$?',
      options: [
        { key: 'A', text: '$\\sigma(x)\\,(1 - \\sigma(x))$', correct: true },
        { key: 'B', text: '$1 - \\sigma(x)^2$' },
        { key: 'C', text: '$e^{-x}$' },
      ],
      why: 'Differentiate: $\\sigma\'(x) = \\frac{e^{-x}}{(1+e^{-x})^2} = \\sigma(x)\\,(1-\\sigma(x))$ — maximal $0.25$ at $x = 0$, which is why deep sigmoid stacks saturate.',
      choice: null,
    }),
  },
  flashcards: {
    label: 'Flashcards',
    ghost: true,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'flashcards',
      dx: 0,
      dy: 0,
      cards: [
        { front: 'What is `wte`?', back: 'The token embedding table — one learned row per vocabulary token ($65 \\times 384$ in the char model).' },
        { front: 'Why are attention heads free?', back: '`n_head` only splits the same $n\\_{embd}$ channels — changing it adds no parameters.' },
        { front: 'Reported parameter count of the char model?', back: '$10{,}646{,}784$ — `bias = False` everywhere, and the position table is subtracted by `get_num_params`.' },
      ],
    }),
  },
  table: {
    label: 'Table',
    width: 560,
    autoMax: 620,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'table',
      dx: 0,
      dy: 0,
      title: 'Where the parameters live',
      caption: 'Char-model shapes at `n_embd = 384`, `vocab_size = 65`, `block_size = 256`.',
      columns: ['Tensor', 'Shape', 'Parameters', 'In `model.py`', 'Counted?'],
      rows: [
        ['`wte`', '$65 \\times 384$', '24,960', '127', 'yes'],
        ['`wpe`', '$256 \\times 384$', '98,304', '128', 'no'],
        ['`ln_1.weight`', '$384$', '384', '95', 'yes'],
        ['`attn.c_attn`', '$384 \\times 1152$', '442,368', '46', 'yes'],
        ['`attn.c_proj`', '$384 \\times 384$', '147,456', '48', 'yes'],
        ['`ln_2.weight`', '$384$', '384', '99', 'yes'],
        ['`mlp.c_fc`', '$384 \\times 1536$', '589,824', '81', 'yes'],
        ['`mlp.c_proj`', '$1536 \\times 384$', '589,824', '83', 'yes'],
        ['`ln_f.weight`', '$384$', '384', '131', 'yes'],
        ['`lm_head`', '$384 \\times 65$', 'tied to `wte`', '133', 'no'],
      ],
    }),
  },
  snippet: {
    label: 'Code sample',
    // Code needs room: wider than prose blocks and tall enough that the
    // output stays visible without a manual resize.
    width: 520,
    autoMax: 760,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'snippet',
      dx: 0,
      dy: 0,
      title: 'Building the character vocabulary',
      brief: 'The char model derives its whole vocabulary from the training text — every distinct character gets an id.',
      code: "text = 'hello hi'\nchars = sorted(set(text))\nprint(chars)\nprint(len(chars), 'characters')\nstoi = { ch: i for i, ch in enumerate(chars) }\nprint(stoi['h'], stoi['i'])",
      output: "[' ', 'e', 'h', 'i', 'l', 'o']\n6 characters\n2 3",
    }),
  },
  code: {
    label: 'Code exercise',
    width: 520,
    autoMax: 860,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'code',
      dx: 0,
      dy: 0,
      title: 'Finish the character encoder',
      brief: 'The char model maps every character to an id with `stoi`. Complete `encode` so it turns a string into its list of ids.',
      setup: "text = 'hello hi'\nchars = sorted(set(text))\nstoi = { ch: i for i, ch in enumerate(chars) }\nitos = { i: ch for ch, i in stoi.items() }",
      starter: 'def encode(s):\n    # return the list of ids for the characters of s\n    ...',
      checks: "assert encode('hi') == [stoi['h'], stoi['i']], f\"encode('hi') returned {encode('hi')}\"\nassert encode('') == [], 'an empty string should give an empty list'\nprint('encode(\\'hi\\') =', encode('hi'))\nprint('all checks passed')",
      hint: 'encode must return one id per character of s, in order — look each character up in stoi.',
      draft: null,
    }),
  },
  graph: {
    label: 'Interactive graph',
    // Opens at a size the plot is actually usable in; still resizable.
    width: 560,
    height: 520,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'graph',
      dx: 0,
      dy: 0,
      title: 'Sharpen the sigmoid',
      brief: 'Drag $k$ — a bigger slope makes the curve snap toward a step function, and the derivative peak grows.',
      // The existing lesson graph contract (packages/control-plane/src/
      // learn-graph-schema.js): Desmos for live math, Plotly for data traces.
      spec: {
        op: 'interactive_plot', id: 'sigmoid-slope', renderer: 'desmos', concept: 'sigmoid slope',
        parameters: { k: { value: 1, min: 0.2, max: 6, step: 0.1 } },
        expressions: [
          { id: 'sigma', expression: '\\sigma(x)=\\frac{1}{1+e^{-k x}}', label: 'sigma' },
          { id: 'curve', expression: 'y=\\sigma(x)' },
          { id: 'slope', expression: 'y=\\sigma(x)(1-\\sigma(x))' },
        ],
        xAxis: { label: 'x', min: -8, max: 8 },
        yAxis: { label: 'σ(x)', min: -0.2, max: 1.2 },
      },
      state: {},
    }),
  },
  plot: {
    label: 'Data plot',
    width: 560,
    height: 480,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'graph',
      dx: 0,
      dy: 0,
      title: 'Training loss against iterations',
      brief: 'Plotly handles measured data: hover a point, drag to pan, scroll to zoom, click the legend to hide a run.',
      spec: {
        op: 'interactive_plot', id: 'char-loss', renderer: 'plotly', concept: 'training loss',
        traces: [
          { id: 'train', label: 'train', type: 'line', x: [0, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000], y: [4.2, 2.6, 2.1, 1.85, 1.7, 1.55, 1.46, 1.36, 1.3, 1.25] },
          { id: 'val', label: 'val', type: 'line', x: [0, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000], y: [4.2, 2.65, 2.2, 1.95, 1.82, 1.7, 1.63, 1.57, 1.55, 1.54] },
        ],
        xAxis: { label: 'iteration', min: 0, max: 5000 },
        yAxis: { label: 'loss', min: 1, max: 4.4 },
      },
      state: {},
    }),
  },
  flow: {
    label: 'Flow diagram',
    width: 560,
    height: 520,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'flow',
      dx: 0,
      dy: 0,
      title: 'Where a token goes',
      // ELK lays this out; the agent only names nodes, edges and a direction.
      spec: {
        direction: 'DOWN',
        nodes: [
          { id: 'ids', label: 'token ids', detail: '(B, T)', tone: 'input' },
          { id: 'wte', label: 'token embeddings', detail: 'wte', tone: 'step' },
          { id: 'wpe', label: 'position embeddings', detail: 'wpe', tone: 'step' },
          { id: 'sum', label: 'token + position', tone: 'step' },
          { id: 'block', label: 'transformer block', detail: 'x N', tone: 'repeat' },
          { id: 'norm', label: 'final LayerNorm', detail: 'ln_f', tone: 'step' },
          { id: 'head', label: 'LM head', detail: 'lm_head', tone: 'step' },
          { id: 'logits', label: 'logits', detail: 'one score per token', tone: 'output' },
        ],
        edges: [
          { source: 'ids', target: 'wte', label: 'look up' },
          { source: 'ids', target: 'wpe', label: 'index' },
          { source: 'wte', target: 'sum' },
          { source: 'wpe', target: 'sum' },
          { source: 'sum', target: 'block' },
          { source: 'block', target: 'norm', label: 'after the last block' },
          { source: 'norm', target: 'head' },
          { source: 'head', target: 'logits', animated: true },
        ],
      },
    }),
  },
  mermaid: {
    label: 'Mermaid diagram',
    width: 560,
    height: 480,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'mermaid',
      dx: 0,
      dy: 0,
      title: 'One training step',
      code: [
        'sequenceDiagram',
        '  participant D as data',
        '  participant M as model',
        '  participant L as loss',
        '  participant O as optimizer',
        '  D->>M: batch of token ids',
        '  M->>L: logits',
        '  L->>M: gradients',
        '  M->>O: parameters and grads',
        '  O-->>M: updated weights',
      ].join(NEWLINE),
      showSource: false,
    }),
  },
  walkthrough: {
    // First activity on the interaction engine: a registered behaviour plus
    // lesson data. A second dataset below reuses the same behaviour.
    label: 'Walkthrough',
    width: 420,
    height: 460,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'scene',
      dx: 0,
      dy: 0,
      title: 'Walk a token through the model',
      spec: {
        type: 'interactive_scene',
        id: 'token-walkthrough',
        schemaVersion: 1,
        behaviorId: 'walkthrough_v1',
        renderer: 'svg',
        conceptIds: ['token-embeddings', 'transformer-block'],
        initialState: {
          steps: [
            { id: 'ids', label: 'token ids arrive', detail: 'idx (B, T)' },
            { id: 'wte', label: 'each id picks a row', detail: 'wte' },
            { id: 'wpe', label: 'position is added', detail: 'wpe' },
            { id: 'blocks', label: 'blocks mix the vectors', detail: 'h x N' },
            { id: 'head', label: 'the head scores tokens', detail: 'lm_head' },
          ],
        },
        interactions: [
          { input: 'button', label: 'Back', action: 'previous_step' },
          { input: 'button', label: 'Next', action: 'advance_step' },
          { input: 'button', label: 'Reset', action: 'reset_attempt' },
        ],
        execution: { mode: 'illustration' },
        buildGoal: 'Step through the path a token takes and name what changes at each stage.',
        checkGoal: 'Predict what the shape is after the embeddings are added.',
      },
      state: null,
      attempts: 0,
    }),
  },
  vector: {
    label: 'Vector explorer',
    width: 420,
    height: 520,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'scene',
      dx: 0,
      dy: 0,
      title: 'Project one vector onto another',
      spec: {
        type: 'interactive_scene',
        id: 'vector-experiment',
        schemaVersion: 1,
        behaviorId: 'vector_projection_v1',
        renderer: 'svg',
        conceptIds: ['vector-projection', 'dot-product'],
        initialState: { a: [2, 1], b: [1, 0] },
        interactions: [
          { input: 'drag_handle', target: 'a', action: 'set_vector' },
          { input: 'drag_handle', target: 'b', action: 'set_vector' },
          { input: 'number', target: 'a', action: 'set_vector' },
          { input: 'button', label: 'Reset', action: 'reset_attempt' },
        ],
        execution: { mode: 'local_calculation' },
        buildGoal: 'Drag or type the vectors so the projection of a onto b has length 2.',
        checkGoal: 'Explain what happens to the projection when b points the other way.',
      },
      state: null,
      attempts: 0,
    }),
  },
  pipeline: {
    label: 'Pipeline builder',
    width: 460,
    height: 520,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'scene',
      dx: 0,
      dy: 0,
      title: 'Assemble the inference pipeline',
      spec: {
        type: 'interactive_scene',
        id: 'inference-pipeline',
        schemaVersion: 1,
        behaviorId: 'pipeline_assembly_v1',
        renderer: 'dnd',
        conceptIds: ['inference-pipeline'],
        initialState: {
          pieces: [
            { id: 'tokenise', label: 'tokenise the text' },
            { id: 'embed', label: 'look up embeddings' },
            { id: 'blocks', label: 'run the transformer blocks' },
            { id: 'head', label: 'score the vocabulary' },
            { id: 'sample', label: 'sample the next token' },
          ],
          slots: [
            { id: 'step-1', label: 'first', accepts: 'tokenise' },
            { id: 'step-2', label: 'then', accepts: 'embed' },
            { id: 'step-3', label: 'then', accepts: 'blocks' },
            { id: 'step-4', label: 'then', accepts: 'head' },
            { id: 'step-5', label: 'last', accepts: 'sample' },
          ],
        },
        interactions: [
          { input: 'drop_target', action: 'place_item' },
          { input: 'select', action: 'place_item' },
          { input: 'button', label: 'Reset', action: 'reset_attempt' },
        ],
        execution: { mode: 'local_calculation' },
        buildGoal: 'Put the inference steps in the order the model actually runs them.',
        checkGoal: 'Explain why sampling cannot happen before the head scores the vocabulary.',
      },
      state: null,
      attempts: 0,
    }),
  },
  animation: {
    label: 'Animation',
    width: 560,
    height: 460,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'animation',
      dx: 0,
      dy: 0,
      title: 'One token, all the way through',
      // Authored scene JSON. The objects are the things themselves - a table
      // with a row that lights up, a strip of numbers that changes, a
      // distribution that grows - not labelled rectangles sliding around.
      scene: {
        id: 'token-journey',
        title: 'One token, all the way through',
        width: 760,
        height: 400,
        duration: 13,
        objects: [
          { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 26, opacity: 0 } },
          { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'tokenisation', initialState: { label: 'the text, one character per id', x: 40, y: 58, opacity: 0, tokens: ['h', 'e', 'l', 'l', 'o'], color: '#e8590c' } },
          { id: 'table', type: 'grid', semanticId: 'embedding-table', conceptId: 'token-embeddings', initialState: { label: 'wte - 65 x 384 (8 x 8 shown)', x: 40, y: 140, opacity: 0, rows: 8, cols: 8, cell: 26, color: '#2383e2', values: Array.from({ length: 64 }, (unused, index) => Number((Math.sin(index * 1.7) * 1.4).toFixed(2))) } },
          { id: 'vector', type: 'strip', semanticId: 'embedding-row', conceptId: 'token-embeddings', initialState: { label: 'row 42 - this token, as numbers', x: 320, y: 160, opacity: 0, cell: 34, color: '#7c3aed', values: Array.from({ length: 8 }, (unused, index) => Number((Math.sin((24 + index) * 1.7) * 1.4).toFixed(2))) } },
          { id: 'scores', type: 'bars', semanticId: 'next-token-scores', conceptId: 'softmax', initialState: { label: 'a score for every possible next character', x: 320, y: 260, opacity: 0, h: 96, color: '#1a7f37', values: Array.from({ length: 12 }, () => 0), labels: ['a', 'b', 'c', 'd', 'e', 'h', 'i', 'l', 'n', 'o', 's', 't'] } },
        ],
        timeline: [
          { at: 0, action: 'appear', target: 'caption', duration: 0.3 },
          { at: 0.2, action: 'type_text', target: 'caption', value: 'text is only a list of ids', duration: 1.3 },
          { at: 0.6, action: 'appear', target: 'chars', duration: 0.5 },
          // the sweep walks the characters one at a time
          { at: 1.8, action: 'sweep', target: 'chars', duration: 1.2 },
          { at: 3.0, action: 'highlight_cell', target: 'chars', value: 4 },
          { at: 3.1, action: 'change_text', target: 'caption', value: 'follow this one: it is id 42' },
          { at: 3.8, action: 'appear', target: 'table', duration: 0.5 },
          { at: 4.5, action: 'change_text', target: 'caption', value: 'the table holds one learned row per id' },
          // the row the id selects lights up, then leaves as its own numbers
          { at: 5.0, action: 'highlight_cell', target: 'table', value: { row: 3 } },
          { at: 5.6, action: 'appear', target: 'vector', duration: 0.5 },
          { at: 5.8, action: 'change_text', target: 'caption', value: 'that row is the token now - 384 numbers, 8 shown' },
          { at: 6.8, action: 'emphasize', target: 'vector', duration: 0.4 },
          { at: 7.2, action: 'change_text', target: 'caption', value: 'the blocks mix it with every other position' },
          { at: 7.4, action: 'set_values', target: 'vector', duration: 1.5, value: [0.62, -0.18, 1.07, 0.44, -0.95, 0.23, 0.81, -0.36] },
          { at: 9.2, action: 'appear', target: 'scores', duration: 0.4 },
          { at: 9.4, action: 'change_text', target: 'caption', value: 'the head scores every character that could come next' },
          { at: 9.6, action: 'set_values', target: 'scores', duration: 1.5, value: [0.03, 0.02, 0.05, 0.02, 0.09, 0.04, 0.06, 0.42, 0.05, 0.12, 0.04, 0.06] },
          { at: 11.3, action: 'highlight_cell', target: 'scores', value: 'max' },
          { at: 11.5, action: 'change_text', target: 'caption', value: 'the highest score wins: the next character is l' },
        ],
      },
      time: 0,
      selectedObject: null,
      marked: null,
    }),
  },
  whiteboard: {
    label: 'Whiteboard',
    width: 620,
    height: 480,
    autoMax: 1000,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'whiteboard',
      dx: 0,
      dy: 0,
      title: 'The sigmoid, drawn',
      narration: 'The sigmoid takes any score and squashes it into a probability between 0 and 1. At x equals 0 it passes through one half.',
      // Seeded with a drawn lesson so both questions have something to point
      // at: the whole board, or just the part the learner circles.
      demo: 'sigmoid',
      snapshot: null,
    }),
  },
  knowledge: {
    // A generic node-link graph the tutor can emit for any explanation:
    // concepts, processes, dependencies, taxonomies. A repository graph is
    // one shape of it — nodes may cite a source file, or none at all.
    label: 'Graph',
    width: 620,
    height: 520,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'knowledge',
      dx: 0,
      dy: 0,
      title: 'How a sentence becomes a prediction',
      graph: {
        nodes: [
          { id: 'text', label: 'raw text', path: 'input' },
          { id: 'ids', label: 'token ids', path: 'input' },
          { id: 'tok', label: 'token embeddings', path: 'representation' },
          { id: 'pos', label: 'position embeddings', path: 'representation' },
          { id: 'sum', label: 'token + position', path: 'representation' },
          { id: 'attn', label: 'self-attention', path: 'transformer block' },
          { id: 'mlp', label: 'MLP', path: 'transformer block' },
          { id: 'norm', label: 'final LayerNorm', path: 'head' },
          { id: 'logits', label: 'logits', path: 'head' },
          { id: 'next', label: 'next token', path: 'output' },
        ],
        edges: [
          { source: 'text', target: 'ids', relation: 'tokenised into', confidence: 'EXTRACTED' },
          { source: 'ids', target: 'tok', relation: 'looks up', confidence: 'EXTRACTED' },
          { source: 'ids', target: 'pos', relation: 'indexes', confidence: 'EXTRACTED' },
          { source: 'tok', target: 'sum', relation: 'added into', confidence: 'EXTRACTED' },
          { source: 'pos', target: 'sum', relation: 'added into', confidence: 'EXTRACTED' },
          { source: 'sum', target: 'attn', relation: 'flows into', confidence: 'EXTRACTED' },
          { source: 'attn', target: 'mlp', relation: 'then', confidence: 'EXTRACTED' },
          { source: 'mlp', target: 'attn', relation: 'repeats for each block', confidence: 'INFERRED' },
          { source: 'mlp', target: 'norm', relation: 'last block feeds', confidence: 'EXTRACTED' },
          { source: 'norm', target: 'logits', relation: 'scored by lm_head into', confidence: 'EXTRACTED' },
          { source: 'logits', target: 'next', relation: 'sampled as', confidence: 'EXTRACTED' },
        ],
      },
      selected: null,
    }),
  },
  paper: {
    label: 'Paper',
    width: 620,
    height: 560,
    autoMax: 1000,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'paper',
      dx: 0,
      dy: 0,
      title: 'Attention Is All You Need',
      paper: { id: '1706.03762', page: 1 },
    }),
  },
  image: {
    label: 'Image',
    width: 480,
    autoMax: 620,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'image',
      dx: 0,
      dy: 0,
      mode: 'search',
      title: 'Softmax over the vocabulary',
      src: SIGMOID_FIGURE,
      alt: 'The logistic curve rising from 0 to 1 through 0.5 at the origin',
      caption: 'The same S-curve the LM head squashes its scores through. Search Pexels to swap in a photograph.',
    }),
  },
  imageGenerate: {
    label: 'Image generate',
    width: 480,
    autoMax: 680,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'image',
      dx: 0,
      dy: 0,
      mode: 'generate',
      title: 'Illustrate an idea',
      src: '',
      prompt: 'A clean diagram of light entering a glass prism and fanning into a rainbow, flat vector style, dark background',
      caption: 'Generated illustration — not a photograph or a measurement.',
    }),
  },
  video: {
    label: 'Video',
    width: 560,
    autoMax: 620,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'video',
      dx: 0,
      dy: 0,
      mode: 'existing',
      title: 'An existing clip',
      src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/88/Big_Buck_Bunny_alt.webm/Big_Buck_Bunny_alt.webm.360p.vp9.webm',
      caption: 'Any hosted MP4 or WebM plays here; generated clips use the other block.',
    }),
  },
  videoGenerate: {
    label: 'Video generate',
    width: 560,
    autoMax: 680,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'video',
      dx: 0,
      dy: 0,
      mode: 'generate',
      title: 'Light bending through a prism',
      src: '',
      caption: 'Generated footage illustrates a process; it is not a measurement.',
      // generate_video contract (learn-video-schema.js); FAL Seedance renders it.
      operation: {
        op: 'generate_video', id: 'prism-refraction',
        prompt: 'A slow close-up of a white light beam entering a glass prism and fanning into a rainbow on a dark background, studio lighting, macro lens',
        purpose: 'physical_process', duration: 4, aspectRatio: '16:9',
        style: 'clean scientific illustration, dark background',
        caption: 'White light separating into a spectrum through a prism.',
      },
      status: 'idle',
    }),
  },
  model3d: {
    label: '3D model',
    width: 560,
    height: 460,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'model3d',
      dx: 0,
      dy: 0,
      title: 'Orbit a glTF model',
      brief: 'Drag to orbit, scroll to zoom, right-drag to pan. Animation clips come from the file itself.',
      // Khronos sample asset: the same model the 3D viewer is verified against.
      modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb',
      camera: {},
      autoRotate: false,
      animation: { autoplay: true },
      animationTime: 0,
    }),
  },
  scene: {
    label: 'Blender scene',
    width: 560,
    height: 480,
    autoMax: 900,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'scene',
      dx: 0,
      dy: 0,
      title: 'Perspective projection',
      brief: 'Blender compiles this validated scene into a glTF asset; the viewer below is the same three.js renderer.',
      // Exactly the generate_3d_animation contract the Learn Agent emits
      // (packages/control-plane/src/learn-scene-schema.js).
      operation: {
        op: 'generate_3d_animation', id: 'perspective-frustum', concept: 'perspective projection',
        purpose: 'spatial_intuition', output: 'glb', duration: 3,
        caption: 'A camera frustum, a cube inside it, and a ray sweeping across.',
        scene: {
          objects: [
            { id: 'frustum', type: 'camera_frustum', fov: 50, near: 0.4, far: 4, aspect: 1.6, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#2383e2' },
            { id: 'frame', type: 'coordinate_frame', length: 1, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            { id: 'cube', type: 'cube', position: [0, 0, -3], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: '#f59e0b' },
            { id: 'ray', type: 'arrow', start: [0, 0, 0], end: [0, 0, -3], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b42318' },
          ],
          animations: [
            { target: 'ray', type: 'rotate', from: [0, -18, 0], to: [0, 18, 0], start: 0, end: 3 },
            { target: 'cube', type: 'rotate', from: [0, -45, 0], to: [0, 45, 0], start: 0, end: 3 },
          ],
        },
      },
      status: 'idle',
      modelUrl: '',
      camera: {},
      autoRotate: false,
      animation: { autoplay: true },
      animationTime: 0,
    }),
  },
  audio: {
    label: 'Narration',
    width: 460,
    autoMax: 460,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'audio',
      dx: 0,
      dy: 0,
      title: 'Say it out loud',
      text: 'A token id is only an index. The embedding table turns that index into a learned vector, and everything after it works with vectors, never with the number itself.',
    }),
  },
};



// Generation has no real progress signal, so the bar tracks elapsed time
// against a typical duration and stops short of full until the asset lands.
function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const started = performance.now();
    const timer = setInterval(() => setSeconds(Math.round((performance.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

function Progress({ seconds, expected, label }) {
  const percent = Math.min(96, Math.round((seconds / expected) * 100));
  return (
    <div className="w-full">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div data-progress style={{ width: `${percent}%` }} className="h-full rounded-full bg-accent transition-[width] duration-500" />
      </div>
      <p className="mt-1 text-center text-xs text-ink-2">{label} · {seconds}s elapsed{seconds > expected ? ' · nearly there' : ''}</p>
    </div>
  );
}

function Kicker({ author = 'course', action = null, children }) {
  return (
    <div data-drag-zone className="-mx-4 -mt-3 mb-2 flex cursor-grab items-center justify-between px-4 pt-3 pb-1 active:cursor-grabbing">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{children}</span>
      <span className="flex items-center gap-1">
        {action}
        <span className="rounded-full bg-ink px-2 py-px text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">{author}</span>
      </span>
    </div>
  );
}

function ChallengeBody({ block, onChange, onFile, onGrade, appName }) {
  const [draft, setDraft] = useState('');
  const latest = useRef(block);
  latest.current = block;
  const commit = async () => {
    const answer = draft.trim();
    if (!answer) return;
    const committed = { ...block, answer, verdict: '', grading: !!onGrade };
    onChange(committed);
    if (!onGrade) return;
    // The tutor reads the challenge, the expected ideas and this answer, then
    // streams a short verdict back into the block.
    try {
      await onGrade(committed, answer, delta => {
        const current = latest.current;
        onChange({ ...current, verdict: (current.verdict || '') + delta, grading: true });
      });
      onChange({ ...latest.current, grading: false });
    } catch (error) {
      onChange({ ...latest.current, grading: false, verdict: `Could not reach the tutor: ${error.message}` });
    }
  };
  const retry = () => { setDraft(block.answer || ''); onChange({ ...block, answer: null, verdict: '', grading: false }); };
  // The tutor opens with "VERDICT: good|partial"; it tints the answer and is
  // stripped from what the learner reads.
  const token = (block.verdict || '').match(/VERDICT:\s*(good|partial)/i);
  const grade = token ? token[1].toLowerCase() : null;
  const verdictText = (block.verdict || '').replace(/VERDICT:\s*(good|partial)\s*/i, '').trim();
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>{block.mode === 'explain_back' ? 'Explain back' : 'Challenge'}</Kicker>
      <div className="text-sm"><Md text={block.prompt} onFile={onFile} /></div>
      {!block.answer ? (
        <div onPointerDown={e => e.stopPropagation()}>
          <p className="mt-1 text-xs text-ink-2 italic">{block.hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SpeakAnswer appName={appName} onText={text => setDraft(current => (current ? `${current} ${text}` : text))} />
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); }}
              placeholder={block.mode === 'explain_back' ? 'Explain it in your own words…' : 'Your guess in one sentence…'} className="h-8 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-ink-3" />
            <button type="button" disabled={!draft.trim()} onClick={commit}
              className="h-8 shrink-0 rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-40">{block.mode === 'explain_back' ? 'Submit' : 'Commit'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 flex justify-end"><span data-answer data-grade={grade || 'pending'} className={`max-w-[85%] rounded-xl border px-3 py-1.5 text-sm whitespace-pre-wrap ${grade === 'good' ? 'border-green-700/30 bg-green-700/10 text-green-800' : grade === 'partial' ? 'border-amber-600/40 bg-amber-500/10 text-amber-800' : 'border-line bg-hover text-ink'}`}>{block.answer}</span></div>
          {(verdictText || block.grading) && (
            <div data-verdict className="mt-3 border-t border-line pt-3 text-sm">
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">{block.mode === 'explain_back' ? 'Understanding evidence' : 'Tutor'}</p>
              {verdictText ? <Md text={verdictText} onFile={onFile} /> : <p className="text-ink-2 italic">Reading your answer…</p>}
            </div>
          )}
          {block.reveal && <div className="mt-3 border-t border-line pt-3 text-sm"><Md text={block.reveal} onFile={onFile} /></div>}
          <div className="mt-2 flex justify-end" onPointerDown={e => e.stopPropagation()}>
            <button type="button" data-challenge-retry onClick={retry} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-hover hover:text-ink">{block.mode === 'explain_back' ? 'Explain again' : 'Answer again'}</button>
          </div>
        </>
      )}
    </div>
  );
}

function QuizBody({ block, onChange, onFile }) {
  const chosen = block.options.find(option => option.key === block.choice);
  const solved = !!chosen?.correct;
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker author="tutor" action={block.choice && (
        <button type="button" aria-label="Reset quiz" title="Try again from scratch"
          onPointerDown={e => e.stopPropagation()} onClick={() => onChange({ ...block, choice: null })}
          className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><RotateCcw size={13} /></button>
      )}>Check yourself</Kicker>
      <div className="text-sm"><Md text={block.question} /></div>
      <div className="mt-2" onPointerDown={e => solved || e.stopPropagation()}>
        {block.options.map(option => {
          const state = block.choice === option.key ? (option.correct ? 'right' : 'wrong') : null;
          return (
            <button key={option.key} type="button" data-quiz-option={option.key} disabled={solved}
              onClick={() => onChange({ ...block, choice: option.key })}
              className={`mt-1.5 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${state === 'right' ? 'border-green-700 bg-green-700/5' : state === 'wrong' ? 'border-red-700 bg-red-700/5' : 'border-line bg-white hover:bg-hover'} ${solved && !state ? 'opacity-50' : ''}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold ${state === 'right' ? 'border-green-700 text-green-700' : state === 'wrong' ? 'border-red-700 text-red-700' : 'border-line text-ink-2'}`}>{option.key}</span>
              <span className="min-w-0"><Md text={option.text} /></span>
            </button>
          );
        })}
      </div>
      {block.choice && !solved && <p className="mt-2 text-xs text-red-700">Not quite — look at where the exponential ends up, and try again.</p>}
      {solved && <div className="mt-2 border-t border-line pt-2 text-sm text-ink-2"><span className="mr-1 font-medium text-green-700">✓ Right.</span><Md text={block.why} onFile={onFile} /></div>}
    </div>
  );
}

// The lesson paper reader, embedded as a canvas block: page navigation and
// the red region-select both come from the existing LearnPaper component.
function PaperBody({ block, appName, onChange, onAskRegion }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-2" onPointerDown={event => event.stopPropagation()}>
      <LearnPaper app={appName} paper={block.paper} selectRequest={block.selectRequest || 0}
        onPage={page => onChange({ ...block, paper: { ...block.paper, page, selection: undefined } })}
        onSelect={selection => {
          // The marked region stays drawn on the page after asking, until it
          // is cleared from the toolbar, the header pill or with Esc.
          if (!selection) { onChange({ ...block, paper: { ...block.paper, selection: undefined } }); return; }
          const next = { ...block, paper: { ...block.paper, selection: { region: selection.region } } };
          onChange(next);
          onAskRegion?.(next, selection);
        }} />
    </div>
  );
}

// Narration through the lesson text-to-speech endpoint (the same pinned
// product narrator the lesson clips use).
function AudioBody({ block, appName, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [src, setSrc] = useState('');
  const [spoken, setSpoken] = useState(''); // text the current clip was made from
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const speak = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/learn/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ app: appName, text: block.text }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      setSrc(URL.createObjectURL(await response.blob()));
      setSpoken(block.text);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  // The player owns replay; this button only exists to make a clip that does
  // not exist yet, or to redo one after the narration text changed.
  const stale = src && spoken !== block.text;
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Narration</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <textarea value={block.text} rows={4} spellCheck={false}
        onPointerDown={event => event.stopPropagation()}
        onChange={event => onChange({ ...block, text: event.target.value })}
        className="mt-2 w-full resize-y rounded-lg border border-line p-2 text-sm outline-none focus:border-ink-3" />
      <div className="mt-2 flex items-center gap-2" onPointerDown={event => event.stopPropagation()}>
        {(!src || stale) && (
          <button type="button" data-speak disabled={busy || !block.text.trim()} onClick={speak}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}{stale ? 'Read the new text' : 'Read it aloud'}
          </button>
        )}
        {busy && <span className="text-xs text-ink-2">Making the audio…</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
      {src && <audio data-narration src={src} controls autoPlay onPointerDown={event => event.stopPropagation()} className="mt-2 w-full" />}
    </div>
  );
}

// An activity from the interaction engine: validated spec, registered
// behaviour, semantic actions. The block only stores committed state.
function SceneActivityBody({ block, onChange, onAskScene }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>Activity</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {block.spec.buildGoal && <p data-drag-zone className="mt-0.5 mb-2 cursor-grab text-xs text-ink-2 active:cursor-grabbing">{block.spec.buildGoal}</p>}
      <InteractiveScene block={block} onChange={onChange} />
    </div>
  );
}

// A tldraw board in a block: the learner draws with tldraw's own tools and a
// selection can be sent to the tutor with a picture of what was selected.
function WhiteboardBody({ block, appName, onChange, onAskSelection }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker author="learner">Whiteboard</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<p className="p-4 text-xs text-ink-2">Loading the board…</p>}>
          <WhiteboardBlock block={block} appName={appName} onChange={onChange} onAskSelection={onAskSelection} />
        </Suspense>
      </div>
    </div>
  );
}

// A short animation from scene JSON: deterministic playback the learner can
// pause, scrub and ask about without the scene ever changing.
function AnimationBody({ block, onChange, onAskAnimation }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>Animation</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <AnimatedScene block={block} onChange={onChange} onAskRegion={onAskAnimation} />
      </div>
    </div>
  );
}

// A laid-out diagram: React Flow draws it, ELK positions it.
function FlowBody({ block }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>Diagram</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div data-flow className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-line"
        onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <FlowDiagram spec={block.spec} />
      </div>
    </div>
  );
}

// A text-authored diagram: mermaid renders it, Shiki themes its source.
function MermaidBody({ block, onChange }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker action={
        <button type="button" data-toggle-source title="Show the mermaid source"
          onPointerDown={event => event.stopPropagation()} onClick={() => onChange({ ...block, showSource: !block.showSource })}
          className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><Code size={13} /></button>
      }>Diagram</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border border-line p-2"
        onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <MermaidDiagram code={block.code} />
      </div>
      {block.showSource && <div className="mt-2 shrink-0" onPointerDown={event => event.stopPropagation()}><MermaidSource code={block.code} /></div>}
    </div>
  );
}

// The repository graph component, embedded as a lesson block: drag nodes,
// scroll to zoom, double-click to expand a node's one-hop neighbourhood.
function KnowledgeBody({ block, onChange, onFile }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>Graph</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <RepositoryGraph graph={block.graph} query="" external={false} selected={block.selected}
          onSelect={node => onChange({ ...block, selected: node })} />
      </div>
      {block.selected && (
        <p className="mt-1.5 truncate text-xs text-ink-2">
          {block.selected.label}
          {block.selected.path && onFile && <> · <button type="button" onClick={() => onFile(block.selected.path, block.selected.line, block.selected.line)} className="underline">{block.selected.path}:{block.selected.line}</button></>}
        </p>
      )}
    </div>
  );
}

// A Blender-generated scene: post the validated spec, poll the durable job,
// then hand the exported GLB to the same three.js viewer.
function SceneBody({ block, appName, onChange }) {
  const [error, setError] = useState('');
  const elapsed = useElapsed(block.status === 'queued' || block.status === 'rendering');
  const polling = useRef(null);
  useEffect(() => () => clearTimeout(polling.current), []);
  const follow = async () => {
    try {
      const list = await sceneList(appName);
      const mine = list.scenes?.find(scene => scene.operation?.id === block.operation.id);
      if (!mine) return;
      if (mine.status === 'ready') { onChange({ ...block, status: 'ready', modelUrl: sceneAssetUrl(appName, mine.key) }); return; }
      if (mine.status === 'failed') { setError(mine.error || 'Blender could not build this scene.'); onChange({ ...block, status: 'failed' }); return; }
      onChange({ ...block, status: mine.status });
      polling.current = setTimeout(follow, 5000);
    } catch (problem) { setError(problem.message); }
  };
  const generate = async () => {
    setError('');
    onChange({ ...block, status: 'queued' });
    try {
      await startScene(appName, block.operation);
      follow();
    } catch (problem) { setError(problem.message); onChange({ ...block, status: 'failed' }); }
  };
  if (block.status === 'ready' && block.modelUrl) return <ThreeDBody block={block} onChange={onChange} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>Blender scene</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div data-drag-zone className="mt-1 cursor-grab text-sm text-ink-2 active:cursor-grabbing"><Md text={block.brief} /></div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-hover p-4 text-center" onPointerDown={event => event.stopPropagation()}>
        <p className="text-xs text-ink-2">{block.operation.scene.objects.length} objects · {block.operation.scene.animations?.length || 0} animations · {block.operation.duration || 3}s</p>
        {block.status === 'idle' || block.status === 'failed' ? (
          <button type="button" data-generate-scene onClick={generate} className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-white">
            <Play size={14} />{block.status === 'failed' ? 'Retry scene' : 'Build the scene'}
          </button>
        ) : (
          <Progress seconds={elapsed} expected={120} label={block.status === 'rendering' ? 'Blender is rendering' : 'Queued for Blender'} />
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}

// Interactive glTF on the canvas, sharing the lesson three.js renderer.
function ThreeDBody({ block, onChange }) {
  const host = useRef(null);
  const engine = useRef(null);
  const [clips, setClips] = useState([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(block);
  latest.current = block;
  useEffect(() => {
    let disposed = false, instance;
    setError('');
    import('./three-d-renderer.js').then(({ createThreeDRenderer }) => {
      if (disposed) return;
      const current = latest.current;
      const props = { w: 0, h: 0, modelUrl: current.modelUrl, camera: current.camera || {}, animation: current.animation || { autoplay: false }, animationTime: current.animationTime || 0, autoRotate: !!current.autoRotate };
      instance = createThreeDRenderer(host.current, props, patch => onChange({ ...latest.current, ...patch }), setClips, setError);
      engine.current = instance;
      instance.interact(true); // the canvas node owns focus, so orbit is always live
    }).catch(problem => { if (!disposed) setError(problem.message); });
    return () => { disposed = true; instance?.destroy(); engine.current = null; };
  }, [block.id, block.modelUrl, attempt]);
  // Play/pause, clip choice and auto-rotate live in block state: push every
  // change into the renderer, the way the tldraw viewer does.
  useEffect(() => {
    engine.current?.update({ w: 0, h: 0, modelUrl: block.modelUrl, camera: block.camera || {}, animation: block.animation || { autoplay: false }, animationTime: block.animationTime || 0, autoRotate: !!block.autoRotate });
  }, [block.modelUrl, block.camera, block.animation, block.animationTime, block.autoRotate]);
  const playing = block.animation?.autoplay;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
      <Kicker>3D model</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {block.brief && <div data-drag-zone className="mt-1 cursor-grab text-sm text-ink-2 active:cursor-grabbing"><Md text={block.brief} /></div>}
      <div className="relative mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-[#f4f5f7]" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <div ref={host} className="h-full w-full" />
        {error && <div className="absolute inset-0 grid place-content-center bg-white p-4 text-center text-xs text-ink-2">{error}
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-ink hover:bg-hover">Retry model</button></div>}
      </div>
      {!!clips.length && <div className="mt-2 flex items-center gap-2 text-xs" onPointerDown={event => event.stopPropagation()}>
        <button type="button" onClick={() => onChange({ ...block, animation: { ...block.animation, autoplay: !playing } })}
          className="rounded-lg border border-line px-2.5 py-1 hover:bg-hover">{playing ? 'Pause animation' : 'Play animation'}</button>
        {clips.length > 1 && <select aria-label="Animation clip" value={block.animation?.clipName || clips[0]}
          onChange={event => onChange({ ...block, animation: { ...block.animation, clipName: event.target.value }, animationTime: 0 })}
          className="rounded-lg border border-line px-2 py-1">{clips.map((name, index) => <option key={index} value={name}>{name || `Clip ${index + 1}`}</option>)}</select>}
        <label className="ml-auto flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={!!block.autoRotate} onChange={event => onChange({ ...block, autoRotate: event.target.checked })} />auto-rotate
        </label>
      </div>}
    </div>
  );
}

function ImageBody({ block, appName, onChange, onFile }) {
  const [query, setQuery] = useState(block.prompt || '');
  // Every generated or chosen picture is kept as a variant so the learner (or
  // the agent) can step back through them. Generated bytes live in the asset
  // cache, so only the prompt travels in canvas storage.
  const variants = block.variants?.length ? block.variants : (block.src ? [{ src: block.src, alt: block.alt, credit: block.credit }] : []);
  const index = Math.max(0, Math.min(block.variant ?? variants.length - 1, variants.length - 1));
  const current = variants[index];
  const [resolved, setResolved] = useState(current?.src || '');
  useEffect(() => {
    let live = true;
    if (current?.src) { setResolved(current.src); return; }
    if (!current?.cacheKey) { setResolved(''); return; }
    cachedAsset(current.cacheKey).then(value => { if (live) setResolved(value || ''); });
    return () => { live = false; };
  }, [current?.src, current?.cacheKey]);
  const step = direction => onChange({ ...block, variant: (index + direction + variants.length) % variants.length });
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const elapsed = useElapsed(busy);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError(''); setResults(null);
    try {
      const found = await api(`/api/learn/photos?app=${encodeURIComponent(appName)}&query=${encodeURIComponent(query.trim())}`);
      setResults(found.photos || []);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  const choose = photo => {
    setResults(null);
    const entry = { src: photo.src, alt: photo.alt, credit: { photographer: photo.photographer, url: photo.url } };
    onChange({ ...block, ...entry, variants: [...variants, entry], variant: variants.length });
  };
  const generate = async () => {
    const prompt = (query.trim() || block.prompt || '').trim();
    if (!prompt) return;
    setBusy(true); setError(''); setResults(null);
    try {
      const key = `image:${prompt}`;
      const cached = await cachedAsset(key);
      const image = cached || (await api('/api/learn/image', { method: 'POST', body: JSON.stringify({ app: appName, prompt }) })).image;
      if (!cached) cacheAsset(key, image);
      const entry = { cacheKey: key, prompt, alt: prompt, credit: { photographer: 'generated illustration', url: '' } };
      const kept = variants.some(variant => variant.cacheKey === key) ? variants : [...variants, entry];
      onChange({ ...block, src: '', prompt, alt: prompt, credit: entry.credit, variants: kept, variant: kept.findIndex(variant => variant.cacheKey === key) });
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Image</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {resolved
        ? <img src={resolved} alt={current?.alt || block.alt || block.title} className="mt-2 w-full rounded-lg border border-line bg-white object-contain" />
        : <div className="mt-2 grid min-h-28 place-content-center rounded-lg border border-dashed border-line bg-hover p-4 text-center text-xs text-ink-2">{busy ? 'Working...' : current ? 'This picture is no longer cached - generate it again.' : 'Search for a photo or describe one to generate.'}</div>}
      {variants.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between" onPointerDown={event => event.stopPropagation()}>
          <button type="button" aria-label="Previous picture" onClick={() => step(-1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronLeft size={15} /></button>
          <span className="text-xs tabular-nums text-ink-2">{index + 1} / {variants.length}</span>
          <button type="button" aria-label="Next picture" onClick={() => step(1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronRight size={15} /></button>
        </div>
      )}
      {block.caption && <div className="mt-1.5 text-xs text-ink-2"><Md text={block.caption} onFile={onFile} /></div>}
      {current?.credit && (current.credit.url
        ? <p className="mt-1 text-[11px] text-ink-3">Photo by <a href={current.credit.url} target="_blank" rel="noreferrer" className="underline">{current.credit.photographer}</a> on Pexels</p>
        : <p className="mt-1 text-[11px] text-ink-3">Generated illustration — not a photograph or measurement.</p>)}
      <div className="mt-2 flex gap-2" onPointerDown={event => event.stopPropagation()}>
        <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') search(); }}
          placeholder="Search or describe an image…" className="h-8 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-ink-3" />
        <button type="button" data-photo-search disabled={busy || !query.trim()} onClick={search}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Find
        </button>
        <button type="button" data-image-generate disabled={busy || !query.trim()} onClick={generate} title="Generate an illustration instead of searching"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white disabled:opacity-40">
          <Sparkles size={14} />Generate
        </button>
      </div>
      {busy && <div className="mt-2"><Progress seconds={elapsed} expected={25} label="Working" /></div>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {results && (results.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2" onPointerDown={event => event.stopPropagation()}>
          {results.map(photo => (
            <button key={photo.id} type="button" data-photo-result onClick={() => choose(photo)} className="overflow-hidden rounded-lg border border-line hover:border-ink-3">
              <img src={photo.src} alt={photo.alt} className="h-20 w-full object-cover" />
            </button>
          ))}
        </div>
      ) : <p className="mt-1 text-xs text-ink-2">No photos matched that search.</p>)}
    </div>
  );
}

// Either an existing clip (src) or one generated by FAL through the durable
// video job the tldraw canvas already uses.
function VideoBody({ block, appName, onChange, onFile }) {
  const [error, setError] = useState('');
  const elapsed = useElapsed(block.status === 'generating' || block.status === 'queued');
  const polling = useRef(null);
  useEffect(() => () => clearTimeout(polling.current), []);
  const follow = async () => {
    try {
      const list = await videoList(appName);
      const mine = list.videos?.find(video => video.operation?.id === block.operation?.id);
      if (!mine) return;
      if (mine.status === 'ready') {
        const src = videoAssetUrl(appName, mine.key);
        const existing = block.variants?.length ? block.variants : (block.src ? [{ src: block.src }] : []);
        const kept = existing.some(clip => clip.src === src) ? existing : [...existing, { src, prompt: block.operation?.prompt }];
        onChange({ ...block, status: 'ready', src, variants: kept, variant: kept.findIndex(clip => clip.src === src) });
        return;
      }
      if (mine.status === 'failed') { setError(mine.error || 'The provider could not generate this clip.'); onChange({ ...block, status: 'failed' }); return; }
      onChange({ ...block, status: mine.status });
      polling.current = setTimeout(follow, 5000);
    } catch (problem) { setError(problem.message); }
  };
  const generate = async () => {
    setError('');
    onChange({ ...block, status: 'generating' });
    try { await startVideo(appName, block.operation); follow(); }
    catch (problem) { setError(problem.message); onChange({ ...block, status: 'failed' }); }
  };
  const pending = block.status === 'generating' || block.status === 'queued';
  const clips = block.variants?.length ? block.variants : (block.src ? [{ src: block.src }] : []);
  const position = Math.max(0, Math.min(block.variant ?? clips.length - 1, clips.length - 1));
  const shown = clips[position]?.src || '';
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Video</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {shown
        ? <>
            <video data-lesson-video src={shown} controls preload="metadata" onPointerDown={event => event.stopPropagation()}
              className="mt-2 w-full rounded-lg border border-line bg-black" />
            {clips.length > 1 && (
              <div className="mt-1.5 flex items-center justify-between" onPointerDown={event => event.stopPropagation()}>
                <button type="button" aria-label="Previous clip" onClick={() => onChange({ ...block, variant: (position - 1 + clips.length) % clips.length })} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronLeft size={15} /></button>
                <span className="text-xs tabular-nums text-ink-2">{position + 1} / {clips.length}</span>
                <button type="button" aria-label="Next clip" onClick={() => onChange({ ...block, variant: (position + 1) % clips.length })} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronRight size={15} /></button>
              </div>
            )}
          </>
        : <div className="mt-2 flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-hover p-4 text-center" onPointerDown={event => event.stopPropagation()}>
            <p className="text-xs text-ink-2">{block.operation?.duration || 4}s · {block.operation?.aspectRatio || '16:9'} · {block.operation?.purpose?.replace('_', ' ')}</p>
            {pending
              ? <Progress seconds={elapsed} expected={180} label="Generating the clip" />
              : <button type="button" data-generate-video onClick={generate} className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-white"><Play size={14} />{block.status === 'failed' ? 'Retry video' : 'Generate the video'}</button>}
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>}
      {block.caption && <div className="mt-1.5 text-xs text-ink-2"><Md text={block.caption} onFile={onFile} /></div>}
    </div>
  );
}

function TableBody({ block, onFile }) {
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Table</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {block.caption && <div data-drag-zone className="mt-1 cursor-grab text-xs text-ink-2 active:cursor-grabbing"><Md text={block.caption} onFile={onFile} /></div>}
      <div className="mt-2 overflow-x-auto">
        <table data-lesson-table className="w-full border-collapse text-left text-xs">
          <thead><tr>{block.columns.map((column, index) => (
            <th key={index} className="sticky top-0 border-b border-line bg-white px-2 py-1.5 font-semibold whitespace-nowrap"><Md text={column} onFile={onFile} /></th>
          ))}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-hover">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-line px-2 py-1.5 align-top whitespace-nowrap"><Md text={cell} onFile={onFile} /></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ExplanationBody({ block, onFile }) {
  const [open, setOpen] = useState({});
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Explanation</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div className="mt-1 text-sm"><Md text={block.body} onFile={onFile} /></div>
      {(block.more || []).map((section, index) => (
        <div key={index} className="mt-2 border-t border-line pt-2">
          <button type="button" data-explain-more onPointerDown={e => e.stopPropagation()}
            onClick={() => setOpen(previous => ({ ...previous, [index]: !previous[index] }))}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-ink-2 hover:text-ink">
            {section.label}
            <ChevronRight size={13} className={open[index] ? 'rotate-90 transition-transform' : 'transition-transform'} />
          </button>
          {open[index] && <div className="mt-1.5 text-sm text-ink-2"><Md text={section.text} onFile={onFile} /></div>}
        </div>
      ))}
    </div>
  );
}

function GraphBody({ block, appName, onChange }) {
  const host = useRef(null);
  const engine = useRef(null);
  const own = useRef('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false, instance;
    setError('');
    const change = patch => {
      if (disposed) return;
      const state = { ...block.state, ...patch, ...(patch.parameters ? { parameters: { ...block.state.parameters, ...patch.parameters } } : {}) };
      const encoded = JSON.stringify(state);
      if (encoded === own.current) return;
      own.current = encoded;
      onChange({ ...block, state });
    };
    (async () => {
      validateGraph(block.spec);
      instance = await graphRenderers[block.spec.renderer](host.current, block.spec, block.state || {}, appName, change);
      if (disposed) { instance.destroy(); return; }
      engine.current = instance;
      own.current = JSON.stringify(block.state || {});
      instance.resize();
    })().catch(problem => { if (!disposed) setError(problem.message); });
    return () => { disposed = true; instance?.destroy(); engine.current = null; };
  }, [block.id, attempt, appName]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const observer = new ResizeObserver(() => { if (engine.current) Promise.resolve(engine.current.resize()).catch(() => {}); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stop = event => event.stopPropagation();
  return (
    <div data-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
      <Kicker>Interactive graph</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {block.brief && <div data-drag-zone className="mt-1 mb-2 cursor-grab text-sm text-ink-2 active:cursor-grabbing"><Md text={block.brief} /></div>}
      <div data-graph className="relative min-h-[260px] flex-1 overflow-hidden rounded-lg border border-line"
        onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onWheel={stop} onKeyDown={stop}>
        <div ref={host} className="h-full w-full" />
        {error && <div className="absolute inset-0 grid place-content-center bg-white p-4 text-center text-xs text-ink-2">
          {error}
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-ink hover:bg-hover">Retry graph</button>
        </div>}
      </div>
    </div>
  );
}

function SnippetBody({ block, onFile }) {
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Code</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      {block.brief && <div data-drag-zone className="mt-1 cursor-grab text-sm text-ink-2 active:cursor-grabbing"><Md text={block.brief} onFile={onFile} /></div>}
      <CodeBlock className="mt-2 text-xs">{block.code.split('\n').map((line, index) => <div key={index}>{colorLine(line)}</div>)}</CodeBlock>
      {block.output && <>
        <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Output</p>
        <pre className="no-scrollbar mt-1 max-h-40 overflow-y-auto rounded-lg border border-line bg-white p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">{block.output}</pre>
      </>}
    </div>
  );
}

function CodeBody({ block, onChange, onFile }) {
  const [draft, setDraft] = useState(block.draft ?? block.starter);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null); // null | 'starting' | { ok, output, error }
  const execute = async () => {
    setBusy(true);
    setRun('starting');
    const result = await runPython(`${block.setup}\n\n${draft}\n\n${block.checks}`);
    setRun(result);
    setBusy(false);
  };
  const reset = () => { setDraft(block.starter); setRun(null); onChange({ ...block, draft: null }); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker action={draft !== block.starter && (
        <button type="button" aria-label="Reset code" title="Restore the starter code"
          onPointerDown={e => e.stopPropagation()} onClick={reset}
          className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><RotateCcw size={13} /></button>
      )}>Code</Kicker>
      <p data-drag-zone className="cursor-grab text-sm font-medium active:cursor-grabbing">{block.title}</p>
      <div data-drag-zone className="mt-1 cursor-grab text-sm text-ink-2 active:cursor-grabbing"><Md text={block.brief} onFile={onFile} /></div>
      <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Given</p>
      <CodeBlock className="mt-1 text-xs">{block.setup.split('\n').map((line, index) => <div key={index}>{colorLine(line)}</div>)}</CodeBlock>
      <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Your code</p>
      <textarea data-code-editor value={draft} spellCheck={false} rows={Math.max(4, draft.split('\n').length + 1)}
        onPointerDown={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onChange({ ...block, draft })}
        className="mt-1 w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-5 outline-none focus:border-ink-3" />
      <div className="mt-2 flex items-center gap-2" onPointerDown={e => e.stopPropagation()}>
        <button type="button" data-run-code disabled={busy} onClick={execute}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{run === 'starting' ? 'Starting Python…' : 'Run checks'}
        </button>
        {run && run !== 'starting' && (run.ok
          ? <span className="text-sm font-medium text-green-700">✓ All checks passed</span>
          : <span className="text-sm font-medium text-red-700">✗ Not yet</span>)}
      </div>
      {run && run !== 'starting' && !run.ok && (
        <div className="mt-2 rounded-lg border border-red-700/25 bg-red-700/5 p-2 text-xs">
          <p><span className="font-medium text-red-700">Why it failed:</span> {(run.error || 'A check did not pass.').split('\n').filter(Boolean).pop()}</p>
          {block.hint && <p className="mt-1 text-ink"><span className="font-medium">Hint:</span> {block.hint}</p>}
        </div>
      )}
      {run && run !== 'starting' && run.output && (
        <pre className="no-scrollbar mt-2 max-h-32 overflow-y-auto rounded-lg border border-line bg-white p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">{run.output}</pre>
      )}
    </div>
  );
}

function FlashcardsBody({ block, onChange }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = block.cards[index];
  const marks = block.marks || {}; // per-card self-assessment feeding the adaptive engine
  const go = step => { setFlipped(false); setIndex(previous => (previous + step + block.cards.length) % block.cards.length); };
  const mark = result => { onChange({ ...block, marks: { ...marks, [index]: result } }); go(1); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker author="tutor">Flashcards</Kicker>
      <button type="button" data-flashcard aria-label={flipped ? 'Show front' : 'Show back'} style={{ perspective: 900 }}
        onPointerDown={e => e.stopPropagation()} onClick={() => setFlipped(previous => !previous)} className="block w-full">
        <span style={{ transformStyle: 'preserve-3d', transition: 'transform .4s ease', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }} className="relative block h-32 w-full motion-reduce:transition-none">
          <span style={{ backfaceVisibility: 'hidden' }} className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-lg border border-line bg-white px-5 py-4 text-center text-sm hover:bg-hover"><Md text={card.front} /></span>
          <span style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-lg border border-line bg-hover px-5 py-4 text-center text-sm"><Md text={card.back} /></span>
        </span>
      </button>
      {flipped && (
        <div className="mt-2 flex justify-center gap-2" onPointerDown={e => e.stopPropagation()}>
          <button type="button" data-flash-knew onClick={() => mark('right')}
            className="flex items-center gap-1.5 rounded-lg border border-green-700 px-3 py-1.5 text-sm text-green-700 hover:bg-green-700/5"><Check size={14} />Got it</button>
          <button type="button" data-flash-missed onClick={() => mark('wrong')}
            className="flex items-center gap-1.5 rounded-lg border border-red-700 px-3 py-1.5 text-sm text-red-700 hover:bg-red-700/5"><X size={14} />Not yet</button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between" onPointerDown={e => e.stopPropagation()}>
        <button type="button" aria-label="Previous card" onClick={() => go(-1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronLeft size={15} /></button>
        <span className="flex items-center gap-2 text-xs tabular-nums text-ink-2">
          {index + 1} / {block.cards.length}
          <span className="flex gap-1">{block.cards.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${marks[i] === 'right' ? 'bg-green-600' : marks[i] === 'wrong' ? 'bg-red-600' : 'bg-line'} ${i === index ? 'ring-2 ring-line' : ''}`} />)}</span>
          · flip, then rate yourself
        </span>
        <button type="button" aria-label="Next card" onClick={() => go(1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

const NEWLINE = String.fromCharCode(10);

// Serialize a block for the tutor prompt when the learner asks about it.
export function describeBlock(block) {
  if (block.type === 'code') return { kind: 'Code exercise', title: block.title, text: `Code exercise: ${block.title}\n${block.brief}\nGiven setup:\n${block.setup}\nLearner's current code:\n${block.draft ?? block.starter}\nChecks it must pass:\n${block.checks}` };
  if (block.type === 'audio') return { kind: 'Narration', title: block.title, text: [`Narration block: ${block.title}`, block.text].join(NEWLINE) };
  if (block.type === 'whiteboard') return { kind: 'Whiteboard', title: block.title, text: `Learner whiteboard: ${block.title}` };
  if (block.type === 'animation') return { kind: 'Animation', title: block.title, text: [`Animation: ${block.title} (${block.scene.duration}s)`, `Paused at: ${(block.time ?? 0).toFixed(1)}s`, block.selectedObject ? `Selected object: ${block.selectedObject}` : '', `State at that moment: ${JSON.stringify(getSceneState(block.scene, block.time ?? 0).objects.filter(object => object.visible).map(object => ({ id: object.semanticId, highlighted: object.highlighted })))}`].join(NEWLINE) };
  if (block.type === 'flow') return { kind: 'Diagram', title: block.title, text: [`Laid-out diagram: ${block.title}`, `Nodes: ${block.spec.nodes.map(node => node.label).join(', ')}`, `Edges: ${block.spec.edges.map(edge => `${edge.source} -> ${edge.target}${edge.label ? ` (${edge.label})` : ''}`).join('; ')}`].join(NEWLINE) };
  if (block.type === 'mermaid') return { kind: 'Diagram', title: block.title, text: [`Mermaid diagram: ${block.title}`, block.code].join(NEWLINE) };
  if (block.type === 'knowledge') return { kind: 'Graph', title: block.title, text: [`Knowledge graph: ${block.title}`, `Nodes: ${block.graph.nodes.map(node => node.label).join(', ')}`, `Edges: ${block.graph.edges.map(edge => `${edge.source} ${edge.relation} ${edge.target}`).join('; ')}`, block.selected ? `Learner selected: ${block.selected.label}` : ''].join(NEWLINE) };
  if (block.type === 'scene' && block.spec?.type === 'interactive_scene') return { kind: 'Activity', title: block.title, text: [`Interactive activity: ${block.title}`, `Behaviour: ${block.spec.behaviorId} (${block.spec.execution.mode})`, block.spec.buildGoal ? `Build goal: ${block.spec.buildGoal}` : '', block.spec.checkGoal ? `Check goal: ${block.spec.checkGoal}` : '', block.selectedObject ? `Learner selected: ${block.selectedObject}` : '', `Activity state: ${JSON.stringify(sceneSummary(block))}`].join(NEWLINE) };
  if (block.type === 'scene') return { kind: 'Blender scene', title: block.title, text: [`Generated 3D scene: ${block.title}`, block.brief || '', `Status: ${block.status}`, `Scene specification: ${JSON.stringify(block.operation)}`].join(NEWLINE) };
  if (block.type === 'model3d') return { kind: '3D model', title: block.title, text: [`3D model on the canvas: ${block.title}`, block.brief || '', `Model file: ${block.modelUrl}`, `Animation: ${block.animation?.autoplay ? 'playing' : 'paused'}${block.animation?.clipName ? ` (${block.animation.clipName})` : ''}`].join(NEWLINE) };
  if (block.type === 'image') return { kind: 'Image', title: block.title, text: [`Image on the canvas: ${block.title}`, block.alt || '', block.caption || '', `Source: ${block.src}`].join(NEWLINE) };
  if (block.type === 'video') return { kind: 'Video', title: block.title, text: [`Video on the canvas: ${block.title}`, block.caption || '', `Status: ${block.status || 'ready'}`, block.operation ? `Generation prompt: ${block.operation.prompt}` : `Source: ${block.src}`].join(NEWLINE) };
  if (block.type === 'paper') return { kind: 'Paper', title: block.title, text: `Paper on the canvas: ${block.title} (arXiv ${block.paper.id}), page ${block.paper.page}.`, paper: { id: block.paper.id, page: block.paper.page } };
  if (block.type === 'table') return { kind: 'Table', title: block.title, text: [`Table: ${block.title}`, block.caption || '', block.columns.join(' | '), ...block.rows.map(row => row.join(' | '))].join('\n') };
  if (block.type === 'explanation') return { kind: 'Explanation', title: block.title, text: [`Explanation: ${block.title}`, block.body, ...(block.more || []).map(section => `[${section.label}] ${section.text}`)].join('\n') };
  if (block.type === 'graph') return { kind: 'Interactive graph', title: block.title, text: [`Interactive graph: ${block.title}`, block.brief || '', `Renderer: ${block.spec.renderer}`, `Specification: ${JSON.stringify(block.spec)}`, `Learner's current graph state: ${JSON.stringify(block.state || {})}`].join('\n') };
  if (block.type === 'snippet') return { kind: 'Code sample', title: block.title, text: `Code sample: ${block.title}\n${block.brief || ''}\nCode:\n${block.code}\nOutput:\n${block.output || '(none shown)'}` };
  if (block.type === 'quiz') return { kind: 'Quiz', title: block.question, text: `Quiz question: ${block.question}\nOptions:\n${block.options.map(option => `${option.key}. ${option.text}${option.correct ? ' (correct answer)' : ''}`).join('\n')}\nLearner's current choice: ${block.choice || 'none yet'}` };
  if (block.type === 'flashcards') return { kind: 'Flashcards', title: `${block.cards.length} cards`, text: `Flashcards:\n${block.cards.map((card, index) => `- ${card.front} → ${card.back} (learner self-rated: ${(block.marks || {})[index] || 'unrated'})`).join('\n')}` };
  if (block.type === 'challenge' && block.mode === 'explain_back') return { kind: 'Explain back', title: block.prompt, text: [`Explain-back prompt: ${block.prompt}`, `Key ideas expected: ${(block.expects || []).join('; ')}`, `Learner's explanation: ${block.answer || 'not given yet'}`, block.verdict ? `Understanding evidence: ${block.verdict}` : ''].join(NEWLINE) };
  if (block.type === 'challenge') return { kind: 'Challenge', title: block.prompt, text: [`Challenge: ${block.prompt}`, `Learner's committed answer: ${block.answer || 'none yet'}`, block.verdict ? `Tutor verdict: ${block.verdict}` : ''].join(NEWLINE) };
  return null;
}

export function LearningBlockBody({ block, onChange, onFile, appName, onAskRegion, onGrade, onAskScene }) {
  if (block.type === 'challenge') return <ChallengeBody block={block} onChange={onChange} onFile={onFile} onGrade={onGrade} appName={appName} />;
  if (block.type === 'quiz') return <QuizBody block={block} onChange={onChange} onFile={onFile} />;
  if (block.type === 'flashcards') return <FlashcardsBody block={block} onChange={onChange} />;
  if (block.type === 'code') return <CodeBody block={block} onChange={onChange} onFile={onFile} />;
  if (block.type === 'snippet') return <SnippetBody block={block} onFile={onFile} />;
  if (block.type === 'explanation') return <ExplanationBody block={block} onFile={onFile} />;
  if (block.type === 'table') return <TableBody block={block} onFile={onFile} />;
  if (block.type === 'model3d') return <ThreeDBody block={block} onChange={onChange} />;
  if (block.type === 'audio') return <AudioBody block={block} appName={appName} onChange={onChange} />;
  if (block.type === 'scene' && block.spec?.type === 'interactive_scene') return <SceneActivityBody block={block} onChange={onChange} onAskScene={onAskScene} />;
  if (block.type === 'whiteboard') return <WhiteboardBody block={block} appName={appName} onChange={onChange} onAskSelection={onAskRegion} />;
  if (block.type === 'animation') return <AnimationBody block={block} onChange={onChange} onAskAnimation={onAskRegion} />;
  if (block.type === 'flow') return <FlowBody block={block} />;
  if (block.type === 'mermaid') return <MermaidBody block={block} onChange={onChange} />;
  if (block.type === 'knowledge') return <KnowledgeBody block={block} onChange={onChange} onFile={onFile} />;
  if (block.type === 'scene') return <SceneBody block={block} appName={appName} onChange={onChange} />;
  if (block.type === 'image') return <ImageBody block={block} appName={appName} onChange={onChange} onFile={onFile} />;
  if (block.type === 'video') return <VideoBody block={block} appName={appName} onChange={onChange} onFile={onFile} />;
  if (block.type === 'paper') return <PaperBody block={block} appName={appName} onChange={onChange} onAskRegion={onAskRegion} />;
  if (block.type === 'graph') return <GraphBody block={block} appName={appName} onChange={onChange} />;
  return null;
}
