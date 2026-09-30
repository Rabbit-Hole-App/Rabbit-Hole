// A line plot COMPOSED from existing scene primitives - `line` segments for a
// series, `line` + `text` for axes and ticks, a `circle` for a marker. There
// is no plot/series primitive in the renderer (see
// scripts/probe-scene-capabilities.mjs, "piecewise-linear-plot"); this is
// scene-authoring code that emits ordinary objects, not a renderer branch.
//
// The data -> pixel mapping runs through the EXISTING derive seam (scale then
// add), so a series that follows an input (pick a preset) re-maps live, and
// every plotted point is traceable to its data value. Tick positions are
// layout arithmetic on the declared axis domain (authored constants, not data).

const LAYOUT = { tickLength: 5, tickLabelGap: 8 };

// frame: { id, x, y, w, h, xDomain: [lo, hi], yDomain: [lo, hi],
//          xTicks: [{ value, label }], yTicks: [{ value, label }], xTitle, yTitle, conceptId }
const toPx = (frame, value) => frame.x + ((value - frame.xDomain[0]) / (frame.xDomain[1] - frame.xDomain[0])) * frame.w;
const toPy = (frame, value) => frame.y + frame.h - ((value - frame.yDomain[0]) / (frame.yDomain[1] - frame.yDomain[0])) * frame.h;

// tickMarks: false keeps only the tick LABELS (saves one object per tick
// against the scene's 60-object ceiling).
export function axesObjects(frame, { tickMarks = true } = {}) {
  const c = frame.conceptId;
  const o = (id, type, initialState) => ({ id: `${frame.id}-${id}`, type, semanticId: `${frame.id}-${id}`, conceptId: c, initialState });
  const bottom = frame.y + frame.h;
  return [
    o('x-axis', 'line', { from: { x: frame.x, y: bottom }, to: { x: frame.x + frame.w, y: bottom }, role: 'neutral' }),
    o('y-axis', 'line', { from: { x: frame.x, y: bottom }, to: { x: frame.x, y: frame.y }, role: 'neutral' }),
    ...frame.xTicks.flatMap((tick, i) => {
      const px = Math.round(toPx(frame, tick.value));
      return [
        ...(tickMarks ? [o(`xtick-${i}`, 'line', { from: { x: px, y: bottom }, to: { x: px, y: bottom + LAYOUT.tickLength }, role: 'neutral' })] : []),
        o(`xtick-label-${i}`, 'text', { text: tick.label, x: px - tick.label.length * 3.5, y: bottom + LAYOUT.tickLength + 16, typography: 'annotation' }),
      ];
    }),
    ...frame.yTicks.flatMap((tick, i) => {
      const py = Math.round(toPy(frame, tick.value));
      return [
        ...(tickMarks ? [o(`ytick-${i}`, 'line', { from: { x: frame.x - LAYOUT.tickLength, y: py }, to: { x: frame.x, y: py }, role: 'neutral' })] : []),
        o(`ytick-label-${i}`, 'text', { text: tick.label, x: frame.x - LAYOUT.tickLength - LAYOUT.tickLabelGap - tick.label.length * 7.8, y: py + 4, typography: 'annotation' }),
      ];
    }),
    ...(frame.xTitle ? [o('x-title', 'text', { text: frame.xTitle, x: frame.x + frame.w / 2 - frame.xTitle.length * 3.9, y: bottom + 44, typography: 'annotation' })] : []),
    ...(frame.yTitle ? [o('y-title', 'text', { text: frame.yTitle, x: frame.x - 4, y: frame.y - 14, typography: 'annotation' })] : []),
  ];
}

// The derive entries + constant vectors that map a data series to pixels.
// xs / ys name vectors in exampleData or earlier derived entries; the result
// names `${name}Px` and `${name}Py` (vectors of pixel coordinates).
export function seriesMapping(frame, name, xs, ys, n) {
  const kx = frame.w / (frame.xDomain[1] - frame.xDomain[0]);
  const ky = frame.h / (frame.yDomain[1] - frame.yDomain[0]);
  return {
    exampleData: {
      [`${name}OffX`]: Array.from({ length: n }, () => frame.x - frame.xDomain[0] * kx),
      [`${name}OffY`]: Array.from({ length: n }, () => frame.y + frame.h + frame.yDomain[0] * ky),
    },
    derived: {
      [`${name}RelX`]: { op: 'scale', args: [xs, kx] },
      [`${name}Px`]: { op: 'add', args: [`${name}RelX`, `${name}OffX`] },
      [`${name}RelY`]: { op: 'scale', args: [ys, -ky] },
      [`${name}Py`]: { op: 'add', args: [`${name}RelY`, `${name}OffY`] },
    },
  };
}

// n-1 line segments through the mapped points, one object each.
export function seriesObjects(frame, name, n, { role = 'output', identity } = {}) {
  return Array.from({ length: n - 1 }, (unused, i) => ({
    id: `${name}-seg-${i}`, type: 'line', semanticId: `${name}-seg-${i}`, conceptId: frame.conceptId,
    initialState: {
      from: { x: { $derive: `${name}Px.${i}` }, y: { $derive: `${name}Py.${i}` } },
      to: { x: { $derive: `${name}Px.${i + 1}` }, y: { $derive: `${name}Py.${i + 1}` } },
      role, ...(identity ? { identity } : {}),
    },
  }));
}
