# TOK-W3 (sprint 2): token-links chip rows wrap

Commit on feat/visual-sprint-2-flow (token-links-layout.js only; hunk.diff), on 77218dcad (before = 77218dcad).

Rule: when the row of chips (the wider of source and target) would pass the budget (the request, at least 720, at most 960), chips wrap at chip boundaries: as many columns as fit, the rest on further rows; the source chips wrap the same way; the gap between wrapped chips is 28 px and rows are 44 px apart. A figure that fits keeps its layout byte for byte. Links keep their weight, colour and head: to a target on the first row the same straight arrow as before; to a target on a lower row the arrow leaves the source, runs along a lane, down the gap to the right of its column, along a lane above the target's row and down into the chip; a source chip on an upper source row first goes down its own gap. The weight badge of the strongest link sits on the last leg.

| figure | request | before | after |
|---|---|---|---|
| retro-chunk-attention | 408 | 960 x 424 | 616 x 463 |
| retro-chunk-attention | 720 | 960 x 424 | 720 x 474 |
| depth-attention | 408 | 721 x 647 | 534 x 825 |
| depth-attention | 720 | 721 x 647 | 720 x 847 |
(at a 720 request the figure is the request; ml-self-attention-token-links / cross-attention are unchanged: 514 / 720.)
Files: <figure>-<408|720>-<before|after>.png/.html, sizes.txt.
depth-attention is 1 px over (721), so its three target chips wrap 2 + 1, which makes it taller (825); that is the rule applied as asked.
Tests run singly: token-links.test.mjs 7 pass, 1 fail: token-links.test.mjs:123 "natural token widths keep the full rows and bound long labels at 960 px": AssertionError: Expected values to be strictly equal: 471 !== 960 (line 129, tokenLinksNaturalWidth(long): eight 24-letter chips now wrap, natural width 471). Not re-pinned. illustration-embedded-layouts 4 pass.
