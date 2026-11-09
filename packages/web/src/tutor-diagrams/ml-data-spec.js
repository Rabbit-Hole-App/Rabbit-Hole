// Keep the old kind discriminators: saved v1 documents select new semantics explicitly.
export function createShapes({ z, titled, text, id, numeric }) {
  const reference = { row: id, column: z.int().min(0).max(7) };
  return [
    z.strictObject({
      ...titled, kind: z.literal('timeline'), layout: z.literal('scaled-lanes').optional(),
      events: z.array(z.strictObject({ time: text(28), label: text(55), detail: text(90).optional() })).min(2).max(8).optional(),
      domain: z.strictObject({ min: numeric, max: numeric, unit: text(12), label: text(36).optional() }).optional(),
      lanes: z.array(z.strictObject({
        id, label: text(40),
        intervals: z.array(z.strictObject({
          id, label: text(45), start: numeric, end: numeric,
          role: z.enum(['train', 'validation', 'test', 'gap', 'window', 'available', 'excluded']).optional(),
          detail: text(80).optional(),
        })).max(8).optional(),
        events: z.array(z.strictObject({ id, label: text(45), time: numeric, detail: text(80).optional() })).max(8).optional(),
      })).min(1).max(6).optional(),
      cutoffs: z.array(z.strictObject({ id, label: text(40), time: numeric })).max(4).optional(),
    }),
    z.strictObject({
      ...titled, kind: z.literal('matrix'), layout: z.literal('teaching').optional(),
      columns: z.array(text(24)).min(2).max(8),
      rows: z.array(z.strictObject({ id: id.optional(), heading: text(30), cells: z.array(text(40)).min(2).max(8) })).min(2).max(12),
      emphasis: z.strictObject({
        rows: z.array(id).max(12).optional(), columns: z.array(z.int().min(0).max(7)).max(8).optional(),
        cells: z.array(z.strictObject(reference)).max(24).optional(),
      }).optional(),
      states: z.array(z.strictObject({ ...reference, state: z.enum(['missing', 'changed']) })).max(24).optional(),
    }),
  ];
}

function distinct(values, path, issue, name) {
  const seen = new Set();
  values.forEach((value, index) => {
    if (seen.has(value)) issue([...path, index], `${name} must be distinct`);
    seen.add(value);
  });
}

function checkTimeline(d, issue) {
  if (d.layout !== 'scaled-lanes') {
    if (!d.events) issue(['events'], 'A legacy timeline needs events');
    for (const key of ['domain', 'lanes', 'cutoffs']) {
      if (d[key] !== undefined) issue([key], 'Select layout scaled-lanes for numeric time data');
    }
    return;
  }
  if (d.events !== undefined) issue(['events'], 'Put numeric events inside a lane');
  if (!d.domain) issue(['domain'], 'A scaled timeline needs a numeric domain and unit');
  if (!d.lanes) issue(['lanes'], 'A scaled timeline needs labelled lanes');
  if (!d.domain || !d.lanes) return;
  const { min, max } = d.domain;
  if (min >= max) issue(['domain', 'max'], 'The maximum must be greater than the minimum');
  const within = (value, path) => {
    if (value < min || value > max) issue(path, 'Time must be within the declared domain');
  };
  distinct(d.lanes.map(lane => lane.id), ['lanes'], issue, 'Lane IDs');
  // Entry IDs are global, so an event, interval, or cutoff can be named unambiguously.
  const ids = new Set();
  const unique = (entry, path) => {
    if (ids.has(entry.id)) issue([...path, 'id'], 'Timeline entry IDs must be distinct');
    ids.add(entry.id);
  };
  let count = 0;
  d.lanes.forEach((lane, i) => {
    const intervals = lane.intervals ?? [], events = lane.events ?? [];
    if (!intervals.length && !events.length) issue(['lanes', i], 'A lane needs at least one interval or event');
    count += intervals.length + events.length;
    intervals.forEach((entry, j) => {
      const path = ['lanes', i, 'intervals', j];
      unique(entry, path);
      within(entry.start, [...path, 'start']);
      within(entry.end, [...path, 'end']);
      if (entry.start >= entry.end) issue(path, 'Use an increasing interval');
    });
    events.forEach((entry, j) => {
      const path = ['lanes', i, 'events', j];
      unique(entry, path);
      within(entry.time, [...path, 'time']);
    });
  });
  if (count > 32) issue(['lanes'], 'Use at most 32 intervals and events in one teaching timeline');
  (d.cutoffs ?? []).forEach((entry, i) => {
    unique(entry, ['cutoffs', i]);
    within(entry.time, ['cutoffs', i, 'time']);
  });
}

