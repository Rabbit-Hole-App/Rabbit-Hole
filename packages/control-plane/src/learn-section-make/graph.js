// Learn sections C §9: a graph item, made by the typed /graph command. interactive_graph: a function the source defines, its sliders the
// parameters the anchored lines expose, with their defaults. data_plot: measured numbers; illustrative false only when every value is traceable.
// ponytail: C §9c.3 (a graph item on a structure beat) is compose's fit check (CORE), not this validator.
import { codeNameError } from '../learn-section-brief.js';

const MAX_REQUEST = 1000;
const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
const num = { type: 'number' };

export const fields = {
  request: { type: 'string', maxLength: 500, description: 'The /graph request, from the template.' },
  kind: { type: 'string', enum: ['interactive_graph', 'data_plot'] },
  expression: { type: 'string', maxLength: 300, description: 'interactive_graph: the function in Desmos LaTeX, single-letter parameters.' },
  parameters: {
    type: 'array', maxItems: 6, description: 'interactive_graph: one slider per parameter the source exposes.',
    items: { type: 'object', additionalProperties: false, required: ['name', 'source', 'value'], properties: { name: { type: 'string', pattern: '^[a-zA-Z](?:_\\{?\\w+\\}?)?$' }, source: { type: 'string', maxLength: 60, description: 'The name in the anchored code.' }, value: num, min: num, max: num } },
  },
  series: {
    type: 'array', maxItems: 3, description: 'data_plot: the values to plot.',
    items: { type: 'object', additionalProperties: false, required: ['label', 'x', 'y'], properties: { label: { type: 'string', maxLength: 60 }, x: { type: 'array', maxItems: 200, items: num }, y: { type: 'array', maxItems: 200, items: num } } },
  },
  illustrative: { type: 'boolean', description: 'data_plot: false only when every value comes from the record or a notebook cell of this section.' },
};
export const required = ['request', 'kind'];
export const tools = ['read_source', 'search_code'];

// The anchored lines at the pinned commit ("path", "path:a" or "path:a-b").
export function anchorText(ctx) {
  return (ctx.beat?.anchors ?? []).map(anchor => {
    const m = String(anchor).match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/), lines = ctx.snapshot?.files?.[m?.[1]]?.split('\n');
    if (!lines) return '';
    const start = m[2] ? Number(m[2]) : 1, end = m[3] ? Number(m[3]) : m[2] ? start : lines.length;
    return lines.slice(start - 1, end).join('\n');
  }).join('\n');
}
const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const numbersIn = text => (String(text).match(NUMBER) ?? []).map(Number).filter(Number.isFinite);

function interactive(input, ctx) {
  const params = input.parameters ?? [], code = anchorText(ctx), expression = String(input.expression ?? '');
  if (!expression.trim()) return { error: 'Give the function from the anchored lines as expression' };
  for (const p of params) {
    // The source names the parameter and sets the default on the same line: `name = value` (or name: value).
    const line = code.split('\n').find(l => new RegExp(`(?:^|[^\\w])${p.source.replace(/[^\w]/g, '\\$&')}\\s*[:=]`).test(l));
    if (!line) return { error: `${p.source} is not a parameter the anchored lines set` };
    if (!numbersIn(line.split(/[:=]/).slice(1).join('=')).some(n => same(n, p.value))) return { error: `${p.source}'s default in the source is not ${p.value}` };
  }
  // Single-letter names in the expression, LaTeX commands removed: x and y are the axes, e the constant; every other one is a slider.
  const names = new Set(params.map(p => p.name.replace(/[{}]/g, '')));
  const used = expression.replace(/\\[a-zA-Z]+/g, ' ').match(/[a-zA-Z](?:_\{?\w+\}?)?/g) ?? [];
  const stray = used.map(n => n.replace(/[{}]/g, '')).find(n => !['x', 'y', 'e'].includes(n) && !names.has(n));
  if (stray) return { error: `The expression uses ${stray}, which is not a parameter the source exposes` };
  const sliders = params.map(p => `${p.name} = ${p.value}${p.min != null && p.max != null ? ` from ${p.min} to ${p.max}` : ''} (${p.source})`).join(', ');
  return { line: `Expression: ${expression}.${sliders ? ` Sliders: ${sliders}.` : ''}` };
}

function plot(input, ctx) {
  const series = input.series ?? [];
  if (!series.length || series.some(s => !s.x.length || s.x.length !== s.y.length)) return { error: 'Give each series the same number of x and y values' };
  // What a value may be traced to: the record, the anchored lines and this section's notebook cells already made.
  const known = [ctx.record, anchorText(ctx), ...(ctx.earlier ?? []).filter(e => e.perform?.op === 'notebook').map(e => e.perform.files?.map(f => f.content).join('\n'))]
    .flatMap(source => numbersIn(typeof source === 'string' ? source : JSON.stringify(source ?? '')));
  const untraced = series.flatMap(s => [...s.x, ...s.y]).filter(v => !known.some(k => same(k, v)));
  const corrected = input.illustrative === false && untraced.length > 0;
  const illustrative = input.illustrative !== false || corrected;
  return {
    line: `Values: ${series.map(s => `${s.label}: x = [${s.x.join(', ')}], y = [${s.y.join(', ')}]`).join('; ')}. ${illustrative ? 'Illustrative: true, these are not measured values.' : 'Illustrative: false, every value was measured.'}`,
    illustrative, ...(corrected ? { record: { illustrativeCorrected: true, untraced: untraced.slice(0, 20) } } : {}),
  };
}

export async function validate(input, ctx) {
  const request = String(input.request ?? '').trim();
  if (!request) return { error: 'Write the /graph request' };
  const wrongRequest = codeNameError(request); // the one rule: only a path, a file name or a flag is refused
  if (wrongRequest) return { error: `The request ${wrongRequest}; use plain words` };
  const made = input.kind === 'interactive_graph' ? interactive(input, ctx) : input.kind === 'data_plot' ? plot(input, ctx) : { error: 'kind is interactive_graph or data_plot' };
  if (made.error) return made;
  const line = `/graph ${request} ${made.line}`;
  if (line.length > MAX_REQUEST) return { error: `The request with its values is over ${MAX_REQUEST} characters; plot fewer points` };
  // ponytail: the /graph author still writes data_plot's illustrative itself; the line states the checked value. Enforce it on the artifact path if it drifts.
  return { perform: { op: 'slash', line, madeBy: 'learn-section' }, ...(made.record ? { record: made.record } : {}) };
}
