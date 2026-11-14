# Judge 2: the shadow judge with its blind spots filled (bench-judge-v2)

The judge now reads, per scheduled state, every drawn text and callout line by object id (`labels`), the readout rows as the card words them (`readoutRows`) and what the scrubber reads (`scrubber`: elapsed + the display offset, within its range). Same Sonnet 5.5, low effort, advisory only. The 12 cards were NOT rebuilt on the clone: each plan was read back from its job and the card rebuilt in-process (template build, zero model calls, headless captures). Findings: `judge2/<jobId>.json`.

## Verdicts

| Card | Job | New verdict | Blocker or major | Old input: verdict, majors | Group of each major |
|---|---|---|---|---|---|
| template-overview | ej_9c20c1b1185a43a0a6fdf3d5c61cc6ff | fail | 3 | fail, 3 | wording, cannot judge, cannot judge |
| template-standard | ej_3ee505d22b654d7bae60b9314be5c095 | pass | 0 | fail, 2 | none |
| template-deep | ej_37d809a8707f46f6ad7b1d03d31ec7af | fail | 2 | fail, 2 | cannot judge, cannot judge |
| template-moon-ledge | ej_0e7320ceab9845f08907ae035a977335 | fail | 2 | fail, 2 | content, cannot judge |
| fast-brief-1 | ej_6b34b063734c489195c3d43dc181284a | fail | 3 | fail, 3 | cannot judge, cannot judge, cannot judge |
| fast-brief-2 | ej_dc9553c1cc684548b83eaaaf9e5bd35d | fail | 2 | fail, 3 | cannot judge, cannot judge |
| fast-brief-3 | ej_addfa29c55bd41e980be8c8e4aed3328 | pass | 0 | fail, 3 | none |
| fast-balanced-1 | ej_a8376a99464f40e1bf32bcbcf5d3bb76 | fail | 3 | fail, 3 | content, content, cannot judge |
| fast-balanced-2 | ej_2d842a5df9254c2fb02689f586d7b3ca | fail | 2 | not finished | content, cannot judge |
| fast-detailed-1 | ej_e46d979659dc4e7f93081294f4b4ee69 | fail | 3 | fail, 1 | content, cannot judge, cannot judge |
| fast-detailed-2 | ej_6f69b9647ac8469aa17527e677b02231 | fail | 2 | fail, 2 | content, cannot judge |
| fast-detailed-3 | ej_3ce14431c893494f9162c3de9fd4f0f5 | pass | 0 | fail, 4 | none |

## Summary

- Majors by group (22 in all): wrong physics 0, content 6, wording 1, cannot judge 15.
- Agreement with the owner's approval of the 4 template cards: the judge passes 1 of 4 (old input: 0 of 4). Majors it raised against the approved cards: 7, none of them wrong physics.
- Fast cards: the judge passes 2 of 8 (old input: 0 of 7 that finished).

Classification rule: wrong physics = a number, sign or direction on the card is wrong; content = what the card draws or says contradicts its plan or is unfinished (a truncated state word); wording = the card and the plan word the same thing differently; cannot judge = the finding says itself that it cannot be judged from frames and traces, or says in its own text that the thing is consistent, acceptable or not a defect. Each major was classified by reading it; the judge does not classify itself.

## Blockers and majors, verbatim

### template-overview (fail, US$0.026728)

- **wording** (major, start): The scene description says there is no number readout and that the Motion arrow is blue and the gravity arrow is dashed. The frames label the arrows with letters 'v' and 'a', and the lane shows state text such as 'At launch' and 'Back at launch height'. The plan does not mention these labels. At the top, the 'Motion' readout and 'Gravity' readout rows are not in the scene description either. The arrows are also called 'Motion' and 'gravity' in the plan, but the card labels them 'v' and 'a'. This is a mismatch with the plan, though the content is not false.
- **cannot judge** (major, start): At t=0 the callout and the Motion readout say 'Moving up', and the state says 'At launch'. This is acceptable. At the end (t=0.816, v=-4) the ball is back at launch height and the motion arrow points down, which is consistent. However, the Motion arrow at launch has length 48 px for v=4. At cp-rising (v=2) it has length 24 px. That is proportional and fine. The gravity arrow stays at 48 px throughout. This is consistent. The 'At launch' state word is unplanned, so it is not a required observation.
- **cannot judge** (major, cp-fastTop): On the fixed height scale, apex height 1.27551 m is drawn at y=60, which is 170 px above the launch line at y=230. For launch speed 4, apex 0.816 m is drawn 108.8 px above. The ratio is 170/108.8 = 1.5625, and 1.27551/0.816327 = 1.5625. So the scale is consistent and faster tosses rise higher. The callout box for the fast top sits at y=40 and the scene starts at y=34, so it is close to the lane edge. This cannot be judged without pixels.

