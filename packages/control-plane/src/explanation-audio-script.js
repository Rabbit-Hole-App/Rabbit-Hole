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
  // 190 / 260 / 320), so its asks are the owner's targets divided by that ratio, with a content checklist and a floor sentence. Iteration 2 measured the first pass at 185 / 273 / 302 words after the strip (Detailed raw median 315 for an ask of 340 to 400, under its floor on 10 of 24), so Detailed asks 400 to 460. The spoken length stays the owner's: about 60 to 80 s, 90 s, up to 2 minutes.
  gemini: {
    brief: 'Brief: write 300 to 360 words, 60 to 80 seconds of speech. Include: one clarification of the hardest idea, one short worked example in words, a second angle on it, and one sentence on what to notice next. Do not stop before 300 words.',
    balanced: 'Balanced: write 360 to 420 words, about 90 seconds of speech. Include: the clarification, two different examples, one misconception, a second angle on the hardest part, and what to notice next. Do not stop before 360 words.',
    detailed: 'Detailed: write 400 to 460 words, up to about 2 minutes of speech. Include: a fuller second explanation, two different examples, an edge case, one misconception, and what to try next. Do not stop before 400 words.',
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
// -> { prose, labels: [string], visualText } prose: the body with the fences removed; visualText: every string and number inside the fences, for the allowed-number set.
export function splitCard(body) {
  const into = { labels: new Set() }, inside = [];
  for (const [, , source] of String(body ?? '').matchAll(FENCE)) {
    inside.push(source);
    try { collect(JSON.parse(source), into); } catch { /* an unreadable fence contributes its raw text to the numbers only */ }
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
// and the transcript (no regenerate, no retry). A number is read from digits and from spelled-out words, so "zero point three six eight" and 0.368 are the same value.
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const DIGIT_WORDS = new Set(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']);
const has = (table, word) => Object.hasOwn(table, word); // never `in`: a spoken word like "constructor" is on every object
const isNumberWord = word => has(UNITS, word) || has(TENS, word) || has(SCALE, word);
// A comma is a thousands separator only before exactly three digits: "10,0.349" in a JSON array is two numbers.
const DIGITS = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const round = value => Number(value.toFixed(9));

// Every number written in digits in a text (a comma between thousands is dropped).
const digitNumbers = text => [...String(text ?? '').matchAll(DIGITS)].map(match => round(Number(match[0].replace(/,/g, '')))).filter(Number.isFinite);

// A run of number words -> its values. "twenty five" 25, "two hundred" 200, "zero point three six" 0.36; "twenty twenty four" is two numbers (20 and 24), as are two bare units in a row.
// shortcut: a year read as "twenty twenty four" is checked as 20 and 24; a spoken year is rare in these scripts, and a miss only removes its sentence.
function runValues(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let total = 0, part = 0, sawTens = false, sawUnit = false, sawAny = false;
    for (; i < tokens.length; i++) {
      const word = tokens[i];
      if (word === 'point') break;
      if (has(SCALE, word)) { part = (part || 1) * SCALE[word]; if (SCALE[word] >= 1000) { total += part; part = 0; } sawTens = sawUnit = false; sawAny = true; continue; }
      if (has(TENS, word)) { if (sawTens || sawUnit) break; part += TENS[word]; sawTens = true; sawAny = true; continue; }
      if (has(UNITS, word)) { if (sawUnit || (sawTens && UNITS[word] >= 10)) break; part += UNITS[word]; sawUnit = UNITS[word] < 10 || sawUnit; if (UNITS[word] >= 10) sawTens = true; sawAny = true; continue; }
      break;
    }
    let value = total + part;
    if (tokens[i] === 'point' && DIGIT_WORDS.has(tokens[i + 1])) {
      let fraction = '';
      for (i++; i < tokens.length && DIGIT_WORDS.has(tokens[i]); i++) fraction += UNITS[tokens[i]];
      value = round(Number(`${value}.${fraction}`));
      out.push(value);
    } else if (sawAny) out.push(value);
    else i++; // a stray 'point'
  }
  return out;
}

// Every number spoken in a sentence, from digits and from words. A lone "one" is not read as a number: it is also the pronoun and the article ("one idea", "no one").
// counting: false also leaves out the spelled counting words two to ten when they stand alone ("two paths", "the other three"); they are not data. Digits, decimals, spelled-out data
// ("zero point three six eight", "thirty seven", "twelve") and anything inside a longer number word stay. Ordinals, twice, half, double, pair and the like are not number words at all.
function numbersIn(sentence, { counting = true } = {}) {
  const text = String(sentence ?? '');
  const found = digitNumbers(text);
  const words = text.toLowerCase().replace(DIGITS, ' ').match(/[a-z]+|[,;:.!?()]/g) || []; // punctuation is a token, so "point three six eight, one idea" ends the number at the comma
  let run = [];
  const flush = () => {
    const lone = run.length === 1 ? run[0] : null;
    if (run.length && lone !== 'one' && !(!counting && lone && has(UNITS, lone) && UNITS[lone] >= 2 && UNITS[lone] <= 10)) found.push(...runValues(run));
    run = [];
  };
  for (const [index, word] of words.entries()) {
    if (isNumberWord(word) || (word === 'point' && run.length && DIGIT_WORDS.has(words[index + 1]))) run.push(word);
    else if (word === 'and' && run.length && has(UNITS, words[index + 1]) && run.some(w => has(SCALE, w))) continue; // "one hundred and five"
    else flush();
  }
  flush();
  return found;
}
export const spokenNumbers = sentence => numbersIn(sentence);
export const dataNumbers = sentence => numbersIn(sentence, { counting: false });

// The numbers the card has: its prose, the learner's question and everything written inside its visuals, in digits or in words (a card that says "four strokes" has the number 4).
export const cardNumbers = (...texts) => new Set(texts.flatMap(text => spokenNumbers(text)));
// The card's data values only: what a script must speak at least one of (a card with none, only counting words, asks for no example).
export const cardDataNumbers = (...texts) => new Set(texts.flatMap(text => dataNumbers(text)));

const SYMBOLS = /[=+*/^<>[\]%\u00d7\u00f7\\$~\u00b2\u00b3\u00b9\u2070-\u209f]/;
export const sentencesOf = text => String(text ?? '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
// Counting words are free when the card has numbers; a card with none has nothing to be outside of, so every number a script speaks is data (the old rule).
const outside = (sentence, allowed) => numbersIn(sentence, { counting: allowed.size === 0 }).some(n => !allowed.has(n));
const clean = text => String(text ?? '').replace(/\u2011/g, '-').replace(/\s+/g, ' ').trim();

// -> { script, transcript, removed } with every sentence that speaks a number outside `allowed` (or carries a symbol in the script) taken out of both. When the two have the same number of
// sentences they go together by position (a sentence the voice would say is never left in the window, and the other way round); else each is cut on its own.
export function stripUnsafe(script, transcript, allowed) {
  const spoken = sentencesOf(clean(script)), written = sentencesOf(clean(transcript));
  const badSpoken = s => SYMBOLS.test(s) || outside(s, allowed);
  if (!written.length || written.length !== spoken.length) {
    const keptSpoken = spoken.filter(s => !badSpoken(s)), keptWritten = written.filter(s => !outside(s, allowed));
    return { script: keptSpoken.join(' '), transcript: written.length ? keptWritten.join(' ') : '', removed: spoken.length - keptSpoken.length + written.length - keptWritten.length };
  }
  const keep = spoken.map((s, i) => !badSpoken(s) && !outside(written[i], allowed));
  return { script: spoken.filter((_, i) => keep[i]).join(' '), transcript: written.filter((_, i) => keep[i]).join(' '), removed: keep.filter(k => !k).length };
}

export const wordCount = text => String(text ?? '').split(/\s+/).filter(Boolean).length;
// The voice speaks about 180 words a minute at speed 1.1 (AUD-2: 163 to 200 across three cards); the real length comes with the audio.
export const secondsEstimate = text => Math.round(wordCount(text) / 3);

// The two rules a kept script must pass (owner 2026-11-17): the floor in words, and at least one of the card's own data numbers spoken. -> { words, failed: ['floor'?, 'example'?] }
export function verdict(script, depth, cardData) {
  const words = wordCount(script), failed = [];
  if (words < floorWords(depth)) failed.push('floor');
  if (cardData.size && !dataNumbers(script).some(n => cardData.has(n))) failed.push('example');
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
