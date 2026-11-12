# Figure-brief pipeline handoff

The scraper inventoried 654 figure occurrences across 39 article and chapter pages. Each occurrence has a brief. The 21 pinned curriculum lessons link to the briefs that match their scope.

[Figure-by-figure reference map](reference-chapters.md) · [Rendered reference previews by chapter](figure-reference-chapters.md)

| Source | Figures | Briefs | New worked references | Figures mapped to references |
| --- | ---: | ---: | ---: | ---: |
| [Illustrated Transformer](transformer.md) | 36 | 36 | 13 | 36 |
| [Illustrated BERT](bert.md) | 27 | 27 | 11 | 27 |
| [Illustrated GPT-2](gpt2.md) | 65 | 65 | 10 | 64 |
| [Illustrated Word2vec](word2vec.md) | 61 | 61 | 25 | 61 |
| [Illustrated Stable Diffusion](stable-diffusion.md) | 33 | 33 | 17 | 30 |
| [Illustrated Retrieval Transformer](retrieval-transformer.md) | 15 | 15 | 8 | 15 |
| [D2L](d2l.md) | 292 | 292 | 67 | 292 |
| [LLM Architecture Gallery](architecture-gallery.md) | 125 | 125 | 61 | 119 |
| [Phase 02 lesson index](../../figure-briefs/briefs/README.md) | 0 | 0 | 0 | 0 |
| **Total** | **654** | **654** | **212** | **644** |

The 644 mapped occurrences can share worked references when they teach the same mechanism. Six gallery images provide editorial context. The four figures with a missing kind require raster evidence panels or weighted links anchored to a time and pitch axis. [Figure briefs and manifests](../../figure-briefs/sources.md) · [Missing kinds and counts](../../figure-briefs/gaps.md)

## Reproduce the work

The scraper saves artwork and full page context locally. The tracked manifests record the sources, asset locations, document order and retrieval status. The D2L crawl kept 280 SVGs in SVG format. The OCR pass extracted text from 279 of them. Mathematical glyphs in OCR text are approximate. [Scraper commands](../../figure-briefs/README.md)

```sh
node packages/web/scripts/illustration-previews.mjs /tmp/rh-figure-chapters
node --test packages/web/scripts/figure-briefs.test.mjs packages/web/src/tutor-diagrams/figure-chapter-references.test.mjs packages/web/src/tutor-diagrams/svg-snapshots.test.mjs
```

The preview export uses the production TutorDiagram renderer. It writes the authored JSON and original SVGs for Brief, Balanced and Detailed at 408 px, natural width and 960 px. The app's scroll behavior applies when a diagram's minimum readable width exceeds the available card width. The renderer fingerprints live in `svg-snapshots.json`. [Measured compact JSON budgets](../../../../../../packages/web/src/tutor-diagrams/figure-chapter-token-budgets.json)

Eight paired comparisons also have linked single-diagram examples in the offline variant catalogue. Their matched token counts sit alongside the existing panel pairs. [Panel and single-diagram token counts](../../../../../../packages/web/src/tutor-diagrams/set3-token-budgets.json)

The offline selector replay checks the ordered picks for 42 benchmark prompts, 210 benchmark paraphrases and 212 existing reference prompts at all three depths. All 1,392 prior pick sets match the base. The 1,410 new prompt and depth cases select their intended reference. All 713 compact visuals pass the content contract and use at most 300 cl100k_base tokens per visual.

The focused suite passed 1,211 tests and the web build completed. The snapshot file has 3,007 entries, including 2,151 additions. The 856 baseline fingerprints match. Shared companion visuals reuse their existing snapshot entries. Both the source inventory and a downloaded image returned HTTP 403 from the Vite development server. The web bundle and Git archive exclude the source working folder.

The next live acceptance check is to send the documented learner prompts through written `/explain`, then compare the model-authored card with the worked reference. The figure mappings and selector evidence describe the author input.
