# Joint guide 04 — approved motion basis

The user approved this guide as the motion basis. [Approval](approval.json)
records the unchanged joint-data hash. Its original data file retains the status
at creation; the approval record is the current status. The rendered run remains
separately unapproved; see [render 04 review](../../../qa/render-04-review.md).

The refinement 03 identity references and proportions are unchanged. The run
is not approved. This guide makes anatomical leg exchange and connected arm
chains reviewable before another full-strip generation.

- [01 versus 05](contact-a-vs-b.png): complementary contacts and the same watch hand.
- [Eight-pose joint sheet](motion-skeleton-sheet.png), [phase strip](stride-phase-sheet.png), [joint map](joint-topology.png).
- [Eight-key loop](motion-guide.gif), [slow loop](motion-guide-slow.gif), [08-to-01 seam](seam-08-to-01.gif).
- [Continuous joint interpolation](continuous-skeleton.gif): skeleton only, no additional rabbit frames.
- [World-contact diagnostic](world-contact-diagnostic.gif): continuous joints above, held keys below.
- [Exact joint data](joint-data.json) and [geometry/export verification](validation.json).

LEFT is blue/dashed/square; RIGHT is orange/solid/round and always carries the
watch. Frames 01–03 support on the LEFT; 05–07 on the RIGHT. Both feet clear the
floor in 04/08. Colors are motion diagnostics, not new character markings.

Bone lengths come directly from unchanged `proportions.json`. The orthographic
guide exposes both limb chains instead of hiding mistakes behind coat occlusion.
No ears or costume are redrawn here; the head is only a joint locator.

The continuous guide's support toe stays planted. Holding only eight drawings
during continuous world motion still causes sliding: 60 source px per hold at
the proposed 13 FPS / 780 source px/s. **The rabbit's foot sliding is not fixed.**
The world diagnostic is a mathematical export, not a new gameplay/browser test.

See the [motion design and review gate](../../../../../../../docs/features/rabbit-run-joint-guide.md).
New rabbit artwork has now been generated from this guide. Character Bible v1 waits for
the corrected run's approval, followed by living idle/crouch behavior and then
the two-portal proof. All GIFs also have lossless WebP equivalents.
