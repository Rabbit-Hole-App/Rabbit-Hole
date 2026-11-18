// 40 test phrases: expected values vs the shipped index (spokenNumbers, counting words kept) vs the prototype. Writes checks.md and exits 1 when the prototype misses an expectation.
import fs from 'node:fs';
import { spokenNumbers } from '../../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
import { mentions } from './parser-prototype.mjs';
// [phrase, expected values (every acceptable form of each number; [] = must NOT count), note]
const T = [
  ['zero point three six eight', [[0.368]], ''],
  ['point five', [[0.5]], 'no leading digit'],
  ['point zero five', [[0.05]], ''],
  ['three point five', [[3.5]], ''],
  ['thirty-six point eight percent', [[36.8, 0.368]], 'hyphen + decimal + percent'],
  ['36.8%', [[36.8, 0.368]], 'digits + symbol'],
  ['36.8 percent', [[36.8, 0.368]], ''],
  ['eighty percent', [[80, 0.8]], ''],
  ['one percent', [[1, 0.01]], 'a lone one is a number once percent follows'],
  ['two thirds', [[0.6667]], 'fraction'],
  ['a third of the data', [[0.3333]], ''],
  ['three quarters', [[0.75]], ''],
  ['a half', [[0.5]], ''],
  ['one half', [[0.5]], ''],
  ['two and a half', [[2.5]], ''],
  ['one hundred', [[100]], ''],
  ['a hundred', [[100]], ''],
  ['one hundred and five', [[105]], ''],
  ['two hundred fifty', [[250]], ''],
  ['a thousand', [[1000]], ''],
  ['two thousand and twenty four', [[2024]], ''],
  ['a million', [[1e6]], ''],
  ['minus two', [[-2]], 'sign'],
  ['negative zero point five', [[-0.5]], ''],
  ['-2', [[-2]], 'digit with minus'],
  ['thirty-six', [[36]], 'hyphenated compound'],
  ['twenty five', [[25]], ''],
  ['nineteen eighty four', [[1984]], 'spoken year'],
  ['twenty twenty four', [[2024]], 'spoken year'],
  ['1,250', [[1250]], 'thousands separator'],
  ['1/2', [[0.5]], 'digit fraction'],
  ['seven', [[7]], 'counting word: a number to the parser, free to the rule'],
  // must NOT count
  ['no one knows', [], 'pronoun'],
  ['one idea at a time', [], 'article/pronoun one'],
  ['the lowest point of the curve', [], 'noun point'],
  ['the first, second and third step', [], 'ordinals'],
  ['it takes one second', [], 'second as a unit (the one is a pronoun-like lone one)'],
  ['half of the time', [], 'bare half'],
  ['it happens once or twice', [], 'once/twice'],
  ['hundreds of examples', [], 'plural scale'],
];
const near = (a, b) => Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(b));
const fmt = vs => (vs.length ? vs.join(', ') : 'none');
const rows = []; let bad = 0;
for (const [p, exp, note] of T) {
  const old = spokenNumbers(p), now = mentions(p).map(m => m.forms[0]), nowAll = mentions(p);
  const okNew = nowAll.length === exp.length && exp.every((forms, i) => nowAll[i].forms.some(f => forms.some(e => near(f, e))));
  const okOld = old.length === exp.length && exp.every((forms, i) => forms.some(e => near(old[i], e)));
  if (!okNew) bad++;
  rows.push(`| ${rows.length + 1} | \`${p}\` | ${exp.length ? exp.map(f => f.join(' = ')).join('; ') : 'none (not a number)'} | ${fmt(old)} ${okOld ? 'ok' : 'WRONG'} | ${fmt(now)} ${okNew ? 'ok' : 'WRONG'} | ${note} |`);
}
const md = ['| # | phrase | expected | old index | new parser | note |', '|---|---|---|---|---|---|', ...rows].join('\n');
fs.writeFileSync(new URL('./checks.md', import.meta.url), md + '\n');
console.log(md); console.log(`\nnew parser wrong: ${bad} of ${T.length}`);
process.exit(bad ? 1 : 0);
