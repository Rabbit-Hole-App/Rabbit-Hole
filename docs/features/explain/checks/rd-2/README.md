# RD-2 flow decision branches: before / after renders

Build branch `explain/rd-2` at b10cbef77dda324facc8860f506a5e3266c48e97 (c59e7e3b6 = RD-2 literal spec, b10cbef77 = RD-2b short-run variant), built on main 65164f686. Renders come straight from the renderer (`layoutFlow` in `packages/web/src/tutor-diagrams/flow.js`), white background, no card chrome. Before = flow.js of 65164f686, after = the branch tip.

Files are `<case>-<width>-<before|after>.png`.

- `swallow-*`: the owner's "Bedside Swallow Evaluation Process" card rebuilt as a 5-node flow (two process boxes, the decision "Signs of aspiration present?", two outcome capsules, Yes / No labels). The owner's card JSON was not available.
  - 408, 440 and 720 px: 433 px tall before, 381 px after. The before shows the symptom (the Yes and No runs at different heights, the two drops nearly overlapping). The after has both branches leaving the diamond's side vertices at the same height, dropping straight, labels beside them.
  - natural (283 px): byte-identical before and after (the drop would miss the target capsule, so today's routing is kept).
- `farTargets-*`: a decision whose two targets sit at very different x ("Stop" against a long outcome): 404 px before, 352 px after at 408, 440 and 720 px; natural width (263 px) is unchanged.

The literal RD-2 rule alone (c59e7e3b6) changes the swallow card only from about 560 px wide; at the real card widths (320 to 440 px) the targets sit within a label's width of the diamond's side vertices and its fallback keeps today's routing. RD-2b (b10cbef77) is what fixes those widths. The two commits are separate so RD-2b can be dropped alone.
