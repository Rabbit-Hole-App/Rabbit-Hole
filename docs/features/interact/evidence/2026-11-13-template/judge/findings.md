# Shadow judge findings

Exported by scripts/interact/judge-export.mjs from the job details (verbatim, majors first). The four template cards first, then earlier ledger rows that carry a judge verdict.

## toss-overview (brief, google-low, template) job ej_09b11022eddd448ab188df044dc47545

Verdict **fail**, 4 findings (3 major), judge claude-sonnet-5-5.

1. **major** · capture `start` · spec · object `vec.v / vec.a`
   The scene description says the Motion arrow is a blue arrow and the gravity arrow is a separate dashed warm arrow. The frames show the arrows labelled with the letters 'v' and 'a'. The plan says there should be no equation or number readout, and the 'v' and 'a' labels do not match the plan's 'Motion' and 'Gravity' names. The frames give no colour or dash information, so I can't confirm either style.
2. **major** · capture `start` · spec · object `vec.v`
   The Motion arrow length does not match the velocity. At v=4 the arrow is 48 px long. At v=2 (cp-rising) it is 24 px, which is proportional. At v=-4 (end) it is 48 px. However, the gravity arrow stays at 48 px throughout, so the arrow lengths use a scale of 12 px per m/s. The gravity arrow is therefore drawn at 9.8 m/s² on a different scale, which is acceptable only if the card says so. The card does not, so the scale is unsupported.
3. **major** · capture `start` · spec · object `callout.toss`
   The frames show the callout only as empty boxes. The callout text ('Moving up', 'Still for an instant', 'Moving down' and 'Gravity pulls down') does not appear in the objects or texts. The texts lists only 'One toss', the state label, 'Launch height', 'v' and 'a'. The callout wording is therefore unverifiable in frames. The readouts do carry the right values.
4. **minor** · capture `cp-fastTop` · spec · object `ball.toss`
   The fixed height scale is consistent. The 4 m/s top is at y=151.7 and the 5 m/s top is at y=59.9. Both use 200 px per m, so the faster toss rises higher. This checks out. The plan's no-number-readout rule is not violated.

## toss-standard (balanced, google-low, template) job ej_79651614eb724fe6bd760d9fca37b0fe

Verdict **fail**, 4 findings (2 major), judge claude-sonnet-5-5.

1. **major** · capture `start` · spec
   The default launch speed is 4 m/s, so the top is at 0.408 s and the scrubber reads -0.408 to 0.408 s. The capture times are elapsed-from-launch (0 to 0.816 s), not time from the top. The start capture is at time 0 and the end capture at 0.816, but the scrubber is meant to run from -0.408 to +0.408. The frames and traces cannot confirm that the scrubber reading and offset match the plan's timeline.
2. **major** · capture `cp-before` · spec
   The drop ball's callout shows a = 0 while it is held. The plan's own claim is that both balls share height, velocity and acceleration after release, so this is consistent. However, the observation 'accelerationConstant' says the acceleration is -g at every instant, including the top. At cp-top the drop acceleration jumps to -9.8 while its velocity is 0, and the tossed v arrow is drawn as a dot. The traces support this. Even so, the drop callout is 136 wide before release and 146 after, which is minor.
3. **minor** · capture `cp-after` · spec
   The ghost outlines are drawn at the shared start height and the traces are consistent. The velocity arrow is 12 px at 0.98 m/s, which matches the 12 px/(m/s) scale used at v = 4 (48 px). No physics error was found.
4. **minor** · capture `cp-fastTop` · spec
   The apex height of 2.083 m is below the 2.2 m scale, so the ball stays inside the frame. Values match v²/2g = 2.083 and t = 0.833. This is fine. The fastTop gate and ball are consistent.

## toss-deep (detailed, google-low, template) job ej_33000817f3704894b10e657721419aed

Verdict **fail**, 3 findings (2 major), judge claude-sonnet-5-5.

1. **major** · capture `cp-fastTop` · spec
   The checkpoint is captured at time 0.833333 s, but the card's own range for launch speed 5 and gravity 6 is 5/6 = 0.833333 s. The ball's apex height is 2.083 m and the scale tops out at 2.2 m, so the position is consistent. However, the plot and the scrubber for this capture are not shown, so the scrubber range cannot be judged. The fast-top checkpoint is therefore only partly supported. The 'later and higher' observation topMoves has no readout and cannot be confirmed from frames alone.
2. **major** · capture `start` · spec
   The plan's velocitySamples observation (+0.98, 0, -0.98 m/s) is supported for the first two samples. The after-top sample at 0.10 s is not captured, so the -0.98 m/s value is unverified. The start capture's readout shows velocity 4 while the state is 'Ready to toss'. This is acceptable, but no scene text explains it.
