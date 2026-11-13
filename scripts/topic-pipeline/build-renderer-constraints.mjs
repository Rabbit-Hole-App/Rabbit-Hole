// Generates agents/inputs/renderer-constraints.md: every custom validation message the tutor-diagram parser can raise, grouped by diagram kind.
// The JSON schema excerpt shows shapes and lengths; these are the rules it cannot express. Usage: node build-renderer-constraints.mjs [--check]
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const here = dirname(fileURLToPath(import.meta.url));
export const OUTPUT = join(here, 'agents/inputs/renderer-constraints.md');
const DIAGRAMS = resolve(here, '../../packages/web/src/tutor-diagrams');
const SOURCES = ['spec.js', 'block-stack-spec.js', 'ml-composition-spec.js', 'ml-data-spec.js', 'ml-plot-spec.js', 'ml-statistical-spec.js', 'ml-topology-spec.js', 'tensor-spec.js', 'token-links-spec.js'];

const isNode = value => value && typeof value.type === 'string';
function children(node) {
  return Object.values(node).flatMap(value => Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []);
}
const text = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
  : node?.type === 'TemplateLiteral' ? node.quasis.map(quasi => quasi.value.cooked).join('…') : null;
const kindOf = node => {
  // `x.kind === 'flow'` or `'flow' === x.kind`
  if (node?.type !== 'BinaryExpression' || !['===', '=='].includes(node.operator)) return null;
  const [a, b] = [node.left, node.right];
  const literal = a.type === 'Literal' ? a : b.type === 'Literal' ? b : null, other = literal === a ? b : a;
  return literal && typeof literal.value === 'string' && other.type === 'MemberExpression' && other.property?.name === 'kind' ? literal.value : null;
};

function collect(ast) {
  const messages = [], functionKinds = new Map();
  const visit = (node, scope) => {
    let next = scope;
    if ((node.type === 'FunctionDeclaration' && node.id) ) next = { ...scope, fn: node.id.name };
    if (node.type === 'VariableDeclarator' && node.id?.name && /Function/u.test(node.init?.type ?? '')) next = { ...scope, fn: node.id.name };
    if (node.type === 'SwitchCase' && node.test?.type === 'Literal' && typeof node.test.value === 'string') next = { ...scope, kind: node.test.value };
    if (node.type === 'IfStatement' && kindOf(node.test)) { visit(node.consequent, { ...scope, kind: kindOf(node.test) }); if (node.alternate) visit(node.alternate, scope); return; }
    if (node.type === 'CallExpression') {
      const callee = node.callee, name = callee.type === 'Identifier' ? callee.name : callee.property?.name;
      if (scope.kind && callee.type === 'Identifier' && /^check[A-Z]/u.test(name)) functionKinds.set(name, scope.kind);
      let message = null;
      if (callee.type === 'Identifier' && callee.name === 'issue') message = text(node.arguments[1]);
      else if (name === 'addIssue') message = text(node.arguments[0]?.properties?.find(property => property.key?.name === 'message')?.value);
      else if (name === 'refine' || name === 'superRefine') message = text(node.arguments[1]) ?? text(node.arguments[1]?.properties?.find(property => property.key?.name === 'message')?.value);
      if (message) messages.push({ message, kind: scope.kind, fn: scope.fn });
    }
    for (const child of children(node)) visit(child, next);
  };
  visit(ast, {});
  return { messages, functionKinds };
}

