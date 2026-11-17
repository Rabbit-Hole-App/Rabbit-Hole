# AUD-2 results: spoken companion scripts for 12 /explain cards

## 1. WHICH MODEL ANSWERED (read this first)
**The Gemini key still returned HTTP 429 ("Your project has exceeded its monthly spending cap") on the one probe call (a tiny json_schema chat/completions call to gemini-3.5-flash-lite). Per the instruction, ALL 12 scripts were written by the product's fallback model: Fireworks `accounts/fireworks/models/gpt-oss-120b` (key FIREWORKS_API_KEY, reasoning_effort low, non-strict json_schema {"script": string}).** The answered model id in every response is `accounts/fireworks/models/gpt-oss-120b`. There is no Gemini script, so the "Gemini Flash writes the script" assumption is untested. No retries anywhere. Probe error text (key redacted) is in probe.json.

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
Words min / median / max: 170 / 301 / 477. At 170 wpm: 60 / 106 / 168 s; at 185 wpm: 55 / 98 / 155 s. Inside 75-135 s at 170 wpm: 6 of 12 (tcp-handshake, ml-trees-bootstrap-coverage, ref-box-plot-iqr-fences, four-stroke, public-key-encryption, gradient-descent). The other six: the 3 shortest Briefs are under 75 s and the 3 longest Detaileds are over 135 s.

### Per depth
| depth | cards | words per card | min / median / max words | s at 170 wpm (min/med/max) | s at 185 wpm (min/med/max) | target words |
|---|---|---|---|---|---|---|
| Brief | 4 | 172, 221, 178, 170 | 170 / 175 / 221 | 60 / 62 / 78 | 55 / 57 / 72 | 170-230 |
| Balanced | 4 | 310, 292, 357, 261 | 261 / 301 / 357 | 92 / 106 / 126 | 85 / 98 / 116 | 250-300 |
| Detailed | 4 | 464, 477, 398, 366 | 366 / 431 / 477 | 129 / 152 / 168 | 119 / 140 / 155 | 330-400 |

Targets hit: Brief 4 of 4 inside 170-230. Balanced 2 of 4 inside 250-300 (261 and 292; 310 and 357 are over). Detailed 2 of 4 inside 330-400 (366 and 398; 464 and 477 are over). The model overshoots the upper bound at Balanced and Detailed. The three depths are clearly separated (medians 175 / 301 / 431 words).

### Real pace of the chosen voice (3 full clips, Jessica, mp3 frames; section 8): do the word targets move?
Measured words per minute (script words / real audio seconds): speed 1.0: Brief 199, Balanced 162.8, Detailed 172.1; speed 1.1: Brief 200.2, Balanced 177.7, Detailed 180.7. Two surprises: (1) the speed 1.1 setting made the clips only 0.6% (card 4), 8.4% (card 5) and 4.7% (card 10) shorter, and the 90-word sample 6.3% shorter (31.48 s to 29.49 s), not the 10% a "1.1" suggests; (2) pace is not constant across cards: the Brief clip runs about 200 wpm, the Balanced clip 163 to 178 and the Detailed clip 172 to 181 (numerals, long compound words and digits slow the voice). At 1.1 the measured clips are: Brief 170 words = 50.94 s, Balanced 310 words = 104.67 s, Detailed 477 words = 158.41 s.
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
| 1 | precision-recall | Brief | 172 | 61 / 56 | 992 | 254 (37) | 0.000301 | 1399 |
| 2 | tcp-handshake | Brief | 221 | 78 / 72 | 956 | 300 (30) | 0.000323 | 1619 |
| 3 | roman-empire | Brief | 178 | 63 / 58 | 1003 | 265 (36) | 0.000309 | 1566 |
| 4 | gradient-descent | Brief | 170 | 60 / 55 | 959 | 258 (46) | 0.000299 | 1411 |
| 5 | ml-trees-bootstrap-coverage | Balanced | 310 | 109 / 101 | 1154 | 407 (14) | 0.000417 | 2142 |
| 6 | ref-box-plot-iqr-fences | Balanced | 292 | 103 / 95 | 1075 | 456 (48) | 0.000435 | 2136 |
| 7 | four-stroke | Balanced | 357 | 126 / 116 | 1034 | 454 (35) | 0.000427 | 2342 |
| 8 | public-key-encryption | Balanced | 261 | 92 / 85 | 1025 | 361 (30) | 0.00037 | 1741 |
| 9 | softmax | Detailed | 464 | 164 / 150 | 1000 | 606 (23) | 0.000514 | 2768 |
| 10 | bst | Detailed | 477 | 168 / 155 | 1072 | 674 (46) | 0.000565 | 3046 |
| 11 | water-cycle | Detailed | 398 | 140 / 129 | 1005 | 527 (39) | 0.000467 | 2731 |
| 12 | gradient-descent | Detailed | 366 | 129 / 119 | 1072 | 622 (20) | 0.000534 | 2764 |

