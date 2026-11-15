import stepRail from './step-rail.js';
import fixedPicture from './fixed-picture.js';
import activeCallout from './active-callout.js';
import valueReadouts from './readouts.js';
import ghostPrevious from './ghost-previous.js';
import statusLine from './status-line.js';
import { compositionSourceData, compositionDecoderSource } from '../interact-stepper-data.js';

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

export const parts = Object.freeze(Object.fromEntries([stepRail, fixedPicture, activeCallout, valueReadouts, ghostPrevious, statusLine].map(part => [part.id, part])));
const partDraws = Object.fromEntries(Object.values(parts).map(part => [part.id, part.draw]));

// Original reference sketches keep their own names; this explicit map lowers
// those names into the owner's six renderer parts, not a second family registry.
export function assembleFrame(composition, inputs, sdk, words = {}, draws = partDraws) {
  const fail = (code, path, message) => { const e = new Error(message); e.code = code; e.path = path; throw e; };
  if (composition?.depth !== 'brief') fail('stepper_depth_unavailable', 'composition.depth', 'Only Brief algorithm-over-collection is assembled: SDK-8 cannot express the approved dashed previous-state legend and outlines');
  if (composition.canonical !== 'algorithm-over-collection') fail('stepper_canonical_unavailable', 'composition.canonical', 'Only the algorithm-over-collection picture preset is assembled');
  const option = inputs?.option ?? '0';
  if (!(typeof option === 'string' && /^(0|[1-9]\d*)$/.test(option)) && !Number.isInteger(option)) fail('part_binding', 'inputs.option', 'option must be an explicit zero-based variant index');
  const variant = composition.data?.variants?.[Number(option)];
  if (!variant) fail('part_binding', 'inputs.option', 'option must select an existing variant');
  const index = inputs?.step ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= variant.states.length) fail('part_binding', 'inputs.step', 'step must select an existing integer state index');
  const context = { composition, variant, state: variant.states[index], previous: null, index, words }, objects = [];
  const aliases = { 'value-readout': 'readouts', 'previous-state-ghost': 'ghost-previous', progress: 'step-rail' };
  for (const part of composition.parts) {
    const kind = aliases[part.kind] ?? part.kind, drawPart = draws[kind];
    if (typeof drawPart !== 'function') fail('part_binding', `composition.parts.${part.id}.kind`, 'unknown renderer part');
    objects.push(...drawPart({ ...context, presentation: part.kind === 'progress' ? 'completed-trace' : part.presentation }, sdk));
  }
  return sdk.frame(objects, { width: 640, height: 338 });
}

export function source(ctx) {
  const composition = ctx.geometry?.composition, words = ctx.geometry?.words ?? ctx.words ?? {};
  if (!composition) { const e = new Error('stepper-scene requires its validated composition'); e.code = 'part_binding'; e.path = 'geometry.composition'; throw e; }
  if (composition.depth !== 'brief') { const e = new Error('Only Brief algorithm-over-collection is assembled: SDK-8 cannot express the approved dashed previous-state legend and outlines'); e.code = 'stepper_depth_unavailable'; e.path = 'composition.depth'; throw e; }
  if (composition.canonical !== 'algorithm-over-collection') { const e = new Error('Only the algorithm-over-collection picture preset is assembled'); e.code = 'stepper_canonical_unavailable'; e.path = 'composition.canonical'; throw e; }
  const aliases = { 'value-readout': 'readouts', 'previous-state-ghost': 'ghost-previous', progress: 'step-rail' }, kinds = [...new Set(composition.parts.map(part => aliases[part.kind] ?? part.kind))];
  const functions = kinds.map(kind => {
    const drawPart = partDraws[kind];
    if (!drawPart) { const e = new Error(`unknown stepper part ${kind}`); e.code = 'part_binding'; e.path = 'composition.parts'; throw e; }
    return `${JSON.stringify(kind)}:${drawPart.toString()}`;
  });
  // The inlined functions carry their checkout's line endings (toString); the sealed program must not depend on them.
  return `const C=(${compositionDecoderSource})(${compositionSourceData(composition)});\nconst W=${JSON.stringify(words)};\nconst partDraws={${functions.join(',')}};\nconst assembleFrame=${assembleFrame.toString()};\nexport function evaluate({inputs}) { return {frame:assembleFrame(C,inputs,sdk,W),quantities:{}}; }`.replace(/\r\n/g, '\n');
}
