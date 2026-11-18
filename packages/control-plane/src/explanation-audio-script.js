// The spoken add-on of an /explain card, part 1: the script prompt and the deterministic number and symbol check (docs/features/explain.md "Card audio").
// Pure: no provider call, no storage. explanation-audio.js calls these.
//
// The prompt is AUD-2's v1.1 (C:/s/sprint2-evidence/aud-2/prompt-v1.1.txt, root causes in why.md) with the changes listed in the audio build README:
// the numbers rule is the owner's (only numbers that appear in the card, never compute) and no longer pulls against the reuse rule; the reply is two strings (script for the
// voice, transcript for the window); Detailed stops at about two minutes. Gemini gets the length block of why.md section C (its scripts run short), Fireworks the v1.1 block.
import { validDepth, DEFAULT_DEPTH } from './chat-depth.js';

const LENGTHS = Object.freeze({
  // Words at the voice's measured 170 to 200 words a minute (speed 1.1): Brief 60 to 80 s, Balanced about 90 s, Detailed up to about 2 minutes (owner decision).
  standard: {
    brief: 'Brief: aim for 60 to 80 seconds of speech, about 180 to 240 words. The single most useful clarification plus one short example. No side cases, no list of misconceptions.',
    balanced: 'Balanced: aim for about 90 seconds, about 240 to 300 words. The clarification, one or two examples, one misconception.',
    detailed: 'Detailed: aim for up to about 2 minutes, about 300 to 360 words. A fuller second explanation, examples, edge cases, the misconception, and what to try next.',
  },
  // Gemini writes about 0.6 (Brief), 0.7 (Balanced) and 0.9 (Detailed) of the words it is asked for (length measurement 2026-11-17, 144 real calls: raw medians 129 / 205 / 318 words against asks of
  // 190 / 260 / 320), so its asks are the owner's targets divided by that ratio, with a content checklist and a floor sentence. Iteration 2 measured the first pass at 185 / 273 / 302 words after the strip (Detailed raw median 315 for an ask of 340 to 400, under its floor on 10 of 24), so Detailed asked 400 to 460 in iteration 3, which overshot (v3 measurement: median 341 words, max 507, about 170 s); it now asks 360 to 420 with a ceiling. The spoken length stays the owner's: about 60 to 80 s, 90 s, up to 2 minutes.
  gemini: {
    brief: 'Brief: write 300 to 360 words, 60 to 80 seconds of speech. Include: one clarification of the hardest idea, one short worked example in words, a second angle on it, and one sentence on what to notice next. Do not stop before 300 words.',
    balanced: 'Balanced: write 360 to 420 words, about 90 seconds of speech. Include: the clarification, two different examples, one misconception, a second angle on the hardest part, and what to notice next. Do not stop before 360 words.',
    detailed: 'Detailed: write 360 to 420 words, up to about 2 minutes of speech, never above 420 words. Include: a fuller second explanation, two different examples, an edge case, one misconception, and what to try next. Do not stop before 360 words.',
  },
});

// The hard floor, in words after the number check (owner 2026-11-17): a script under it is asked for once more, and still under it is an error, never short audio.
export const FLOOR_WORDS = Object.freeze({ brief: 110, balanced: 200, detailed: 300 });
export const floorWords = depth => FLOOR_WORDS[validDepth(depth) || DEFAULT_DEPTH];
export const LENGTH_TARGET_WORDS = Object.freeze({ brief: [180, 240], balanced: [240, 300], detailed: [300, 360] });
export const lengthLine = (depth, family = 'standard') => LENGTHS[family === 'gemini' ? 'gemini' : 'standard'][validDepth(depth) || DEFAULT_DEPTH];

