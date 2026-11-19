# ILL-B Phase 0 (up to the dry run and the docs answers): report

No paid call, no provider call, no edit in the product repo; harness and subjects in C:/s/ill-b/ and in this folder (film/evidence f734cac4f). The lane's agent could not write a report file; the lead wrote this from its text. One action was refused by the auto-mode classifier: running `node ill-b.mjs --real ...` only to print "STOP" (no key in the environment). The agent stopped that action and did not retry it another way: the real-mode guards are in the code (`--real` exits unless `--owner-ok-usd` is given, then needs RECRAFT_API_KEY in the environment and `--phase0`) but are not demonstrated by a run.

## Contradictions (spec against code or Recraft's docs)
1. Model id: Recraft's docs call the current Flash `recraftv4_1_flash_v2` (alias `..._raster`) and say the first Flash is no longer available, while the Examples page still uses `recraftv4_1_flash`. Whether the old id still works as an alias is not documented; the repo's only Recraft entry is `recraftv4_1_flash` (image-providers.js:28,58). Only a real call settles it; if the two behave identically F2 duplicates F and is dropped.
2. Flash V2 takes no styles: Phase 2(b) style references can only run on S or V.
3. No rasteriser in the repo (the spec says "the repo's own rasteriser"); `sharp` 0.35.5 in node_modules rasterises SVG: use it.
4. S and V are not in the product's tables (image-providers.js:22-30,58), so the product adapter refuses them; the harness posts directly, as the spec says; their prices come from Recraft's pricing page, not the repo.
5. Cap arithmetic: the spec's table omits the 20 speed-extra calls (US$0.14) and the F2 arm. With F2 the total is **US$14.25** against the US$15 cap (headroom US$0.75) and F2 adds 9 sheets for the Reviewer (37 instead of 28); without F2 US$13.39.
6. Controls on V: the docs call `controls.colors` and `background_color` "partial" on V4.1; only the real V call shows whether they take effect in the SVG.

## Docs answers (Recraft's public docs)
- Prices: F US$0.007 = 7 units, S US$0.035 = 35, V US$0.08 = 80; Create-style US$0.005 per request.
- `random_seed`: supported on all models, so the harness sets it from `sha256(image id) & 0x7fffffff` and records it.
- `response_format`: `url`, `b64_json` or `multipart`.
- `style_reference_urls`: up to 10 URLs or data URLs, JSON only. The route that keeps a private repo private: data URLs in the request, or Create style (`image_urls` accepts data URLs or multipart files) and then a `style_id`; a style must be created for the model it is used with, so S and V each need their own; nothing has to be public.
- Default image type for raster output is webp (`image_format`), which the product accepts.
- Newer Flash: Flash V2 exists at US$0.007 and about 1.1 s: F2 added as an arm per the spec's own rule.

## Dry run (`node ill-b.mjs --dry-run`)
`fetch` is replaced by a function that throws, so no network call is possible. It builds 55 prompt forms (30 N, 25 L) with the product's own `figurePrompt`, `withNoTextSuffix` and `RECRAFT_CONTROLS` from a read-only checkout at b3b54c3b3. Calls: 220 with F2 (55 per arm), 165 without. Assertions: every N subject at most 200 characters (longest 181); every L whole subject at most 400 (longest 262); at most four labels. Resume: an image id ever sent is never POSTed again automatically; a failed download retries the download only (spec items 6 and 7). Estimate: judges cost about US$0.0072 (Sonnet 5.5) plus US$0.0014 (Gemini 3.5 Flash Lite) per image, priced from the repo registry; judge token counts are an estimate.

## Not built / not checked
Not built: parsing the `multipart` responses for the ten speed-extra calls, the judge and sheet scripts, and Phase 1 and 2 code. A real call still has to confirm the three ids are accepted as written. Not checked: Recraft's Create-style cost for private styles.

## Questions for the owner
- A. Cap: US$15 total (spec), separate from GEN-1's US$5.
- B. F2: run Phase 0 with F2 (4 images, US$0.129) or without (3 images, US$0.122)?
- C. Which Phase 0 calls to run now (one image per model, P01 in form N).
