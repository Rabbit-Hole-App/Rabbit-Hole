// The UI's thin adapter to the saved card composition (docs/features/interact.md section 5, "Runtime composition envelope"; INT-06). The build lane's
// interact-composition.js owns the record: compileCardComposition builds it on the server and CardCompositionSchema is its shape. The card reads
// that SAME record from the Canvas block, so the helpers that take a composition (resolveTimeline, resolveSupportInputs and everything in
// explain-program/program-card.js) work on the value this returns, unchanged.
//
// CardComposition v1 as saved (interact-composition.js):
//   { version: 1, planHash, depth, title, cardDescription, order: ['title','description','supporting','main','transport','controls'] (the rows present),
//     supporting: [{ id, title, artifact: { kind: 'program'|'spec', hash }, runtime, readoutIds, parameterBindings: [{ fromInputId, toInputId }], readOnly: true, snapshotTime: 0 }]  (0 to 2),
//     main: { artifact: { kind, hash }, runtime, mode: 'static'|'time'|'experiment', readoutIds, inputDefaults, controls: [normalized controls with row and native],
//       timeline: null | { label, unit, end, displayOffset, markers, playbackRate, initialTime, initialPlayback, step }, onInputChange: 'recompute_still'|'reset_pause' },
//     envelopeHash }
// The Canvas block holds a bounded versioned reference: block.interact = { version: 1, planHash, composition } (explain-job.js block()). A block without
// it is a legacy card and renders exactly as before (compositionOf -> null). The artifacts themselves are never on the block: the main program is
// block.program, and a supporting program is read from the authorized result route by panel id (client.result(resultId, cardId, panelId)).
//
// What this adds for the card: supports (each panel's artifact as the program reference the result route resolves: { bundleHash }), controls, timeline, mode and
// onInputChange lifted from main. Everything else is the record as saved.
// ponytail: a supporting panel of kind 'spec' has no spec here (the record names it by hash) and the server does not build one yet (interact-job.js undeliverable);
// it would need the result route to serve its spec before the card can draw it.

export const COMPOSITION_VERSION = 1;
const MODES = ['static', 'time', 'experiment'];
const KINDS = ['program', 'spec'];
const MAX_SUPPORTS = 2;
const TRANSPORT = new Set(['playback', 'scrubber']);
const ON_CHANGE = ['recompute_still', 'reset_pause'];

const fail = (path, message) => ({ ok: false, problems: [{ path, message }] });

// -> { ok: true, value } | { ok: false, problems }. Only what the UI relies on; the server validated and hashed the record when it built it.
export function normalizeComposition(raw) {
  if (!raw || typeof raw !== 'object') return fail('', 'no composition');
  if (raw.version !== COMPOSITION_VERSION) return fail('version', `unknown composition version: expected ${COMPOSITION_VERSION}`);
  if (typeof raw.title !== 'string' || !raw.title) return fail('title', 'a card has a title');
  if (typeof raw.cardDescription !== 'string' || !raw.cardDescription) return fail('cardDescription', 'a card has a description');
  const main = raw.main;
  if (!main || typeof main !== 'object') return fail('main', 'a card has a main scene');
  if (!KINDS.includes(main.runtime?.renderer)) return fail('main.runtime.renderer', 'the main scene is a program or a spec');
  if (!MODES.includes(main.mode)) return fail('main.mode', 'mode is static, time or experiment');
  if (!ON_CHANGE.includes(main.onInputChange)) return fail('main.onInputChange', 'an input change recomputes the still or resets and pauses');
  if (!Array.isArray(main.controls)) return fail('main.controls', 'a card lists its controls');
  if (!main.inputDefaults || typeof main.inputDefaults !== 'object') return fail('main.inputDefaults', 'a card lists its input defaults');
  if (main.timeline !== null && !(Number.isFinite(main.timeline?.playbackRate) && main.timeline.playbackRate > 0)) return fail('main.timeline.playbackRate', 'a timeline has a positive playback rate');
  const supporting = Array.isArray(raw.supporting) ? raw.supporting : [];
  if (supporting.length > MAX_SUPPORTS) return fail('supporting', `at most ${MAX_SUPPORTS} supporting panels`);
  const ids = new Set();
  for (const [i, panel] of supporting.entries()) {
    if (typeof panel?.id !== 'string' || ids.has(panel.id)) return fail(`supporting.${i}.id`, 'supporting panel ids are unique');
    ids.add(panel.id);
    if (typeof panel.title !== 'string' || !panel.title) return fail(`supporting.${i}.title`, 'a supporting panel has a title');
    if (!KINDS.includes(panel.artifact?.kind)) return fail(`supporting.${i}.artifact`, 'a supporting panel is a program or a spec');
    if (!Array.isArray(panel.parameterBindings)) return fail(`supporting.${i}.parameterBindings`, 'a supporting panel lists its input bindings');
  }
  return {
    ok: true,
    value: {
      ...raw, main: { ...main, kind: main.runtime.renderer }, mode: main.mode, controls: main.controls, timeline: main.timeline, onInputChange: main.onInputChange,
      // A dev fixture names its program by id (artifact.program.fixtureId); a saved card by the hash the record carries.
      supports: supporting.map(panel => ({ id: panel.id, title: panel.title, parameterBindings: panel.parameterBindings, readoutIds: panel.readoutIds ?? [],
        artifact: { kind: panel.artifact.kind, hash: panel.artifact.hash, ...(panel.artifact.kind === 'program' ? { program: panel.artifact.program ?? { bundleHash: panel.artifact.hash } } : {}) } })),
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
