import { experimentControls } from './interact-composition-adapter.js';

// INT-06 (docs/features/interact.md section 2 "Card order", INT-06 checklist): the pure half of the /interact card. The components
// (ProgramScene.jsx, InteractCardContent.jsx, InteractSupportPanels.jsx) draw exactly the sections cardLayout returns, so the order,
// the omitted rows and the absence of text below a scene are decided here once, and tested without a browser.

// Title (the card header), the description (2 to 4 lines), optional supporting visuals, the main scene, the readouts row when the plan has readouts (one line per
// declared readout, drawn by the card, not by the program), the external timeline when timed, the experiment controls when declared. Nothing else exists: there is no kind for a caption, Notes or a takeaway.
export const SECTION_ORDER = Object.freeze(['title', 'description', 'support', 'scene', 'readouts', 'timeline', 'controls']);
export const MAX_SUPPORTS = 2;
export const RESET_ID = 'reset'; // the id of the Reset a plan did not declare
const rank = kind => SECTION_ORDER.indexOf(kind);

// The readouts the row draws: the plan's, less those a callout line in the scene already shows (composition.main.calloutReadoutIds). Empty means no row and no reserved height.
export const rowReadoutIds = composition => (composition.main?.readoutIds ?? []).filter(id => !(composition.main?.calloutReadoutIds ?? []).includes(id));

// -> the sections of this card, top to bottom. An absent row is absent, with its space.
export function cardLayout(composition) {
  const sections = [{ kind: 'title' }, { kind: 'description' }, ...composition.supports.map(panel => ({ kind: 'support', id: panel.id })), { kind: 'scene' }];
  if (rowReadoutIds(composition).length) sections.push({ kind: 'readouts', ids: rowReadoutIds(composition) });
  if (composition.timeline) sections.push({ kind: 'timeline' });
  // The controls row always ends with Reset (owner 2026-11-12: one place, one icon on every composed card): the plan's own reset control moves to the end, and a plan without one gets
  // the card's own (RESET_ID, drawn by the player; there is no plan control behind it).
  const controls = experimentControls(composition), own = controls.find(control => control.type === 'reset');
  const reset = own?.id ?? RESET_ID;
  sections.push({ kind: 'controls', ids: [...controls.filter(control => control !== own).map(control => control.id), reset], reset });
  return sections;
}

// -> problems[] of {code, message}; [] when the sections are a valid card. The rules of INT-06-R01 to R03.
export function layoutProblems(sections) {
  const out = [], bad = (code, message) => out.push({ code, message });
  const kinds = sections.map(section => section.kind);
  kinds.forEach(kind => { if (rank(kind) < 0) bad('unknown_section', `"${kind}" is not a card section; explanatory text never follows a scene or its controls`); });
  if (out.length) return out;
  if (kinds[0] !== 'title') bad('title_first', 'the title comes first');
  if (kinds[1] !== 'description') bad('description_second', 'the description follows the title');
  for (const once of ['title', 'description', 'scene']) if (kinds.filter(kind => kind === once).length !== 1) bad('exactly_one', `a card has exactly one ${once}`);
  if (kinds.filter(kind => kind === 'support').length > MAX_SUPPORTS) bad('support_limit', `at most ${MAX_SUPPORTS} supporting panels`);
  for (const once of ['readouts', 'timeline']) if (kinds.filter(kind => kind === once).length > 1) bad('exactly_one', `a card has at most one ${once} row`);
  if (kinds.filter(kind => kind === 'controls').length !== 1) bad('exactly_one', 'a card has exactly one controls row, and it ends with Reset');
  const controls = sections.find(section => section.kind === 'controls');
  if (controls && (!controls.ids?.length || controls.ids.at(-1) !== controls.reset)) bad('reset_last', 'the controls row ends with Reset');
  if (kinds.some((kind, i) => i > 0 && rank(kind) < rank(kinds[i - 1]))) bad('order', 'sections are out of order: title, description, supporting visuals, scene, readouts, timeline, controls');
  const scene = kinds.indexOf('scene'), under = kinds[scene + 1] === 'readouts' ? scene + 2 : scene + 1; // the readouts row is data, not prose: it may sit between the scene and its timeline
  if (kinds.includes('readouts') && kinds[scene + 1] !== 'readouts') bad('readouts_adjacent', 'the readouts row sits directly under the scene');
  // The animation touches its timeline: nothing but its own readouts sits between the scene and the row that controls it.
  if (kinds.includes('timeline') && kinds[under] !== 'timeline') bad('timeline_adjacent', 'the timeline sits directly under the scene (or its readouts)');
  if (kinds.includes('controls') && kinds[under] !== 'controls' && !(kinds[under] === 'timeline' && kinds[under + 1] === 'controls')) bad('controls_adjacent', 'the controls follow the scene, its readouts or its timeline');
  return out;
}

// Support panels are visual-only (INT-04-C03, INT-06-C12): the main state's values, mapped by the plan's parameterBindings, are their read-only
// inputs. A binding whose main input has no value yet is left out, never invented. -> { [toInputId]: value }
export function supportInputs(panel, mainInputs = {}) {
  const out = {};
  for (const { fromInputId, toInputId } of panel.parameterBindings) if (Object.hasOwn(mainInputs, fromInputId)) out[toInputId] = mainInputs[fromInputId];
  return out;
}
const sorted = value => (value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value);
// A cache and staleness key: the same panel artifact at the same bound inputs is the same snapshot (INT-04-C14).
export const snapshotKey = (artifactKey, inputs) => `${artifactKey}|${JSON.stringify(sorted(inputs))}`;

// Focus (INT-06 checklist, "available-height accounting"): the drawing takes the pane minus everything the card draws besides it. The
// description and the supporting panels are measured live (introH) and not folded into the once-measured fixed part, so panels that
// load late, or a description that rewraps at a new width, never leave the drawing too tall for the pane.
//   fixed: { w, h } the chrome measured once on entering (padding, header, gaps; without the controls rows and the intro)
export const focusRoom = ({ cardW, cardH, fixed, rowsH = 0, introH = 0 }) => ({ w: Math.max(0, cardW - fixed.w), h: Math.max(0, cardH - fixed.h - rowsH - introH) });
// The fixed part from the first measure: what is left of the card once the viewport, the rows and the intro are taken away.
export const focusFixed = ({ cardW, cardH, viewportW, viewportH, rowsH = 0, introH = 0 }) => ({ w: cardW - viewportW, h: cardH - viewportH - rowsH - introH });
