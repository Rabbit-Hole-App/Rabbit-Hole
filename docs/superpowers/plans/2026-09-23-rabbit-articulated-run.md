# Rabbit articulated run implementation plan

> Execute locally in the existing worktree. The user's detailed run-only brief
> and explicit renderer migration approval are the scope and design approval.

**Goal:** Evaluate guide 04 continuously and render connected rabbit anatomy,
with world-space support contacts and comparison against rejected raster passes.

**Architecture:** A distance-driven pose evaluator ports the frozen guide without
changing its keys. Connected textured meshes share vertices across knees,
ankles, elbows and wrists; normalized bind geometry uses dual-quaternion skinning.
Opaque material coverage resolves near/far overlap before the final ink output.
Material-space dither coordinates travel with the skin. Physics supplies position;
animation supplies pose and explicit support anchors, never writes physics state.

**Tech stack:** Browser JavaScript/WebGL, existing Python/Pillow asset preparation,
isolated Chrome/CDP evidence capture. No image model, sprite-strip generation,
new dependencies, standing art changes, gameplay, idle, crouch or portals.

**Spec:** Latest user brief; `docs/features/rabbit-run-joint-guide.md` and
`packages/web/design/rabbit-character/motion/run_right/guide-04/approval.json`.

## Work and verification

1. Create `articulated-06/prepare_rig.py`, `rig.json`, and source part textures.
   Freeze existing source hashes. Retain semantic head/ears/coat/pelvis, arm,
   paw/watch and leg/foot parts. Mesh topology, not independent rectangular
   cutouts, spans articulated joints. No new character drawing.
2. Create `motion.mjs` and a guide fixture. Test every approved key and dense
   off-key samples against Python's approved guide, fixed lengths, side ownership,
   seam and support anchors during irregular time steps and variable speed.
3. Create `skinning.mjs` and `renderer.mjs`. Test shared vertices, finite transforms,
   inversion/collapse diagnostics and exact attachment identities. Inspect actual
   textured knees/elbows/ankles at critical off-key bends, without overlays.
4. Extend the existing private artifact QA harness. Run live requestAnimationFrame
   playback, record timings/errors, measure actual displayed contact edges and
   world anchors, and capture normal/slow/world/foot-lock/overlay/mesh comparisons.
   Export recordings and close-up sheets, not another runtime sprite strip.
5. Write `articulated-06/REVIEW.md`; mark pass 05 visually rejected. Report visual
   failures separately from numeric success. Stop for visual approval; if custom
   skinning fails, recommend a dedicated 2D skeletal tool without implementing it.

## Review focus

- Deepest knee/elbow bends between keys must retain a continuous silhouette.
- Foot material edges must stay connected and agree with the anchored contact.
- Far limbs must not show through near white fur or multiply at overlaps.
- Variable movement speed and frame time must not change contact ownership.
- Stable dither coordinates must not conceal mesh folds or introduce dot boiling.

## Decisions

- This is the requested run-renderer/artifact milestone, following the existing
  private browser QA workflow. It does not replace the landing-page mascot or add
  app UI; no app deployment is part of this visual acceptance gate.
- The guide and character inputs are immutable. A failed visual result is a
  reason to stop at the user's decision gate, not to alter the approved gait.

## Execution result

- Built the continuous motion evaluator, 20 semantic regions / 12 connected mesh
  attachments, WebGL material/dither renderer and world support anchors.
- Preserved all 16 frozen inputs. Tested 832 guide samples, variable-speed and
  irregular-time contact trajectories, surface seam and 160-phase mesh diagnostics.
- Chrome recordings and independent screenshot reads measure 1/2 px support-edge
  ranges, versus 9/10 for pass 05 and 32/38 for pass 04 at the common speed.
- Independent review confirmed those numbers and rejected the tucked ankle skin.
  Local positive triangle areas coexist with up to 5.98x edge stretch and visible
  pinching. Added hard inversion/collapse assertions and explicit technical-versus-
  visual status. Recording verification independently checks all contact pixels.
- **Visual acceptance failed.** Stopped custom skinning at the user's fallback
  gate, documented Spine-based corrective authoring, and did not implement that
  migration or any later behavior. Full result: `articulated-06/REVIEW.md`.