Script spend: USD 0.00496 (12 calls; 12,347 prompt + 5,184 completion tokens; Fireworks price 0.15 / 0.60 per M tokens from pricing-registry.js; estimate, not an invoice). The Gemini probe was refused (HTTP 429, not billed). No call failed or was refused; no truncation (all finish=stop).

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
| 4 gradient-descent (Brief) | 1.1 | 170 | 918 | 241 | 1176 | 50.94 | 200.2 | 0.03672 | samples/card-4-gradient-descent.mp3 |
| 4 gradient-descent (Brief) | 1 | 170 | 918 | 195 | 1244 | 51.25 | 199 | 0.03672 | samples/card-4-gradient-descent-speed1.0.mp3 |
| 5 ml-trees-bootstrap-coverage (Balanced) | 1.1 | 310 | 1835 | 201 | 1861 | 104.67 | 177.7 | 0.0734 | samples/card-5-ml-trees-bootstrap-coverage.mp3 |
| 5 ml-trees-bootstrap-coverage (Balanced) | 1 | 310 | 1835 | 201 | 2057 | 114.29 | 162.8 | 0.0734 | samples/card-5-ml-trees-bootstrap-coverage-speed1.0.mp3 |
| 10 bst (Detailed) | 1.1 | 477 | 2573 | 181 | 2652 | 158.41 | 180.7 | 0.10292 | samples/card-10-bst.mp3 |
| 10 bst (Detailed) | 1 | 477 | 2573 | 210 | 2827 | 166.3 | 172.1 | 0.10292 | samples/card-10-bst-speed1.0.mp3 |

Streaming first byte about 180-240 ms; a 158 s clip finishes in 2.7 s, far inside the product's 20 s route limit.

## 9. Spend (estimates from the stated prices)
- Script calls (Fireworks): USD 0.0050. Gemini: 0 (refused).
- ElevenLabs: first voice round with default settings (Bella/Alice/Matilda samples, run twice by mistake, plus 3 full clips; superseded by the owner's voice change): USD 0.3275. Second round (this results.md): 3 samples at 1.1 (0.0572), 1 sample at 1.0 (0.0191), 3 full clips at 1.1 and 3 at 1.0 (0.4264) = USD 0.5027. GET /v1/voices and /v1/models are free.
- Total about USD 0.84, under the USD 2.00 guard.

## 10. Files (all under C:/s/sprint2-evidence/aud-2/)
prompt.txt, prompt.mjs, cards.json, build-cards.mjs, run-scripts.mjs, scripts.json, scripts.md, scripts-md.mjs, probe.json, voices.mjs, el-voices.json, models.mjs, el-model-flash.json, tts.mjs, tts-results.json, results-md.mjs, results.md; samples/ (voice-Jessica-speed1.1.mp3, voice-Jessica-speed1.0.mp3, voice-Laura-speed1.1.mp3, voice-Matilda-speed1.1.mp3, sample-text.txt, card-4-gradient-descent.mp3, card-5-ml-trees-bootstrap-coverage.mp3, card-10-bst.mp3 and the three -speed1.0 versions); old-voice-samples/ (first-round Bella/Alice/Matilda samples and full clips at default settings). No key printed or written; no repo file changed.
