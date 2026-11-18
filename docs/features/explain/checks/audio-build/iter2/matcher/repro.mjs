import { rows } from './load.mjs';
import { stripUnsafe, verdict, wordCount } from '../../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
let ok = 0, bad = 0, noscript = 0;
for (const r of rows) {
  if (!r.script) { noscript++; console.log('no first script', r.i, r.cardId, r.depth); continue; }
  const k = stripUnsafe(r.script, r.transcript, r.card.allowed), v = verdict(k.script, r.depth, r.card.cardData);
  const match = wordCount(r.script) === r.check.firstRawWords && wordCount(k.script) === r.check.firstStrippedWords && JSON.stringify(v.failed) === JSON.stringify(r.check.firstFailed ?? r.check.failed);
  match ? ok++ : (bad++, console.log('MISMATCH', r.i, r.cardId, r.depth, wordCount(r.script), r.check.firstRawWords, wordCount(k.script), r.check.firstStrippedWords, v.failed, r.check.firstFailed, r.check.failed));
}
console.log({ ok, bad, noscript });
