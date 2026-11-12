# Figure briefs

[Source index](sources.md) · [Phase 02 lesson order](briefs/README.md) · [Missing kinds](gaps.md)

Run from the repository root after installing the web workspace dependencies. ImageMagick (`magick` or `convert`) saves the first frame of GIFs. Inkscape and Tesseract read labels when a source SVG stores lettering as outlines.

```sh
node packages/web/scripts/figure-briefs.mjs
node packages/web/scripts/figure-briefs.mjs --extract-svg-text d2l
```

The default crawl visits the illustrated articles first, then the selected D2L sections, the architecture gallery, and the 21 lessons at curriculum revision `e7db050e64bde3be17a9381476f748da26d85692`. To rerun a subset, pass a group (`alammar`, `d2l`, `raschka` or `phase02`), a page's directory name, or a public page URL. For example, `node packages/web/scripts/figure-briefs.mjs illustrated-transformer` retrieves just that article. Each crawl checks robots rules for pages, assets and redirect destinations, and spaces requests at least one second apart.

Each source directory has a `manifest.json` with the source URL, figure order, asset URL, retrieval time, and status. A crawl also writes the original figure files and `_working/manifest.json` with alt text, captions, headings, adjacent paragraphs, and extracted SVG labels. Those files stay in the local working tree. The SVG label pass keeps SVGs intact and records which labels came from OCR. Repeated figures keep their document positions and share one download per crawl. The Transformer article inventory covers its 36 teaching figures. The curriculum pages provide lesson scope and order.

The entire `figure-briefs/` directory is excluded from Git archives and blocked by the Vite development file server. Web builds and the reference exporters take their inputs from the web package and the authored diagram registry. Run `node --test packages/web/scripts/figure-briefs.test.mjs` for the offline scraper checks.
