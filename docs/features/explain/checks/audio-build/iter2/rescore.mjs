// Offline re-score of the saved real first answers (results2/raw2: 72 rows, results-v3/raw-v3: 36 rows) with the shared parser and the two number sets, against the old parser (the committed
// 44021a5fc scripts module, with the allowed set and example set the route had then). No provider call. Join logic: matcher/load.mjs.
import fs from 'node:fs';
import * as NEW from '../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
import * as OLD from '../../../audio-build-2/packages/control-plane/src/_old-eas.js';
const I = 'C:/s/sprint2-evidence/audio-build/iter2/';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json', 'utf8'));
const parse = s => { try { const p = JSON.parse(s); return typeof p?.script === 'string' ? p : null; } catch { return null; } };
const parts = cards.map(c => {
  const j = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/' + c.source + c.id + '.json', 'utf8')), b = j.response.block, question = j.row.prompt;
  const o = OLD.splitCard(b.body), n = NEW.splitCard(b.body);
  return { id: c.id, title: b.title, question,
    old: { allowed: OLD.cardNumbers(o.prose, o.visualText, b.title, question), cardData: OLD.cardDataNumbers(o.prose, question) },
    now: { allowed: NEW.cardNumbers(n.prose, n.visualText, b.title, question), cardData: NEW.cardDataNumbers(n.prose, question) } };
});
function load(resultsFile, rawFile) {
  const results = fs.readFileSync(I + resultsFile, 'utf8').trim().split('\n').map(JSON.parse);
  const raws = fs.readFileSync(I + rawFile, 'utf8').trim().split('\n').map(JSON.parse).map(w => ({ ...w, answers: w.raw.map(parse), used: false }));
  return results.map((r, i) => {
    const hit = x => x.answers.findIndex((a, k) => a && NEW.wordCount(a.script) === r.check.firstRawWords && (k === 0 || r.providers[k] !== r.providers[k - 1]));
    const w = raws.find(x => !x.used && x.card === r.card && x.depth === r.depth && x.run === r.run && x.raw.length === r.calls && hit(x) >= 0);
    if (!w) throw new Error(`unjoined ${resultsFile} row ${i}`); w.used = true;
    const a = w.answers[hit(w)];
    return { set: resultsFile.replace('results', '').replace('.jsonl', '').replace(/^-/, '') || 'v2a', ...r, script: a.script, transcript: a.transcript ?? '', parts: parts[r.cardIndex] };
  });
}
const rows = [...load('results2.jsonl', 'raw2.jsonl'), ...load('results-v3.jsonl', 'raw-v3.jsonl')];
const status = (lib, cfg, row) => {
  const kept = lib.stripUnsafe(row.script, row.transcript, cfg.allowed), v = lib.verdict(kept.script, row.depth, cfg.cardData);
  return { removed: kept.removed, words: lib.wordCount(kept.script), floorFail: v.failed.includes('floor'), exampleFail: v.failed.includes('example'), applicable: cfg.cardData.size > 0, kept };
};
const sentenceOutside = (lib, cfg, text) => lib.sentencesOf(text.replace(/\s+/g, ' ').trim()).filter(s => (lib.outsideMentions ? lib.outsideMentions(s, cfg.allowed).length : lib.spokenNumbers(s).some(n => !cfg.allowed.has(n))));
const per = {}, letThrough = [], nowAllowed = [], changed = [];
for (const row of rows) {
  const o = status(OLD, row.parts.old, row), n = status(NEW, row.parts.now, row);
  const d = (per[row.depth] ??= { scripts: 0, applicableOld: 0, exFailOld: 0, applicableNew: 0, exFailNew: 0, floorFailOld: 0, floorFailNew: 0, removedOld: 0, removedNew: 0 });
  d.scripts++; d.applicableOld += o.applicable; d.exFailOld += o.applicable && o.exampleFail; d.applicableNew += n.applicable; d.exFailNew += n.applicable && n.exampleFail;
  d.floorFailOld += o.floorFail; d.floorFailNew += n.floorFail; d.removedOld += o.removed; d.removedNew += n.removed;
  const oldKeptSents = new Set(OLD.sentencesOf(o.kept.script)), newKeptSents = new Set(NEW.sentencesOf(n.kept.script));
  for (const s of newKeptSents.size >= 0 ? OLD.sentencesOf(o.kept.script) : []) if (!newKeptSents.has(s)) letThrough.push(`${row.set} ${row.card}/${row.depth} r${row.run}: ${s.slice(0, 260)}`);
  for (const s of NEW.sentencesOf(n.kept.script)) if (!oldKeptSents.has(s)) nowAllowed.push(`${row.set} ${row.card}/${row.depth} r${row.run}: ${s.slice(0, 260)}`);
  const so = `${o.floorFail}|${o.exampleFail}|${o.removed}`, sn = `${n.floorFail}|${n.exampleFail}|${n.removed}`;
  if (so !== sn) changed.push(`${row.set} ${row.card}/${row.depth} r${row.run}: floor ${o.floorFail}->${n.floorFail}, example ${o.applicable && o.exampleFail}->${n.applicable && n.exampleFail} (applicable ${o.applicable}->${n.applicable}), removed ${o.removed}->${n.removed}, words ${o.words}->${n.words}`);
}
console.log(JSON.stringify({ rows: rows.length, perDepth: per }, null, 1));
console.log('OLD STRIP KEPT, NEW STRIP REMOVES (' + letThrough.length + '):'); letThrough.forEach(x => console.log('  ' + x));
console.log('NEW STRIP KEEPS, OLD REMOVED (' + nowAllowed.length + '):'); nowAllowed.forEach(x => console.log('  ' + x));
console.log('FIRST-PASS STATUS CHANGED (' + changed.length + ' of ' + rows.length + '):'); changed.forEach(x => console.log('  ' + x));
