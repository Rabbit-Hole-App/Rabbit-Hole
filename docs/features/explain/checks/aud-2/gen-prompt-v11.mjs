// Writes prompt-v1.1.txt from the tested V5 / V6 code so the file is exactly what was run.
import fs from 'node:fs';
import { v5System, v6System } from './variants-prompts.mjs';
import { userMessage } from './prompt.mjs';
const v5 = v5System(), v6 = v6System();
const a = v6.indexOf('- Brief: write'), b = v6.indexOf('\n\nOPENING');
const user = userMessage({ depthLabel: '<Brief|Balanced|Detailed>', question: '<learner question>', title: '<card title>', body: '<card body prose, visual fences removed>', visualLabels: ['<visual label>', '<visual label>'] });
const txt = `PROMPT v1.1 (recommended). Tested as V5 on both models (9 problem cards, one call per card); the Gemini depth block in section C was tested as V6. See why.md.
Differences from v1 (prompt.txt): (1) the instruction to "work out numbers" is replaced by a rule that allows only numbers in the card or trivially simple whole numbers; (2) a generic reuse rule treats the card text and its visual labels as already said and shown; (3) an OPENING rule bans announcing the hardest part; (4) length is stated as seconds and words with "aim", a range and a floor, not as one soft number.
No per-card example extraction is needed (V5 uses no hand-written example line).
Known wording wart, left as tested: the numbers rule ("only numbers that appear in the card, or trivially simple whole numbers") and the reuse rule ("do not reuse its numbers") pull in opposite directions. In the V5 runs the models resolved it by choosing their own trivially simple whole numbers (Fireworks 2 minor slips in 9 outputs, Gemini 0). An untested cleaner wording would be: "Use only trivially simple whole numbers you can verify; you may cite a figure from the card but never replay the card's example." Test it before adopting.

=== A. SYSTEM (same text for both models) ===
${v5}

=== B. USER (template; filled per card, identical to v1) ===
${user}

=== C. GEMINI ONLY: replace the three depth bullets and the "Stay inside the range" line of the SYSTEM text with this block (tested as V6; Gemini still undershoots with V5 wording) ===
${v6.slice(a, b)}

=== D. NOT PART OF THE PROMPT: deterministic checks to run on the returned script (a regex, no model call) ===
- reject or strip any script containing one of these characters: = + * / ^ < > [ ] % x-multiplication-sign, division-sign, superscripts/subscripts, backslash, dollar sign, tilde. (Fireworks leaked these in 2 of 9 control outputs and 3 of 9 V3 outputs; Gemini 0 of 54.)
- these three kinds of error are NOT fixable by wording and need a verifier pass or a card check: wrong arithmetic in numbers the model chose itself, wrong numbers inherited from the card, and invented facts.
`;
fs.writeFileSync('prompt-v1.1.txt', txt);
console.log(txt.length);