3. **minor** · capture `cp-top` · spec
   At the top the velocity arrow vec.v is absent, which is reasonable for v = 0. The acceleration arrow is still drawn, so the card shows a nonzero acceleration at v = 0. The frames do not show the callout text lines, only boxes, so the readout wording cannot be judged. Pixels are not available, so the plot's marker and orange slope segment cannot be judged either.

## ledge-toss-moon (brief, google-low, template) job ej_2fc2f4dfbfdb4d5da47dbf861addec14

Verdict **fail**, 3 findings (2 major), judge claude-sonnet-5-5.

1. **major** · capture `start` · spec
   The plan says the scene has no number readout, but the frame draws text labels 'v' and 'a' and the lane title 'One toss' with state text. The plan names a Motion arrow and a gravity arrow, not v/a vector labels. The callout text itself is not visible in the objects. It can only be judged through the readouts, so the callout wording cannot be verified from the frames.
2. **major** · capture `cp-fastTop` · spec
   The apex height is 3.7778 m, which maps to y=59. The lane box starts at y=34 and the ball radius is 18, so the ball top is at y=41. That is near the lane edge. The callout box starts at y=40. The fixed scale only just fits a launch speed of 3. A higher launch speed would leave the ball outside the lane. This cannot be checked from the captures shown.
3. **minor** · capture `cp-rising` · spec
   The Motion arrow is 12 px long at v=1 and 24 px at v=2, which matches v. At the top it is absent, as required. The gravity arrow is a constant 48 px, as required. The arrow state of the observations is supported by the traces. The scale is 85.33 px/m, which is consistent: the ball height at t=0.617 is 0.926 m above the ledge, which is 79 px, and the frame shows 85.3 px. The pixel offset is 315-229.67=85.33, which corresponds to 1.0 m, not 0.926 m. The drawn ball position therefore disagrees with the traced height of 1.925926. The expected rise is 0.926 m, about 79 px, so it is drawn about 6 px too high.

## toss-deep (detailed, opus-baseline, model) job ej_9c13732ca9ce4bf68bc3b1d3d87651ff

Verdict **fail**, 3 findings (2 major), judge claude-sonnet-5-5.

1. **major** · capture `start` · spec
   The layout says the default inputs read 0 to 0.816327 s. The scheduled states use launch speed 4 and gravity 9.8, and the card ends at 0.816327 s, which matches that range. The plan's observation text and the description both cite 0.98 m/s at 0.10 s before the top, and the cp-before capture shows 0.98 m/s at t=0.308163 s. That matches. Even so, the start state does not match the plan's default launch-speed quantities and the 'launch speed 2/5' scrubber examples. This is only a mild concern.
2. **major** · capture `cp-fastTop` · spec
   The ball is drawn at y=85.38 with the height axis at 360 and length 290 for 0 to 2.2 m. Height 2.0833 m gives y=360-2.0833*131.8=85.4, which is correct. The callout boxes were placed at y=62 to 146 and the ball is near the top of the scene. The acceleration arrow length is 24 px at g=6, against 39.2 px at g=9.8, so it scales with g. That is fine. However, the velocity arrow and the 'v' label are absent at the top, which is acceptable. The velocity readout is 0. The callout texts (velocity, acceleration and force values) are not exposed in the frames, so I cannot verify the callout content or the claim that the force is shown as a downward gravitational force.
3. **minor** · capture `cp-top` · spec
   The frames show the callout only as empty boxes. The readout values live in the traces, but the drawn callout text cannot be judged from what I was shown. The callout widens from 156 to 166 px at 29.4 N, which is plausible. The velocity-time graph geometry looks consistent: the marker sits on the zero line at the top.

## toss-deep (detailed, google-low, model) job ej_90a771e7864a435d874605d19bc17b59

Verdict **fail**, 5 findings (3 major), judge claude-sonnet-5-5.

1. **major** · capture `cp-before` · spec · object `velArrowL`
   The velocity arrow is drawn as kind 'line' instead of 'arrow'. Its length is 9.8 px. It is not clearly the blue velocity arrow, and the arrow scale looks inconsistent: v=4 gives 40 px, so v=0.98 should give about 9.8 px, which matches only the length. The arrowhead is not confirmed.
2. **major** · capture `start` · spec · object `vPlot`
   The frames list only the plot box and axes. The blue trace, linked marker, faint continuation and orange local slope segment labelled a = -g are not shown in any capture. So the velocity-graph observations (velocitySamples, accelerationSlope) cannot be judged from the frames. Callout text and readout text are likewise not shown.
3. **major** · capture `cp-fastTop` · spec · object `accArrowL`
   The acceleration arrow length is 98 px at g=9.8 and 60 px at g=6, so it scales with g. In cp-fastTop its tip is at y=43.8 and its label at y=25.8, close to the top of the scene. Even so, the checkpoint values are correct: apex 0.8333 s, 2.0833 m, a=-6, F=6. The topMoves observation is supported only through numbers, not through a drawn comparison on fixed scales.