// The release suite's content contract (content-contract.js; reference-content-contract.test.mjs fails a reference that breaks it). Rules, their messages, the verb list
// and the reject patterns are read from the source, so the sheet and the suite cannot drift apart (item 5, reviewer 2026-11-13).
const CONTRACT_PATTERNS = ['PLACEHOLDER_EDGE', 'BOOLEAN_EDGE', 'FLOW_NOUN_PHRASE', 'COMPONENT_ACTION_PREFIX'];
async function contractSection(directory) {
  const source = await readFile(join(directory, 'content-contract.js'), 'utf8').catch(() => null);
  if (!source) return [];
  const rules = new Map(), patterns = new Map();
  let verbs = [];
  const visit = node => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'report' && node.arguments[0]?.type === 'Literal') {
      const message = text(node.arguments[2]);
      if (message) rules.set(node.arguments[0].value, message);
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      if (CONTRACT_PATTERNS.includes(node.id.name) && node.init?.regex) patterns.set(node.id.name, `/${node.init.regex.pattern}/${node.init.regex.flags}`);
      if (node.id.name === 'FLOW_VERBS') {
        const template = [];
        const find = n => { if (n.type === 'TemplateLiteral') template.push(n.quasis.map(q => q.value.cooked).join(' ')); for (const child of children(n)) find(child); };
        find(node.init);
        verbs = (template[0] ?? '').trim().split(/\s+/u).filter(Boolean).sort();
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  if (!rules.size) return [];
  const lines = ['## Content contract (the release suite enforces these on every reference; meet them before stage 05)', '',
    'A reference that breaks one fails `reference-content-contract.test.mjs` in the web unit suite, so the pipeline refuses it in the author round (rule id `content-contract:<name>`).', ''];
  for (const [rule, message] of [...rules].sort(([a], [b]) => a.localeCompare(b))) lines.push(`- ${rule}: ${message}`);
  if (/report\('redundant-comparison'/u.test(source)) lines.push('- redundant-comparison: a two-panel comparison whose panels hold the same content, or could be one plot or one grouped bar chart, is refused: draw the shared content once (one plot with a named series per panel, or one grouped bar chart) and keep the panel context in the labels or caption.');
  if (rules.has('math-delimiters')) lines.push('', 'Mathematics in a label includes the operators and arrows between formulas: `$a$ → $b$` and `$a$ = $b$` fail because the arrow or sign stands outside the delimiters. Write one span (`$a \\to b$`) or use words (`from $a$ to $b$`). A superscript, subscript or Greek letter in a unit or axis name needs its own `$…$` too.');
  if (rules.has('duplicate-node-label')) lines.push('', 'Node labels must be unique within one node list after trimming and collapsing spaces: give each node its own words (two "Update weights" nodes fail).');
  if (rules.has('flow-label-verb-first') && verbs.length) lines.push('', `Flow node labels start with an action: the first word (lower-cased, hyphens allowed) must be one of these base verbs or auxiliaries (${verbs.length} words), and a label that is only a noun phrase matching ${patterns.get('FLOW_NOUN_PHRASE') ?? 'the contract'} fails. "Compute prediction" passes; "Prediction" and "Model output" fail.`, '', verbs.join(' '));
  if (rules.has('placeholder-edge-label') && patterns.has('PLACEHOLDER_EDGE')) lines.push('', `An edge label that matches ${patterns.get('PLACEHOLDER_EDGE')} (then, next, continue, arrow, label, step, tbd ...) is a placeholder: name the condition or omit the label. A bare yes/no/true/false ${patterns.get('BOOLEAN_EDGE') ?? ''} is accepted only on a decision's branches.`);
  if (rules.has('block-component-name') && patterns.has('COMPONENT_ACTION_PREFIX')) lines.push('', `Component names in block-stack insets have no action prefix: a label matching ${patterns.get('COMPONENT_ACTION_PREFIX')} fails ("Run optimizer" fails; "Optimizer" passes).`);
  lines.push('');
  return lines;
}

// Lengths (reviewer 2026-11-13): the JSON schema excerpt carries maxLength = twice the real limit (the parser counts the text as shown, and allows the source up to twice that), so an author
// reading it wrote a 16-character unit under a 12-character rule. Read from the live schema: every free-text string of a kind, by path, with its real limit in plain words.
async function lengthsSection(directory) {
  let schema;
  try { schema = (await import(pathToFileURL(join(directory, 'spec.js')).href)).tutorDiagramJsonSchema; } catch { return []; }
  const branches = schema?.properties?.diagram?.anyOf ?? schema?.properties?.diagram?.oneOf;
  if (!Array.isArray(branches)) return [];
  const perKind = new Map();
  const walk = (node, path, into) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'string' && Number.isInteger(node.maxLength) && node.maxLength % 2 === 0 && !node.pattern && !node.enum && node.const === undefined) into.set(path, node.maxLength / 2);
    for (const [name, child] of Object.entries(node.properties ?? {})) walk(child, path ? `${path}.${name}` : name, into);
    if (node.items) walk(node.items, `${path}[]`, into);
    for (const key of ['anyOf', 'oneOf', 'allOf']) for (const child of node[key] ?? []) walk(child, path, into);
  };
  for (const branch of branches) { const into = new Map(); walk(branch, '', into); perKind.set(branch.properties?.kind?.const ?? '?', into); }
  const kinds = [...perKind.keys()].sort();
  const common = [...perKind.get(kinds[0])].filter(([path, limit]) => kinds.every(kind => perKind.get(kind).get(path) === limit));
  const same = new Set(common.map(([path]) => path));
  const words = ([path, limit]) => `${path} at most ${limit} characters`;
  return ['## Lengths (the limit that counts is the text as shown)', '',
    'The JSON schema excerpt shows maxLength values that are TWICE these limits: it measures the source text. The renderer counts the text as shown (a formula counts one character per symbol, so `$\\alpha$` is 1) and rejects any text longer than the limit below, so write to these numbers, not the schema\'s.', '',
    `- Every diagram: ${common.map(words).join('; ')}.`,
    ...kinds.map(kind => [...perKind.get(kind)].filter(([path]) => !same.has(path)).map(words)).map((entries, index) => entries.length ? `- ${kinds[index]}: ${entries.join('; ')}.` : null).filter(Boolean), ''];
}