const TEX = String.fromCharCode(36); // the LaTeX delimiter, written here so the prompt's own text carries no money-looking figure (credits-only-ui scans sources)
export function scriptSystem(depth, family = 'standard') {
  const level = validDepth(depth) || DEFAULT_DEPTH;
  return `You write the script for a short spoken audio companion to an explanation card. A voice actor will read your script aloud exactly as written.

THE SITUATION
The learner has the card on screen and has already read it. The audio is an add-on that helps them understand the card's idea more fully. It is NOT a reading of the card.

DO NOT read, summarize, paraphrase or restate the card. Do not walk through its steps in its order. Do not repeat its definitions. Assume the learner knows exactly what the card says and wants the next thing: what the card does not say. Treat everything in the card text and in the labels of its visuals as already said and shown: do not replay its example, its labelled items or its steps, and do not restate its definitions or formulas. Pick a different example, or none.

WHAT TO ADD, IN THIS ORDER
1. The one idea in the card that learners most often get wrong or find hardest, explained a second way.
2. One or two concrete examples or an analogy.
3. A common misconception about this topic, and what to notice or try next.
Everything must be true and consistent with the card. Add depth; never contradict the card, and do not invent facts you are not sure of.

NUMBERS
Use only numbers that appear in the card text or in the labels of its visuals, exactly as written there. Say at least one of the card's own numbers aloud, in the sentence where you explain the idea, so the explanation is tied to the card's figures. Never compute anything: no sums, products, roots, percentages, rounding or conversions. If an example would need a number that is not in the card, describe it in words without a value. Plain counting words (one, two, three, first, second, twice, half) are fine anywhere, but do not invent quantities for an example: use only the card's own numbers, or no number. Use the card's figures, but do not walk through the card's worked example step by step.

STYLE: MIRROR THE CARD
The script must sound like it was written by the same author as the card. Read the card's prose first and match:
- its register and formality (plain and direct stays plain and direct; technical stays technical),
- its vocabulary level and the exact terms it uses (use the card's own words for its concepts; do not simplify or inflate them),
- its sentence length and rhythm,
- its tone.
The voice that reads the script is warm and friendly, but that is only how it is read. Do not add chatty enthusiasm, exclamation marks, rhetorical cheerleading or filler that the card does not have. No "Great question", no "Let's dive in", no "Isn't that cool". Be as warm as the card is warm, and no warmer.

WRITTEN FOR THE EAR
- Short sentences. One idea per sentence. Plain connecting words.
- No markdown, no bullet lists, no headings, no numbered lists, no emoji, no stage directions, no sound cues.
- In "script", no LaTeX, no symbols and no Greek letters (no equals sign, plus, slash, caret, percent sign, brackets or currency sign; say a letter such as sigma or e as a word). Say math aloud in words: "x squared over two", "zero point three six eight". Spell out units and abbreviations the way a person would say them.
- Do not open by repeating the card's title, and never say "in this card", "as the card says" or "above". Start directly on the idea, in the card's own register.
- Do not close with a recap of the card or a sign-off.

OPENING
Vary your opening. Never start with "The hardest part" or "The part that trips" or any announcement of what is hard. Open on a concrete image, on a question the learner might be asking, or on the common misconception itself.

DEPTH
The user message gives the card's depth. This card is ${level}. Obey it in content and in length.
${lengthLine(level, family)}
Write at least the lower number of words and no more than the upper number.

OUTPUT
Return only JSON of this exact shape: {"script": "...", "transcript": "..."}
"script" is the whole script as one plain string, for the voice. "transcript" is the same words in the same sentences in the same order, for a window shown beside the audio: write every equation, expression and number that you said aloud as LaTeX between ${TEX} signs, for example ${TEX}x^2/2${TEX} or ${TEX}0.368${TEX}, and change nothing else. Both strings use spaces and sentence punctuation only (no line breaks).`;
}

// The visuals' own words: every title, label, text, name or caption in each rh-diagram or rh-illustration fence (AUD-2 build-cards.mjs).
const FENCE = /```(rh-[a-z-]+)[^\n]*\n([\s\S]*?)```/g;
const LABEL_KEYS = new Set(['title', 'label', 'text', 'name', 'caption', 'alt']);
function collect(value, into, labels = true) {
  if (Array.isArray(value)) value.forEach(item => collect(item, into, labels));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (typeof item === 'string' && LABEL_KEYS.has(key)) into.labels.add(item); else collect(item, into, labels); }
}
// What the learner never sees in a diagram spec: the format marker (`version`), ids and node references (`id`, `key`, `from`, `to` as link indices or arrow end points, `source`, `target`, `index`).
// The rest of a spec renders (labels, captions, items, axis bounds, plotted values, box-plot values). shortcut: this is a key list read from the 12 bench cards' specs, not each kind's layout; a kind with another
// unrendered field would still count it (listed in the build README), and a spec key that is shown under one of these names would be missed.
const UNSEEN = new Set(['version', 'id', 'ids', 'key', 'keys', 'from', 'to', 'source', 'target', 'index']);
const seen = value => (Array.isArray(value) ? value.map(seen) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !UNSEEN.has(key)).map(([key, item]) => [key, seen(item)])) : value);
// -> { prose, labels: [string], visualText } prose: the body with the fences removed; visualText: every string and number a learner can see inside the fences (see UNSEEN), for the allowed-number set.
export function splitCard(body) {
  const into = { labels: new Set() }, inside = [];
  for (const [, , source] of String(body ?? '').matchAll(FENCE)) {
    let kept = source;
    try {
      const parsed = JSON.parse(source);
      collect(parsed, into);
      kept = JSON.stringify(seen(parsed));
    } catch { /* an unreadable fence contributes its raw text to the numbers only */ }
    inside.push(kept);
  }
  return { prose: String(body ?? '').replace(FENCE, ' ').replace(/\n{3,}/g, '\n\n').trim(), labels: [...into.labels].slice(0, 40).map(label => label.slice(0, 160)), visualText: inside.join('\n') };
}

