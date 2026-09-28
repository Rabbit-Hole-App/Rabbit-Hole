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

// How a number reads inside text: a whole part of five or more digits gets
// thousands separators ("1,770,240"); four digits stay as written ("1536"),
// so short numbers and years do not change. Only the whole part is grouped -
// "0.00001" and "12345.678" keep their decimals - and anything String() writes
// in exponent form is left alone. In TeX (an equation object) the separator
// is {,} - a bare comma there is punctuation and typesets as "25, 165".
// Display only: never feed the result back into a calculation.
export function groupDigits(value, separator = ',') {
  const text = String(value);
  const match = /^(-?)(\d{5,})(\.\d+)?$/.exec(text);
  return match ? `${match[1]}${match[2].replace(/\B(?=(\d{3})+$)/g, separator)}${match[3] || ''}` : text;
}

// Where a number in text stays as written, however long: one element of a
// list or tuple - "(50304, 384)" is a shape, "get_lr(301000)" a call, "31056,
// 3262" a list of IDs, where a thousands comma would read as another element.
// That is a number inside brackets that hold a comma or nothing else, or one
// with a number or a {{marker}} as its comma neighbour. text[start, end) is
// the number or its {{marker}}.
export function writtenRaw(text, start, end) {
  const before = text.slice(0, start), after = text.slice(end);
  const open = Math.max(before.lastIndexOf('('), before.lastIndexOf('['));
  const close = open < 0 || /[)\]]/.test(before.slice(open)) ? -1 : after.search(/[)\]]/);
  if (close >= 0 && (/,/.test(before.slice(open) + after.slice(0, close)) || !(before.slice(open + 1) + after.slice(0, close)).trim())) return true;
  return /[\d}]\s*,\s*$/.test(before) || /^\s*,\s*[\d{]/.test(after);
}

// The numbers a reader would have to count digits in: a whole part of five or
// more digits, written without separators, that is not a decimal's fraction
// or exponent and not written raw on purpose (writtenRaw). The board-wide gate
// (number-grouping.test.mjs) requires none on any card.
export function ungroupedNumbers(text) {
  return [...text.matchAll(/\d{5,}/g)]
    .filter(({ 0: digits, index }) => !/[\d.,]$/.test(text.slice(0, index)) && !/^[eE]/.test(text.slice(index + digits.length)) && !writtenRaw(text, index, index + digits.length))
    .map(match => match[0]);
}

export function formatCell(value, format = 'decimal') {
  if (format === 'integer') {
    const whole = Math.round(value);
    return String(Object.is(whole, -0) ? 0 : whole);
  }
  const text = value.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}