// Linter rules (reviewer 2026-11-13): written from the linter's own rule table (checks/reference-linter.mjs RULES), so each numbered flag the author gets back has its rule here
// in plain words with its exemptions and one pass and one fail. Rules 5, 6 and 9 were the ones costing rounds.
async function linterSection() {
  const { RULES } = await import('./checks/reference-linter.mjs');
  return ['## Linter rules (the pre-round check and stage 05 raise these; every flag names its rule number)', '',
    ...Object.entries(RULES).map(([number, rule]) => `- Rule ${number}, ${rule.name}: ${rule.text}${rule.exempt === 'none' ? '' : ` Exemptions: ${rule.exempt}.`} Pass: ${rule.pass}. Fail: ${rule.fail}.`), ''];
}

export async function buildConstraints(directory = DIAGRAMS) {
  const present = new Set(await readdir(directory)), groups = new Map();
  const found = [];
  for (const name of SOURCES.filter(name => present.has(name))) {
    const { messages, functionKinds } = collect(parse(await readFile(join(directory, name), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }));
    for (const item of messages) found.push({ ...item, kind: item.kind ?? functionKinds.get(item.fn), file: name });
  }
  // A check function called from several kinds takes the first kind found; unresolved functions group under their file's general rules.
  for (const item of found) {
    const key = item.kind ?? 'other checks (diagram kind not inferred; read the message)';
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(item.message);
  }
  const body = [...groups.keys()].sort((a, b) => (a.startsWith('other') ? 1 : b.startsWith('other') ? -1 : a.localeCompare(b)))
    .map(key => [`## ${key}`, '', ...[...groups.get(key)].sort().map(message => `- ${message}`), ''].join('\n'));
  return ['# Renderer constraints (generated)', '',
    'Generated by `build-renderer-constraints.mjs` from the tutor-diagram parser sources; do not edit. The JSON schema excerpt shows shapes (its string lengths are twice the real limits: see Lengths). These are the additional rules the local parser enforces, by diagram kind. A diagram that breaks one is rejected.', '',
    ...(await lengthsSection(directory)), ...(await linterSection()), ...body, ...(await contractSection(directory))].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = await buildConstraints();
  if (process.argv.includes('--check')) {
    const current = await readFile(OUTPUT, 'utf8').catch(() => '');
    if (current.replace(/\r\n/g, '\n') !== content) { console.error('renderer-constraints.md is stale; run node build-renderer-constraints.mjs'); process.exitCode = 1; }
  } else { await mkdir(dirname(OUTPUT), { recursive: true }); await writeFile(OUTPUT, content); console.log(`wrote ${OUTPUT}`); }
}
