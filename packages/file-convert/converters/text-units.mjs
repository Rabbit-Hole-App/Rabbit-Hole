// The extracted-text derivative (`text.json`, kind `text`) in the shared shape chat citations read
// (packages/web/src/file-text-units.js on the docs lane): { v: 1, units: [{ loc, text }], complete, limited? }.
// One unit per PDF page ({ page }) or slide ({ slide }); a slide's speaker notes are their own unit
// ({ slide, notes: true }); a hidden slide's text starts with "[Hidden slide]", as the card's own units do.
// raw: { units: [{ page | slide, text, notes?, hidden? }], truncated }, total: the document's page/slide count.
// Word/PowerPoint list bullets drawn from the Symbol and Wingdings fonts reach the PDF text layer as
// private-use code points (U+F0B7 Symbol bullet, U+F0A7 square, U+F076 diamond, U+F0D8 arrowhead,
// U+F0FC check, U+F06E / U+F0A8 squares): they read as "•".
const PUA_BULLETS = /[\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF06E\uF0A8]/g;
export const cleanText = t => String(t).replace(PUA_BULLETS, '•');

export function textUnits(raw, unitKey, total) {
  const units = [];
  for (const u of raw.units) {
    const n = u[unitKey];
    units.push({ loc: { [unitKey]: n }, text: cleanText([u.hidden ? '[Hidden slide]' : '', u.text].filter(Boolean).join('\n')) });
    if (u.notes) units.push({ loc: { slide: n, notes: true }, text: cleanText(u.notes) });
  }
  const read = raw.units.length;
  const empty = !raw.units.some(u => u.text || u.notes);
  const gaps = [];
  if (raw.truncated || read < total) gaps.push(`${unitKey}s 1-${raw.units.at(-1)?.[unitKey] ?? 0} of ${total}`);
  if (empty) gaps.push('no text layer (a scanned document?); OCR was not run');
  return { v: 1, units, complete: !gaps.length, ...(gaps.length ? { limited: gaps.join('; ') } : {}) };
}