export function scriptUser({ depth, question, title, prose, labels }) {
  return [`Card depth: ${({ brief: 'Brief', balanced: 'Balanced', detailed: 'Detailed' })[validDepth(depth) || DEFAULT_DEPTH]}`,
    ...(question ? [`The learner's question: ${question}`] : []),
    `Card title: ${title}`, `Card text (what the learner has read):\n${prose}`, `Labels of the card's visuals: ${labels.length ? labels.join(' | ') : '(none)'}`,
    'Write the audio companion script now.'].join('\n\n');
}

// ---- number and symbol safety (deterministic, no model) ----
// The owner's rule: every number in the script is a number of the card. After the model answers, each sentence that speaks a number outside the card's set is removed from the script
// and the transcript (no regenerate, no retry). ONE parser (mentions) reads both the card's text and the script's: digits, percents, spoken decimals ("zero point three six eight", "point five"), fractions ("two thirds",
// "a third of", "1/2"), hundred, thousand and million, "two and a half", signs ("minus two", "negative zero point five", "-2"), hyphenated compounds and spoken years ("nineteen eighty four", "twenty twenty four").
// Every mention carries equivalent forms ("36.8 percent" is 36.8 and 0.368; "two thirds" is 0.6667), and it matches the card when any form equals any form of the card (a fraction also matches a rounded
// decimal within 0.5 percent). Deliberately not numbers: a lone "one" (pronoun, article), ordinals ("first", "a third" not followed by "of"), once, twice, double, a bare "half" or "quarter", "hundreds of", the
// noun "point" and subtraction ("n minus one"). Counting words (a lone zero to ten) are numbers to the parser and always free to the rule (owner 2026-11-17).
// Digits inside a name (Q1, w_0) are numbers the script may say (they are the card's own words, "w zero") but never the example the rule asks for. A lone zero or one is free like the counting words. Table of expected readings: the unit test "the one shared number parser".
// mention = { text, v, forms[], kind, counting }.
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
  return { k, v: value, kind, lone: lone && value >= 0 && value <= 10, bareOne: lone && value === 1, forms: [value] };
}

