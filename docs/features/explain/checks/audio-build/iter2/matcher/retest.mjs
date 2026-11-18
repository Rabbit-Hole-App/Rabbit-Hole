// Offline re-score of the 72 saved first answers (the scored first answer of each row, see load.mjs) with the shipped index and with the prototype parser. No network, no repo writes.
// Usage: node retest.mjs   -> prints the tables, writes candidates.tsv, letthrough.tsv, exfail.tsv, summary.json next to this file.
import fs from 'node:fs';
import { rows, cardParts } from './load.mjs';
import { spokenNumbers, dataNumbers, cardNumbers, cardDataNumbers, sentencesOf } from '../../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
import { mentions, cardSet, inCard, dataMentions, config } from './parser-prototype.mjs';
const IDENT = process.argv[2] === 'ident'; config.dropIdentDigits = IDENT; // node retest.mjs ident: digits glued to a letter/underscore (Q1, x_0) are names, on both the card and the script side
console.log('mode:', IDENT ? 'identifier digits dropped (Q1, x_0 are names)' : 'shipped digit reading (Q1 is the number 1)');
const SUF = IDENT ? '-ident' : '';
const OUT = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const SYMBOLS = /[=+*/^<>[\]%×÷\\$~²³¹⁰-₟]/; // copied from explanation-audio-script.js (not exported)
const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / b)}%)`;
const summary = {};

// ---------- 1. candidates: a generous pattern, independent of both parsers ----------
const NW = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion';
const FR = 'half|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?';
const ATOM = `(?:${NW}|point|oh|\\d[\\d,]*(?:\\.\\d+)?%?|percent|per\\s+cent|${FR})`;
const GROUP = new RegExp(`(?:\\b(?:minus|negative)\\s+)?(?:\\b(?:a|an)\\s+(?=(?:hundred|thousand|million|billion|${FR})\\b))?\\b${ATOM}\\b%?(?:(?:[\\s-]+(?:and\\s+(?:a\\s+)?)?)\\b${ATOM}\\b%?)*|\\b(?:twice|thrice|double|triple|doubled|tripled|times|once|dozen|couple|pair|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\b|\\d[\\d,]*(?:\\.\\d+)?%`, 'gi');
function classify(p) {
  const w = p.toLowerCase().trim();
  if (/^(minus|negative)\b/.test(w)) return 'negative (minus/negative)';
  if (/\bpoint\b\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/.test(w)) return /^point\b/.test(w) ? 'spoken decimal, no leading digit' : 'spoken decimal';
  if (/percent|per cent|%/.test(w)) return 'percent';
  if (/\b(half|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)\b/.test(w)) {
    if (/^(half|quarter|halves|quarters)$/.test(w)) return 'bare half/quarter (not a number by design)';
    if (/^(third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/.test(w)) return 'ordinal (not a number)';
    return 'fraction (a half, two thirds)';
  }
  if (/\b(hundred|thousand|million|billion)\b/.test(w)) return 'scale (a hundred, a thousand)';
  if (/\d/.test(w)) return 'digits';
  if (/^(twice|thrice|double|triple|doubled|tripled|times|once)$/.test(w)) return 'multiplier/frequency word (twice, times, once; not a number by design)';
  if (/^(dozen|couple|pair)$/.test(w)) return 'approximate count (dozen, couple, pair; not a number by design)';
  if (/^(first|second)$/.test(w)) return 'ordinal (not a number)';
  if (w === 'point') return 'noun "point" (not a number)';
  if (w === 'one') return 'lone "one" (pronoun/article, not a number)';
  if (/^(two|three|four|five|six|seven|eight|nine|ten)$/.test(w)) return 'counting word two..ten (free by the owner rule)';
  if (w === 'oh') return 'noun "point" (not a number)';
  return 'other number words (zero, eleven..ninety, compounds)';
}
const TRUE_NUMBER = c => !/not a number|not a number by design|pronoun/.test(c);
const candidates = [], byClass = {};
for (const r of rows) {
  for (const s of sentencesOf(r.script)) for (const m of s.matchAll(GROUP)) {
    const at = m.index, to = m.index + m[0].length;
    const phrase = m[0].trim(), old = spokenNumbers(phrase);
    // the prototype reads the whole sentence (context decides "n minus one" = subtraction, "a third is" = ordinal) and keeps the mentions that sit inside this phrase
    const now = mentions(s).filter(x => x.span[0] >= at && x.span[1] <= to + 1);
    let cls = classify(phrase);
    if (/^negative \(/.test(cls) && !now.some(x => x.kind === 'negative')) cls = /^negative\b/i.test(phrase) ? 'negative (minus/negative)' : 'minus as subtraction (not a number)';
    if (/^fraction/.test(cls) && !now.length) cls = 'a third/fourth as an ordinal (not a number)';
    // old status against the prototype's reading of the same phrase
    let status;
    if (!TRUE_NUMBER(cls)) status = 'n/a';
    else if (!now.length) status = 'review';
    else if (!old.length) status = 'missed';
    else status = now.length === old.length && now.every((x, i) => x.forms.some(f => near(f, old[i]))) ? 'ok' : 'wrong value';
    candidates.push({ row: r.i, card: r.cardId, depth: r.depth, run: r.run, phrase, cls, status, old: old.join(','), now: now.map(x => x.forms[0]).join(','), sentence: s });
    (byClass[cls] ??= { total: 0, ok: 0, missed: 0, 'wrong value': 0, review: 0, 'n/a': 0 }, byClass[cls].total++, byClass[cls][status]++);
  }
}
fs.writeFileSync(OUT + 'candidates' + SUF + '.tsv', ['row\tcard\tdepth\trun\tphrase\tclass\told_status\told_value\tnew_value'].concat(candidates.map(c => [c.row, c.card, c.depth, c.run, c.phrase, c.cls, c.status, c.old, c.now].join('\t'))).join('\n'));
const real = candidates.filter(c => TRUE_NUMBER(c.cls));
console.log('\n== 1. candidate phrases in the 72 scored first-answer scripts (generous pattern) ==');
console.table(Object.entries(byClass).sort((a, b) => b[1].total - a[1].total).map(([cls, v]) => ({ class: cls, ...v })));
const bad = real.filter(c => c.status === 'missed' || c.status === 'wrong value');
const perScript = new Map(); for (const c of bad) perScript.set(c.row, (perScript.get(c.row) || 0) + 1);
console.log(`true spoken-number phrases: ${real.length}; old index missed (nothing parsed): ${real.filter(c => c.status === 'missed').length}; parsed to a wrong value: ${real.filter(c => c.status === 'wrong value').length}; prototype has no reading (review): ${real.filter(c => c.status === 'review').length}`);
console.log(`scripts with at least one missed/wrong phrase: ${pct(perScript.size, rows.length)}; phrases per affected script: ${[...perScript.values()].sort((a, b) => a - b).join(' ')}`);
Object.assign(summary, { realPhrases: real.length, missed: real.filter(c => c.status === 'missed').length, wrong: real.filter(c => c.status === 'wrong value').length, review: real.filter(c => c.status === 'review').length, scriptsAffected: perScript.size, byClass });
console.log('review list (prototype has no reading):', JSON.stringify(real.filter(c => c.status === 'review').map(c => [c.row, c.phrase])));

// ---------- 2 + 3a. example rule ----------
// cardData as MEASURED in results2 (prose + visual JSON + title + question) and as at the tip 4aa8e447e (prose + question only); allowed stays cardNumbers(prose, visualText, title, question).
const forCard = new Map(cardParts.map((c, i) => [i, {
  measuredOld: c.cardData, tipOld: cardDataNumbers(c.prose, c.question),
  measuredNew: cardSet(...dataMentions(c.prose + '\n' + c.visualText + '\n' + c.title + '\n' + c.question).map(m => m.text)),
  tipNew: cardSet(...dataMentions(c.prose + '\n' + c.question).map(m => m.text)),
  allowedNew: cardSet(c.prose, c.visualText, c.title, c.question), strictNew: cardSet(c.prose, c.title, c.question, c.labels.join('. ')),
}]));
// dataMentions(text).map(m=>m.text) re-parses each phrase text in isolation, which loses nothing for these phrase shapes; the card side is exact: re-parse of the mention texts equals the mentions.
const rate = {}; const exfail = [];
for (const depth of ['brief', 'balanced', 'detailed']) rate[depth] = { n: 0, measuredOld: 0, measuredNew: 0, tipOld: 0, tipNew: 0, tipOldApplies: 0, tipNewApplies: 0, scriptsWithAnyDataOld: 0, scriptsWithAnyDataNew: 0 };
for (const r of rows) {
  const k = forCard.get(r.cardIndex), R = rate[r.depth]; R.n++;
  const oldSpoken = dataNumbers(r.script), newSpoken = dataMentions(r.script);
  const failOld = set => set.size && !oldSpoken.some(n => set.has(n));
  const failNew = cs => cs.forms.size && !newSpoken.some(m => inCard(m, cs));
  const mo = failOld(k.measuredOld), mn = failNew(k.measuredNew), to = failOld(k.tipOld), tn = failNew(k.tipNew);
  R.measuredOld += mo ? 1 : 0; R.measuredNew += mn ? 1 : 0; R.tipOld += to ? 1 : 0; R.tipNew += tn ? 1 : 0; R.tipOldApplies += k.tipOld.size ? 1 : 0; R.tipNewApplies += k.tipNew.forms.size ? 1 : 0;
  R.scriptsWithAnyDataOld += oldSpoken.length ? 1 : 0; R.scriptsWithAnyDataNew += newSpoken.length ? 1 : 0;
  if (mo !== (r.check.firstFailed ?? r.check.failed).includes('example')) console.log('REPRO MISMATCH row', r.i);
  if (mo) {
    const proseQ = new Set([...k.tipOld]);
    exfail.push({ row: r.i, card: r.cardId, depth: r.depth, cardData: [...k.measuredOld].slice(0, 8).join(' '), fromProseOrQuestion: [...proseQ].join(' ') || '(none: only title/visual JSON)', spokeOld: oldSpoken.join(' ') || '-', spokeNew: newSpoken.map(m => m.text).join(' | ') || '-', newPasses: !mn, missedForm: !mn || oldSpoken.length !== newSpoken.length });
  }
}
fs.writeFileSync(OUT + 'exfail' + SUF + '.tsv', ['row\tcard\tdepth\tcardData(measured)\tfrom prose+question\tspoke(old)\tspoke(new)\tnew parser passes?'].concat(exfail.map(e => [e.row, e.card, e.depth, e.cardData, e.fromProseOrQuestion, e.spokeOld, e.spokeNew, e.newPasses].join('\t'))).join('\n'));
console.log('\n== 2/3a. example-rule FAILURES on the first answer, by depth ==');
console.table(Object.entries(rate).map(([depth, v]) => ({ depth, n: v.n, 'as measured, old parser': pct(v.measuredOld, v.n), 'as measured, new parser': pct(v.measuredNew, v.n), 'tip rule, old parser': pct(v.tipOld, v.n), 'tip rule, new parser': pct(v.tipNew, v.n), 'tip rule applies (old/new)': `${v.tipOldApplies}/${v.tipNewApplies}`, 'scripts speaking any data number (old/new)': `${v.scriptsWithAnyDataOld}/${v.scriptsWithAnyDataNew}` })));
const tot = k => Object.values(rate).reduce((a, v) => a + v[k], 0);
console.log(`total: measured old ${tot('measuredOld')}, measured new ${tot('measuredNew')}, tip old ${tot('tipOld')} (applies ${tot('tipOldApplies')}), tip new ${tot('tipNew')} (applies ${tot('tipNewApplies')}), of 72`);
console.log('as-measured failures where the card data had NO number from prose/question (only title or diagram JSON):', exfail.filter(e => e.fromProseOrQuestion.startsWith('(none')).length, 'of', exfail.length, '; failures the new parser turns into a pass:', exfail.filter(e => e.newPasses).length);
Object.assign(summary, { rate, exfailCount: exfail.length, exfailNoProseNumber: exfail.filter(e => e.fromProseOrQuestion.startsWith('(none')).length, exfailFixedByNew: exfail.filter(e => e.newPasses).length });

// ---------- 3b. outside numbers the old strip let through ----------
const leaks = [], scriptsLeaking = new Set(), scriptsLeakingStrict = new Set(); let oldFlagged = 0, oldRemovedScripts = 0, structOnly = [], bareHalf = [];
for (const r of rows) {
  const k = forCard.get(r.cardIndex), allowedOld = r.card.allowed; let removedHere = 0;
  for (const [src, text] of [['script', r.script], ['transcript', r.transcript]]) for (const s of sentencesOf(text)) {
    const oldFlag = SYMBOLS.test(s) && src === 'script' || dataNumbers(s).some(n => !allowedOld.has(n)); // counting words are free when the card has numbers (allowed is never empty here)
    if (oldFlag) { oldFlagged++; removedHere++; continue; }
    if (src === 'script') { const covered = mentions(s).map(m => m.text).join(' '); for (const b of s.toLowerCase().matchAll(/\b(half|quarter)\b/g)) { const val = b[1] === 'half' ? 0.5 : 0.25; if (!covered.includes(b[1]) && !k.allowedNew.forms.has(val) && !k.allowedNew.forms.has(val * 100)) bareHalf.push({ row: r.i, card: r.cardId, word: b[1], sentence: s }); } }
    for (const m of mentions(s)) {
      if (m.counting) continue;
      if (!inCard(m, k.allowedNew)) { leaks.push({ row: r.i, card: r.cardId, depth: r.depth, src, phrase: m.text, value: m.forms[0], kind: m.kind, sentence: s }); scriptsLeaking.add(r.i); }
      else if (!inCard(m, k.strictNew)) structOnly.push({ row: r.i, card: r.cardId, phrase: m.text, value: m.forms[0], sentence: s }); // passes only because of a number inside a diagram's JSON structure
    }
  }
  if (removedHere) oldRemovedScripts++;
}
const leakScripts = new Set(leaks.filter(l => l.src === 'script').map(l => l.row));
fs.writeFileSync(OUT + 'letthrough' + SUF + '.tsv', ['row\tcard\tdepth\tsource\tphrase\tvalue\tkind'].concat(leaks.map(l => [l.row, l.card, l.depth, l.src, l.phrase, l.value, l.kind].join('\t'))).join('\n'));
console.log('\n== 3b. OUTSIDE numbers (not in the card set) the shipped strip kept, the prototype catches ==');
console.log(`rows where the first-answer strip removed nothing (firstRaw == firstStripped words): ${pct(rows.filter(r => r.check.firstRawWords === r.check.firstStrippedWords).length, 72)}; old strip re-run on the first answers flags ${oldFlagged} sentences in ${oldRemovedScripts} rows`);
console.log(`leaked mentions: ${leaks.length} (script ${leaks.filter(l => l.src === 'script').length}, transcript ${leaks.filter(l => l.src === 'transcript').length}); scripts affected (script or transcript): ${pct(scriptsLeaking.size, 72)}; by script text alone: ${pct(leakScripts.size, 72)}`);
const per = {}; for (const l of leaks.filter(l => l.src === 'script')) per[l.row] = (per[l.row] || 0) + 1;
console.log('leaked per affected script:', Object.values(per).sort((a, b) => a - b).join(' '));
const kinds = {}; for (const l of leaks.filter(l => l.src === 'script')) kinds[l.kind] = (kinds[l.kind] || 0) + 1; console.log('leaked script mentions by kind:', JSON.stringify(kinds));
console.table(leaks.filter(l => l.src === 'script').map(l => ({ row: l.row, card: l.card, depth: l.depth, phrase: l.phrase, value: Number(l.value.toFixed(4)), kind: l.kind, sentence: l.sentence.slice(0, 70) })));
console.log(`counterfactual, NOT counted by design: bare half/quarter whose value (0.5, 0.25) is not in the card: ${bareHalf.length} words in ${new Set(bareHalf.map(b => b.row)).size} scripts`);
summary.bareHalf = bareHalf.length; summary.bareHalfScripts = new Set(bareHalf.map(b => b.row)).size;
console.log(`numbers kept only because the card's ALLOWED set contains a number from a diagram's JSON structure (not its prose, title, question or labels): ${structOnly.length} mentions in ${new Set(structOnly.map(s => s.row)).size} scripts`);
console.table(structOnly.slice(0, 40).map(s => ({ row: s.row, card: s.card, phrase: s.phrase, value: s.value, sentence: s.sentence.slice(0, 80) })));
Object.assign(summary, { leaks: leaks.length, leaksScript: leaks.filter(l => l.src === 'script').length, scriptsLeaking: scriptsLeaking.size, scriptsLeakingScriptOnly: leakScripts.size, perScript: per, kinds, structOnly: structOnly.length, structOnlyScripts: new Set(structOnly.map(s => s.row)).size, stripNoRemoval: rows.filter(r => r.check.firstRawWords === r.check.firstStrippedWords).length });

// ---------- 4. false positives: what the prototype counts in card prose and in the scripts ----------
console.log('\n== 4. every mention the prototype reads in the 12 card prose + question texts, and every distinct one in the scripts ==');
const proseHits = cardParts.flatMap(c => mentions(c.prose + '\n' + c.question).map(m => ({ card: c.id, text: m.text, kind: m.kind, counting: m.counting })));
console.log('card prose+question mentions:', proseHits.length); console.table(proseHits);
const scriptHits = {}; for (const r of rows) for (const m of mentions(r.script)) { const key = `${m.kind}\t${m.text}`; scriptHits[key] = (scriptHits[key] || 0) + 1; }
console.log('distinct script mentions (kind, text, count):'); console.table(Object.entries(scriptHits).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [kind, text] = k.split('\t'); return { kind, text, n }; }));
summary.proseHits = proseHits.length; summary.scriptMentions = Object.values(scriptHits).reduce((a, b) => a + b, 0);
fs.writeFileSync(OUT + 'summary' + SUF + '.json', JSON.stringify(summary, null, 1));
