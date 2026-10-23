// Fixed-composition fixtures for the Motion renderer capacity validation (C:/s/spec/motion-validation/plan.md section 3). No model
// call: brief, storyboard and a Remotion composition are generated from (scene, ratio, seconds), and each is a valid motion-render/1
// job under the same checks the service runs (contracts.js validateRenderRequest, the Remotion static gate and the Author contract).
//
//   buildFixture({scene, ratio, seconds, layers?}) -> { request, brief, storyboard, source, composition_id, scene, ratio, seconds, layers }
//   fixtureErrors(fixture) -> [] when the job passes every static check the service applies before it renders
//   MATRIX                 the 21 deterministic runs of plan section 3.2 (D01..D21)
//
// Scenes: simple (3 beats, no decorative layers), medium (5 beats, 40 layers) and heavy (8 beats, 160 layers with shadows and blur,
// plus a text ticker). A 5 s video gets at most floor(5 / 1.5) = 3 beats (storyboard minimum 1.5 s per beat). `layers` overrides the
// scene's decorative layer count (0 to 400) so a run can be re-tuned without changing code.
// ponytail: the per-frame load of each scene is an estimate of the Author's output (generate-m6 class), not a measurement; the D17,
// D18 and D20 runs are what measure it. Statically valid is proven by the unit test; a real render of every combination is not.
import { readFileSync } from 'node:fs';
import { RENDER_SCHEMA, STAGE, stageFor, validateRenderRequest } from './contracts.js';
import { checkAuthorSource } from './author-check.js';
import { rendererGate } from './renderers.mjs';
import { MOTION_RATIOS } from './stage-sizes.js';

export const SCENES = Object.freeze({
  simple: { beats: 3, layers: 0, ticker: 0, effects: false },
  medium: { beats: 5, layers: 40, ticker: 0, effects: false },
  heavy: { beats: 8, layers: 160, ticker: 12, effects: true },
});
export { MOTION_RATIOS };
const MIN_BEAT_SECONDS = 1.5;

const BASE = JSON.parse(readFileSync(new URL('./fixtures/demo-a/brief.json', import.meta.url), 'utf8'));
const S3 = BASE.source_refs.find(r => r.id === 'S3'), S3_EVIDENCE = BASE.evidence.find(e => e.source_ref_id === 'S3');
const codeLine = n => S3_EVIDENCE.excerpt.split('\n')[n - S3.start_line].trim();

// What a beat can show. Every id is written once in the composition; labels and code lines are shown verbatim.
const POOL = [
  { id: 'score_values', description: 'raw score values in each cell' },
  { id: 'future_cells', description: 'keys 5 and 6 greyed and tagged future', label: 'future' },
  { id: 'mask_code', description: 'code line 68 (masked_fill)', source: { source_ref_id: 'S3', start_line: 68, end_line: 68 } },
  { id: 'softmax_code', description: 'code line 69 (F.softmax)', source: { source_ref_id: 'S3', start_line: 69, end_line: 69 } },
  { id: 'weight_bars', description: 'weight bars for keys 1-4' },
  { id: 'sum_track', description: 'stacked sum track resolving to 1.00', label: '1.00' },
  { id: 'takeaway_line', description: 'takeaway line' },
];
const SCORE_ROW = { id: 'score_row', description: 'row 4 of the attention scores: query token 4 against keys 1-6' };
const SENTENCES = [
  'Token 4 scores every key, but keys 5 and 6 are in its future.',
  'Fallback path: future scores become -inf before softmax runs.',
  'Softmax turns the eligible scores into non-negative weights that sum to 1.',
  'Masking happens before the weights are computed.',
  'Keys 5 and 6 get zero weight; they stay in the row.',
  'Each weight is a share of the total over keys 1 to 4.',
  'The weights over the eligible keys sum to 1.',
  'Softmax turns the allowed scores into weights that sum to 1.',
];

const ratioTag = ratio => ratio.replace(':', 'x');
const oneDecimal = n => Math.round(n * 10) / 10;

function makeBrief({ scene, ratio, seconds }) {
  const stage = stageFor(ratio);
  return {
    ...BASE,
    id: `brief-val-${scene}-${ratioTag(ratio)}-${seconds}s`,
    raw_user_request: `/motion ${seconds}s explain me softmax func`,
    scope_note: `${seconds}s covers one score row, masking and softmax normalization.`,
    source_refs: [S3], evidence: [S3_EVIDENCE], implementation_conditions: [],
    claim_registry: [{ id: 'C1', text: BASE.claim_registry[0].text, source_ref_ids: ['S3'], condition_ids: [], required: true }],
    duration: { requested_text: `${seconds}s`, requested_seconds: seconds, seconds },
    aspect_ratio: ratio,
    output_requirements: { stage_width: stage.width, stage_height: stage.height, fps: stage.fps, preview_scale: 0.45, poster: true },
    qa_requirements: { ...BASE.qa_requirements, keyframe_times: [oneDecimal(seconds * 0.4), oneDecimal(seconds * 0.7)] },
  };
}

