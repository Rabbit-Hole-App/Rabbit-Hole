// VEC-1: a tuple-shaped formula in a matrix cell, $(0.12,-0.06)$ with numeric entries only, is drawn as plain text, "(0.12, −0.06)": the same characters as the formula's own rendering, but text
// can wrap after its comma where a formula never wraps, so the cell no longer has to be as wide as the whole tuple. Any other cell text is returned as it is.
const TUPLE = /^\$\(\s*([-+−]?\d+(?:\.\d+)?(?:\s*,\s*[-+−]?\d+(?:\.\d+)?)+)\s*\)\$$/u;

export function tuplePlainText(text) {
  const match = TUPLE.exec(String(text).trim());
  return match ? `(${match[1].split(',').map(entry => entry.trim().replace('-', '−')).join(', ')})` : text;
}

// The widest piece a tuple cell has to hold (a piece is what is left of the text after a break at a comma: "(0.12," and "−0.06)"); 0 for any cell that is not a tuple.
export function tuplePieceWidth(text, measure) {
  const plain = tuplePlainText(text);
  return plain === text ? 0 : Math.max(...plain.split(' ').map(piece => measure(piece)));
}
