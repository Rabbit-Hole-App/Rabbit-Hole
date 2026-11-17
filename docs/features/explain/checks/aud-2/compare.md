# Fireworks gpt-oss-120b vs Gemini gemini-3.5-flash-lite: same prompt, same 12 cards

Same prompt.txt (mirror the card's style, depth-aware, one call per card, no overlap check, no verifier, no retry), same cards.json, one call each, serial, no audio in this run. Gemini probe (probe-gemini.json): HTTP 200, the 429 cap is gone. Model that answered every Gemini call: `gemini-3.5-flash-lite` (OpenAI-compatible chat/completions, reasoning_effort low, non-strict json_schema, as in explanation-fast-chain.js). Existing Fireworks files untouched. Speaking time below is at 180 wpm (the Jessica voice measured 178-200 wpm at speed 1.1).

## 1. Per card
In-target windows used at 180 wpm: Brief 60-80 s (180-240 words), Balanced 80-100 s (240-300 words; "about 90 s"), Detailed 100-130 s (300-390 words; "up to about 2 min"). "Ear-unfriendly" = digits, operators or math symbols left in the script.

| n | card | depth | FW words | FW s | FW in target | FW ear-unfriendly | Gemini words | Gemini s | Gemini in target | Gemini ear-unfriendly |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | precision-recall | Brief | 172 | 57 | no | YES (5 numerals) | 197 | 66 | yes | no |
| 2 | tcp-handshake | Brief | 221 | 74 | yes | no | 104 | 35 | no | no |
| 3 | roman-empire | Brief | 178 | 59 | no | YES (1 numerals) | 141 | 47 | no | no |
| 4 | gradient-descent | Brief | 170 | 57 | no | no | 138 | 46 | no | no |
| 5 | ml-trees-bootstrap-coverage | Balanced | 310 | 103 | no | YES (2 numerals) | 250 | 83 | yes | no |
| 6 | ref-box-plot-iqr-fences | Balanced | 292 | 97 | yes | YES (19 numerals) | 239 | 80 | yes | no |
| 7 | four-stroke | Balanced | 357 | 119 | no | no | 177 | 59 | no | no |
| 8 | public-key-encryption | Balanced | 261 | 87 | yes | no | 188 | 63 | no | no |
| 9 | softmax | Detailed | 464 | 155 | no | YES (0 numerals, 2 symbols) | 199 | 66 | no | no |
| 10 | bst | Detailed | 477 | 159 | no | YES (42 numerals) | 263 | 88 | no | no |
| 11 | water-cycle | Detailed | 398 | 133 | no | no | 227 | 76 | no | no |
| 12 | gradient-descent | Detailed | 366 | 122 | yes | YES (42 numerals, 39 symbols) | 260 | 87 | no | YES (1 numerals) |

## 2. Per depth (words; seconds at 180 wpm)
| depth | model | words per card | min / median / max words | min / median / max s | in target |
|---|---|---|---|---|---|
| Brief | Fireworks | 172, 221, 178, 170 | 170 / 175 / 221 | 57 / 58 / 74 | 1 of 4 |
| Brief | Gemini | 197, 104, 141, 138 | 104 / 139.5 / 197 | 35 / 47 / 66 | 1 of 4 |
| Balanced | Fireworks | 310, 292, 357, 261 | 261 / 301 / 357 | 87 / 100 / 119 | 2 of 4 |
| Balanced | Gemini | 250, 239, 177, 188 | 177 / 213.5 / 250 | 59 / 71 / 83 | 2 of 4 |
| Detailed | Fireworks | 464, 477, 398, 366 | 366 / 431 / 477 | 122 / 144 / 159 | 1 of 4 |
| Detailed | Gemini | 199, 263, 227, 260 | 199 / 243.5 / 263 | 66 / 81 / 88 | 0 of 4 |

Overall in target: Fireworks 4 of 12, Gemini 3 of 12. The two models miss in opposite directions. Gemini UNDERSHOOTS every depth (all 4 Detailed scripts are 66-88 s, below the 100-130 s window; the TCP Brief is 104 words, 35 s). Fireworks OVERSHOOTS at Balanced and Detailed (477 words = 159 s). Gemini's depths are still ordered (medians 139.5 / 213.5 / 243.5 words), but the Balanced to Detailed gap is small (about 30 words, 10 s), so Gemini's Detailed barely differs in length from its Balanced. Either model can be pulled into the windows by changing the word targets in the prompt: raise them for Gemini (roughly 1.3x), lower the upper bounds for Fireworks. That calibration is not measured here.

## 3. Style match to the card
Both models were told to mirror the card. Examples (card line, then script line):
- Fireworks GOOD (softmax, Detailed): card "Each score z_i is exponentized as e^{z_i} to ensure all values are positive." -> script "the exponential maps any real number onto a strictly positive scale and stretches differences non-linearly." Same terms and formality.
- Fireworks BAD (TCP handshake, Brief): card "Computers connect on the web using a friendly greeting called a handshake. First, your computer sends a polite hello message." -> script "the client sends a SYN packet that contains an initial sequence number. The server replies with a SYN-ACK packet..." More technical than the card.
- Gemini GOOD (TCP handshake, Brief): same card -> "You call out hello. The other person shouts hello back to prove they heard you. But until you wave back to confirm you heard their reply, neither of you starts talking." Stays in the card's plain, friendly register with no jargon beyond "sequence numbers". Also good: Roman Empire, card "poor leadership, economic troubles, and constant invasions weakened the empire" -> "defending every border cost more money than the government could collect in taxes."
- Gemini BAD (box plot, Balanced): the card is dry ("Fences are placed 1.5 x IQR beyond each quartile... Points beyond these fences are flagged as outliers"); the script is whimsical: "the whisker pulls back to the last loyal neighbor inside the boundary... one house owns a massive sprawling ranch that spills way past the neighborhood gate." Figurative, chattier than the card. Also precision/recall: "When your model shouts yes, precision checks if it is crying wolf" is livelier than the card's plain prose.
Reading: Gemini matches plain cards better and drifts toward folksy analogies on dry or technical ones; Fireworks keeps technical cards technical but escalates plain cards. Neither added exclamation marks or cheerleading openers (0 "!" in both sets). Both have a formula opener: Gemini starts 9 of 12 scripts "The hardest part..."; Fireworks starts most with "The part/point/step that trips most learners...". Voiced back to back that repetition will be noticeable.

## 4. The slips found in the Fireworks scripts: does Gemini repeat them?
| # | Fireworks slip (exact line) | Gemini, same card (exact line) | Repeated? |
|---|---|---|---|
| 1 | Gradient descent Brief: "when the ground is almost flat, a longer step lets you keep moving toward the bottom" (wrong) | "If your steps are too small, you might take forever to get there." and "If your steps are too large, you bounce back and forth across the valley" | No, correct |
| 2 | Bootstrap Balanced: "sixty-two point two percent" (card says 0.632) | "roughly thirty seven percent of those slots are filled by duplicate copies of other rows, leaving the remaining sixty three percent as unique observations" | No, consistent (0.368 and 63%) |
| 3 | Box plot Balanced: computes fences "minus three" and "twenty-one", contradicting the card's own (wrong) 2 and 16 | No numbers at all: "set one and a half times the interquartile range beyond the first and third quartiles" | No contradiction, but it also skips the worked numbers the prompt asks for (the houses-and-ranch analogy replaces them) |
| 4 | Softmax Detailed: "roughly three-to-one" for e^2 over e^1 (it is 2.7) | "roughly two point seven, seven point four, and twenty point zero ... sum of thirty point one ... nine percent, twenty four percent, and sixty six percent" | No, arithmetic checks out (9.0, 24.5, 66.5) |
| 5 | Gradient descent Detailed: symbols left in ("L(w)= (w-3)^2", "w1 = 0 - 0.1 times (-6) = 0.6" in symbol form) and the wrong value "-3" (should be -9) | "Suppose your current weight is five and the gradient at that point is positive four ... multiply the gradient by the learning rate to get zero point four ... moving it down to four point six." and "You turn around 180 degrees" | No symbols (only the numeral 180); example correct |
| 6 | BST Detailed: reads out the card's own example: "To insert the key 7 you start at the root. 7 is less than 8, so you move left to 3. It is greater than 3, so you move right to 6." | "Suppose your tree has the root eight, with three to its left and ten to its right. You want to insert seven. You compare seven to eight. Seven is smaller, so you move left to three. Seven is larger than three, so you move right to six. Seven is larger than six, and the right child of six is empty." | YES. Gemini recites the card's own insert-7 example too (and opens with an abstract line about "relative position rather than a rigid array index") |
| 7 | Four-stroke Balanced: re-walks the four strokes in paragraph 1 | Adds the crankshaft/bicycle-pedal link and the flywheel; only the last line lists "intake, compression, power, and exhaust" | Mostly no. New slip: "happening dozens of times every single second" (an idling cylinder fires about six times a second) |
| 8 | Precision/recall Brief: re-defines both terms before the example | "Precision is about caution ... Recall is about thoroughness. It looks at every single actual positive item hidden in the entire dataset and asks if you managed to catch it." then numbers (nine of ten = ninety percent; five of ten = fifty percent) and a fisherman's net | Partly: the definitions are restated, but the worked numbers and the net analogy follow |
| 9 | TCP Brief: more technical than the card | Plain, see section 3 | No |
New Gemini slips found by reading: water cycle Detailed restates the card's formula line ("bulk aerodynamic formulas govern how fast the remaining surface water evaporates back into the wind") and names a muddled misconception ("runoff water flows mostly in underground rivers"); BST opener is abstract; the Balanced and Detailed scripts for box plot and four-stroke contain no worked numbers.
Ear-readiness: Gemini 0 of 12 scripts have operators or math symbols; the only numeral is "180 degrees" (card 12). Fireworks: card 12 leaks 36 symbols and many numerals; cards 6 and 10 use many numerals (19 and 42) that a TTS reads out as numbers, acceptably but not as "math said aloud".
These are my readings of 12 single-run scripts; no verifier ran, so unseen errors may remain in both sets.

## 5. Cost, tokens, latency (estimates at the registry prices: Gemini 0.30 / 2.50 per M tokens; Fireworks 0.15 / 0.60)
| model | prompt tokens | completion tokens | USD for 12 | USD per script | ms per call (min-max) |
|---|---|---|---|---|---|
| Fireworks gpt-oss-120b | 12,347 | 5,184 | 0.0050 | 0.00041 | 1399-3046 |
| Gemini gemini-3.5-flash-lite | 11,767 | 2,761 | 0.0104 | 0.00087 | 1232-1818 |
Gemini reports no separate reasoning-token field (the reported completion tokens may or may not include thinking; unverified), so its cost may be slightly understated. Both are about a tenth of a cent per script; cost is not a deciding factor.

## 6. Recommendation (honest)
Use Gemini Flash (gemini-3.5-flash-lite) for the script call, with Fireworks gpt-oss-120b as the fallback that the product's explain chain already has, and calibrate the length instruction per model. Reasons, on this evidence only (12 cards, one run each):
- It did not repeat the numeric errors and the symbol leak that Fireworks made (slips 1-5): every worked number I checked was right, and it had no math symbols, which is the rule that matters for a voice read-out.
- It matches plain cards better (TCP, Roman Empire) and it is a little faster (1232-1818 ms against 1399-3046 ms) and it is the product's own explain model and key.
- Against it: it undershoots every depth (Detailed 66-88 s, not about 2 minutes), it recites the card's own example on the BST card (slip 6, same as Fireworks), it gave no worked numbers on two Balanced cards, it drifts folksy on dry cards (box plot), and 9 of 12 openers are the same "The hardest part..." line. The Gemini key also hit a monthly spending cap this week; Fireworks is the sensible second step.
- Fireworks' advantages: longer, more worked numbers, more faithful to the "work out the numbers" rule, but it overshoots the Detailed and Balanced length and its arithmetic and symbol slips are the kind that cannot be heard around.
Next cheap steps (not done here): raise the Gemini word targets about 30% (Brief 230-300, Balanced 320-380, Detailed 430-520 words would aim at the same seconds; or state targets in seconds), add the one line "do not reuse the worked example or numbers in the card's visual", and vary the opener. Both runs are single samples with no retry, so run-to-run variance is unknown.
