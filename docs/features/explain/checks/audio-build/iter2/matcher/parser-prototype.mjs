// ONE shared number parser (prototype, scratch only): the card's text and the script's text both go through mentions(), and a mention matches the card when any of its forms equals any form of any card mention.
// mention = { text, value, forms[], kind, counting }.  forms: the same quantity written the other way (36.8 percent = 36.8 = 0.368; two thirds = 0.6667 = 66.67).
// counting: a lone spelled two..ten ("two paths"): free when the card has numbers, exactly as the shipped rule (owner A3). A lone "one" is never a mention (pronoun, article).
// Not numbers on purpose: ordinals (first, second, third, 1st), "once/twice/double/triple", a bare "half"/"quarter" ("half of the time"), plurals ("hundreds of"), the noun "point" ("the lowest point").
// Fractions count only as "<a|an|number> <half|third|quarter|fifth..>" with numerator < denominator ("a third", "two thirds", "three quarters"); "and a half" after a number adds 0.5.

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const DENOM = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10 };
const DIGIT_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const has = (t, w) => Object.hasOwn(t, w);
const round = v => Number(v.toFixed(9));
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[a-z]+|%|[,;:.!?()—–]/g;

// -> [{ s, e, v }] a spelled number starting at tokens[i] (no sign, no percent): integer part + optional "point d d d", or "point d d" alone. null when tokens[i] does not start one.
function wordNumber(tk, i) {
  const w = k => tk[k]?.t;
  let k = i, value = null, lone = false, kind = 'word';
  const a = w(k) === 'a' || w(k) === 'an';
  if (a && (has(SCALE, w(k + 1)))) { value = SCALE[w(k + 1)]; k += 2; kind = 'scale'; }
  else if (a && has(DENOM, w(k + 1)) && w(k + 1) !== 'halves' && (w(k + 1) === 'half' || w(k + 1) === 'quarter' || w(k + 2) === 'of' || !tk[k + 2] || /^[,;:.!?()]$/.test(w(k + 2)))) return { k: k + 2, v: 1 / DENOM[w(k + 1)], kind: 'fraction', forms: [1 / DENOM[w(k + 1)]] };
  else if (w(k) === 'point' && has(DIGIT_WORDS, w(k + 1))) value = 0;
  else if (has(UNITS, w(k)) || has(TENS, w(k)) || has(SCALE, w(k))) {
    // a spoken year: "nineteen eighty four", "twenty twenty four", "nineteen oh five" -> 1984, 2024, 1905
    if (UNITS[w(k)] >= 13 && UNITS[w(k)] <= 19 || w(k) === 'twenty') {
      const hi = has(UNITS, w(k)) ? UNITS[w(k)] : 20;
      if (has(TENS, w(k + 1))) { let lo = TENS[w(k + 1)], n = k + 2; if (has(UNITS, w(n)) && UNITS[w(n)] < 10 && UNITS[w(n)] > 0) { lo += UNITS[w(n)]; n++; } if (!has(SCALE, w(n))) return { k: n, v: hi * 100 + lo, kind: 'year', forms: [hi * 100 + lo] }; }
      else if ((w(k + 1) === 'oh' || w(k + 1) === 'zero') && has(UNITS, w(k + 2)) && UNITS[w(k + 2)] > 0 && UNITS[w(k + 2)] < 10) return { k: k + 3, v: hi * 100 + UNITS[w(k + 2)], kind: 'year', forms: [hi * 100 + UNITS[w(k + 2)]] };
    }
    let total = 0, part = 0, sawTens = false, sawUnit = false, any = false, first = k;
    for (; k < tk.length; k++) {
      const x = w(k);
      if (has(SCALE, x)) { part = (part || 1) * SCALE[x]; if (SCALE[x] >= 1e3) { total += part; part = 0; } sawTens = sawUnit = false; any = true; kind = 'scale'; continue; }
      if (x === 'and' && any && (has(UNITS, w(k + 1)) || has(TENS, w(k + 1))) && has(SCALE, w(k - 1))) continue; // "one hundred and five"
      if (has(TENS, x)) { if (sawTens || sawUnit) break; part += TENS[x]; sawTens = true; any = true; continue; }
      if (has(UNITS, x)) { if (sawUnit || (sawTens && UNITS[x] >= 10)) break; part += UNITS[x]; sawUnit = UNITS[x] < 10 || sawUnit; if (UNITS[x] >= 10) sawTens = true; any = true; continue; }
      break;
    }
    if (!any) return null;
    value = total + part;
    lone = k - first === 1 && has(UNITS, w(first));
  } else return null;
  // spoken decimal
  if (w(k) === 'point' && has(DIGIT_WORDS, w(k + 1))) {
    let f = ''; k++;
    while (has(DIGIT_WORDS, w(k))) f += DIGIT_WORDS[w(k++)];
    return { k, v: round(Number(`${value}.${f}`)), kind: 'decimal', forms: [round(Number(`${value}.${f}`))] };
  }
  // "two and a half"
  if (w(k) === 'and' && (w(k + 1) === 'a' || w(k + 1) === 'an') && w(k + 2) === 'half') { return { k: k + 3, v: value + 0.5, kind: 'decimal', forms: [value + 0.5] }; }
  // fraction: "two thirds", "one half", "three quarters"
  if (has(DENOM, w(k)) && value >= 1 && value < DENOM[w(k)] && kind === 'word') { const f = value / DENOM[w(k)]; return { k: k + 1, v: f, kind: 'fraction', forms: [f] }; }
  return { k, v: value, kind, lone: lone && value >= 2 && value <= 10, bareOne: lone && value === 1, forms: [value] };
}