function makeStoryboard(brief, n) {
  const seconds = brief.duration.seconds, tag = brief.id.replace('brief-', '');
  const start = i => oneDecimal((seconds * i) / n);
  const beats = Array.from({ length: n }, (_, i) => {
    const picks = [POOL[(2 * i) % POOL.length], POOL[(2 * i + 1) % POOL.length]];
    return {
      id: `B${i + 1}`, start_time: start(i), end_time: i === n - 1 ? seconds : start(i + 1),
      pedagogical_role: i === 0 ? 'hook' : i === n - 1 ? 'takeaway' : 'mechanism',
      visible_objects: [SCORE_ROW, ...picks].map(o => ({ ...o })),
      claim_ids: ['C1'],
      must_show_covered: BASE.must_show.filter((_, j) => j % n === i),
      transition: 'objects fade in', framing: 'panels in a grid, caption at the bottom',
      on_screen_text: SENTENCES[i % SENTENCES.length],
    };
  });
  return { id: `storyboard-${tag}`, brief_id: brief.id, version: 1, beats };
}

// The Remotion source for a storyboard. Every learner-visible string is TEXT (the Author contract); every storyboard object is one
// panel carrying data-object; decorative layers and the ticker carry no data-object and no text of their own.
function makeSource({ brief, storyboard, layers, ticker, effects }) {
  const stage = stageFor(brief.aspect_ratio), fps = STAGE.fps;
  const text = {}, keyOf = {};
  const textKey = value => (keyOf[value] ??= (text[`t${Object.keys(text).length}`] = value, `t${Object.keys(text).length - 1}`));
  const captions = storyboard.beats.map(b => textKey(b.on_screen_text));
  const objects = [];
  storyboard.beats.forEach((b, i) => b.visible_objects.forEach(o => {
    let entry = objects.find(x => x.id === o.id);
    if (!entry) {
      entry = { id: o.id, beats: [], text: o.label ? textKey(o.label) : o.source ? textKey(codeLine(o.source.start_line)) : null, mono: !!o.source };
      objects.push(entry);
    }
    entry.beats.push(i);
  }));
  const tickerKeys = Array.from({ length: ticker }, (_, k) => captions[k % captions.length]);
  const timeline = Object.fromEntries(storyboard.beats.map(b => [b.id, [Math.round(b.start_time * fps), Math.round(b.end_time * fps)]]));
  const j = JSON.stringify;
  return `// Generated validation fixture (motion/validation-fixtures.js): ${brief.id}. Not a model output.
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from 'remotion';

export const stage = { width: ${stage.width}, height: ${stage.height}, fps: ${fps}, durationInFrames: ${brief.duration.seconds * fps} };
export const timeline = ${j(timeline)};
export const TEXT = ${j(text, null, 2)};

const SANS = 'Inter', MONO = 'JetBrains Mono';
const INK = '#37352F', MUTED = '#9B9A97', LINE = '#E3E2E0', BLUE = '#2383E2', SOFT = '#F1F1EF';
const OBJECTS = [
${objects.map(o => `  { id: ${j(o.id)}, beats: ${j(o.beats)}, text: ${j(o.text)}, mono: ${o.mono} },`).join('\n')}
];
const CAPTIONS = ${j(captions)};
const TICKER = ${j(tickerKeys)};
const LAYERS = ${layers};
const EFFECTS = ${effects};
const SPANS = Object.values(timeline);

const W = stage.width, H = stage.height;
const COLS = W > H ? 3 : 2, ROWS = Math.ceil(OBJECTS.length / COLS);
const PAD = 48, GAP = 24, TOP = 120, BOTTOM = 220;
const CW = (W - 2 * PAD - GAP * (COLS - 1)) / COLS, CH = (H - TOP - BOTTOM - GAP * (ROWS - 1)) / ROWS;

const ease = Easing.bezier(0.33, 0, 0.2, 1);
const ramp = (f, a, b) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
// 1 inside any beat the object belongs to; a short fade-in only when it arrives (never at frame 0, never between two beats it shares)
const visible = (o, f) => {
  let v = 0;
  for (const b of o.beats) {
    const [from, to] = SPANS[b];
    if (f >= from && f < to) v = Math.max(v, from === 0 || o.beats.includes(b - 1) ? 1 : ramp(f, from, from + 9));
  }
  return v;
};
const LABEL_STYLE = { fontFamily: SANS, fontSize: 34 };
const CODE_STYLE = { fontFamily: MONO, fontSize: 24 };

const Panel = ({ o, i, f }) => (
  <div data-object={o.id} style={{ position: 'absolute', left: PAD + (i % COLS) * (CW + GAP), top: TOP + Math.floor(i / COLS) * (CH + GAP), width: CW, height: CH, boxSizing: 'border-box', padding: 20, opacity: visible(o, f), transform: 'scale(' + (1 + 0.015 * Math.sin((f + i * 7) / 9)) + ')', border: '3px solid ' + (i % 2 ? BLUE : LINE), borderRadius: 16, background: '#FFFFFF', color: INK, ...(o.mono ? CODE_STYLE : LABEL_STYLE) }}>
    <div style={{ height: 10, width: (CW - 40) * ramp(f, 0, 60 + i * 20), borderRadius: 5, background: BLUE, opacity: 0.6, marginBottom: 12 }} />
    {o.text ? TEXT[o.text] : null}
  </div>
);

const Layer = ({ k, f }) => {
  const size = 40 + random('s' + k) * 200;
  return (
    <div style={{ position: 'absolute', left: random('x' + k) * W - size / 2, top: random('y' + k) * H - size / 2 + 30 * Math.sin((f + k * 11) / 25), width: size, height: size, borderRadius: size * random('r' + k) * 0.5, transform: 'rotate(' + f * (0.2 + random('a' + k)) + 'deg)', opacity: 0.04 + 0.08 * random('o' + k), background: 'hsla(' + ((k * 37 + f) % 360) + ', 60%, 70%, 1)', ...(EFFECTS ? { boxShadow: '0 8px 32px rgba(35,131,226,0.35)', filter: k % 4 === 0 ? 'blur(6px)' : 'none' } : {}) }} />
  );
};

const Ticker = ({ k, f }) => (
  <div style={{ position: 'absolute', left: (f * 3 + k * 160) % (W - 400), top: 70 + (k % 6) * 8, fontFamily: SANS, fontSize: 22, color: MUTED, opacity: 0.5, whiteSpace: 'nowrap' }}>{TEXT[TICKER[k]]}</div>
);

export default function ValidationScene() {
  const f = useCurrentFrame();
  const beat = SPANS.findIndex(([from, to]) => f >= from && f < to);
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF', fontFamily: SANS, color: INK }}>
      {Array.from({ length: LAYERS }, (_, k) => <Layer key={k} k={k} f={f} />)}
      {Array.from({ length: TICKER.length }, (_, k) => <Ticker key={k} k={k} f={f} />)}
      {OBJECTS.map((o, i) => <Panel key={i} o={o} i={i} f={f} />)}
      <div style={{ position: 'absolute', left: PAD, width: W - 2 * PAD, top: H - BOTTOM + 60, textAlign: 'center', fontFamily: SANS, fontSize: 36, color: INK, background: SOFT }}>{TEXT[CAPTIONS[beat]]}</div>
    </AbsoluteFill>
  );
}
`;
}