4. **minor** · capture `cp-top` · spec · object `velArrowL`
   At v=0 the velocity arrow is absent, which is acceptable. The frame cannot show a zero-length arrow or a label to the viewer, so the 'v = 0' emphasis cannot be judged.
5. **minor** · capture `start` · spec · object `callout.l0`
   The callout box width varies between captures (146, 96, 116, 226). Its text is not shown, so this cannot be judged.

## toss-overview (brief, opus-baseline, model) job ej_29fd176defcb498da137358c96de8c0c

Verdict **pass**, 1 findings (0 major), judge claude-sonnet-5-5.

1. **minor** · capture `start` · spec
   The default launch speed is 4 m/s. The layout text says the default scrubber reads 0 to 0.816327 s, and that matches 2·4/9.8. I found no inconsistency. The callout text is not shown in the frames, only its boxes and the readouts. The wording 'Moving up', 'Still for an instant' and 'Moving down' therefore comes from the readout only. I cannot judge the 'Gravity pulls down' line from the frames.

## toss-standard (balanced, opus-baseline, model) job ej_7e1e09ed8c8a42209b46cb9c72a1142e

Verdict **fail**, 4 findings (3 major), judge claude-sonnet-5-5.

1. **major** · capture `start` · spec · object `dropBall`
   At launch the drop ball is held at apex height 0.816 m, but the drawn y is 240.9 with scale 240px/2.2m from baseline 330. That gives about 89 px of height, so it is drawn correctly. The problem is the tossed ball's velocity arrow at t=0. It runs from 330 to 274, which is 56 px for 4 m/s, or 14 px per m/s. At cp-before, 0.98 m/s gives 13.7 px, so the scale is consistent. Even so, the toss lane has no 'Held' state at the start, and the Toss lane state line at the top is the same as the plan says, so this is not an error.
2. **major** · capture `cp-top` · spec · object `dropAcc`
   At the top the drop ball's acceleration reads -9.8 while its state says 'Just released'. Before the top it reads 0 while held. This matches the plan. But the drop ball's acceleration jumps from 0 to -g at the instant the velocity is zero, and the card gives no explanation. The card's claim is that both balls share acceleration at every instant after release. Drop acceleration at cp-before is 0, so the claim 'toss acceleration is -gravity throughout' holds, but the readouts for cp-before show the pair disagreeing. This is acceptable only if the scene says why.
3. **major** · capture `cp-fastTop` · spec · object `hAxis`
   The fast-toss apex height is 2.083 m. The drawn y is 102.7 on a 240 px / 2.2 m scale, which gives 330-227=103, so it is consistent. However, the time reading cannot be verified: the scrubber range and the 'Time from the top' offset are not shown in the frames. The scrubber and the control effects (At top seek, reset, speed and gravity) cannot be judged from these frames and traces.
4. **minor** · capture `start` · spec · object `tossLane.state`
   The lane title and state text share y=16, with the state at x=160 and the title at x=80. Whether they overlap cannot be judged without pixels.

## toss-deep (detailed, opus-baseline, model) job ej_f1f8bd2dd724484fba2bb43c0a3dd454

Verdict **fail**, 4 findings (2 major), judge claude-sonnet-5-5.

1. **major** · capture `cp-before` · spec
   The plan's velocitySamples observation says the velocity is +0.98 m/s at 0.10 s before the top. The trace agrees: velocity 0.98 at t=0.308. The velocity arrow is too short for that. Its length is 9.8 px, but the scale in the start frame is 10 px per m/s (4 m/s gives 40 px). That is consistent, so the arrow is not the problem. The velocity arrow here is drawn as kind 'line' rather than 'arrow'. At the start and end it is an 'arrow'. That makes the arrowhead inconsistent and possibly missing.
2. **major** · capture `cp-fastTop` · spec
   At launch speed 5 and gravity 6, the apex height is 2.083 m, which fits the 0–2.2 m ruler. The info box at y=100–184 and the slope label at y=128 may overlap, but that cannot be judged without pixels. The slope label sits at a fixed position (448,128) away from the orange segment. In the fast capture the segment is at about y=214–255, so the label is not attached to it. The 'labelled with the slope' claim is weakly supported.
3. **minor** · capture `cp-top` · spec
   The velocity arrow is correctly absent at v=0. The info-box text lines and readout text are not shown in the frame, so the callout contents (velocity, acceleration, force in N) cannot be judged from frames and traces.
4. **minor** · capture `start` · spec
   Default launch speed is 4 m/s, and the card shows 0 to 0.816 s. The plan's observation text about the top is only partly checkable: the topMoves observation has no readout, so its effect on the fixed scales must be inferred from the ball position. The ball is later and higher in cp-fastTop, which supports it.