function checkMatrix(d, issue) {
  d.rows.forEach((row, i) => {
    if (row.cells.length !== d.columns.length) issue(['rows', i, 'cells'], 'The number of cells must match the number of columns');
  });
  if (d.layout !== 'teaching') {
    if (d.columns.length > 5) issue(['columns'], 'Select layout teaching for more than five columns');
    if (d.rows.length > 6) issue(['rows'], 'Select layout teaching for more than six rows');
    d.rows.forEach((row, i) => { if (row.id !== undefined) issue(['rows', i, 'id'], 'Select layout teaching for stable row IDs'); });
    for (const key of ['emphasis', 'states']) {
      if (d[key] !== undefined) issue([key], 'Select layout teaching for semantic cell styling');
    }
    return;
  }
  d.rows.forEach((row, i) => { if (!row.id) issue(['rows', i, 'id'], 'Teaching rows need stable IDs'); });
  distinct(d.rows.map(row => row.id), ['rows'], issue, 'Row IDs');
  const rows = new Set(d.rows.map(row => row.id));
  const rowReference = (row, path) => { if (!rows.has(row)) issue(path, 'Reference an existing row ID'); };
  const columnReference = (column, path) => {
    if (column >= d.columns.length) issue(path, 'Reference an existing zero-based column index');
  };
  const emphasis = d.emphasis ?? {};
  (emphasis.rows ?? []).forEach((row, i) => rowReference(row, ['emphasis', 'rows', i]));
  (emphasis.columns ?? []).forEach((column, i) => columnReference(column, ['emphasis', 'columns', i]));
  distinct(emphasis.rows ?? [], ['emphasis', 'rows'], issue, 'Highlighted rows');
  distinct(emphasis.columns ?? [], ['emphasis', 'columns'], issue, 'Highlighted columns');
  for (const [entries, path] of [[emphasis.cells ?? [], ['emphasis', 'cells']], [d.states ?? [], ['states']]]) {
    entries.forEach((entry, i) => {
      rowReference(entry.row, [...path, i, 'row']);
      columnReference(entry.column, [...path, i, 'column']);
    });
    distinct(entries.map(entry => `${entry.row}:${entry.column}`), path, issue, 'Cell references');
  }
}

export function validate(diagram, issue) {
  if (diagram.kind === 'timeline') checkTimeline(diagram, issue);
  if (diagram.kind === 'matrix') checkMatrix(diagram, issue);
}

const timeLabel = (entry, unit) => `${entry.label}: ${entry.time ?? `${entry.start}–${entry.end}`} ${unit}`;
const stateLabel = state => state === 'missing' ? 'Missing' : 'Changed';

export function describe(d) {
  if (d.kind === 'timeline' && d.layout === 'scaled-lanes') {
    return [
      `${d.domain.label ?? 'Time'}: ${d.domain.min}–${d.domain.max} ${d.domain.unit}`,
      ...d.lanes.flatMap(lane => [lane.label, ...[...(lane.intervals ?? []), ...(lane.events ?? [])]
        .map(entry => `${timeLabel(entry, d.domain.unit)}${entry.detail ? ` — ${entry.detail}` : ''}`)]),
      ...(d.cutoffs ?? []).map(entry => `Cutoff — ${timeLabel(entry, d.domain.unit)}`),
    ];
  }
  if (d.kind === 'matrix' && d.layout === 'teaching') {
    const rowName = id => d.rows.find(row => row.id === id)?.heading;
    return [
      d.columns.join(' | '), ...d.rows.map(row => `${row.heading}: ${row.cells.join(' | ')}`),
      ...(d.states ?? []).map(entry => `${rowName(entry.row)} / ${d.columns[entry.column]}: ${stateLabel(entry.state)}`),
      ...(d.emphasis?.rows ?? []).map(id => `${rowName(id)}: highlighted row`),
      ...(d.emphasis?.columns ?? []).map(column => `${d.columns[column]}: highlighted column`),
      ...(d.emphasis?.cells ?? []).map(entry => `${rowName(entry.row)} / ${d.columns[entry.column]}: highlighted cell`),
    ];
  }
  return null;
}

export function visibleText(d) {
  if (d.kind === 'timeline' && d.layout === 'scaled-lanes') {
    return [d.title, d.caption, d.domain.label ?? 'Time', d.domain.unit,
      ...d.lanes.flatMap(lane => [lane.label, ...[...(lane.intervals ?? []), ...(lane.events ?? [])].flatMap(entry => [entry.label, entry.detail])]),
      ...(d.cutoffs ?? []).map(entry => entry.label)];
  }
  if (d.kind === 'matrix' && d.layout === 'teaching') {
    return [d.title, d.caption, ...d.columns, ...d.rows.flatMap(row => [row.heading, ...row.cells]), ...(d.states ?? []).map(entry => stateLabel(entry.state))];
  }
  return null;
}