### template-standard (pass, US$0.035098)

No blocker or major.

### template-deep (fail, US$0.036064)

- **cannot judge** (major, cp-fastTop): At launch speed 5 and gravity 6 the apex is at 0.833 s, but the scrubber range is 0 to 1.666667 s. The layout says Launch speed 5 reads 0 to 1.020408 s and Gravity 6 reads 0 to 1.333333 s, both at the default other input. For 5 m/s and 6 m/s², the full flight is 2u/g = 1.666667 s, so the range looks self-consistent. The plan's scrubber range text does not cover this combined case. The mismatch is only against the per-input examples, so this is a minor concern, not a clear error.
- **cannot judge** (major, cp-fastTop): The apex height is 2.083 m. The ruler runs 0 to 2.2 m over 175 px, so the ball should be at y = 243 − 2.0833/2.2×175 = 77.3. That matches the drawn position. However, the callout boxes sit at y = 40 to 124 and the ball is near the top of the scene. I cannot judge from frames whether any of these overlap or clip.

### template-moon-ledge (fail, US$0.025422)

- **content** (major, start): The plan says the scene has no number readout and that the height scale is fixed with a marked ledge at 1.0 m. The frames show the ledge guide at y=230, which is the ball's launch position. The ground is not drawn. The ledge is therefore at the base of the scale, not at 1.0 m on it. The height axis also has no scale marks, so a learner cannot read heights. The ball pixel position is 56.67 px per m of rise, which matches the traces. But the 'marked ledge at 1.0 m' requirement is not clearly met.
- **cannot judge** (major, cp-fastTop): At launch speed 3 the ball at the top is at y=60, inside the lane that spans y=34 to 266. The callout box at y=40 to 96 fits. The fixed scale works up to speed 3. But the label 'Fastest throw' is not a maximum, because the input may allow higher speeds. Those would leave the lane. This cannot be judged from the frames.

### fast-brief-1 (fail, US$0.026702)

- **cannot judge** (major, start): The layout text says the default scrubber range is 0 to 1.020408 s, and the plan's own default launch speed of 5 gives a range of 0 to 1.020408 s. The scene plan's example inputs differ from this default, but the trace is consistent with itself. The more serious problem is that the vec.v and vec.a arrows in the lane show a 60 px velocity at v=5 and a fixed 48 px gravity arrow. The motion arrow at v=5 (60 px) is longer than the gravity arrow. That scaling is not wrong, but the cp-rising frame supports 'shortens' only weakly. The velocity arrow is 30 px at v=2.5, which is proportional, so it does shorten.
- **cannot judge** (major, cp-fastTop): The checkpoint is labelled 'Fastest toss' and uses launch speed 10. The apex ball is at y=60 for 5.1 m, which is a scale of about 33.3 px/m. At v=5 the apex is at 187.5, which is 42.5 px for 1.2755 m, also about 33.3 px/m. The scale is therefore fixed and the claim holds. However, the callout box at y=40 is only 20 px from the lane top at y=34, so it is close to the lane edge. This cannot be judged without pixels. If the user can enter a launch speed above 10, the ball or callout would leave the lane. That is a possible out-of-range risk.
- **cannot judge** (major, end): At the endpoint the ball is back at launch height with v=-5. The readout says 'Moving down', and the state says 'Back at start'. The motion arrow points down at full length. This is consistent, but the callout still says 'Moving down' for a ball that has landed. That is a minor point and not misleading.

### fast-brief-2 (fail, US$0.027064)

