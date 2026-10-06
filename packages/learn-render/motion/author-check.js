// The Remotion Author contract (spec §5.3, §8; M4): conventions that tie generated source to its
// storyboard, checked on the AST after the safety checks in static-check.js (which stay as they
// are). A composition source:
//   export const timeline = { B1: [from, to], ... }  frames per beat, exactly the storyboard's
//   export const TEXT = { key: 'string', ... }       every learner-visible string, rendered as {TEXT.key}
//   data-object="<id>"                              exactly one element per storyboard object id,
//                                                   the same element in every beat (stable identity)
// A reusable primitive may set data-object={props.id}: then each storyboard id is written once as
// a literal where the primitive is used (a JSX prop or a spec object's value). Statically every id
// appears exactly once as such a literal; the frame probe checks one live element per id.
// TEXT keeps every storyboard label, on_screen_text and shown source line verbatim; anything the
// Author adds is short and passes the storyboard's learner-text vocabulary rules.
//   checkAuthorSource(source, brief, storyboard) -> { errors, mapping }
// ponytail: prose hidden in a one-word prop, or text built at run time, is not visible to this
// static pass; the frame probe (author-proof.mjs) checks the text a viewer actually sees.
import { parse } from '@babel/parser';
import { STAGE } from './contracts.js';
import { ABSOLUTE } from './director.js';
import { FONT_FAMILIES } from './static-check.js';
import { LIMITS, briefFacts, codeNames, sentences, vocabulary, vocabularyErrors, wordCount } from './storyboard-check.js';

