// Fits for a program frame (owner 2026-11-13, 14:20 brief section 3): a frame that is wrong in a way the host can put right is put right, never refused. Pure geometry on the raw frame the program
// returned, applied by contract.js parseOutput before the strict check, so the card, the headless trace and the checks all see the same fitted frame. Each fit that fires is logged as a note
// `fitted:<id>` (parseFrame / parseGuestResult return them as `fitted`), never as a problem. Anything this does not understand passes through untouched for the strict check to judge; it never throws.
//   flatten            an array inside `objects` (a helper result listed beside plain objects) is flattened
//   duplicate-id       a repeated id takes `-2`, `-3` ... on its stem (the part before the first '.'), in order of appearance: a second sdk.panel is panel-2, panel-2.title, panel-2.state
//   ticks              an axis `ticks: n` (a count, not a list) becomes n evenly spaced ticks from min to max
//   axis               an axis is moved (then shortened) so it, its tick labels and its title stay inside the frame (FIGURE_BAND: 52 below an x axis, 60 left of and 28 above a y axis)
//   single-point       a line or step series of fewer than two points is a scatter series (one point is the current-point dot, none draws nothing)
// A label over a body is fitted too, but by frame-overlap.js fitGuestLabels (it needs the text estimate the overlap check uses, and importing that here would be a cycle through contract.js).
import { FIGURE_BAND, FIGURE_LIMITS } from './contract.js'; // used inside functions only: contract.js imports this file

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
const DEFAULT_FRAME = { width: 960, height: 540 }; // the Frame schema's defaults (contract.js Frame)

const round2 = value => Math.round(value * 100) / 100;

function suffixDuplicates(objects, note) {
  const seen = new Set();
  return objects.map(object => {
    if (!isObject(object) || typeof object.id !== 'string') return object;
    let id = object.id;
    if (seen.has(id)) {
      const dot = id.indexOf('.'), stem = dot < 0 ? id : id.slice(0, dot), rest = dot < 0 ? '' : id.slice(dot);
      for (let n = 2; ; n += 1) if (!seen.has(`${stem}-${n}${rest}`)) { id = `${stem}-${n}${rest}`; break; }
      note('duplicate-id');
    }
    seen.add(id);
    return id === object.id ? object : { ...object, id };
  });
}

function fitAxis(axis, frame, note) {
  let out = axis;
  if (num(axis.ticks)) { // a count where a list belongs
    const n = Math.min(Math.floor(axis.ticks), FIGURE_LIMITS.ticks), { ticks, ...rest } = axis;
    out = n >= 1 && num(axis.min) && num(axis.max) && axis.min < axis.max
      ? { ...rest, ticks: Array.from({ length: n }, (_, i) => (n === 1 ? axis.min : Number((axis.min + (axis.max - axis.min) * i / (n - 1)).toPrecision(12)))) } : rest;
    note('ticks');
  }
  if (!num(out.x) || !num(out.y) || !num(out.length) || !(out.length > 0)) return out;
  let { x, y, length } = out;
  if (out.orientation === 'x') {
    length = Math.min(length, frame.width); x = clamp(x, 0, frame.width - length); y = clamp(y, 4, frame.height - FIGURE_BAND.x);
  } else if (out.orientation === 'y') {
    length = Math.min(length, frame.height - FIGURE_BAND.titleRoom - 8); y = clamp(y, length + FIGURE_BAND.titleRoom, frame.height - 8); x = clamp(x, FIGURE_BAND.y, frame.width - 4);
  } else return out;
  if (x === out.x && y === out.y && length === out.length) return out;
  note('axis');
  return { ...out, x: round2(x), y: round2(y), length: round2(length) };
}

// -> { frame, fitted: ['fitted:axis', ...] } (each id once, in the order first applied). `frame` is the raw frame object ({ width?, height?, objects, ... }).
export function fitFrame(frame) {
  const fitted = [], note = id => { if (!fitted.includes(`fitted:${id}`)) fitted.push(`fitted:${id}`); };
  if (!isObject(frame) || !Array.isArray(frame.objects)) return { frame, fitted };
  try {
    const size = { width: num(frame.width) ? frame.width : DEFAULT_FRAME.width, height: num(frame.height) ? frame.height : DEFAULT_FRAME.height };
    let objects = frame.objects;
    if (objects.some(Array.isArray)) { objects = objects.flat(Infinity); note('flatten'); }
    objects = suffixDuplicates(objects, note);
    objects = objects.map(object => {
      if (!isObject(object)) return object;
      if (object.kind === 'axis') return fitAxis(object, size, note);
      if (object.kind === 'plot' && Array.isArray(object.series) && object.series.some(s => isObject(s) && Array.isArray(s.points) && s.points.length < 2 && s.kind !== 'scatter')) {
        note('single-point');
        return { ...object, series: object.series.map(s => (isObject(s) && Array.isArray(s.points) && s.points.length < 2 && s.kind !== 'scatter' ? { ...s, kind: 'scatter' } : s)) };
      }
      return object;
    });
    return fitted.length ? { frame: { ...frame, objects }, fitted } : { frame, fitted };
  } catch {
    return { frame, fitted: [] };
  }
}
