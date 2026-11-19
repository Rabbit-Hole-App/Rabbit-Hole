# ILL-B Phase 0, real calls (owner approval 2026-11-19 08:26 PT; hard cap US$15 in total; Phase 0 estimate US$0.129, stop line +20 % = US$0.155)

Four images, subject P01 (piston), form N (today's pipeline: `figurePrompt(withNoTextSuffix(subject))`, `RECRAFT_CONTROLS`), size 1024x1024, `random_seed = sha256(image id) & 0x7fffffff`; the key was read by name from small-deploy/.env into the harness process only and never printed or written. Run by the lead (subagents cannot make paid calls); harness C:/s/ill-b/ill-b.mjs `--real --phase0 --owner-ok-usd 15` through run-real-phase0.mjs.

| arm | model id | HTTP | request seconds | credits (expected) | file |
|---|---|---|---|---|---|
| F | recraftv4_1_flash | 200 | 1.595 | 7 (7) | webp 697,378 bytes |
| F2 | recraftv4_1_flash_v2 | 200 | 1.007 | 7 (7) | webp 620,454 bytes |
| S | recraftv4_1 | 200 | 6.371 | 35 (35) | webp 558,502 bytes |
| V | recraftv4_1_vector | 200 | 8.495 | 80 (80) | svg 33,708 bytes |

Settled cost: 129 credits = **US$0.129** (the estimate), cumulative ILL-B spend US$0.129 of the US$15 cap. Images and results: originals/, results.jsonl, phase0-sheet.png (the four at 512 px, arm named on each tile).

## The two Flash ids (ILL-3: is the product's id an alias of Flash V2?)
- The old id `recraftv4_1_flash` is still accepted: HTTP 200, the same price (7 credits).
- It is NOT shown to be an alias. Latency differs: F 1.595 s against F2 1.007 s (Recraft's docs give Flash V2 about 1.1 s); the two images differ, but that proves nothing because the harness's seeds differ per image id (F seed 1299344522, F2 seed 1677822410) and every call so far is one draw.
- What would settle it: two more calls with the SAME prompt, size and `random_seed` on both ids (US$0.014): identical output would mean an alias; different output means two models. Not run: outside the approved four calls. Until then F2 stays in Phase 1 (the Reviewer's rule: dropped only if the ids are the same model).

## Notes
All four images are in the product's style (cream background, the eight-colour controls honoured on F, F2, S; the V output is a vector SVG with a cream background). A style reference, if wanted, is by data URL or Create-style only; nothing public.