- **cannot judge** (major, start): The layout says the default inputs read 0 to 1.020408 s. The default captures (start, cp-rising, cp-top, cp-falling, end) have launchSpeed 5, so the traced range is 0 to 1.020408 s. That range matches launch speed 10 (2*10/9.8 = 2.04 s). Launch speed 5 should read 0 to 1.020408 s, which is consistent. However, the layout's own examples say speed 3 gives 0.612245 s and speed 10 gives 2.040816 s, so the default is 5. This is consistent and not a defect. The real problem is that the plan says 'no number readout', yet the readouts are text only, so that is fine too.
- **cannot judge** (major, cp-fastTop): The fast toss (10 m/s) puts the ball at y=60 and the callout at y=40–96. The apex height is 5.10 m, and the drawn rise is 170 px, which is 33.3 px/m. At 5 m/s the apex rise is 42.5 px for 1.2755 m, also 33.3 px/m, so the scale is consistent. The velocity arrow is absent at the top, as planned. The fixed scale for fasterHigher is supported.

### fast-brief-3 (pass, US$0.024308)

No blocker or major.

### fast-balanced-1 (fail, US$0.041546)

- **content** (major, start): The lane.toss.state and lane.drop.state labels read 'Starting', 'Held at', 'Rising', 'At the apex' and 'Back at'. Several of these are truncated phrases, for example 'Held at' with no object and 'Back at' with no object. The state words are incomplete, so the learner reads unfinished text.
- **content** (major, start): At the default inputs the first frame shows the tossed ball at launch (height 0) with v = +5 m/s, but the scrubber reads -0.51 s, the time from the top. That is consistent. However, the drop-lane label 'Ground Level' sits at the bottom while the held ball is drawn at the apex height. Its gate lines (y=236.7) are drawn about 15 px below the ball center (221.7), not at the ball. The gate geometry looks inconsistent with the 'gate at apex height' description.
- **cannot judge** (major, cp-top): At the top the released ball is labelled 'Released' and a = -9.8 on the instant of release. This is piecewise at the switch, so it is acceptable. However, the gate lines are drawn open and slanted at the same instant, and the drop-lane state flips before any motion. The gate open at exactly t=0 is a minor ambiguity.

### fast-balanced-2 (fail, US$0.041048)

- **content** (major, start): The default launch speed is 5 m/s with g = 9.8 m/s². The drop lane state reads 'Held at' and the toss lane state reads 'Back at'. Both phrases are truncated, so the state lines are incomplete. The scrubber range of ±0.510204 s is correct for these inputs.
- **cannot judge** (major, end): The tossed ball is drawn at height 0 (y=243) with v = −5.00 m/s, and the arrow length of 60 px matches. The v arrow reaches y=303, below the lane box (y 34–279) and below the launch mark. In the toss lane, the a arrow and label sit at the launch level. The ball at the ground is therefore drawn with arrows that extend outside the lane. This is plausible but cannot be judged without pixels.

### fast-detailed-1 (fail, US$0.035262)

- **content** (major, start/lane.toss.state): The state line text is truncated. It reads 'At' at launch and at the top, and 'Risin' and 'Back' in other captures, instead of 'At launch', 'Rising', 'At the top' and 'Back at start'. The motionState readout holds the full words, so the on-card state line contradicts it. At the top, 'At' does not say what the state is.
- **cannot judge** (major, cp-top/vec.v): No velocity arrow is drawn at the top, which is acceptable for v = 0. The 'v' label is also absent, so the zero velocity is not shown visually. The callout does read v = 0.00 m/s. This is minor on its own.
- **cannot judge** (major, cp-fastTop/axis.h): The ruler tops out at 13.2 m, and the ball at 12.5 m sits near the top. The ball is at y=77 and the callout boxes start at y=40, so the plot fits. The scrubber reads 0 to 5 s, but the layout says Launch speed 10 with Gravity 4 reads 0 to 5 s, which is consistent with the trace. The plot x axis is fixed at 0 to 5 s, so the default 1.02 s trace occupies only a small part of the plot. This is imprecise but not wrong.

### fast-detailed-2 (fail, US$0.032262)

- **content** (major, end/lane.toss.state): The state line at the endpoint reads "Back at". The motionState readout says "Back at start", so the drawn state text is truncated or incomplete and contradicts the readout.
- **cannot judge** (major, cp-fastTop/vec.v): The fast-toss capture has apexHeight 12.5 m and the ball is drawn at y=77. The callout boxes sit at y=40 to 124, which is inside the lane. The callout stack moves with the ball and no longer lines up with the fixed positions used in the other captures. The reader cannot confirm from this capture that the top is placed correctly on the fixed scales. The axis ticks only reach 10 and max is 13.2, which is acceptable. This is a minor placement issue, but the missing launch-speed and gravity comparison against the default capture is unsupported.

### fast-detailed-3 (pass, US$0.032044)

No blocker or major.