const squash = s => String(s).replace(/\s+/g, ' ').trim();
const keyName = k => k?.type === 'Identifier' ? k.name : k?.type === 'StringLiteral' ? k.value : null;
const stringOf = n => n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis.map(q => q.value.cooked).join('') : null;
const LETTERS = /[A-Za-z]{2,}/;
// Two or more plain words: prose, not a CSS value ('3px solid #E3E2E0') or an id.
const CSS_WORDS = new Set(['solid', 'dashed', 'dotted', 'double', 'none', 'auto', 'inherit', 'initial', 'center', 'left', 'right', 'top', 'bottom', 'normal', 'bold', 'italic', 'absolute', 'relative', 'fixed', 'flex', 'column', 'row', 'wrap', 'nowrap', 'hidden', 'visible', 'inset', 'transparent', 'block', 'inline', 'grid', 'pre', 'middle', 'baseline', 'start', 'end', 'stretch', 'contain', 'cover', 'ellipsis', 'uppercase', 'lowercase', 'nowrap', 'tabular', 'nums', 'round', 'butt', 'square', 'miter', 'linear', 'radial']);
const isProse = s => (s.match(/\S+/g) || []).filter(t => /^[A-Za-z][a-z]+[.,:;!?]?$/.test(t) && !CSS_WORDS.has(t.toLowerCase().replace(/[.,:;!?]$/, ''))).length >= 2;
const isFontList = s => s.split(',').every(f => FONT_FAMILIES.includes(f.trim().replace(/^['"]|['"]$/g, '')));

function walk(node, parent, visit) {
  visit(node, parent);
  for (const key in node) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node, visit); }
    else if (v && typeof v.type === 'string') walk(v, node, visit);
  }
}

// Frames per beat, [from, to): the storyboard's 0.1 s boundaries at 30 fps.
export const timelineFrames = storyboard => Object.fromEntries(storyboard.beats.map(b => [b.id, [Math.round(b.start_time * STAGE.fps), Math.round(b.end_time * STAGE.fps)]]));

// The strings the composition must show verbatim: labels, on-screen text, shown source lines.
export function requiredText(brief, storyboard) {
  const f = briefFacts(brief);
  const labels = new Set(), screen = new Set(), code = new Set();
  for (const b of storyboard.beats) {
    if (b.on_screen_text?.trim()) screen.add(squash(b.on_screen_text));
    for (const o of b.visible_objects) {
      if (o.label) labels.add(squash(o.label));
      if (o.source) for (const line of f.lineText(o.source.source_ref_id, o.source.start_line, o.source.end_line).split('\n')) if (line.trim()) code.add(line.trim());
    }
  }
  return { labels: [...labels], on_screen_text: [...screen], code_lines: [...code] };
}

// Every learner-visible string (TEXT: key -> string) against the storyboard: required text
// verbatim, and anything the Author adds short and taught only by the contract. Shared by both
// renderers' Authors (M7B), so the HyperFrames Author meets exactly the Remotion text rules.
// label names the text in messages: 'TEXT' for Remotion's TEXT object, 'text' for HTML text.
export function textContractErrors(TEXT, brief, storyboard, label = 'TEXT') {
  const e = [];
  const values = Object.values(TEXT).map(squash);
  const valueLines = new Set(Object.values(TEXT).flatMap(v => v.split('\n').map(l => l.trim())));
  const req = requiredText(brief, storyboard);
  for (const s of [...req.labels, ...req.on_screen_text]) if (!values.includes(s)) e.push(`${label}: the storyboard text "${s}" must appear verbatim`);
  for (const line of req.code_lines) if (!valueLines.has(line)) e.push(`${label}: the shown source line "${line}" must appear verbatim (one ${label} line)`);

  // What the Author adds is short and teaches nothing the brief and storyboard do not. Its words
  // come from the contract (claims, must_show, objective, direction, conditions, storyboard text),
  // never from raw source: code is evidence to show verbatim, not a place to read new meaning
  // (`dropout_p=self.dropout if self.training else 0` must not become "dropout only while training").
  const f = briefFacts(brief);
  const storyboardStems = vocabulary(storyboard.beats.flatMap(b => [b.on_screen_text, b.narration_line, ...b.visible_objects.map(o => o.label)]).filter(Boolean));
  const contract = { ...f, positive: vocabulary([brief.title, brief.objective, brief.visual_direction, ...brief.must_show, ...brief.claim_registry.map(c => c.text), ...brief.implementation_conditions.flatMap(k => [k.condition, ...k.branches.map(b => b.when)]), ...(brief.analogy_map || []).flatMap(a => [a.analogy_element, a.real_concept])]) };
  const evidence = brief.evidence.map(x => x.excerpt).join('\n') + '\n' + [...req.labels, ...req.on_screen_text].join('\n');
  const verbatim = new Set([...req.labels, ...req.on_screen_text]);
  for (const [k, v] of Object.entries(TEXT)) {
    if (verbatim.has(squash(v)) || v.split('\n').every(l => !l.trim() || req.code_lines.includes(l.trim()) || f.excerpt && [...f.excerpt.values()].some(x => x.includes(l.trim())))) continue;
    if (v.includes('\n') || v.length > LIMITS.label_chars || wordCount(v) > LIMITS.label_words || sentences(v) > 1) e.push(`${label}.${k}: Author text is one short line (at most ${LIMITS.label_chars} characters / ${LIMITS.label_words} words): "${v}"`);
    e.push(...vocabularyErrors(`${label}.${k}`, v, contract, storyboardStems));
    for (const name of codeNames(v)) if (!evidence.includes(name)) e.push(`${label}.${k}: names "${name}", which is not in the brief's evidence`);
    if (brief.implementation_conditions.length && ABSOLUTE.test(v)) e.push(`${label}.${k}: "${v.match(ABSOLUTE)[0]}" in a brief with branch-dependent code`);
  }
  return e;
}

export function checkAuthorSource(source, brief, storyboard) {
  let ast;
  try { ast = parse(source, { sourceType: 'module', plugins: ['jsx'] }); }
  catch (error) { return { errors: [`source does not parse: ${error.message}`], mapping: null }; }
  const e = [];
  const at = (n, msg) => e.push(`${n.loc?.start.line}:${(n.loc?.start.column ?? 0) + 1} ${msg}`);
  let timelineNode = null, textNode = null;
  for (const s of ast.program.body) {
    if (s.type !== 'ExportNamedDeclaration' || s.declaration?.type !== 'VariableDeclaration') continue;
    for (const d of s.declaration.declarations) {
      if (d.id.name === 'timeline') timelineNode = d.init;
      if (d.id.name === 'TEXT') textNode = d.init;
    }
  }

  // The beats, frame-exact.
  const want = timelineFrames(storyboard);
  const got = {};
  if (timelineNode?.type !== 'ObjectExpression') e.push(`timeline: missing \`export const timeline = ${JSON.stringify(want)}\``);
  else for (const p of timelineNode.properties) {
    const k = keyName(p.key);
    const v = p.value?.type === 'ArrayExpression' && p.value.elements.length === 2 && p.value.elements.every(x => x?.type === 'NumericLiteral') ? p.value.elements.map(x => x.value) : null;
    if (!v) at(p, `timeline.${k}: [from, to] as number literals`);
    else got[k] = v;
  }
  if (timelineNode?.type === 'ObjectExpression') {
    for (const [id, frames] of Object.entries(want)) if (JSON.stringify(got[id]) !== JSON.stringify(frames)) e.push(`timeline.${id}: must be [${frames.join(', ')}] (storyboard ${storyboard.beats.find(b => b.id === id).start_time}-${storyboard.beats.find(b => b.id === id).end_time}s at ${STAGE.fps} fps)${got[id] ? `, got [${got[id].join(', ')}]` : ''}`);
    for (const id of Object.keys(got)) if (!(id in want)) e.push(`timeline.${id}: not a storyboard beat`);
  }

  // Every learner-visible string, declared once.
  const TEXT = {};
  if (textNode?.type !== 'ObjectExpression') e.push('TEXT: missing `export const TEXT = { key: \'string\', ... }` holding every learner-visible string');
  else for (const p of textNode.properties) {
    const k = keyName(p.key), v = stringOf(p.value);
    if (v === null) at(p, `TEXT.${k}: a string literal`);
    else TEXT[k] = v;
  }
  e.push(...textContractErrors(TEXT, brief, storyboard));

  // One renderer element per storyboard object.
  const ids = new Set(storyboard.beats.flatMap(b => b.visible_objects.map(o => o.id)));
  const elements = {};
  const textDecl = textNode ? [textNode.start, textNode.end] : [-1, -1];
  let dynamic = 0;
  walk(ast.program, null, (n, p) => {
    if (n.type === 'JSXAttribute' && n.name.type === 'JSXIdentifier') {
      const v = n.value?.type === 'StringLiteral' ? n.value.value : n.value?.type === 'JSXExpressionContainer' ? stringOf(n.value.expression) : null;
      if (n.name.name === 'data-object') {
        if (v === null) { dynamic++; return; } // set by a primitive from its props
        if (!ids.has(v)) return at(n, `data-object "${v}" is not a storyboard object`);
      }
      // a storyboard id written as a literal: on the element itself, or as a prop of a primitive
      if (v !== null && ids.has(v)) (elements[v] ||= []).push(`${p?.name?.type === 'JSXIdentifier' ? p.name.name : 'element'}${n.name.name === 'data-object' ? '' : `[${n.name.name}]`}@${n.loc.start.line}`);
      if (n.name.name === 'data-object') return;
    }
    // ... or as a value in a spec object a primitive renders from ({ id: 'chip_model', ... })
    if (n.type === 'ObjectProperty' && n.value?.type === 'StringLiteral' && ids.has(n.value.value) && !(n.start >= (textNode?.start ?? -1) && n.end <= (textNode?.end ?? -1))) (elements[n.value.value] ||= []).push(`spec.${keyName(n.key)}@${n.loc.start.line}`);
    // Text reaches the screen only through TEXT.
    if (n.type === 'JSXText' && LETTERS.test(n.value)) return at(n, `text "${squash(n.value).slice(0, 40)}" in JSX: render {TEXT.key}`);
    if (n.type === 'JSXExpressionContainer' && p?.type === 'JSXElement') {
      const v = stringOf(n.expression) ?? (n.expression.type === 'TemplateLiteral' ? n.expression.quasis.map(q => q.value.cooked).join('') : null);
      if (v !== null && LETTERS.test(v)) return at(n, `text "${squash(v).slice(0, 40)}" in JSX: render {TEXT.key}`);
    }
    if ((n.type === 'StringLiteral' || n.type === 'TemplateElement') && !(n.start >= textDecl[0] && n.end <= textDecl[1])) {
      const v = n.type === 'StringLiteral' ? n.value : n.value.cooked ?? '';
      if (p?.type === 'ImportDeclaration' || isFontList(v)) return;
      if (isProse(v)) at(n, `prose outside TEXT: "${squash(v).slice(0, 50)}"`);
    }
  });
  for (const id of ids) {
    if (!elements[id]) e.push(`data-object "${id}": no element carries this storyboard object${dynamic ? ' (write the id once as a literal where the primitive is used)' : ''}`);
    else if (elements[id].length > 1) e.push(`data-object "${id}": written ${elements[id].length} times (${elements[id].join(', ')}); one element keeps the object's identity across beats`);
  }
  return { errors: [...new Set(e)], mapping: { timeline: got, objects: Object.fromEntries(Object.entries(elements).map(([k, v]) => [k, v[0]])), text: TEXT } };
}
