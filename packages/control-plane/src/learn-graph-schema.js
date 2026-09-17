import { validateToolInput } from './learn-validation.js';

const axis = { type: 'object', additionalProperties: false, properties: { label: { type: 'string', maxLength: 100 }, min: { type: 'number' }, max: { type: 'number' } } };
const parameter = { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', minimum: 0.000001 }, label: { type: 'string', maxLength: 100 } } };
export const GRAPH_SCHEMA = { type: 'object', additionalProperties: false, required: ['op', 'id', 'renderer', 'concept'], properties: {
  op: { type: 'string', enum: ['interactive_plot'] }, id: { type: 'string', minLength: 1, maxLength: 100 }, renderer: { type: 'string', enum: ['desmos', 'plotly'] },
  title: { type: 'string', maxLength: 120 }, concept: { type: 'string', minLength: 1, maxLength: 300 },
  expressions: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['id', 'expression'], properties: { id: { type: 'string', maxLength: 80 }, expression: { type: 'string', minLength: 1, maxLength: 800 }, label: { type: 'string', maxLength: 100 } } } },
  traces: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'x', 'y'], properties: { id: { type: 'string', maxLength: 80 }, type: { type: 'string', enum: ['line', 'scatter', 'bar'] }, x: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'number' } }, y: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'number' } }, label: { type: 'string', maxLength: 100 } } } },
  parameters: { type: 'object', additionalProperties: parameter }, xAxis: axis, yAxis: axis,
} };

export function validateGraph(value) {
  validateToolInput(value, GRAPH_SCHEMA, 'interactive_plot');
  if (JSON.stringify(value).length > 100000 || !/^[\w-]{1,100}$/.test(value.id)) throw new Error('Invalid graph size or id');
  const items = value.renderer === 'desmos' ? value.expressions : value.traces;
  if (!items?.length || new Set(items.map(x => x.id)).size !== items.length || items.some(x => !/^[\w-]{1,80}$/.test(x.id))) throw new Error('Graph needs uniquely identified expressions or traces');
  if (value.renderer === 'desmos' && value.traces?.length || value.renderer === 'plotly' && (value.expressions?.length || Object.keys(value.parameters || {}).length)) throw new Error('Use expressions and parameters for Desmos, numeric traces for Plotly');
  for (const trace of value.traces || []) if (trace.x.length !== trace.y.length) throw new Error('Each trace needs matching x and y arrays');
  if (Object.keys(value.parameters || {}).length > 8) throw new Error('At most eight graph parameters');
  for (const [name, p] of Object.entries(value.parameters || {})) {
    if (!/^[a-zA-Z](?:_[a-zA-Z0-9]{1,16})?$/.test(name)) throw new Error('Use a mathematical variable name for each parameter');
    validateToolInput(p, parameter, `parameters.${name}`);
    if (p.min !== undefined && p.max !== undefined && p.min >= p.max || p.min !== undefined && p.value < p.min || p.max !== undefined && p.value > p.max) throw new Error('Invalid parameter bounds');
  }
  for (const a of [value.xAxis, value.yAxis]) if (a?.min !== undefined && a?.max !== undefined && a.min >= a.max) throw new Error('Axis minimum must be below its maximum');
  return value;
}
