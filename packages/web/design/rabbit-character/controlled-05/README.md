# Controlled correction and 16-frame sampling

**Rejected by the user as a final visual candidate:** multiple rendered legs look
broken. This folder preserves the historical experiment. Continue with the
[continuous rig experiment and fallback decision](../articulated-06/REVIEW.md).

This is the user-authorized, offline correction experiment following candidate
04. It is not a runtime rig migration and is not visually approved.

The experiment is now rendered and tested. Start with the
[world comparison](world-movement.gif), [slow 16-frame loop](run-16-slow.gif),
[16-frame contact sheet](contact-sheet-16.png) and [full measured review](REVIEW.md).
Pose alignment improved, but Chrome still measures about 11 display pixels of
sliding during a held support pose. The recommendation is a continuous
articulated/hybrid run renderer next, subject to the user's approval.

The approved guide, character seed, proportions and standing turnaround stay
unchanged. Candidate 04 remains at the parent directory for comparison. Existing
candidate-04 artwork supplies all raster material. No new image-generation call,
optical flow, independently generated in-between or character redesign is used.

Plan: isolate reusable artwork, attach it to the frozen anatomical trajectories,
correct passing/toe-off and flight, then sample eight keys and eight half-phase
in-betweens. Reapply the existing monochrome dither after deformation. Export
16 frames at 26 FPS: the stride still lasts 8/13 seconds.

Compare the old eight drawings, corrected eight keys and 16-frame cycle in an
actual Chrome canvas with an independently translating world root. Report
between-pose contact error separately from sliding while a drawing is held.
Any visual root offset must be explicit metadata and compared with an
uncompensated version. A rigged runtime, living idle/crouch and portals require
the later approval gate; they are outside this experiment.
