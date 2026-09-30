# Hybrid leg skinning correction

The user approved the continuous architecture and rejected candidate 06 skinning.
This is a bounded change to the existing run renderer, delivered as review
recordings and close-ups through the existing private browser QA harness. It does
not add app UI or another behavior. No sprite generation or tool migration.

## Inputs and motion

Keep candidate 06's continuous motion/controller module unchanged. Retain the
approved joint guide, source hashes, character proportions, standing views,
material/dither treatment, right-hand watch, and all non-leg attachments.
Pass 04 contact artwork (source keys 01/05) supplies the leg construction reference.
No new attachment accompanied the request; an optional reference clarification
is pending, with the retained contacts as the stated working assumption.

## Implementation

1. Bind separate thigh, shin and complete foot surfaces to single bones. Normalize
   source lengths once at authoring time; no runtime section scaling or shearing.
2. Add small overlapping joint surfaces and authored compression/toe-off/recovery
   contour corrections. Keep these confined to the hip/knee/ankle regions. Foot
   outline vertices remain rigid and never enter a generic skin solver.
3. Preserve far LEFT / near RIGHT layering. Natural overlap is allowed; do not
   translate the joints to separate crossing limbs.
4. Reuse grayscale source artwork and stable material UV dither. Joint patches
   are anatomical skin, not full-character alternate frames.
5. Verify dense-cycle section distances, knee branch, seam, source integrity,
   watch ownership and world contacts. Measure ankle angles rather than silently
   changing an approved trajectory to improve a metric.
6. Capture real Chrome plain renders, comparison with 06, both legs at contact,
   compression, passing, toe-off and recovery, with separate skeleton, boundaries,
   weight and foot-outline diagnostics. Export normal, slow and world recordings.

## Review focus

- Recovery feet may overlap lower legs under the existing ankle angles. A rigid
  outline alone does not prove a readable drawing; review plain art first.
- Joint overlap must not create cuffs twice, bulges, gaps or rectangular edges.
- Existing material dots can alias during rotation; do not confuse pixel shimmer
  with a bone/anchor regression.
- Record architecture approval separately from rendered-run visual approval.
- Stop after this candidate for the user's visual approval. No idle or portals.
