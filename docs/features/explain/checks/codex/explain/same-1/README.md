# SAME-1 data

The branch `explain/same-1-data` is based on `2aeca536d`. Its tip is `144f125669196d0bd7c3e505cb08a0babaf1bfa7`.

| Item | Commit | Verification |
| --- | --- | --- |
| Transformation gallery | `e6d0d1e66c973cc6689dcc0ed70d2f1623911753` | Both galleries use three matching ribbon lengths, from 1, 2 and 3 m to 100, 200 and 300 cm. The Brief, Balanced and Detailed specs measure 92, 91 and 121 cl100k tokens. Only `shape-transformation/320`, `/408` and `/720` changed. |
| Softmax learner keywords | `27d72f6a193e32e712301d9e083a5e6ab94963e2` | Both target references steer at 12 across all depths. |
| Top-k worked reference | `144f125669196d0bd7c3e505cb08a0babaf1bfa7` | Both five-token distributions sum to 100%. Top-2 keeps `on` and `near`, increasing their shares from 42% and 28% to 60% and 40%. The other three shares are zero. The new Standard snapshots are `ml-sampling-top-k/320`, `/408` and `/720`. |

| Top-k depth | Diagram spec tokens | Author reference tokens |
| --- | ---: | ---: |
| Brief | 112 | 148 |
| Balanced | 109 | 145 |
| Detailed | 133 | 169 |

The token counts use `cl100k_base`. The author reference count includes the ID and usage guidance.

## Planner replay

The replay used `planWithReferenceKind` and `selectForAuthor`. The three questions and two archived variants used the archived transformation plan. The rest used the source reference's diagram kind. The same 3,069 prompt and depth cases ran on the base, the keywords commit and the final data tree. The keywords moved 9 picks. Top-k moved 6 more. All 3,054 existing library prompt/depth picks and their resolved kinds were stable. The separate 474-row archived planner replay reproduced its saved baseline and had zero picks or kinds move.

| Question or variant | Topical pick | Score | Resolved kind |
| --- | --- | ---: | --- |
| Can we retrieve the probability of a specific token after generation? | `ml-transformer-vocabulary-softmax` | 12 | `block-stack` in Brief, `bar-chart` in Balanced and Detailed |
| what is softmax, and how does it work here? (plain and wrapped) | `ml-logistic-regression-softmax` | 12 | `bar-chart` |
| Does top-k filtering affect the reported probability of the chosen token? (ASCII and archived nonbreaking hyphens) | `ml-sampling-top-k` | 58 | `bar-chart` |

All five wordings began with an empty topical pick. The author receives `ml-logistic-regression-softmax-single` when the three-stage reference wins. The contact sheet shows the library reference and the author variant. The per-depth IDs and kind changes are recorded in the [replay report](selector-replay.json).

## 408 px previews

The transformation gallery and top-k reference each have three native 408 px renders. The contact sheet also shows the two selected softmax references in Balanced. The vocabulary detail and library three-stage panel have wider native layouts and are fitted to 408 px on the sheet.

[PNG contact sheet](contact-sheet.png) · [SVG contact sheet with typeset formulas](contact-sheet.svg) · [Individual SVGs](408/) · [Render dimensions and hashes](previews.json)

## Checks

The 159 focused gallery, budget, top-k and SVG snapshot checks passed. The 37 focused control-plane checks and `npm run build --workspace web` also passed. The first broad web run caught the stale per-depth token receipt. After the recount, `npm run test:unit --workspace web` reported 7,279 passed, 37 skipped, 1 todo and zero failures.
