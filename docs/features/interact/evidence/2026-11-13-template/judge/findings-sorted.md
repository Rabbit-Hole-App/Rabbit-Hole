# Judge findings of the four template cards, sorted

Quoted verbatim from judge/<plan>.json (Sonnet 5.5 shadow judge, headless frames: no pixels). The judge labels every finding category `spec`; the groups are the sorter's reading. Nothing here is fixed.

## Wrong physics (what is drawn disagrees with the plan's numbers)

- **toss-standard** · major · capture `cp-before`
  > The drop ball's callout shows a = 0 while it is held. The plan's own claim is that both balls share height, velocity and acceleration after release, so this is consistent. However, the observation 'accelerationConstant' says the acceleration is -g at every instant, including the top. At cp-top the drop acceleration jumps to -9.8 while its velocity is 0, and the tossed v arrow is drawn as a dot. The traces support this. Even so, the drop callout is 136 wide before release and 146 after, which is minor.
  Sorter's note: the judge's own reading is that the traces support the plan (held ball a = 0, then -g after release); it flags the observation wording "acceleration is -g at every instant".

- **ledge-toss-moon** · minor · capture `cp-rising`
  > The Motion arrow is 12 px long at v=1 and 24 px at v=2, which matches v. At the top it is absent, as required. The gravity arrow is a constant 48 px, as required. The arrow state of the observations is supported by the traces. The scale is 85.33 px/m, which is consistent: the ball height at t=0.617 is 0.926 m above the ledge, which is 79 px, and the frame shows 85.3 px. The pixel offset is 315-229.67=85.33, which corresponds to 1.0 m, not 0.926 m. The drawn ball position therefore disagrees with the traced height of 1.925926. The expected rise is 0.926 m, about 79 px, so it is drawn about 6 px too high.
  Sorter's note: the judge's arithmetic (a drawn rise of 1.0 m against 0.926 m) was not re-checked by the sorter.

## Wrong or missing content (the card lacks something the plan or the reader needs)

- **toss-overview** · major · capture `start` · object `vec.v`
  > The Motion arrow length does not match the velocity. At v=4 the arrow is 48 px long. At v=2 (cp-rising) it is 24 px, which is proportional. At v=-4 (end) it is 48 px. However, the gravity arrow stays at 48 px throughout, so the arrow lengths use a scale of 12 px per m/s. The gravity arrow is therefore drawn at 9.8 m/s² on a different scale, which is acceptable only if the card says so. The card does not, so the scale is unsupported.
  Sorter's note: the gravity arrow is drawn on a fixed length while the velocity arrow is proportional, and the card does not say so.

- **ledge-toss-moon** · major · capture `cp-fastTop`
  > The apex height is 3.7778 m, which maps to y=59. The lane box starts at y=34 and the ball radius is 18, so the ball top is at y=41. That is near the lane edge. The callout box starts at y=40. The fixed scale only just fits a launch speed of 3. A higher launch speed would leave the ball outside the lane. This cannot be checked from the captures shown.
  Sorter's note: the fixed scale leaves the ball 7 px under the lane top and level with the callout box at launch speed 3 (the top of the input range).

## Wording or naming (labels and names against the plan's words)

- **toss-overview** · major · capture `start` · object `vec.v / vec.a`
  > The scene description says the Motion arrow is a blue arrow and the gravity arrow is a separate dashed warm arrow. The frames show the arrows labelled with the letters 'v' and 'a'. The plan says there should be no equation or number readout, and the 'v' and 'a' labels do not match the plan's 'Motion' and 'Gravity' names. The frames give no colour or dash information, so I can't confirm either style.
  Sorter's note: v and a against the plan's Motion and Gravity names; the colour and dash part is also unjudgeable from frames.

