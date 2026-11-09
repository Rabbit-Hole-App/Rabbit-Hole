// Maths in diagram labels (owner 2026-11-08: "all maths should be latex"): a formula written with the card prose's delimiters is typeset by
// KaTeX inside the svg, measured whole so its box holds it, and refused TeX stays as its source. Static markup only: how KaTeX's glyphs sit
// in the foreignObject in a real browser is the owner's check.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { renderTutorDiagram } from './TutorDiagram.js';
import { lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { alignField } from '../explanation-interactions.js';
import { diagramProblem } from '../../../control-plane/src/learn-primitives.js';

const FRACTION = String.raw`$\frac{e^{z_i}}{\sum_j e^{z_j}}$`;
const LONG = String.raw`$\operatorname{softmax}(z)_i = \frac{e^{z_i}}{\sum_{j=1}^{n} e^{z_j}} + \sqrt{a^2 + b^2}$`;
const flow = (nodes, edges) => ({ version: 1, diagram: { kind: 'flow', title: 'Softmax', nodes, edges } });
const SOFTMAX = flow([
  { id: 'a', label: 'Scores', role: 'process' },
  { id: 'b', label: 'Exponentiate ($e^x$)', role: 'process' },
  { id: 'c', label: `Normalise ${FRACTION}`, role: 'process' },
  { id: 'd', label: LONG, role: 'outcome' },
], [{ from: 'a', to: 'b', label: 'each $z_i$' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }]);
const markup = (spec, width = 408) => renderToStaticMarkup(renderTutorDiagram(spec, width).element);
const part = (html, attribute) => {
  const start = html.indexOf(attribute);
  return html.slice(start, html.indexOf('</g></g>', start));
};
// What a reader sees: tags and attributes (data-tutor-tex keeps the source) removed.
const visible = html => html.replace(/<[^>]+>/g, '');
const numbers = (tag, html) => [...html.matchAll(new RegExp(`<${tag} ([^>]*)>`, 'g'))]
  .map(([, attributes]) => Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, Number(v)])));

