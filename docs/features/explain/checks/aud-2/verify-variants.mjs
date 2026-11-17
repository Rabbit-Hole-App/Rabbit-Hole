// Mechanical checks of every script: V0 (existing outputs), V1-V4 (variants.json). Writes verify-out.json and prints the numeric sentences for hand review.
import fs from 'node:fs';
const D = 'C:/s/sprint2-evidence/aud-2/';
const cards = JSON.parse(fs.readFileSync(D + 'cards.json', 'utf8'));
const TRIAL = [1, 4, 5, 6, 7, 9, 10, 11, 12];
const fw0 = JSON.parse(fs.readFileSync(D + 'scripts.json', 'utf8')), gm0 = JSON.parse(fs.readFileSync(D + 'scripts-gemini.json', 'utf8')), vars = JSON.parse(fs.readFileSync(D + 'variants.json', 'utf8'));
const rows = [];
for (const [prov, set] of [['fireworks', fw0], ['gemini', gm0]]) for (const n of TRIAL) rows.push({ ...set[n - 1], provider: prov, variant: 'V0', n, reasoningTokens: set[n - 1].usage?.completion_tokens_details?.reasoning_tokens ?? null });
rows.push(...vars, ...JSON.parse(fs.readFileSync(D + 'variants-v5.json', 'utf8')), ...JSON.parse(fs.readFileSync(D + 'variants-v6.json', 'utf8')));

// ---- spoken numbers -> numerals ("seven point three nine" -> 7.39) ----
const U = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const T = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNum = w => w in U || w in T || w === 'hundred' || w === 'thousand';
function normalize(text) {
  const toks = text.replace(/[\u2011\u2013-]/g, ' ').replace(/([.,;:!?)\u2019\u201d])(?=\s|$)/g, ' $1').replace(/([(\u201c])/g, '$1 ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length;) {
    const w = toks[i].toLowerCase();
    if (isNum(w)) {
      let v = 0, cur = 0, j = i, any = false;
      while (j < toks.length && isNum(toks[j].toLowerCase())) { const x = toks[j].toLowerCase(); if (x === 'hundred') cur = (cur || 1) * 100; else if (x === 'thousand') { v += (cur || 1) * 1000; cur = 0; } else cur += U[x] ?? T[x]; any = true; j++; }
      let num = String(v + cur);
      if (any && toks[j]?.toLowerCase() === 'point' && j + 1 < toks.length && toks[j + 1].toLowerCase() in U && U[toks[j + 1].toLowerCase()] < 10) { let k = j + 1, dec = ''; while (k < toks.length && toks[k].toLowerCase() in U && U[toks[k].toLowerCase()] < 10) { dec += U[toks[k].toLowerCase()]; k++; } num += '.' + dec; j = k; }
      out.push(num); i = j;
    } else { out.push(toks[i]); i++; }
  }
  return out.join(' ').replace(/ ([.,;:!?)"\u2019\u201d])/g, '$1').replace(/([(\u201c]) /g, '$1');
}
const nums = t => (normalize(t).match(/\d+(?:\.\d+)?/g) || []).map(Number);

// ---- symbols ----
const SYM = /[=+*\/^<>\[\]%\u00b2\u00b3\u2080-\u2089\u00b7\u2248\u03b7\u00d7\u00f7\u2212\\$_~]/g;
const symbols = t => (t.match(SYM) || []);
const numerals = t => (t.match(/\d+(?:\.\d+)?/g) || []);

// ---- reuse ----
const words = t => t.toLowerCase().replace(/\$/g, ' ').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
const grams = (t, k) => { const w = words(t), s = new Set(); for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(' ')); return s; };
function overlap(script, card) { const a = grams(script, 5), b = grams(card.body + ' ' + card.visualLabels.join(' '), 5); return [...a].filter(x => b.has(x)); }
// distinctive "card's own example" detectors on the normalized script (numerals), per card
const REUSE = {
  1: s => /of the (items|cases)[^.]*\b(yes|positive)/i.test(s) && /\bhow (often|many)\b/i.test(s) ? 'restates the two definitions' : null,
  4: s => (s.match(/\b(fog|foggy|hill|hilly|hillside|valley|downhill)\b/gi) || []).length >= 2 ? 'reuses the hill-in-the-fog analogy' : null,
  5: s => /0\.368|36\.8|0\.632|63\.2/.test(s) ? 'repeats the card figures 0.368 / 0.632' : null,
  6: s => { const n = nums(s); return [6, 12, 18].every(x => n.includes(x)) ? 'uses the card Q1 6, Q3 12, outlier 18' : null; },
  7: s => ['intake', 'compression', 'power', 'exhaust'].every(w => new RegExp(w, 'i').test(s)) && s.search(/intake/i) < s.search(/compression/i) && s.search(/compression/i) < s.search(/power/i) ? 'walks the four strokes again' : null,
  9: s => /e to the 2(\.0)?\b/.test(s) && /\b0\.1\b/.test(s) ? 'uses the card scores 2.0, 1.0, 0.1' : null,
  10: s => { const n = nums(s); return /insert|inserting/i.test(s) && [7, 8, 6].every(x => n.includes(x)) ? 'replays the card insert-7 example (7, 8, 6)' : null; },
  11: s => /aerodynamic|bulk formula/i.test(s) ? 'restates the card evaporation formula line' : null,
  12: s => /contour|two weights|step (1|one)|steps? (1|one) to (3|three)/i.test(s) ? 'reuses the card two-weight contour path' : null,
};
// ---- other slip detectors ----
const flat = s => s.split(/(?<=[.?!])\s+/).filter(x => /\b(flat|plateau|gentle|almost level)\b/i.test(x) && /\b(longer|bigger|larger|increas\w+ the step|bigger stride|larger step)\b/i.test(x));
function softmaxPairs(s) { const t = normalize(s), out = []; for (const m of t.matchAll(/e to the (\d+(?:\.\d+)?)[^\d]{0,50}?(\d+(?:\.\d+)?)/gi)) { const x = +m[1], y = +m[2], t2 = Math.exp(x); out.push({ claim: `e^${x} = ${y}`, true: +t2.toFixed(2), ok: Math.abs(y - t2) / t2 < 0.02 }); } return out; }
function ratioClaims(s) { return [...normalize(s).matchAll(/(\d+(?:\.\d+)?)[ -]to[ -](\d+(?:\.\d+)?)/g)].map(m => m[0]); }
function bootstrap(s) {
  const t = normalize(s), bad = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?) percent/g)) { const x = +m[1]; if ((x > 60 && x < 66 || x > 34 && x < 40) && ![63, 63.2, 63.4, 36.8, 37, 36.6].includes(x)) bad.push(x + ' percent'); }
  const decs = (t.match(/\b0\.\d+/g) || []).map(Number).filter(x => x > 0.6 && x < 0.66 && x !== 0.632 && x !== 0.634 || x > 0.34 && x < 0.4 && x !== 0.368 && x !== 0.366);
  return { badPercents: bad, badDecimals: decs };
}
function sentencesWithNumbers(s) { return normalize(s).split(/(?<=[.?!])\s+/).filter(x => /\d/.test(x)); }

