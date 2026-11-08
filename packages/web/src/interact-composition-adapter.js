// The UI's thin adapter to the saved card composition (docs/features/interact.md section 5, "Runtime composition envelope"; INT-06). The build
// lane (branch interact/i1-build) owns packages/web/src/interact-composition.js: compileCardComposition and resolveTimeline. The card UI
// reads only the CardComposition v1 shape below, so when that module lands, `compositionOf` is the one place that maps its output.
//
// CardComposition v1, as the UI reads it:
//   { schemaVersion: 1, planHash, title, cardDescription, mode: 'static'|'time'|'experiment',
//     main: { kind: 'program'|'spec' },                      the artifact itself stays on the block (block.program or block.scene)
//     supporting: [{ id, title, artifact: { kind: 'program'|'spec', ... }, parameterBindings: [{ fromInputId, toInputId }], readoutIds }]  (0 to 2)
//     controls: [ the plan's normalized control declarations ],
//     timeline: null | { label, start: 0, end: ScalarExpr, displayOffset: ScalarExpr, markers: [{ id, label, time: ScalarExpr }], playbackRate },
//     onInputChange: 'recompute_still'|'reset_pause' }
// The Canvas block holds a bounded versioned reference: block.interact = { version: 1, planHash, composition }. A block without it is a
// legacy card and renders exactly as before (compositionOf -> null).
// ponytail: the composition is read inline from the block; resolving it through the result route (as programs are) waits for the build lane.

export const COMPOSITION_VERSION = 1;
const MODES = ['static', 'time', 'experiment'];
const KINDS = ['program', 'spec'];
const MAX_SUPPORTS = 2;
const TRANSPORT = new Set(['playback', 'scrubber']);

const fail = (path, message) => ({ ok: false, problems: [{ path, message }] });

// -> { ok: true, value } | { ok: false, problems }. Only what the UI relies on; the build lane validates bindings and runtimes.
export function normalizeComposition(raw) {
  if (!raw || typeof raw !== 'object') return fail('', 'no composition');
  if (raw.schemaVersion !== COMPOSITION_VERSION) return fail('schemaVersion', `unknown composition version: expected ${COMPOSITION_VERSION}`);
  if (typeof raw.title !== 'string' || !raw.title) return fail('title', 'a card has a title');
  if (typeof raw.cardDescription !== 'string' || !raw.cardDescription) return fail('cardDescription', 'a card has a description');
  if (!MODES.includes(raw.mode)) return fail('mode', 'mode is static, time or experiment');
  if (!KINDS.includes(raw.main?.kind)) return fail('main.kind', 'the main scene is a program or a spec');
  const supporting = Array.isArray(raw.supporting) ? raw.supporting : [];
  if (supporting.length > MAX_SUPPORTS) return fail('supporting', `at most ${MAX_SUPPORTS} supporting panels`);
  const ids = new Set();
  for (const [i, panel] of supporting.entries()) {
    if (typeof panel?.id !== 'string' || ids.has(panel.id)) return fail(`supporting.${i}.id`, 'supporting panel ids are unique');
    ids.add(panel.id);
    if (typeof panel.title !== 'string' || !panel.title) return fail(`supporting.${i}.title`, 'a supporting panel has a title');
    if (!KINDS.includes(panel.artifact?.kind)) return fail(`supporting.${i}.artifact`, 'a supporting panel is a program or a spec');
  }
  const controls = Array.isArray(raw.controls) ? raw.controls : [];
  if (raw.timeline !== null && raw.timeline !== undefined && !(Number.isFinite(raw.timeline.playbackRate) && raw.timeline.playbackRate > 0)) return fail('timeline.playbackRate', 'a timeline has a positive playback rate');
  return {
    ok: true,
    value: {
      version: COMPOSITION_VERSION, planHash: raw.planHash ?? null, title: raw.title, cardDescription: raw.cardDescription, mode: raw.mode, main: { kind: raw.main.kind },
      supports: supporting.map(panel => ({ id: panel.id, title: panel.title, artifact: panel.artifact, parameterBindings: panel.parameterBindings ?? [], readoutIds: panel.readoutIds ?? [] })),
      controls, timeline: raw.timeline ?? null, onInputChange: raw.onInputChange ?? null,
    },
  };
}

// The composition a block renders with. -> null for a legacy card; { problems } for a composition that does not hold together (the card
// says so instead of drawing a partial card); otherwise the value above.
export function compositionOf(block) {
  const raw = block?.interact?.composition;
  if (!raw) return null;
  const out = normalizeComposition(raw);
  return out.ok ? out.value : { problems: out.problems };
}

// Controls the experiment row holds: everything but the timeline's own Play and scrubber (the external timeline row).
export const experimentControls = composition => composition.controls.filter(control => !TRANSPORT.has(control.type));
