# GEN-1 example pool 2 · Batch A review revision

Source commit `e88f0ab873b0e933699cdf1b2767cda1ba2e1bb4` adds the accepted adjustment on top of `bda73b91d`.

Standard and Detailed omit item-link rows for the garden grant and fruit tea softmax examples. The Detailed captions retain the leading-share calculations.

The refreshed sheet contains all 33 views at native 408 px. The four changed views have new SVG digests.

## Compact tokens

Each cell shows authored and parser-completed counts for `{id, spec}` with `cl100k_base`.

| Reference | Overview | Standard | Detailed |
| --- | ---: | ---: | ---: |
| `pool-garden-grant-softmax` | 109 / 124 | 118 / 133 | 114 / 129 |
| `pool-fruit-tea-blend-softmax` | 109 / 124 | 117 / 132 | 114 / 129 |
| `pool-rain-barrel-midpoint` | 152 / 155 | 165 / 168 | 172 / 175 |
| `pool-dog-park-gate-mean` | 170 / 173 | 183 / 186 | 187 / 190 |
| `pool-farm-stand-shelf-peak` | 162 / 165 | 179 / 182 | 187 / 190 |
| `pool-museum-coat-check-waits` | 122 / 133 | 177 / 200 | 185 / 208 |
| `pool-paint-swatch-drying-times` | 124 / 135 | 182 / 205 | 189 / 212 |
| `pool-skate-rental-proportions` | 97 / 105 | 109 / 117 | 124 / 132 |
| `pool-bakery-tray-spot-check` | 136 / 142 | 177 / 184 | 175 / 182 |
| `pool-craft-market-aisle-traffic` | 103 / 113 | 125 / 135 | 142 / 152 |
| `pool-repair-cafe-station-weights` | 85 / 91 | 108 / 120 | 109 / 121 |

## Checks

- Passed all 43 focused tests, including the SVG fingerprints, content contract, pool data, lazy library and board-link audit.
- Regenerated six fingerprints for the two softmax references at 320, 408 and 720 px.
- Compared the accepted and revised reference objects. The only difference is the removal of the item links.
- The reference linter reports no errors and two warnings because Overview and Standard now have equal element counts.

[Token counts and schema checks](tokens.json) · [Preview dimensions](preview-layout.json) · [Fingerprint changes](snapshots.json) · [Reference comparison](selector-inputs.json)

![Batch A reviewed at 408 px per view](contact-sheet.png)