export function buildFixture({ scene, ratio, seconds, layers } = {}) {
  const s = SCENES[scene];
  if (!s) throw new Error(`scene: ${Object.keys(SCENES).join(' | ')}`);
  if (!MOTION_RATIOS.includes(ratio)) throw new Error(`ratio: ${MOTION_RATIOS.join(' | ')}`);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) throw new Error('seconds: a whole number from 5 to 60');
  if (layers !== undefined && !(Number.isInteger(layers) && layers >= 0 && layers <= 400)) throw new Error('layers: a whole number from 0 to 400');
  const n = Math.max(2, Math.min(s.beats, Math.floor(seconds / MIN_BEAT_SECONDS)));
  const brief = makeBrief({ scene, ratio, seconds }), storyboard = makeStoryboard(brief, n);
  const layerCount = layers ?? s.layers;
  const source = makeSource({ brief, storyboard, layers: layerCount, ticker: s.ticker, effects: s.effects });
  const composition_id = `val-${scene}-${ratioTag(ratio)}-${seconds}s`;
  return {
    scene, ratio, seconds, layers: layerCount, brief, storyboard, source, composition_id,
    request: { schema: RENDER_SCHEMA, renderer: 'remotion', brief, storyboard, composition: { composition_id, source } },
  };
}

// Everything the service checks before it renders, plus the Author contract the orchestrator's gate adds.
export function fixtureErrors(f) {
  const gate = rendererGate('remotion');
  return [
    ...validateRenderRequest(f.request),
    ...gate.staticErrors(f.source, { durationSeconds: f.seconds, stage: stageFor(f.ratio) }),
    ...checkAuthorSource(f.source, f.brief, f.storyboard).errors,
  ];
}

// Plan section 3.2: the deterministic runs on the current dev machine. stage 'preview' is the preview-only job (D21).
const run = (id, ratio, seconds, scene, stage = 'final') => ({ id, ratio, seconds, scene, stage });
export const MATRIX = Object.freeze([
  run('D01', '16:9', 15, 'medium'),
  ...['9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'].map((r, i) => run(`D0${i + 2}`, r, 15, 'medium')),
  run('D10', '16:9', 5, 'medium'), run('D11', '16:9', 30, 'medium'), run('D12', '16:9', 45, 'medium'), run('D13', '16:9', 60, 'medium'),
  run('D14', '9:16', 60, 'medium'), run('D15', '1:1', 60, 'medium'), run('D16', '3:4', 60, 'medium'),
  run('D17', '16:9', 15, 'simple'), run('D18', '16:9', 15, 'heavy'), run('D19', '16:9', 60, 'simple'), run('D20', '16:9', 60, 'heavy'),
  run('D21', '16:9', 60, 'heavy', 'preview'),
].map(Object.freeze));
