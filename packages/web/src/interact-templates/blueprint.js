import { z } from 'zod';
import { COLUMNS, DRAWN_TEXT_SIZES, LayoutError, arrangeText, pickLayout, roleOf } from '../interact-layout.js';
import { textWidthPx } from '../interact-description-fit.js';
import { LAYOUT_BODY_SIZE } from '../scene-style.js';
import { BUILT_SCHEMA } from '../interact-blueprint.js';
import { DEFAULT_DECIMALS, STAGE_MIN_HEIGHT, WINDOW_PAD_PX } from '../interact-blueprint-constants.js';
import { fitWindow, placeFromBuild, programFromBuild, rolesOf } from '../interact-blueprint-build.js';

// Brief 38 spec section 6: the template that builds any checked interactive-blueprint into a card's Program, the way pendulum.js and attention.js build theirs: the layout module places everything (arrangeText),
// the model's function is embedded as written, the Program draws the parts through one window, a graph through sdk.diagram and its marker, the values, the formula and the explanation. No subject appears here and
// nothing branches on a blueprint's ids, labels or titles. `measured` is what the checker found (the reach of the parts, the graph's y range, the graph's size and plot area from one renderer call, the texts that set the
// layout); nothing in the job path calls the renderer.
const number = z.number();
const plotGeometry = z.object({
  min: z.object({ width: number, height: number }).strict(), plotArea: z.object({ left: number, right: number, top: number, bottom: number }).strict(),
  x: z.object({ min: number, max: number }).strict(), y: z.object({ min: number, max: number }).strict(),
}).strict();
export const measuredSchema = z.object({
  reach: z.object({ minX: number, maxX: number, minY: number, maxY: number }).strict(),
  yRange: z.tuple([number, number]).nullable(),
  valueTexts: z.array(z.string()), variants: z.array(z.array(z.string())).min(1),
  plot: z.object({ geometry: plotGeometry, figureParts: z.object({ title: z.literal(false) }).strict().optional() }).strict().nullable(), // figureParts: the graph is drawn without its title (brief 44, a title's height too tall)
  facts: z.record(z.string(), z.unknown()).optional(), // what the report shows (turn counts, milliseconds per frame): the Program does not read it
}).strict();
// Brief 46: a card is { blueprint, buildSchema } (blueprint-schema.js); the Program is written from them by programFromBuild. `measuredSchema` and `place` below are what the design check 9 still uses.
export { blueprintCardSchema } from './blueprint-schema.js';

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometryOf = range => range;
export { geometryOf as geometry };
export const states = () => ({});

const NO_FORMULA = 'x'; // a card without a formula still reserves the formula's place in the layout; nothing is drawn there

// Everything the layout decides, once, when the program is built: the arrangement and every box, the window of the parts, the roles of the dots.
export function place(data) {
  const B = data.blueprint, M = data.measured, panel = B.pictures.panel, id = pickLayout(B.layout, { hasPanel: panel !== null }), roles = rolesOf(B);
  const values = B.values.map((_, k) => ({ text: M.valueTexts[k] })), variants = M.variants.map(explanation => ({ values, explanation }));
  const arrangement = arrangeText(id, { variants, formula: B.relationship.formula ?? NO_FORMULA, pictureMins: { stage: STAGE_MIN_HEIGHT, ...(panel ? { panel: M.plot.geometry.min.height } : {}) } }, DRAWN_TEXT_SIZES);
  const stage = arrangement.pictures.stage, box = arrangement.pictures.panel;
  if (stage[3] < STAGE_MIN_HEIGHT) throw new LayoutError('figure_too_big', `the parts picture needs at least ${STAGE_MIN_HEIGHT} px; its box is ${stage[3]} px tall`, ['pictures', 'main']);
  if (panel && (M.plot.geometry.min.width > box[2] || M.plot.geometry.min.height > box[3])) throw new LayoutError('figure_too_big', `the graph needs at least ${M.plot.geometry.min.width} x ${M.plot.geometry.min.height} px; its box is ${box[2]} x ${box[3]} px`, ['pictures', 'panel']);
  const window = fitWindow(M.reach, stage, WINDOW_PAD_PX);
  if (!window) throw new LayoutError('window_none', 'the parts reach a single point, so there is no scale to draw them at', ['pictures', 'main']);
  const { dropped } = arrangement;
  // brief 43: the program places each label beside the part it is near; it needs the label's width (the larger of the per-glyph advance and the 0.6 em per character estimate frame-overlap.js uses, and 2 px) and the picture's bounds
  const labelWidths = Object.fromEntries(B.pictures.main.parts.filter(part => part.type === 'label').map(part => [part.id, Math.ceil(Math.max((part.text ?? '').length * LAYOUT_BODY_SIZE * 0.6, textWidthPx(part.text ?? '', LAYOUT_BODY_SIZE))) + 2]));
  if (dropped.explanationLines || dropped.values) console.log(JSON.stringify({ event: 'interact_layout_dropped', template: 'stepper-blueprint', arrangement: arrangement.arrangement, rowsTall: arrangement.rowsTall, droppedExplanationLines: dropped.explanationLines, droppedValues: dropped.values }));
  return {
    layout: id, arrangement: arrangement.arrangement, rowsTall: arrangement.rowsTall, stage, stageBounds: [stage[0], stage[1], stage[0] + stage[2], stage[1] + stage[3]], labelWidths, window, figure: box ? { at: [box[0], box[1]], w: box[2], h: box[3] } : null, plotGeometry: panel ? M.plot.geometry : null,
    values: arrangement.values.boxes.map((boxOf, i) => ({ value: B.values[i].value, label: B.values[i].label, unit: B.values[i].unit ?? '', decimals: B.values[i].decimals ?? DEFAULT_DECIMALS, box: boxOf, dot: arrangement.values.dots[i], role: roleOf(B.values[i].of, { shapes: roles.things }) })),
    formula: B.relationship.formula === null ? null : arrangement.formula, explanation: arrangement.explanation, bullet: COLUMNS.bullet,
  };
}
// The picture's box height (the host asks the renderer for exactly this box: the sealed manifest carries it): the panel box of the build-schema's layout and arrangement, from the config. A card with no graph has no such box.
export const figureHeight = ctx => { const data = ctx.geometry.blueprint; return placeFromBuild(data.blueprint, data.buildSchema).panel?.[3]; };

// The card's Program (brief 46): written from the blueprint's function and the build-schema's decisions, no judgment of its own (interact-blueprint-build.js programFromBuild).
export function source(ctx) {
  const data = ctx.geometry?.blueprint;
  if (!data) { const e = new Error('blueprint requires its validated data'); e.code = 'part_binding'; e.path = 'geometry.blueprint'; throw e; }
  try { return programFromBuild(data).source; } catch (error) { const e = new Error(error.message); e.code = error.code ?? 'part_binding'; e.path = 'geometry.buildSchema'; throw e; }
}
