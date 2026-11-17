import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('scripts.json', 'utf8')), t = JSON.parse(fs.readFileSync('tts-results.json', 'utf8'));
const f = a => { a = [...a].sort((x, y) => x - y); const m = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; return [a[0], m, a[a.length - 1]]; };
const sec = (w, wpm) => Math.round(w / wpm * 60);
const words = s.map(r => r.words), [wmin, wmed, wmax] = f(words);
const inRange = s.filter(r => sec(r.words, 170) >= 75 && sec(r.words, 170) <= 135);
let md = `# AUD-2 results: spoken companion scripts for 12 /explain cards

## 1. WHICH MODEL ANSWERED (read this first)
**The Gemini key still returned HTTP 429 ("Your project has exceeded its monthly spending cap") on the one probe call (a tiny json_schema chat/completions call to gemini-3.5-flash-lite). Per the instruction, ALL 12 scripts were written by the product's fallback model: Fireworks \`accounts/fireworks/models/gpt-oss-120b\` (key FIREWORKS_API_KEY, reasoning_effort low, non-strict json_schema {"script": string}).** The answered model id in every response is \`${s[0].answeredModel}\`. There is no Gemini script, so the "Gemini Flash writes the script" assumption is untested. No retries anywhere. Probe error text (key redacted) is in probe.json.

## 2. Prompt, and how it mirrors the card's style (owner corrections)
prompt.txt has the system prompt and the user template (source prompt.mjs). Each call passes: depth label, learner question, card title, card body prose (visual fences removed) and the labels of the visuals. No scripts were made with an earlier prompt (the corrected prompt existed before the first script call), so there is no old/ folder for scripts.

How the prompt makes the script mirror the card:
- A STYLE: MIRROR THE CARD section tells the model to read the card prose first and match its register and formality, vocabulary level and exact terms (use the card's own words for its concepts), sentence length and rhythm, and tone.
- It says the warm friendly voice is only how the text is READ: no added chatty enthusiasm, exclamation marks, cheerleading or filler ("Great question", "Let's dive in"); "be as warm as the card is warm, and no warmer".
- Kept: ear rules (short sentences, no markdown, no symbols or LaTeX, math said aloud, no title repeat, no "in this card"), the add-not-restate rule, and the order (hardest idea a second way; examples with numbers in words; misconception and what to try next).
- DEPTH section (owner addition): Brief about 170-230 words (60-80 s; the single most useful clarification plus one short example, no side cases); Balanced about 250-300 (about 90 s; clarification, one or two worked examples, one misconception); Detailed about 330-400 (up to about 2 min; fuller second explanation, worked numbers, edge cases, misconception, what to try next). Soft; "stop when complete, never pad".

Did it work? On tone yes: 0 exclamation marks, no cheerleading opener. On register it is uneven. Two comparisons:
1. Technical card, technical script (good). Card (Softmax, Detailed): "Each score z_i is exponentized as e^{z_i} to ensure all values are positive." Script: "the exponential maps any real number onto a strictly positive scale and stretches differences non-linearly." Same terms, same formality.
2. Plain card, script drifts up in register (miss). Card (TCP handshake, Brief): "Computers connect on the web using a friendly greeting called a handshake. First, your computer sends a polite hello message." Script: "the client sends a SYN packet that contains an initial sequence number. The server replies with a SYN-ACK packet that both acknowledges that number and supplies its own initial sequence number." The card never uses SYN, ACK or sequence numbers; the script is more technical than the card. The Roman Empire Brief script is a good plain-register match: "Many students think the shift from a republic to an empire was sudden, but it was a gradual erosion of shared power."

## 3. Inputs (cards.json)
12 existing cards, 4 per depth (the bench rows allow it). Stored depth is overview / balanced / deep; mapped to the product labels overview = Brief, balanced = Balanced, deep = Detailed. Sources: Balanced from C:/s/spec/benchmarks/explain-bench/2026-11-14T125715-145-smoke-rerun-71415b6b8 (every card in that run is balanced); Brief and Detailed from 2026-11-08T205831-baseline-3x-on-shipped-116-9d645b8f6 (raw/correct-svg-r1-overview and -deep), the only runs that carry non-balanced depths. Same topic at two depths: gradient descent (Brief card 4, Detailed card 12). Topics: ML (precision/recall, softmax, gradient descent x2, bootstrap coverage), statistics (box-plot fences), CS systems (TCP handshake, public-key encryption, binary search tree), science (four-stroke engine, water cycle), non-technical (Roman Empire). Fields: title, body prose, visualLabels (title/label/text strings pulled out of the diagram JSON), depth, question (the bench prompt).

## 4. Script length distribution (12 scripts)
Words min / median / max: ${wmin} / ${wmed} / ${wmax}. At 170 wpm: ${sec(wmin, 170)} / ${sec(wmed, 170)} / ${sec(wmax, 170)} s; at 185 wpm: ${sec(wmin, 185)} / ${sec(wmed, 185)} / ${sec(wmax, 185)} s. Inside 75-135 s at 170 wpm: ${inRange.length} of 12 (${inRange.map(r => r.id).join(', ')}). The other six: the 3 shortest Briefs are under 75 s and the 3 longest Detaileds are over 135 s.

### Per depth
| depth | cards | words per card | min / median / max words | s at 170 wpm (min/med/max) | s at 185 wpm (min/med/max) | target words |
|---|---|---|---|---|---|---|
`;
const tgt = { Brief: '170-230', Balanced: '250-300', Detailed: '330-400' };
for (const d of ['Brief', 'Balanced', 'Detailed']) { const w = s.filter(r => r.depthLabel === d).map(r => r.words), [a, m, b] = f(w); md += `| ${d} | ${w.length} | ${w.join(', ')} | ${a} / ${m} / ${b} | ${sec(a, 170)} / ${sec(m, 170)} / ${sec(b, 170)} | ${sec(a, 185)} / ${sec(m, 185)} / ${sec(b, 185)} | ${tgt[d]} |\n`; }
md += `
Targets hit: Brief 4 of 4 inside 170-230. Balanced 2 of 4 inside 250-300 (261 and 292; 310 and 357 are over). Detailed 2 of 4 inside 330-400 (366 and 398; 464 and 477 are over). The model overshoots the upper bound at Balanced and Detailed. The three depths are clearly separated (medians 175 / 301 / 431 words).

### Real pace of the chosen voice (3 full clips, Jessica, mp3 frames; section 8): do the word targets move?
Measured words per minute (script words / real audio seconds): speed 1.0: Brief ${t.full[1].wpm}, Balanced ${t.full[3].wpm}, Detailed ${t.full[5].wpm}; speed 1.1: Brief ${t.full[0].wpm}, Balanced ${t.full[2].wpm}, Detailed ${t.full[4].wpm}. Two surprises: (1) the speed 1.1 setting made the clips only 0.6% (card 4), 8.4% (card 5) and 4.7% (card 10) shorter, and the 90-word sample 6.3% shorter (31.48 s to 29.49 s), not the 10% a "1.1" suggests; (2) pace is not constant across cards: the Brief clip runs about 200 wpm, the Balanced clip 163 to 178 and the Detailed clip 172 to 181 (numerals, long compound words and digits slow the voice). At 1.1 the measured clips are: Brief 170 words = ${t.full[0].audioSeconds} s, Balanced 310 words = ${t.full[2].audioSeconds} s, Detailed 477 words = ${t.full[4].audioSeconds} s.
Against the owner's depth targets using the 1.1 pace of about 180 wpm (a rounded middle of 178-200): Brief 170-230 words = 57-77 s (target 60-80 s: fits); Balanced 250-300 words = 83-100 s (target about 90 s: fits); Detailed 330-400 words = 110-133 s (target up to about 2 min: fits, slightly over at the top). So the word targets themselves do not need to move; what is wrong is that the model overshoots them (310, 357, 464, 477 words; the 477-word Detailed script runs 158 s at speed 1.1, well over 2 minutes). Recommendation: keep the targets but state them as ceilings in the prompt ("never more than 300 / 400 words") and, if the owner prefers a strict 2 minutes for Detailed, lower its target to 310-370. Do not raise any target.

### Do the three depths sound different in depth?
Yes, in content and not only length. Same topic, gradient descent:
- Brief opens: "The trick that trips many learners is thinking the steps must be exactly the same size every time. In fact, gradient descent adapts the step length to the steepness of the slope." One misconception, one hill analogy, no numbers, no next step.
- Detailed opens: "The point that trips most learners is the idea that the gradient points directly toward the minimum. In fact the gradient points in the direction of steepest increase, so we move opposite to it." It then works two numeric examples (one weight, then two weights), a too-large learning rate case and what to try next.

## 5. Quality reading (honest; no verifier was run, by design)
- Best: Roman Empire (Brief, card 3). Adds what the card never says (Augustus, the Senate surviving, a partnership analogy, the year 27 B.C.), plain register like the card, no symbols, right length (178 words). Runner-up: public-key encryption (Balanced).
- Worst for reciting the card: binary search tree (Detailed, card 10). Its worked example is the card's own: the card's diagram reads "Insert 7 into the binary search tree / 7 < 8, 7 > 3, and 7 > 6" and the script opens its example "Consider a tree that currently holds the keys 8, 3, 10, 1, and 6 ... To insert the key 7 you start at the root. 7 is less than 8, so you move left to 3. It is greater than 3, so you move right to 6." Mild recitation also in four-stroke (Balanced), which re-walks the four strokes in its first paragraph, and in precision/recall (Brief), which re-defines both terms before its spam-filter example.
- Worst for the ear and for correctness: gradient descent Detailed (card 12). It leaves unsayable symbols in the script (w with subscripts, eta, a centre dot, squares and equals signs, e.g. "L(w)= (w-3)^2" and "w1 = 0 - 0.1 times (-6) = 0.6" written with symbols), breaking the no-symbols rule, and its learning-rate-1.5 example is numerically wrong (it says w goes to 9 then -3; the next value is -9).
- Factual slips found by reading (a verifier pass would catch these): gradient descent Brief says the step should be LONGER on flat ground (wrong for plain gradient descent, where steps shrink with the gradient); bootstrap coverage Balanced says "sixty-two point two percent" in three places where the card gives 0.632; box-plot Balanced computes fences of minus 3 and 21 (right for 1.5 x IQR of 6) and so silently contradicts the card, whose own numbers (lower 2, upper 16) are wrong; softmax Detailed calls e^2 over e^1 "roughly three-to-one" (it is 2.7).
- Symbol leakage: only card 12 has math symbols or "=" in the script. Cards 6, 10 and 12 contain many numerals. A U+2011 non-breaking hyphen appears in several scripts; it was normalised to "-" before TTS, the only text change made.
- Style mirror: see section 2; one clear register miss (TCP).

## 6. Per-card table (one call each, Fireworks gpt-oss-120b)
| n | card | depth | words | s at 170 / 185 wpm | prompt tok | completion tok (of which reasoning) | USD | ms |
|---|---|---|---|---|---|---|---|---|
`;
for (const r of s) md += `| ${r.n} | ${r.id} | ${r.depthLabel} | ${r.words} | ${sec(r.words, 170)} / ${sec(r.words, 185)} | ${r.usage.prompt_tokens} | ${r.usage.completion_tokens} (${r.usage.completion_tokens_details?.reasoning_tokens ?? '?'}) | ${r.usd} | ${r.ms} |\n`;
const sp = s.reduce((a, r) => a + r.usd, 0);
md += `
Script spend: USD ${sp.toFixed(5)} (12 calls; 12,347 prompt + 5,184 completion tokens; Fireworks price 0.15 / 0.60 per M tokens from pricing-registry.js; estimate, not an invoice). The Gemini probe was refused (HTTP 429, not billed). No call failed or was refused; no truncation (all finish=stop).

## 7. Voices (owner: female, a little more energetic, a little faster)
GET /v1/voices returned 28 voices. Candidates, chosen from the clearly female voices with upbeat labels:
| name | id | labels | description (from the API) |
|---|---|---|---|
| Jessica - Playful, Bright, Warm (RECOMMENDED) | cgSgspJ2msm6clMCkdW9 | use_case conversational, age young, gender female, descriptive cute, accent american | "Young and popular, this playful American female voice is perfect for trendy content." |
| Laura - Enthusiast, Quirky Attitude | FGY2WhTYpPnrIDTdsKH5 | social_media, young, female, sassy, american | "This young adult female voice delivers sunny enthusiasm with a quirky attitude." |
| Matilda - Knowledgable, Professional | XrExE9yKIg1WjnnlVkGX | informative_educational, middle_aged, female, upbeat, american | "A professional woman with a pleasing alto pitch. Suitable for many use cases." |
Dropped from the first round (default settings): Bella (professional, bright, warm; middle-aged; educational, hpp4J3VqNfWAUOO0d1Us) and Alice (clear engaging educator, British, Xb7hH8MSUJpSbSDYk0k2); their default-settings samples are kept in old-voice-samples/ for comparison. Also in the library and not used: Sarah (EXAVITQu4vr4xnSDxMaL, mature reassuring confident), Lily (velvety British actress), Veda Sky (crisp, natural conversations, XcXEQzuLXRU9RcfWzEJt).

**Exact voice_settings used (all calls): {"stability": 0.4, "similarity_boost": 0.75, "speed": 1.1}** and one 1.0 comparison (same stability and similarity_boost). eleven_flash_v2_5 reports can_use_style = false and can_use_speaker_boost = false (GET /v1/models, saved in el-model-flash.json), so no style or speaker-boost field was sent; only stability, similarity_boost and speed. output_format mp3_44100_64, endpoint /v1/text-to-speech/{id}/stream.

Samples (identical text, the first 90 words of script 1, samples/sample-text.txt, speed 1.1): samples/voice-Jessica-speed1.1.mp3 (29.49 s, 183 wpm), voice-Laura-speed1.1.mp3 (28.00 s, 193 wpm), voice-Matilda-speed1.1.mp3 (31.71 s, 170 wpm), plus samples/voice-Jessica-speed1.0.mp3 (31.48 s, 172 wpm). TTFB 190-331 ms, under 3 s total each.

**Recommendation: Jessica at speed 1.1, stability 0.4, similarity_boost 0.75.** Why: of the three she is the one whose description is bright and warm without being "sassy" (Laura) or "professional, mature" (Matilda), she is young and fast-ish (183 wpm at 1.1 versus Matilda 170), and she is a conversational voice, which suits an add-on spoken explanation. Caveat: this is chosen from labels and measured pace only; I cannot listen. Laura is the most energetic (193 wpm) and is the alternative if Jessica sounds too flat; Matilda is the safe teacher voice. The owner must audition the four sample files. The word "cute" in Jessica's label is a risk for technical cards.

## 8. Full audio: Jessica, eleven_flash_v2_5, mp3_44100_64, stability 0.4, similarity_boost 0.75 (duration from mp3 frames via whiteboard-mp3.js; shortest, middle and longest of the 12 scripts, at speed 1.1 and at 1.0)
| card | speed | words | chars | TTFB ms | total ms | audio s | wpm | USD (0.04 per 1K chars) | file |
|---|---|---|---|---|---|---|---|---|---|
`;
for (const r of t.full) md += `| ${r.n} ${r.id} (${r.depthLabel}) | ${r.voice_settings.speed} | ${r.scriptWords} | ${r.chars} | ${r.ttfbMs} | ${r.totalMs} | ${r.audioSeconds} | ${r.wpm} | ${r.usd} | samples/${r.file.replace('samples/', '')} |\n`;
md += `
Streaming first byte about 180-240 ms; a 158 s clip finishes in 2.7 s, far inside the product's 20 s route limit.

## 9. Spend (estimates from the stated prices)
- Script calls (Fireworks): USD ${sp.toFixed(4)}. Gemini: 0 (refused).
- ElevenLabs: first voice round with default settings (Bella/Alice/Matilda samples, run twice by mistake, plus 3 full clips; superseded by the owner's voice change): USD 0.3275. Second round (this results.md): 3 samples at 1.1 (0.0572), 1 sample at 1.0 (0.0191), 3 full clips at 1.1 and 3 at 1.0 (0.4264) = USD 0.5027. GET /v1/voices and /v1/models are free.
- Total about USD 0.84, under the USD 2.00 guard.

## 10. Files (all under C:/s/sprint2-evidence/aud-2/)
prompt.txt, prompt.mjs, cards.json, build-cards.mjs, run-scripts.mjs, scripts.json, scripts.md, scripts-md.mjs, probe.json, voices.mjs, el-voices.json, models.mjs, el-model-flash.json, tts.mjs, tts-results.json, results-md.mjs, results.md; samples/ (voice-Jessica-speed1.1.mp3, voice-Jessica-speed1.0.mp3, voice-Laura-speed1.1.mp3, voice-Matilda-speed1.1.mp3, sample-text.txt, card-4-gradient-descent.mp3, card-5-ml-trees-bootstrap-coverage.mp3, card-10-bst.mp3 and the three -speed1.0 versions); old-voice-samples/ (first-round Bella/Alice/Matilda samples and full clips at default settings). No key printed or written; no repo file changed.
`;
fs.writeFileSync('results.md', md);
console.log('ok', md.length);