test('a flow node "Exponentiate ($e^x$)" is typeset by KaTeX, with no literal dollar on screen and the TeX in its accessible name', () => {
  const html = markup(SOFTMAX);
  const node = part(html, 'data-tutor-node="b"');
  assert.match(node, /<foreignObject[^>]*><div[^>]*>Exponentiate \(<span data-tutor-tex="\$e\^x\$"[^>]*><span class="katex">/);
  assert.match(node, /class="msupsub"/, 'e^x is a superscript');
  assert.doesNotMatch(visible(node), /\$|\^/);
  assert.doesNotMatch(html, /katex-error|<math/, 'no red error box, no second MathML copy inside the image');
  assert.match(html, /aria-label="Softmax\nScores — each \$z_i\$ → Exponentiate \(\$e\^x\$\)/, 'the svg\'s accessible name keeps the source');
  assert.equal(html, markup(SOFTMAX), 'deterministic');
});

test('the box grows to hold a formula, which is measured whole, never split, and never taller than its line', () => {
  const html = markup(SOFTMAX);
  for (const id of ['b', 'c', 'd']) {
    const node = part(html, `data-tutor-node="${id}"`);
    const [rect] = numbers('rect', node), objects = numbers('foreignObject', node);
    assert.ok(objects.length >= 1, id);
    for (const object of objects) {
      assert.ok(object.x >= rect.x && object.x + object.width <= rect.x + rect.width, `${id}: the formula line sits inside its box`);
      assert.ok(object.y >= rect.y && object.y + object.height <= rect.y + rect.height, `${id}: and inside its height`);
      assert.equal(object.height, lineHeight(), `${id}: one line tall`);
    }
  }
  // The long formula is wider than a flow node's usual maximum (186): the node grows to it instead of wrapping it by characters.
  const long = numbers('rect', part(html, 'data-tutor-node="d"'))[0];
  assert.ok(widestFormula(LONG) > 186 - 20 && long.width >= Math.ceil(widestFormula(LONG) + 20), `${long.width}`);
  assert.equal((part(html, 'data-tutor-node="d"').match(/data-tutor-tex=/g) || []).length, 1, 'one formula, one line');
  // A fraction is taller than a line, so it is set smaller (font-size under the label's 14 px); e^x is not.
  assert.match(part(html, 'data-tutor-node="c"'), /data-tutor-tex="[^"]*" style="font-size:(?:[0-9]|1[0-3])(?:\.\d+)?px/);
  assert.match(part(html, 'data-tutor-node="b"'), /data-tutor-tex="\$e\^x\$" style="font-size:14px/);
  // The measurer: a formula is one unit and counts as typeset, not as its TeX.
  assert.ok(textWidth(FRACTION) < textWidth(FRACTION.replaceAll('$', '')) / 2, 'a fraction is measured by its larger part, not by its source');
  assert.deepEqual(wrap('so $x + y = z$ holds', 45), ['so', '$x + y = z$', 'holds']);
  assert.deepEqual(wrap(`a ${FRACTION}-b`, 10).filter(line => line.includes('frac')), [FRACTION], 'never split, not even at a hyphen');
});

test('TeX KaTeX refuses stays as its source text: no KaTeX markup, no error box, no crash', () => {
  const html = markup(flow([{ id: 'a', label: String.raw`Bad $\frac{1$ here`, role: 'process' }, { id: 'b', label: String.raw`Unknown $\notacommand x$`, role: 'outcome' }], [{ from: 'a', to: 'b' }]));
  assert.doesNotMatch(html, /class="katex|katex-error|foreignObject/);
  assert.match(html, /<tspan[^>]*>Bad \$\\frac\{1\$ here<\/tspan>/);
  assert.match(html, /\\notacommand x\$<\/tspan>/);
  assert.match(markup(flow([{ id: 'a', label: 'Costs $5 or $10', role: 'process' }, { id: 'b', label: 'B', role: 'outcome' }], [{ from: 'a', to: 'b' }])), /<tspan[^>]*>Costs \$5 or \$10<\/tspan>/, 'currency is not maths');
});

test('an edge label and a timeline event with maths are typeset too', () => {
  // Flow edge labels are drawn after the wires and before the nodes.
  const html = markup(SOFTMAX);
  const labels = html.slice(html.lastIndexOf('data-tutor-edge='), html.indexOf('data-tutor-node="a"'));
  assert.match(labels, /<foreignObject[^>]*><div[^>]*>each <span data-tutor-tex="\$z_i\$"[^>]*><span class="katex">/);
  const timeline = markup({ version: 1, diagram: { kind: 'timeline', title: String.raw`Cooling of $T(t)$`, events: [
    { time: '$t_0$', label: String.raw`Hot: $T = T_0$`, detail: String.raw`Newton: $\frac{dT}{dt} = -k(T - T_a)$` },
    { time: 'Later', label: 'Room temperature $T_a$' },
  ] } });
  for (const tex of ['$T(t)$', '$t_0$', '$T = T_0$', String.raw`$\frac{dT}{dt} = -k(T - T_a)$`, '$T_a$']) {
    assert.ok(timeline.includes(`data-tutor-tex="${tex}"`), tex);
  }
  assert.doesNotMatch(visible(timeline.replace(/<title>[\s\S]*?<\/title>/, '')), /\$/);
  assert.doesNotMatch(timeline, /katex-error/);
});

test('the validator accepts maths in labels and counts a formula by what it shows', () => {
  assert.doesNotThrow(() => parseTutorDiagram(SOFTMAX));
  // An edge label may show 30 characters: this one is 33 as TeX and 13 on screen.
  const edge = String.raw`if $\frac{\partial L}{\partial w} > 0$`;
  assert.ok(edge.length > 30);
  assert.doesNotThrow(() => parseTutorDiagram(flow([{ id: 'a', label: 'A', role: 'process' }, { id: 'b', label: 'B', role: 'outcome' }], [{ from: 'a', to: 'b', label: edge }])));
  assert.throws(() => parseTutorDiagram(flow([{ id: 'a', label: `${'x'.repeat(55)} $abcdef$`, role: 'process' }, { id: 'b', label: 'B', role: 'outcome' }], [{ from: 'a', to: 'b' }])), /at most 60/);
  assert.throws(() => parseTutorDiagram(flow([{ id: 'a', label: 'x'.repeat(61), role: 'process' }, { id: 'b', label: 'B', role: 'outcome' }], [{ from: 'a', to: 'b' }])), 'plain text keeps its limit');
  const body = `Softmax turns scores into shares.\n\n\`\`\`rh-diagram\n${JSON.stringify(SOFTMAX)}\n\`\`\`\n\nEach share is positive.`;
  assert.equal(diagramProblem(body), null, 'the server delivers it');
});

test('the card\'s text alignment reads formulas once, including a caption with a native fallback', () => {
  const spec = structuredClone(SOFTMAX);
  spec.diagram.caption = 'Apply $x_p=e_p+PE_p$ to add the position.';
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${markup(spec)}</div></body></html>`);
  const words = tutorDiagramVisibleText(parseTutorDiagram(spec)).filter(Boolean).join(' ');
  assert.ok(alignField(document.getElementById('root'), words), 'the diagram island matches the canonical text');
});
