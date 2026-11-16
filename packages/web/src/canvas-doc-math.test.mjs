import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMath, withInlineMath } from './canvas-doc-math.js';

test('$$ on lines of its own is a math block that splits the Markdown; one-line $$...$$ too', () => {
  const { parts, inline } = splitMath('Intro line.\n\n$$\nL = -\\sum_i y_i \\log p_i\n$$\n\nAfter.\n$$ a^2 + b^2 = c^2 $$\nEnd.');
  assert.deepEqual(parts, [{ markdown: 'Intro line.\n' }, { latex: 'L = -\\sum_i y_i \\log p_i' }, { markdown: '\nAfter.' }, { latex: 'a^2 + b^2 = c^2' }, { markdown: 'End.' }]);
  assert.deepEqual(inline, []);
});

test('$...$ becomes a placeholder word, numbered in order; prices, escaped dollars and code are left alone', () => {
  const { parts, inline } = splitMath('The rate $\\eta$ times $x_i^2$ costs $5 and $6, not \\$7. Code `$a$` stays.');
  assert.deepEqual(inline, ['\\eta', 'x_i^2']);
  assert.equal(parts[0].markdown, 'The rate RHMATH0X times RHMATH1X costs $5 and $6, not \\$7. Code `$a$` stays.');
});

test('fenced code is never math, and an unclosed $$ stays text', () => {
  const { parts, inline } = splitMath('```\n$$ x $$\nprint("$a$")\n```\n$$ unclosed');
  assert.deepEqual(inline, []);
  assert.deepEqual(parts, [{ markdown: '```\n$$ x $$\nprint("$a$")\n```\n$$ unclosed' }]);
});

test('withInlineMath puts each placeholder back as inline math, keeping styles, inside links and children', () => {
  const inline = ['\\eta', 'y'];
  const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'rate RHMATH0X here', styles: { bold: true } }, { type: 'link', href: 'https://x', content: [{ type: 'text', text: 'RHMATH1X', styles: {} }] }],
    children: [{ type: 'paragraph', content: [{ type: 'text', text: 'RHMATH1X', styles: {} }], children: [] }] }];
  const [out] = withInlineMath(blocks, inline);
  assert.deepEqual(out.content, [
    { type: 'text', text: 'rate ', styles: { bold: true } }, { type: 'inlineMath', props: { latex: '\\eta' } }, { type: 'text', text: ' here', styles: { bold: true } },
    { type: 'link', href: 'https://x', content: [{ type: 'inlineMath', props: { latex: 'y' } }] },
  ]);
  assert.deepEqual(out.children[0].content, [{ type: 'inlineMath', props: { latex: 'y' } }]);
  assert.deepEqual(withInlineMath([{ type: 'divider' }], inline), [{ type: 'divider' }]);
});
