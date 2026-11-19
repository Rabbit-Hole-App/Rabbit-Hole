# ILL-B Phase 1: images and judges done; blind sheets pushed (2026-11-19)

The lead wrote this. Provider calls were made by the lead under the owner's US$15 total cap (the Reviewer approves runs under US$20).

## What ran
- Images: 220 images (F recraftv4_1_flash, F2 recraftv4_1_flash_v2, S recraftv4_1, V recraftv4_1_vector, 55 prompt forms each) plus 20 speed extras (10 url, 10 multipart). Run spend US$7.106 (estimate US$7.106, stop line US$8.527). All HTTP 200; the credits per call matched the prices 7 / 7 / 35 / 80. Latency per call is in results.jsonl.
- Judges: Gemini 3.5 Flash Lite (gemini-3.5-flash-lite) and Sonnet 5.5 (claude-sonnet-5-5), 220 rows each, no parse errors at the end, rows keyed by image id.
- Blind sheets: 38 sheets (physical 10, spatial 14, abstract 14), 6 tiles per sheet, one opaque code per tile with the subject id, no model name on any tile; checklist.md and reviewer-empty.csv (220 rows) alongside. The key (code to model and form) and salt.json stay local and are NOT pushed until the Reviewer has pushed claude/ill-b-reviewer-scores.csv. The judge rows are also held back so they do not anchor the Reviewer's scores.

## Cumulative spend (settled)
| item | US$ |
|---|---|
| Phase 0 and seed check | 0.150 |
| Phase 1 images and speed extras | 7.106 |
| Gemini judge (220 images) | 0.104 |
| Sonnet judge, final 220 rows | 1.339 |
| Sonnet judge, wasted tries (see below) | 0.474 |
| **Total** | **about 9.17 of 15** |
The judge phase estimate was US$1.89 (stop line US$2.27); it settled at US$1.917 including the wasted tries (0.104 + 1.339 + 0.474), inside the stop line.

## Judge problems found and fixed (the harness agent could not exercise the real judge endpoints)
1. The Sonnet request carried `temperature: 0`; the model answers HTTP 400 "`temperature` is deprecated for this model." All 55 first rows were 400 at cost 0 (kept as judge-sonnet.400-temperature-deprecated.jsonl). A socket error ("other side closed") then ended that run once. The `temperature` field was removed and a network error now becomes a row instead of a crash.
2. `max_tokens` 400 truncated Sonnet's JSON in several of 23 rows (US$0.137 wasted, kept as judge-sonnet.first-try-400tok.jsonl); raised to 1200.
3. Sonnet writes a prose reading first, then the JSON object, so 32 of 220 rows failed the parser (US$0.337 incl. one re-run with a parser patch that did not apply). The parser now takes the trailing `{"must"...}` object; the failed rows were re-judged and all 220 parse.
Local copies of all discarded rows are kept in run/scores/. Judges' own prompt is the same checklist and JSON for both and carries no model name.

## Judge results (automatic judges only, not the score)
Pass on the checklist: Gemini 115 of 220, Sonnet 99 of 220; the two agree on pass or fail for 170 of 220 (77.3 %). The spec's section 8 rule asks for judge agreement of at least 90 %: the judges alone do not reach it, so the Reviewer's blind scores are the reference for the verdict (scorer: `node score.mjs --reviewer <csv>`).

## Next
Reviewer scores the sheets (physical, spatial, abstract) into claude/ill-b-reviewer-scores.csv; then the lead pushes the key and the judge rows and runs the scorer.
