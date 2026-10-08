// Equations on the learning canvas (docs/features/canvas-equations.md): the item, its palette, its resize, and the guard
// that keeps typing in an equation away from the canvas's keys. The editor itself (MathLive) is EquationEditor.jsx,
// loaded only when an equation is edited.

// The item, saved with the board like a text box: { id, kind: 'equation', x, y, latex, size }. `latex` is the editable
// source - what is saved, copied, duplicated and asked about; the picture is rendered from it (KaTeX) every time.
export const EQUATION_SIZE = 24;
export const newEquation = ({ x, y }) => ({ id: crypto.randomUUID(), kind: 'equation', x, y, latex: '', size: EQUATION_SIZE, fresh: true });

// The corner handle scales the type, never a box: the new size follows the width dragged to, within readable bounds.
export const scaledSize = (size, from, to) => Math.max(12, Math.min(160, Math.round(size * to / Math.max(1, from))));

// Where the keyboard belongs to a field, so the canvas's keys (Delete, Ctrl+D, C, /, Ctrl+V...) stand down: a text box,
// an input, or an equation being edited. MathLive's <math-field> keeps its own input in a shadow root, so the page sees
// the field itself as document.activeElement - neither contenteditable nor an input.
export const typingIn = element => !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'MATH-FIELD'].includes(element.tagName));

// The palette: each group a tab. `label` is what the button shows (rendered with KaTeX), `insert` what MathLive inserts:
// #@ takes the selection, or the term just before the caret, and #? is an empty slot to fill.
const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'phi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Omega'];
const matrix = (env, rows, cols, cell = '#?') => `\\begin{${env}}${Array.from({ length: rows }, () => Array(cols).fill(cell).join('&')).join('\\\\')}\\end{${env}}`;
export const EQUATION_PALETTE = [
  { id: 'fraction', tab: 'Fraction', name: 'Fractions, powers and subscripts', items: [
    { title: 'Fraction', label: '\\frac{a}{b}', insert: '\\frac{#@}{#?}' },
    { title: 'Power', label: 'x^{n}', insert: '#@^{#?}' },
    { title: 'Subscript', label: 'x_{i}', insert: '#@_{#?}' },
    { title: 'Subscript and power', label: 'x_{i}^{n}', insert: '#@_{#?}^{#?}' },
  ] },
  { id: 'root', tab: 'Root', name: 'Square roots', items: [
    { title: 'Square root', label: '\\sqrt{x}', insert: '\\sqrt{#@}' },
    { title: 'nth root', label: '\\sqrt[n]{x}', insert: '\\sqrt[#?]{#@}' },
  ] },
  { id: 'greek', tab: 'Greek', name: 'Greek letters', items: GREEK.map(letter => ({ title: letter, label: `\\${letter}`, insert: `\\${letter}` })) },
  { id: 'sum', tab: 'Sum', name: 'Sums and integrals', items: [
    { title: 'Sum', label: '\\sum_{i=1}^{n}', insert: '\\sum_{#?}^{#?}' },
    { title: 'Product', label: '\\prod_{i=1}^{n}', insert: '\\prod_{#?}^{#?}' },
    { title: 'Integral', label: '\\int_{a}^{b}', insert: '\\int_{#?}^{#?}' },
    { title: 'Indefinite integral', label: '\\int', insert: '\\int' },
    { title: 'Double integral', label: '\\iint', insert: '\\iint' },
    { title: 'Contour integral', label: '\\oint', insert: '\\oint' },
    { title: 'Limit', label: '\\lim_{x\\to a}', insert: '\\lim_{#?\\to #?}' },
  ] },
  { id: 'matrix', tab: 'Matrix', name: 'Matrices and brackets', items: [
    { title: '2 by 2 matrix', label: matrix('pmatrix', 2, 2, 'a'), insert: matrix('pmatrix', 2, 2) },
    { title: '2 by 2 matrix, square brackets', label: matrix('bmatrix', 2, 2, 'a'), insert: matrix('bmatrix', 2, 2) },
    { title: '3 by 3 matrix', label: matrix('pmatrix', 3, 3, 'a'), insert: matrix('pmatrix', 3, 3) },
    { title: 'Determinant', label: matrix('vmatrix', 2, 2, 'a'), insert: matrix('vmatrix', 2, 2) },
    { title: 'Parentheses', label: '(x)', insert: '\\left(#@\\right)' },
    { title: 'Square brackets', label: '[x]', insert: '\\left[#@\\right]' },
    { title: 'Braces', label: '\\{x\\}', insert: '\\left\\{#@\\right\\}' },
    { title: 'Absolute value', label: '|x|', insert: '\\left|#@\\right|' },
  ] },
];
