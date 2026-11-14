import { isDeepStrictEqual } from 'node:util';
import { tokenizeMath } from '../math-tokens.js';
import { plotSeriesPoints } from './ml-plot-spec.js';

// Authored display text in the v1 shapes. Structural strings and numeric data stay out of the check.
const TEXT_FIELDS = new Set([
  'title', 'caption', 'label', 'edgeLabel', 'heading', 'detail', 'source', 'unit', 'time', 'operation', 'claim',
  'conclusion', 'class', 'rowLabel', 'columnLabel', 'xLabel', 'note', 'account', 'name', 'dims', 'dimensions',
]);
const TEXT_LISTS = new Set(['items', 'columns', 'cells', 'steps', 'categories', 'source', 'target']);
const normalized = value => value.normalize('NFC').trim().replace(/\s+/gu, ' ');

const PLACEHOLDER_EDGE = /^(?:then|next(?: step)?|continue|proceed|go(?: to)?|goes to|link|connects to|(?:is )?related to|relates to|edge(?: label)?|arrow|label|step|placeholder(?: text)?|tbd|todo)(?: \d+)?$/iu;
const BOOLEAN_EDGE = /^(?:yes|no|true|false)$/u;
const EDGE_LISTS = { flow: 'edges', relationship: 'edges', sequence: 'messages', tree: 'nodes', transformation: 'links' };
const edgeWords = label => normalized(label).toLowerCase().replace(/[.!?:,;]+$/u, '');

// A finite list of base verbs used in teaching instructions and auxiliaries used in decisions.
const FLOW_VERBS = new Set(`
  accept act activate add adjust align allocate analyze analyse answer append apply archive are arrange assemble ask
  assign attach augment await balance batch begin blend bootstrap branch break build cache calculate call can cancel
  capture center centre check choose classify clean clip close collect combine compare complete compute concatenate
  condition configure confirm connect construct convert convolve copy count create cross-validate cut decode decrease define
  delete deliver deploy derive describe detect determine did differentiate discard display distribute divide do does drain
  draw drop emit encode end enrich estimate evaluate execute expand extract feed fetch fill filter find finish fit
  fix flatten forward gather generate get give group handle has have hold identify
  impute increase initialize initialise insert inspect interpolate is join keep label launch learn lift limit load locate
  log lower make map mark match measure merge mix model monitor move multiply normalize normalise obtain observe open order
  pad parse pass partition pick plan plot pool predict prepare present process produce project prune publish pull push
  query rank read receive recalculate record recover reduce refresh reject release remove render reorder repeat
  replace report request reset resolve restore retain retrieve return retry reverse rinse round route run sample save
  scale scan schedule score select send sense serve set shift should shuffle skip sort split square standardize standardise
  start stop store subtract sum summarize summarise swap switch take test tokenize tokenise train transform translate
  trim truncate tune unroll update upload use validate verify vote wait warn was weigh weight will wrap write
`.trim().split(/\s+/u));
const FLOW_NOUN_PHRASE = /^(?:bootstrap draws|model (?:output|results|training|weights)|record (?:accepted|rejected))[.!?]?$/iu;
const COMPONENT_ACTION_PREFIX = /^(?:apply|execute|perform|run|use)\s+/iu;
const COMPONENT_NAME_JOIN = /(?<=\p{L}{2})\s+\+\s+(?=\p{L}{2})/gu;

// String steps describe actions. Role-tagged inset steps name components.
const isInsetComponentLabel = path => path.at(-6) === 'blocks' && path.at(-4) === 'diagram'
  && path.at(-3) === 'steps' && path.at(-1) === 'label';

