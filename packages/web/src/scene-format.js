// How a number reads inside a data cell (grid, strip): formatted once, here,
// from the canonical value the evaluator hands over (scene-derive.js's
// cellPool) - never from a value already rounded for display somewhere else.
//
// Default: two decimals with the leading zero, at every magnitude - "0.90",
// "10.01", "-0.25" - so a column reads as one kind of number and 19.795 is
// never shown as a bare "20". Whole numbers only where the object asks for
// them (`numberFormat: 'integer'`: token IDs, counts); a value is never made
// an integer because of its size. A value that rounds to zero shows "0.00",
// not "-0.00".
// The one font size for every number in a grid or strip: the numeral style's
// own size, capped by the cell's height and by its width for the object's
// longest formatted number (0.6em per monospace character). One size per
// object, so a row never mixes sizes because one cell holds a minus sign. The
// renderer draws with it and the legibility gate (scene-layout.js) checks it.
export function cellNumeralSize(texts, cell, base) {
  const longest = texts.reduce((most, text) => Math.max(most, text.length), 4);
  return Math.min(base, cell * 0.42, (cell - 6) / (0.6 * longest));
}

export function formatCell(value, format = 'decimal') {
  if (format === 'integer') {
    const whole = Math.round(value);
    return String(Object.is(whole, -0) ? 0 : whole);
  }
  const text = value.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}