const win = { Brief: [60, 80], Balanced: [80, 100], Detailed: [100, 130] };
for (const r of rows) {
  const card = cards[r.n - 1], s = r.script || '', norm = normalize(s), sec = Math.round(r.words / 180 * 60), [a, b] = win[r.depthLabel];
  r.check = {
    words: r.words, sec180: sec, inWindow: sec >= a && sec <= b, over: sec > b, under: sec < a,
    opener: s.split(/\s+/).slice(0, 7).join(' '), formulaOpener: /^(the )?(hardest|trickiest|toughest|part that|point that|step that|trick that|subtle point|catch|idea that trips|part (here|to picture)|one idea)/i.test(s) || /^the (hardest|part|point|step|trick|trickiest|subtle)/i.test(s),
    symbols: symbols(s).length, symbolChars: [...new Set(symbols(s))].join(''), numerals: numerals(s).length,
    reuseTag: REUSE[r.n]?.(norm) ?? null, overlap5: overlap(s, card).length, overlapSample: overlap(s, card).slice(0, 3),
    flatGroundClaim: r.n === 4 ? flat(s) : undefined, softmax: r.n === 9 ? { pairs: softmaxPairs(s), ratios: ratioClaims(s) } : undefined, bootstrap: r.n === 5 ? bootstrap(s) : undefined,
    numberSentences: [5, 6, 9, 12, 4, 10, 1].includes(r.n) ? sentencesWithNumbers(s) : [],
  };
}
fs.writeFileSync(D + 'verify-out.json', JSON.stringify(rows.map(r => ({ provider: r.provider, variant: r.variant, n: r.n, id: r.id, depthLabel: r.depthLabel, reasoningTokens: r.reasoningTokens, finish: r.finish, completion: r.usage?.completion_tokens, usd: r.usd, check: r.check })), null, 1));
if (process.argv[2] === 'dump') for (const r of rows) {
  const c = r.check; console.log(`\n### ${r.provider} ${r.variant} #${r.n} ${r.id} ${r.depthLabel} ${c.words}w ${c.sec180}s sym=${c.symbols}${c.symbolChars} num=${c.numerals} reuse=${c.reuseTag} ov5=${c.overlap5} opener="${c.opener}" fo=${c.formulaOpener}`);
  if (c.flatGroundClaim?.length) console.log('  FLAT-CLAIM:', c.flatGroundClaim.join(' | '));
  if (c.softmax) console.log('  SOFTMAX:', JSON.stringify(c.softmax));
  if (c.bootstrap && (c.bootstrap.badPercents.length || c.bootstrap.badDecimals.length)) console.log('  BOOT-BAD:', JSON.stringify(c.bootstrap));
  for (const x of c.numberSentences) console.log('  NUM>', x);
}
