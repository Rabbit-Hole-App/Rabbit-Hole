// The one math-formatting sentence every prompt that writes card or chat text reuses. Md renders $...$ and $$...$$ with KaTeX
// (web/src/MathText.jsx); anything else on screen is literal. Import-free: the browser imports learn-grade.js, which imports this.
export const MATH_FORMAT = 'Write every mathematical expression as LaTeX between dollar signs: $...$ inline and $$...$$ on its own lines for display equations (for example $\frac{a}{b}$ or $x_i$). Leave code, file names, snake_case identifiers and currency amounts as plain text, never in dollar signs.';