export function mentions(text) {
  const src = String(text ?? '').toLowerCase().replace(/‑/g, '-').replace(/(?<=(?:zero|one|two|three|four|five|six|seven|eight|nine|point))\d+(?![a-z])/g, d => ' '.repeat(d.length)); // a digit glued to a number word ("six0 eight", a model typo seen once) drops out and the words join, as the shipped index reads it
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
      if (m) { m.s = tk[i].s; if (/[a-z_]/.test(src[tk[i].s - 1] ?? '') || /_\{[^}]*$/.test(src.slice(0, tk[i].s))) m.ident = true; } // a digit glued to a letter or underscore, or inside a subscript brace, is a name (Q1, w_0, w_{t+1}): allowed to be said, never an example
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


const keyOf = value => round(value);
// Every number a text mentions (counting words included) / only data (counting words left out), as the sets of all their forms.
const formsOf = (texts, keep) => new Set(texts.flatMap(text => mentions(text).filter(keep).flatMap(m => m.forms.map(keyOf))));
export const cardNumbers = (...texts) => formsOf(texts, () => true);
// The card's data values only: what a script must speak at least one of. Not counting words (a lone zero to ten) and not names with digits (Q1, w_0): a card with only those asks for no example.
export const cardDataNumbers = (...texts) => formsOf(texts, m => !m.counting && !m.ident);
// A mention is the card's when one of its forms is in the set; a fraction also matches a rounded decimal within 0.5% (two thirds = 0.667 = 66.7 percent).
export function inCard(m, set) {
  if (m.forms.some(f => set.has(keyOf(f)))) return true;
  if (m.kind !== 'fraction') return false;
  return m.forms.some(f => [...set].some(c => c !== 0 && (Math.abs(f - c) / Math.abs(c) <= 0.005 || Math.abs(f * 100 - c) / Math.abs(c) <= 0.005)));
}
// The mentions of a text outside the card. Counting words (a lone two to ten, a lone zero) are always free, on a card with no numbers too (owner 2026-11-17, replacing the exception for such cards).
export const outsideMentions = (text, allowed) => mentions(text).filter(m => !m.counting && !inCard(m, allowed));
export const spokenNumbers = text => mentions(text).map(m => m.v);
export const dataNumbers = text => mentions(text).filter(m => !m.counting).map(m => m.v);
export const outsideNumbers = (text, allowed) => outsideMentions(text, allowed).map(m => m.v);
// Whether a script speaks at least one of the card's data numbers.
export const speaksCardNumber = (text, cardData) => mentions(text).some(m => !m.counting && inCard(m, cardData));

const SYMBOLS = /[=+*/^<>[\]%\u00d7\u00f7\\$~\u00b2\u00b3\u00b9\u2070-\u209f]/;
export const sentencesOf = text => String(text ?? '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
const outside = (sentence, allowed) => outsideMentions(sentence, allowed).length > 0;
// The transcript writes the counting words as LaTeX digits ("toward zero" becomes "$0$"): a whole digit zero to ten is as free there as the word is in the script.
const outsideWritten = (sentence, allowed) => mentions(sentence).some(m => !(m.counting || (m.kind === 'digit' && Number.isInteger(m.v) && m.v >= 0 && m.v <= 10)) && !inCard(m, allowed));
const clean = text => String(text ?? '').replace(/\u2011/g, '-').replace(/\s+/g, ' ').trim();

// -> { script, transcript, removed } with every sentence that speaks a number outside `allowed` (or carries a symbol in the script) taken out of both. When the two have the same number of
// sentences they go together by position (a sentence the voice would say is never left in the window, and the other way round); else each is cut on its own.
export function stripUnsafe(script, transcript, allowed) {
  const spoken = sentencesOf(clean(script)), written = sentencesOf(clean(transcript));
  const badSpoken = s => SYMBOLS.test(s) || outside(s, allowed);
  if (!written.length || written.length !== spoken.length) {
    const keptSpoken = spoken.filter(s => !badSpoken(s)), keptWritten = written.filter(s => !outsideWritten(s, allowed));
    return { script: keptSpoken.join(' '), transcript: written.length ? keptWritten.join(' ') : '', removed: spoken.length - keptSpoken.length + written.length - keptWritten.length };
  }
  const keep = spoken.map((s, i) => !badSpoken(s) && !outsideWritten(written[i], allowed));
  return { script: spoken.filter((_, i) => keep[i]).join(' '), transcript: written.filter((_, i) => keep[i]).join(' '), removed: keep.filter(k => !k).length };
}

export const wordCount = text => String(text ?? '').split(/\s+/).filter(Boolean).length;
// The voice speaks about 180 words a minute at speed 1.1 (AUD-2: 163 to 200 across three cards); the real length comes with the audio.
export const secondsEstimate = text => Math.round(wordCount(text) / 3);

// The two rules a kept script must pass (owner 2026-11-17): the floor in words, and at least one of the card's own data numbers spoken. -> { words, failed: ['floor'?, 'example'?] }
export function verdict(script, depth, cardData) {
  const words = wordCount(script), failed = [];
  if (words < floorWords(depth)) failed.push('floor');
  if (cardData.size && !speaksCardNumber(script, cardData)) failed.push('example');
  return { words, failed };
}
// The one extra user turn of the single re-ask; names each rule that failed.
export function reaskMessage({ words, failed }, depth, cardData) {
  const [low, high] = LENGTH_TARGET_WORDS[validDepth(depth) || DEFAULT_DEPTH];
  const parts = [];
  if (failed.includes('floor')) parts.push(`too short: ${words} words after removing sentences with outside numbers; target ${low} to ${high} words`);
  if (failed.includes('example')) parts.push(`none of the card's own numbers (${[...cardData].slice(0, 4).join(', ')}) is spoken; say at least one of them aloud in the explanation`);
  return `${parts.join('; and ')}; use the card's own numbers.`;
}