// config.dropIdentDigits: digits glued to a letter or underscore (Q1, x_0, e2) are names, not numbers. Off by default so the shipped reading (they are numbers) is kept and only the spoken forms differ.
export const config = { dropIdentDigits: false };
export function mentions(text) {
  const src = String(text ?? '').toLowerCase().replace(/‑/g, '-').replace(config.dropIdentDigits ? /(?<=[a-z_])\d+(?![a-z])/g : /(?<=(?:zero|one|two|three|four|five|six|seven|eight|nine|point))\d+(?![a-z])/g, d => ' '.repeat(d.length)); // a digit glued to a number word ("six0 eight", a model typo seen once) drops out and the words join, as the shipped index reads it
  const tk = [...src.matchAll(TOKEN)].map(m => ({ t: m[0], s: m.index, e: m.index + m[0].length }));
  const out = [];
  const signBefore = (i, startChar) => { // "minus two", "negative zero point five", "-2" / "−2" at the start of a token run
    const prev = tk[i - 1]?.t, before = tk[i - 2]?.t; // 'minus' after a number or a one-letter name is subtraction ("n minus one", "ten minus six"), not a sign
    if (prev === 'negative' || (prev === 'minus' && !(before && (/^[0-9]/.test(before) || before.length === 1 && before !== 'a' || has(UNITS, before) || has(TENS, before) || has(SCALE, before))))) return tk[i - 1].s;
    const c = src[startChar - 1]; if ((c === '-' || c === '−') && (startChar - 1 === 0 || /[\s(=:,[]/.test(src[startChar - 2]))) return startChar - 1;
    return -1;
  };
  for (let i = 0; i < tk.length;) {
    const t = tk[i].t; let m = null, k = i + 1;
    if (/^\d/.test(t)) {
      const v = round(Number(t.replace(/,/g, '')));
      const next = tk[i + 1]?.t, adj = tk[i + 1] && tk[i + 1].s === tk[i].e;
      if ((next === '%' && adj) || next === 'percent' || (next === 'per' && tk[i + 2]?.t === 'cent')) { m = { v, kind: 'percent', forms: [v, round(v / 100)] }; k = i + (next === 'per' ? 3 : 2); }
      else if (adj && /^(st|nd|rd|th)$/.test(next ?? '') ) { k = i + 2; }                                  // 1st, 2nd: ordinal
      else if (src[tk[i].e] === '/' && /^\d/.test(src.slice(tk[i].e + 1))) { const d = src.slice(tk[i].e + 1).match(/^\d+/)[0]; if (v < Number(d)) { const f = v / Number(d); m = { v: f, kind: 'fraction', forms: [f] }; k = i + 1; while (tk[k] && tk[k].s < tk[i].e + 1 + d.length) k++; } else m = { v, kind: 'digit', forms: [v] }; }
      else m = { v, kind: 'digit', forms: [v] };
      if (m) m.s = tk[i].s;
    } else if (/^[a-z]+$/.test(t)) {
      const r = wordNumber(tk, i);
      if (r) {
        k = r.k; const next = tk[k]?.t;
        m = { v: r.v, kind: r.kind, forms: r.forms, lone: r.lone, s: tk[i].s };
        if (r.kind !== 'fraction' && (next === 'percent' || (next === 'per' && tk[k + 1]?.t === 'cent'))) { m = { ...m, kind: 'percent', forms: [r.v, round(r.v / 100)], lone: false }; k += next === 'per' ? 2 : 1; }
        if (r.bareOne && m.kind !== 'percent') m.bare = true; // lone "one": a number only after minus/negative
      }
    }
    if (m) {
      const sb = signBefore(i, tk[i].s);
      if (sb >= 0 && m.kind !== 'fraction') { m.v = -m.v; m.forms = m.forms.map(x => -x); m.kind = 'negative'; m.lone = false; m.bare = false; m.s = sb; }
      if (m.bare) { i = Math.max(k, i + 1); continue; }
      m.e = tk[k - 1].e; m.text = src.slice(m.s, m.e); m.counting = !!m.lone; m.span = [m.s, m.e]; delete m.lone; delete m.s; delete m.e; delete m.bare;
      out.push(m);
    }
    i = Math.max(k, i + 1);
  }
  return out;
}

const keyOf = v => round(v);
// The card's number set: every form of every mention in the given texts (counting words included, as the shipped cardNumbers does).
export function cardSet(...texts) {
  const forms = new Set(), list = [];
  for (const t of texts) for (const m of mentions(t)) for (const f of m.forms) { forms.add(keyOf(f)); list.push(f); }
  return { forms, list };
}
// A mention is the card's when one of its forms equals one of the card's; a fraction also matches a rounded decimal within 0.5% (two thirds = 0.667 = 66.7 percent).
export function inCard(m, card) {
  if (m.forms.some(f => card.forms.has(keyOf(f)))) return true;
  if (m.kind === 'fraction') return m.forms.some(f => card.list.some(c => c !== 0 && Math.abs(f - c) / Math.abs(c) <= 0.005 || Math.abs(f * 100 - c) / Math.abs(c) <= 0.005));
  return false;
}
// Mentions of a sentence that are outside the card (counting words free when the card has numbers).
export const outsideMentions = (sentence, card) => mentions(sentence).filter(m => !(m.counting && card.forms.size) && !inCard(m, card));
// The numbers a script speaks as data (counting words excluded), for the example rule.
export const dataMentions = text => mentions(text).filter(m => !m.counting);