const MATH_NOTATION = [
  /\\[A-Za-z]+\b/u, // TeX command
  /[\u2070-\u209F¹²³′″‴]|[\u{1D400}-\u{1D7FF}]/u, // scripts, primes and math alphabets
  /[±×÷≤≥≠≈≡∝√∞∑∏∫∂∇∈∉⊂⊆∩∪⊗]/u,
  /(?<![\p{L}\p{N}])\p{Script=Greek}(?![\p{L}\p{N}])|[Δδ][a-z]\b/u,
  /(?<![\p{L}\p{N}_])\p{L}\s*_\s*(?=[\p{L}\p{N}{])|[\p{L}\p{N})\]]\s*\^\s*(?=[\p{L}\p{N}{+−-])/u,
  /[\p{L}\p{N})\]\uFFFC]\s*(?:[=<>*]|\+(?=\s))\s*[+−-]?[\p{L}\p{N}([{\\\uFFFC]/u,
  /(?:[\d)\]\uFFFC]|(?<![\p{L}\d])\p{L})\s*\+\s*[\p{L}\d([\uFFFC]/u,
  /(?:[\d)\]\uFFFC]|(?<![\p{L}\d])\p{L})\s+[−-]\s+[\p{L}\d([\uFFFC]|\b[\da-z]−[\da-z]\b/u,
  /\uFFFC\s*[-−/]\s*(?:\uFFFC|\d|\b[a-z]\b)|(?:\d|\b[a-z])\s*[-−/]\s*\uFFFC/u,
  /(?:\d|\b[A-Za-z]|\uFFFC)\s*[←→↔]\s*(?:\d|[A-Za-z]\b|\uFFFC)/u,
  /\b(?:[a-z]|Pr|sin|cos|tan|log|ln|exp|sqrt|min|max)\([^()]+\)/u,
  /[([]\s*[+−-]?\d+(?:\.\d+)?(?:\s*,\s*[+−-]?\d+(?:\.\d+)?)+\s*[)\]]/u,
  /(?<!\\)\$\s*\p{L}\s*(?:\$|$)/u, // an unfinished or whitespace-padded variable token
];
const FRACTION = /(?<![\p{L}\d/])\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?(?![\p{L}\d/])|(?<![\p{L}\d])[a-z]\s*\/\s*[a-z\d](?![\p{L}\d])/u;

function needsMathDelimiters(value, field, componentName) {
  // A tensor's dimension label and a block's dimension note are literal shape metadata.
  if (field === 'dimensions' && /^\d+(?:\s*[×x]\s*\d+)+$/u.test(value)) return false;
  if (field === 'dims' && /^[A-Za-z]\s*=\s*[\d,]+$/u.test(value)) return false;
  const { source, math } = tokenizeMath(value);
  if (math.some(({ raw }) => !raw.startsWith('$') || raw.startsWith('$$'))) return true;
  // Keep a neutral operand in place of each valid token to catch expressions like "$x$ + 1".
  let plain = source.replace(/\uE000\d+\uE001/gu, '\uFFFC')
    .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/gu, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\s*(?:[-–—]|to|through|until)\s*\d{1,2}\/\d{1,2}\b/giu, ' ')
    .replace(/\b[12]\d{3}\s*[-−–—/]\s*[12]\d{3}\b/gu, ' ');
  // A spaced plus can join textual component names. Numeric, one-letter,
  // and typeset operands still need to be inside one complete formula.
  if (componentName) plain = plain.replace(COMPONENT_NAME_JOIN, ' and ');
  if (MATH_NOTATION.some(pattern => pattern.test(plain))) return true;
  if (field === 'unit' || (field === 'time' && /^\d{1,2}\/\d{1,2}$/u.test(plain.trim()))) return false;
  return FRACTION.test(plain);
}

function meaningfulBoolean(diagram, edges, edge, index, label) {
  if (diagram.kind === 'flow') return diagram.nodes?.some(node => node.id === edge.from && node.role === 'decision');
  if (diagram.kind === 'tree') {
    const parentIsQuestion = edges.some(node => node.id === edge.parent && node.label?.trim().endsWith('?'));
    return edges.some(other => other.parent === edge.parent && typeof other.edgeLabel === 'string'
      && edgeWords(other.edgeLabel) !== label && (parentIsQuestion || BOOLEAN_EDGE.test(edgeWords(other.edgeLabel))));
  }
  if (diagram.kind === 'sequence') {
    const previous = edges[index - 1];
    return previous && previous.from === edge.to && previous.to === edge.from && previous.label?.trim().endsWith('?');
  }
  return false;
}

function lintEdges(diagram, path, report) {
  const list = EDGE_LISTS[diagram.kind];
  if (!list) return;
  const field = diagram.kind === 'tree' ? 'edgeLabel' : 'label';
  const edges = diagram[list] ?? [];
  edges.forEach((edge, index) => {
    const value = edge[field];
    if (typeof value !== 'string') return;
    const label = edgeWords(value);
    if (!label || /^[.·…_→>-]+$/u.test(label) || PLACEHOLDER_EDGE.test(label)
      || (BOOLEAN_EDGE.test(label) && !meaningfulBoolean(diagram, edges, edge, index, label))) {
      report('placeholder-edge-label', [...path, list, index, field],
        'Name the condition, transition, or message. Omit optional labels when the arrow already conveys the order.', value);
    }
  });
}

function lintNodes(diagram, path, report) {
  const list = diagram.kind === 'sequence' ? 'actors' : diagram.kind === 'block-stack' ? 'blocks'
    : diagram.kind === 'flow' && diagram.steps ? 'steps' : 'nodes';
  const seen = new Map();
  (diagram[list] ?? []).forEach((node, index) => {
    const raw = typeof node === 'string' ? node : node.label;
    if (typeof raw !== 'string') return;
    const label = normalized(raw);
    const labelPath = typeof node === 'string' ? [...path, list, index] : [...path, list, index, 'label'];
    if (seen.has(label)) report('duplicate-node-label', labelPath,
      `This label repeats ${list}[${seen.get(label)}]. Name the distinction between the two nodes.`, raw);
    else seen.set(label, index);
    if (isInsetComponentLabel(labelPath)) {
      if (COMPONENT_ACTION_PREFIX.test(label)) report('block-component-name', labelPath,
        'Use the component name without an action prefix.', raw);
    } else if (diagram.kind === 'flow') {
      const first = label.match(/^[a-z]+(?:-[a-z]+)*/iu)?.[0]?.toLowerCase();
      if (!FLOW_VERBS.has(first) || FLOW_NOUN_PHRASE.test(label)) report('flow-label-verb-first', labelPath,
        'Start with the action or the verb of a decision question.', raw);
    }
  });
}

const sameAxis = (a, b) => a && b && ['label', 'min', 'max', 'unit'].every(key => a[key] === b[key])
  && (a.scale ?? 'linear') === (b.scale ?? 'linear');

function mergeablePlots(a, b) {
  if (!sameAxis(a.x, b.x) || !sameAxis(a.y, b.y) || a.annotations?.length || b.annotations?.length
    || a.series?.length !== 1 || b.series?.length !== 1) return false;
  const [left] = a.series, [right] = b.series;
  const leftPoints = plotSeriesPoints(left), rightPoints = plotSeriesPoints(right);
  if ([leftPoints, rightPoints].some(points => points.some(point => point.label !== undefined
    || point.low !== undefined || point.high !== undefined))) return false;
  if (left.kind === 'scatter' && right.kind === 'scatter') {
    const coordinates = new Set(leftPoints.map(({ x, y }) => `${x},${y}`));
    return rightPoints.every(({ x, y }) => !coordinates.has(`${x},${y}`));
  }
  if (left.kind !== 'line' || right.kind !== 'line') return false;
  const leftX = leftPoints.map(point => point.x), rightX = rightPoints.map(point => point.x);
  return Math.max(...leftX) < Math.min(...rightX) || Math.max(...rightX) < Math.min(...leftX);
}

function comparisonRepair(diagram) {
  if (diagram.kind !== 'comparison' || diagram.variant !== 'panels' || diagram.panels?.length !== 2) return null;
  const [left, right] = diagram.panels;
  const a = left.diagram, b = right.diagram;
  if (isDeepStrictEqual({ ...a, title: undefined, caption: undefined }, { ...b, title: undefined, caption: undefined })) {
    return 'Draw the shared content once and retain the distinct panel context in the labels or caption.';
  }
  // Keep separate annotations, explanations and marks that would overlap on a shared plot.
  if (a.caption || b.caption || normalized(left.heading) === normalized(right.heading) || a.kind !== b.kind) return null;
  if (a.kind === 'coordinate-plot' && mergeablePlots(a, b)) {
    return 'Use one plot with a named series for each panel and preserve both axis domains.';
  }
  if (a.kind === 'bar-chart' && !a.variant && !b.variant && a.unit === b.unit && a.bars && b.bars
    && isDeepStrictEqual(a.bars.map(bar => bar.label), b.bars.map(bar => bar.label))) {
    return 'Use one grouped bar chart with the shared categories and a named series for each panel.';
  }
  return null;
}

// This authoring check assumes the versioned spec shape. The runtime parser owns structural validation.
export function lintDiagramContent(spec) {
  const issues = [];
  const report = (rule, path, message, value) => issues.push(value === undefined ? { rule, path, message } : { rule, path, message, value });
  function visit(value, path) {
    const key = path.at(-1);
    if (typeof value === 'string') {
      const visible = Number.isInteger(key) ? TEXT_LISTS.has(path.at(-2)) : TEXT_FIELDS.has(key);
      if (visible && needsMathDelimiters(value, key, isInsetComponentLabel(path))) report('math-delimiters', path,
        'Put each complete mathematical expression inside $…$ delimiters.', value);
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, index]));
    } else if (value && typeof value === 'object') {
      if (key === 'diagram') {
        lintNodes(value, path, report);
        lintEdges(value, path, report);
        const repair = comparisonRepair(value);
        if (repair) report('redundant-comparison', [...path, 'panels'], repair);
      }
      for (const [field, entry] of Object.entries(value)) visit(entry, [...path, field]);
    }
  }
  visit(spec.diagram, ['diagram']);
  return issues;
}