- **ledge-toss-moon** · major · capture `start`
  > The plan says the scene has no number readout, but the frame draws text labels 'v' and 'a' and the lane title 'One toss' with state text. The plan names a Motion arrow and a gravity arrow, not v/a vector labels. The callout text itself is not visible in the objects. It can only be judged through the readouts, so the callout wording cannot be verified from the frames.
  Sorter's note: v and a letters against the plan's Motion and gravity arrow names; callout text not visible in the objects.

## Cannot be judged without pixels (the judge saw frame traces, not a rendering; headless runs carry a 1 x 1 placeholder image)

- **toss-overview** · major · capture `start` · object `callout.toss`
  > The frames show the callout only as empty boxes. The callout text ('Moving up', 'Still for an instant', 'Moving down' and 'Gravity pulls down') does not appear in the objects or texts. The texts lists only 'One toss', the state label, 'Launch height', 'v' and 'a'. The callout wording is therefore unverifiable in frames. The readouts do carry the right values.
  Sorter's note: callout text is not in the frame objects the judge reads.

- **toss-standard** · major · capture `start`
  > The default launch speed is 4 m/s, so the top is at 0.408 s and the scrubber reads -0.408 to 0.408 s. The capture times are elapsed-from-launch (0 to 0.816 s), not time from the top. The start capture is at time 0 and the end capture at 0.816, but the scrubber is meant to run from -0.408 to +0.408. The frames and traces cannot confirm that the scrubber reading and offset match the plan's timeline.
  Sorter's note: the scrubber (-0.408 to 0.408 s) is not in the frames, only elapsed capture times.

- **toss-deep** · major · capture `cp-fastTop`
  > The checkpoint is captured at time 0.833333 s, but the card's own range for launch speed 5 and gravity 6 is 5/6 = 0.833333 s. The ball's apex height is 2.083 m and the scale tops out at 2.2 m, so the position is consistent. However, the plot and the scrubber for this capture are not shown, so the scrubber range cannot be judged. The fast-top checkpoint is therefore only partly supported. The 'later and higher' observation topMoves has no readout and cannot be confirmed from frames alone.
  Sorter's note: scrubber and plot are not shown in the capture; the "later and higher" observation has no readout.

- **toss-deep** · major · capture `start`
  > The plan's velocitySamples observation (+0.98, 0, -0.98 m/s) is supported for the first two samples. The after-top sample at 0.10 s is not captured, so the -0.98 m/s value is unverified. The start capture's readout shows velocity 4 while the state is 'Ready to toss'. This is acceptable, but no scene text explains it.
  Sorter's note: the after-top sample (0.10 s) is not among the captures; the start readout showing v = 4 at "Ready to toss" is called acceptable but unexplained.

- **toss-deep** · minor · capture `cp-top`
  > At the top the velocity arrow vec.v is absent, which is reasonable for v = 0. The acceleration arrow is still drawn, so the card shows a nonzero acceleration at v = 0. The frames do not show the callout text lines, only boxes, so the readout wording cannot be judged. Pixels are not available, so the plot's marker and orange slope segment cannot be judged either.
  Sorter's note: callout text lines, the plot marker and the orange slope segment cannot be judged.

## Not a defect (the judge checked and found it correct; listed because it is in the findings)

- **toss-overview** · minor · capture `cp-fastTop` · object `ball.toss`
  > The fixed height scale is consistent. The 4 m/s top is at y=151.7 and the 5 m/s top is at y=59.9. Both use 200 px per m, so the faster toss rises higher. This checks out. The plan's no-number-readout rule is not violated.

- **toss-standard** · minor · capture `cp-after`
  > The ghost outlines are drawn at the shared start height and the traces are consistent. The velocity arrow is 12 px at 0.98 m/s, which matches the 12 px/(m/s) scale used at v = 4 (48 px). No physics error was found.

- **toss-standard** · minor · capture `cp-fastTop`
  > The apex height of 2.083 m is below the 2.2 m scale, so the ball stays inside the frame. Values match v²/2g = 2.083 and t = 0.833. This is fine. The fastTop gate and ball are consistent.
