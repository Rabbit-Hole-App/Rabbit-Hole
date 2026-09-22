// The Static App Review Gallery (docs/features/static-app-review-gallery.md):
// five realistic Learn lesson compositions, reviewed by hand on the dev-only
// `?board=static-app-review` board. Every scene here is authored through the
// same vocabulary as demo-scenes.js and reference-scenes.js - no new object
// types, no new timeline actions, no scene-specific renderer code. Canvas 1
// reuses reference-scenes.js's causalAttentionScene outright rather than
// re-authoring a near-duplicate: it already draws everything the spec asks
// for and is already benchmarked.
//
// Each canvas is a short run of ordinary lesson blocks (explanation,
// animation, snippet, sometimes a table, quiz) stacked in AdaptiveCanvas's
// normal vertical flow - the same mechanism any real lesson uses. Nothing
// here seeds `items` (freeform stickies/section rules): BOARDS only ever
// seeds `blocks`, so the five canvases are separated by their own
// explanation-block titles rather than a section rule.

import { causalAttentionScene } from './reference-scenes.js';

const uid = () => crypto.randomUUID();

// --- canvas 2: nanoGPT - Transformer Block -----------------------------------
// Input -> LayerNorm -> attention -> residual -> LayerNorm -> MLP -> residual.
// One row, two skip arrows drawn at the same height so they read as one
// residual stream with two taps - the same convention demo-scenes.js's own
// residualScene established, extended to a full block.

// h: 90, not the original 64 - the reviewer's "too much empty space, worst
// in Transformer Block" finding: the row only ever used the top third of
// the card's height. Box top (y=90) stays put, so the skip elbows' anchors
// (pinned to that top edge) need no change - only the row's own connector
// arrows, pinned to the row's vertical centre, move with it (90 + 90/2).
//
// Pitch tightened from 170 (130 box + 40 gap) to 150 (126 + 24) and the
// longest box label shortened, so the seven-box row's own content bounds fit
// the viewport the legibility floors demand (scene-layout.js's
// sceneLegibility / MAX_SCENE_VIEWPORT). At the old pitch the row needed a
// 1275px frame to keep 13px annotations at 13 EFFECTIVE pixels, which is
// wider than a lesson column can give it - so the camera made up the
// difference by shrinking every label to about 5px, which is the defect.
// Nothing here is a renderer change: the scene is authored to a size it can
// actually be read at.
const TB_BOX_W = 126;
const TB_PITCH = 150;
const tbX = index => 40 + index * TB_PITCH;
const tbCentre = index => tbX(index) + TB_BOX_W / 2;
const tbBox = (id, label, index, role) => ({
  id, type: 'box', semanticId: id, conceptId: 'transformer-block',
  initialState: { label, x: tbX(index), y: 90, w: TB_BOX_W, h: 90, opacity: 0, role },
});
const tbArrow = (id, from, to) => ({
  id, type: 'arrow', semanticId: id, conceptId: 'transformer-block',
  initialState: { from, to, opacity: 0, role: 'neutral' },
});

export const transformerBlockScene = {
  id: 'nanogpt-transformer-block',
  title: 'nanoGPT — Transformer Block',
  width: 1120,
  height: 340,
  duration: 11,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 26 } },
    tbBox('input', 'x', 0, 'input'),
    tbBox('ln1', 'LayerNorm', 1, 'neutral'),
    // "Attention", not "Self-Attention": at the body floor (15 effective px)
    // the longer label is wider than the box that has to contain it, and a
    // label overflowing its own frame is the same defect at a different size.
    // The sub-layer is named in full by the caption and by the note.
    tbBox('attn', 'Attention', 2, 'observed'),
    tbBox('add1', '+', 3, 'output'),
    tbBox('ln2', 'LayerNorm', 4, 'neutral'),
    tbBox('mlp', 'MLP', 5, 'observed'),
    tbBox('add2', '+', 6, 'output'),
    tbArrow('a-in-ln1', { x: tbX(0) + TB_BOX_W + 4, y: 135 }, { x: tbX(1) - 4, y: 135 }),
    tbArrow('a-ln1-attn', { x: tbX(1) + TB_BOX_W + 4, y: 135 }, { x: tbX(2) - 4, y: 135 }),
    tbArrow('a-attn-add1', { x: tbX(2) + TB_BOX_W + 4, y: 135 }, { x: tbX(3) - 4, y: 135 }),
    tbArrow('a-add1-ln2', { x: tbX(3) + TB_BOX_W + 4, y: 135 }, { x: tbX(4) - 4, y: 135 }),
    tbArrow('a-ln2-mlp', { x: tbX(4) + TB_BOX_W + 4, y: 135 }, { x: tbX(5) - 4, y: 135 }),
    tbArrow('a-mlp-add2', { x: tbX(5) + TB_BOX_W + 4, y: 135 }, { x: tbX(6) - 4, y: 135 }),
    // The residual stream, drawn as an elbow rather than a floating straight
    // line: a `line` up out of the source box's own top edge, a `line`
    // across at y=60 (clear of both boxes and the row's own connector
    // arrows, which all sit at y=135), then an `arrow` back down into the
    // target box's top edge. This is the same spine-and-branch decomposition
    // case 08 of the illustrated-transformer benchmark uses for a residual
    // bypass ("a residual connection needs an arrow that visually goes
    // AROUND a box, not just to it - arrows are a single straight segment,
    // so 'around' has to be built... composed from two `line` objects... and
    // one `arrow` object") - not a new primitive, the existing vocabulary
    // used the way the benchmark already proved it. The old skip1/skip2 were
    // a single arrow floating at y=60 that never touched either box, reading
    // as an unrelated blue line rather than a residual path.
    // Residual label text shortened from "residual: x carried forward" and
    // "residual: carried forward again". At a readable 13px those ran most of
    // the way across their own sub-layer and read as a second caption; the
    // elbow already shows what is carried and where it lands, so the label
    // only has to name the thing.
    { id: 'skip1-up', type: 'line', semanticId: 'skip1-up', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(0), y: 90 }, to: { x: tbCentre(0), y: 60 }, opacity: 0, role: 'input' } },
    { id: 'skip1-across', type: 'line', semanticId: 'skip1-across', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(0), y: 60 }, to: { x: tbCentre(3), y: 60 }, opacity: 0, role: 'input' } },
    { id: 'skip1-in', type: 'arrow', semanticId: 'skip1-in', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(3), y: 60 }, to: { x: tbCentre(3), y: 90 }, opacity: 0, role: 'input' } },
    { id: 'skip1-label', type: 'text', semanticId: 'skip1-label', conceptId: 'transformer-block',
      initialState: { text: 'residual path', x: 150, y: 40, opacity: 0, typography: 'annotation', role: 'input' } },
    // Second residual runs at its own height (44, not skip1's 60) so the two
    // paths never share one horizontal line - the app-review finding that the
    // top routing could be read as one continuous skip from x to both `+`
    // nodes. skip1's own across-segment ends exactly where skip2's up-segment
    // starts (both anchored to add1's top edge, tbCentre(3)), so at the old
    // shared height=60 the two segments were collinear with no visible seam:
    // x -> add1 -> add2 read as a single unbroken line. Anchoring skip2 to a
    // different elevation makes it visibly climb its OWN path out of add1,
    // rather than pass straight through as a continuation of skip1's.
    { id: 'skip2-up', type: 'line', semanticId: 'skip2-up', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(3), y: 90 }, to: { x: tbCentre(3), y: 44 }, opacity: 0, role: 'input' } },
    { id: 'skip2-across', type: 'line', semanticId: 'skip2-across', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(3), y: 44 }, to: { x: tbCentre(6), y: 44 }, opacity: 0, role: 'input' } },
    { id: 'skip2-in', type: 'arrow', semanticId: 'skip2-in', conceptId: 'transformer-block',
      initialState: { from: { x: tbCentre(6), y: 44 }, to: { x: tbCentre(6), y: 90 }, opacity: 0, role: 'input' } },
    { id: 'skip2-label', type: 'text', semanticId: 'skip2-label', conceptId: 'transformer-block',
      initialState: { text: 'residual path', x: 650, y: 24, opacity: 0, typography: 'annotation', role: 'input' } },
    { id: 'shape-input', type: 'text', semanticId: 'shape-input', conceptId: 'transformer-block',
      initialState: { text: '(B, T, C)', x: 52, y: 246, opacity: 0, typography: 'annotation' } },
    { id: 'shape-mlp', type: 'text', semanticId: 'shape-mlp', conceptId: 'transformer-block',
      initialState: { text: 'MLP: C to 4C to C', x: 790, y: 246, opacity: 0, typography: 'annotation' } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 290 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'x enters the block and must come out the same shape it went in', duration: 1.6 },
    { at: 0.6, action: 'appear', target: 'input', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'a-in-ln1', duration: 0.3 },
    { at: 1.0, action: 'appear', target: 'ln1', duration: 0.4 },
    { at: 1.6, action: 'appear', target: 'a-ln1-attn', duration: 0.3 },
    { at: 1.6, action: 'appear', target: 'attn', duration: 0.4 },
    { at: 2.6, action: 'change_text', target: 'caption', value: 'attention mixes information across positions - but the residual carries x forward untouched' },
    { at: 2.8, action: 'appear', target: 'skip1-up', duration: 0.4 },
    { at: 2.8, action: 'appear', target: 'skip1-across', duration: 0.4, sound: 'connect' },
    { at: 3.0, action: 'appear', target: 'skip1-in', duration: 0.4 },
    { at: 2.8, action: 'appear', target: 'skip1-label', duration: 0.4 },
    { at: 3.4, action: 'appear', target: 'a-attn-add1', duration: 0.3 },
    { at: 3.4, action: 'appear', target: 'add1', duration: 0.4 },
    { at: 4.2, action: 'change_text', target: 'caption', value: 'the same pattern repeats for the MLP sub-layer' },
    { at: 4.4, action: 'appear', target: 'a-add1-ln2', duration: 0.3 },
    { at: 4.4, action: 'appear', target: 'ln2', duration: 0.4 },
    { at: 5.0, action: 'appear', target: 'a-ln2-mlp', duration: 0.3 },
    { at: 5.0, action: 'appear', target: 'mlp', duration: 0.4 },
    { at: 5.6, action: 'appear', target: 'skip2-up', duration: 0.4 },
    { at: 5.6, action: 'appear', target: 'skip2-across', duration: 0.4, sound: 'connect' },
    { at: 5.8, action: 'appear', target: 'skip2-in', duration: 0.4 },
    { at: 5.6, action: 'appear', target: 'skip2-label', duration: 0.4 },
    { at: 6.4, action: 'appear', target: 'a-mlp-add2', duration: 0.3 },
    { at: 6.4, action: 'appear', target: 'add2', duration: 0.4 },
    { at: 7.2, action: 'change_text', target: 'caption', value: 'two residual paths, two sub-layers - the shape never changes' },
    { at: 7.4, action: 'appear', target: 'shape-input', duration: 0.4 },
    { at: 7.4, action: 'appear', target: 'shape-mlp', duration: 0.4 },
    { at: 8.4, action: 'highlight', target: 'add1' },
    { at: 8.4, action: 'highlight', target: 'add2' },
    { at: 8.8, action: 'type_text', target: 'note', value: 'each sub-layer only has to learn the change it adds, not the whole representation', duration: 1.8 },
  ],
};

// --- canvas 3: VLM - Image to Patches to Projector to LLM --------------------
// Repaired post-review: the original used /icon-512.png (a generic app icon)
// with the patch grid drawn as a SEPARATE object beside it, so the lesson
// read "icon -> grid -> encoder" instead of "image -> sliced into patches ->
// encoder" - the learner never saw the transformation happen. Fixed with a
// real photograph (packages/web/public/lesson-assets/vlm-patch-source.jpg, a
// square crop fetched from Pexels at authoring time - never a runtime fetch,
// and never a third-party or data: src: `image`'s same-origin policy in
// animation-scene.js requires a local, same-origin path) and the patch grid
// drawn AT THE SAME x/y/w/h as the image, one object layered directly on the
// other, so the grid reads as dividing lines ON the photo rather than a
// second, unrelated picture next to it. `patch-detail` is one of those 16
// patches (row 1, column 2 of the 4x4 grid) pre-cropped to its own file
// (vlm-patch-detail.png) and shown enlarged beside the grid, with a short
// arrow back to the cell it came from - "ideally one patch enlarged to show
// what a single patch is", per the review.
//
// Both files live under public/lesson-assets/, not public/ directly: the
// dev worker (packages/web/dev-worker.js) and the live control-plane worker
// (packages/control-plane/src/index.js) each only forward a fixed allowlist
// of top-level paths to their ASSETS binding (/static/, /icon-*, favicon,
// apple-touch-icon) - anything else falls through to the app worker and 404s
// as the SPA shell instead of the image. /lesson-assets/ is a new entry in
// that same allowlist (both workers), the minimal fix that makes a real,
// locally-hosted lesson image servable at all, and the one any future scene
// needing a real image will also want.
//
// The grid still carries no `values` - GAP NOTE: a grid with no `values`
// still paints every cell in its role's own fill (AnimatedScene.jsx's
// DataShape draws `look.fill` regardless of whether a cell has a numeral), so
// this is a real, working patch overlay with no numeric claim attached and no
// matrixKind needed - nothing here is a computed relationship. Its `input`
// role fill sits in the soft tier (6-28%, scene-vocab.js's FILL), which is
// exactly what lets the photograph show through underneath rather than being
// covered by it.

export const vlmScene = {
  id: 'vlm-image-to-llm',
  title: 'VLM — Image to Patches to Projector to LLM',
  width: 1080,
  height: 500,
  duration: 12.4,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 26 } },
    { id: 'image', type: 'image', semanticId: 'source-image', conceptId: 'vlm-pipeline',
      initialState: { src: '/lesson-assets/vlm-patch-source.jpg', x: 40, y: 70, w: 200, h: 200, opacity: 0, role: 'input' } },
    // Overlaid on the image above, not beside it: same x/y/w/h, drawn after
    // (so it paints on top), its soft-tier fill translucent enough to still
    // show the photo through the grid lines.
    { id: 'patch-grid', type: 'grid', semanticId: 'patch-grid', conceptId: 'vlm-pipeline',
      initialState: { label: '16 fixed-size patches', x: 40, y: 70, rows: 4, cols: 4, cell: 50, opacity: 0, role: 'input' } },
    // Row 1, column 2 of the grid above (x: 40+2*50=140..190, y: 70+1*50=
    // 120..170) - the exact region vlm-patch-detail.png was cropped from.
    { id: 'detail-arrow', type: 'arrow', semanticId: 'detail-arrow', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 165, y: 145 }, to: { x: 280, y: 180 }, opacity: 0, role: 'neutral' } },
    // Ties the source cell to its magnified crop: composed entirely from
    // existing vocabulary (a plain `box`, IDENTITY) rather than a new marker
    // type - the same shared authoring key on both boxes resolves to one hue
    // (validateScene's identity-slot assignment), so "this grid square becomes
    // this enlarged patch" reads directly from the matching outline colour,
    // the same way causalAttentionScene already ties Q/K/V peers together.
    // A plain stroke on `patch-detail` itself would not show this: SVG does
    // not render a stroke on an <image> element, which is why the tie is two
    // outline boxes (one over the grid cell, one over the crop) instead.
    { id: 'source-cell-outline', type: 'box', semanticId: 'source-cell-outline', conceptId: 'vlm-pipeline',
      initialState: { x: 140, y: 120, w: 50, h: 50, opacity: 0, role: 'neutral', identity: 'patch-tie' } },
    { id: 'patch-detail', type: 'image', semanticId: 'patch-detail', conceptId: 'vlm-pipeline',
      initialState: { src: '/lesson-assets/vlm-patch-detail.png', x: 280, y: 110, w: 140, h: 140, opacity: 0, role: 'input' } },
    { id: 'patch-detail-outline', type: 'box', semanticId: 'patch-detail-outline', conceptId: 'vlm-pipeline',
      initialState: { x: 280, y: 110, w: 140, h: 140, opacity: 0, role: 'neutral', identity: 'patch-tie' } },
    { id: 'detail-label', type: 'text', semanticId: 'detail-label', conceptId: 'vlm-pipeline',
      initialState: { text: 'one patch, magnified', x: 280, y: 264, opacity: 0, typography: 'annotation' } },
    { id: 'a-patch-enc', type: 'arrow', semanticId: 'a-patch-enc', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 140, y: 270 }, to: { x: 120, y: 340 }, opacity: 0, role: 'neutral' } },
    { id: 'encoder', type: 'box', semanticId: 'vision-encoder', conceptId: 'vlm-pipeline',
      initialState: { label: 'Vision Encoder', x: 40, y: 340, w: 160, h: 70, opacity: 0, role: 'observed' } },
    { id: 'a-enc-vtok', type: 'arrow', semanticId: 'a-enc-vtok', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 200, y: 375 }, to: { x: 240, y: 375 }, opacity: 0, role: 'neutral' } },
    { id: 'vtoken', type: 'strip', semanticId: 'visual-tokens', conceptId: 'vlm-pipeline',
      initialState: { label: 'visual tokens · dim 1152', x: 240, y: 355, cell: 40, opacity: 0, heat: true, valueScale: 'local', role: 'observed', values: [0.8, 0.3, 0.6, 0.9] } },
    { id: 'a-vtok-proj', type: 'arrow', semanticId: 'a-vtok-proj', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 400, y: 375 }, to: { x: 440, y: 375 }, opacity: 0, role: 'neutral' } },
    { id: 'projector', type: 'box', semanticId: 'projector', conceptId: 'vlm-pipeline',
      initialState: { label: 'Projector', x: 440, y: 340, w: 160, h: 70, opacity: 0, role: 'observed' } },
    // y raised from 428 to 446 - the app-review "breathing room from the
    // projector box shadow" finding: the box's own bottom edge sits at
    // 340+70=410, and the box carries animation-shadow's drop shadow
    // (AnimatedScene.jsx), so the original 18px gap read as the annotation
    // sitting inside that shadow rather than clear of it.
    { id: 'dim', type: 'text', semanticId: 'dim-annotation', conceptId: 'vlm-pipeline',
      initialState: { text: '1152 → 4096', x: 452, y: 446, opacity: 0, typography: 'annotation' } },
    { id: 'a-proj-ltok', type: 'arrow', semanticId: 'a-proj-ltok', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 600, y: 375 }, to: { x: 640, y: 375 }, opacity: 0, role: 'neutral' } },
    { id: 'ltoken', type: 'strip', semanticId: 'language-tokens', conceptId: 'vlm-pipeline',
      initialState: { label: 'projected tokens · dim 4096', x: 640, y: 355, cell: 40, opacity: 0, heat: true, valueScale: 'local', role: 'observed', values: [0.5, 0.7, 0.2, 0.4] } },
    { id: 'a-ltok-llm', type: 'arrow', semanticId: 'a-ltok-llm', conceptId: 'vlm-pipeline',
      initialState: { from: { x: 800, y: 375 }, to: { x: 840, y: 375 }, opacity: 0, role: 'neutral' } },
    { id: 'llm', type: 'box', semanticId: 'llm', conceptId: 'vlm-pipeline',
      initialState: { label: 'Language Model', x: 840, y: 340, w: 160, h: 70, opacity: 0, role: 'output' } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 462 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'a picture is turned into tokens the language model can read', duration: 1.6 },
    { at: 0.6, action: 'appear', target: 'image', duration: 0.4, sound: 'soft_pop' },
    { at: 1.4, action: 'appear', target: 'patch-grid', duration: 0.4, sound: 'split' },
    { at: 2.2, action: 'change_text', target: 'caption', value: 'the image is sliced into fixed-size patches - here is one of them, close up' },
    { at: 2.4, action: 'appear', target: 'detail-arrow', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'patch-detail', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'source-cell-outline', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'patch-detail-outline', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'detail-label', duration: 0.3 },
    { at: 4.2, action: 'change_text', target: 'caption', value: 'every patch like this one is encoded, then the encoder is done' },
    { at: 4.4, action: 'appear', target: 'a-patch-enc', duration: 0.3 },
    { at: 4.6, action: 'appear', target: 'encoder', duration: 0.4, sound: 'compute' },
    { at: 5.6, action: 'appear', target: 'a-enc-vtok', duration: 0.3 },
    { at: 5.8, action: 'appear', target: 'vtoken', duration: 0.4 },
    { at: 6.6, action: 'change_text', target: 'caption', value: "a projector maps each visual token into the language model's own width" },
    { at: 6.8, action: 'appear', target: 'a-vtok-proj', duration: 0.3 },
    { at: 7.0, action: 'appear', target: 'projector', duration: 0.4 },
    { at: 7.4, action: 'appear', target: 'dim', duration: 0.3 },
    { at: 8.0, action: 'appear', target: 'a-proj-ltok', duration: 0.3 },
    { at: 8.2, action: 'appear', target: 'ltoken', duration: 0.4 },
    { at: 9.0, action: 'appear', target: 'a-ltok-llm', duration: 0.3 },
    { at: 9.2, action: 'appear', target: 'llm', duration: 0.4 },
    { at: 10.0, action: 'highlight', target: 'projector', sound: 'select' },
    { at: 10.4, action: 'type_text', target: 'note', value: 'only the projector is new - the vision encoder and the language model are both pretrained separately', duration: 2.0 },
  ],
};

// --- canvas 4: World Model - Branching Futures -------------------------------
// Exactly three candidate actions, not four: IDENTITY_SLOTS (scene-vocab.js)
// only carries three anonymous categorical slots today, so a fourth distinct
// identity in one scene would silently wrap and collide with the first. The
// spec allows "3-4"; three stays inside the vocabulary's current budget
// instead of asking for a slot the visual-language pass hasn't grown yet.
// Each action shares its identity with its own predicted future (a real use
// of IDENTITY: peers tied across two different roles by one categorical
// hue), while ROLE alone (prediction vs. observed) carries the
// prediction/observed distinction the spec actually asks for.

const COSTS = [7.5, 2.0, 4.5]; // predicted cost per action; B is cheapest, so B is chosen

export const worldModelScene = {
  id: 'world-model-branching-futures',
  title: 'World Model — Branching Futures',
  width: 1000,
  height: 730,
  duration: 8.2,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 26 } },
    { id: 'current', type: 'box', semanticId: 'current-state', conceptId: 'world-model-planning',
      initialState: { label: 'current state', x: 40, y: 220, w: 150, h: 64, opacity: 0, role: 'observed' } },
    { id: 'action-a', type: 'box', semanticId: 'action-a', conceptId: 'world-model-planning',
      initialState: { label: 'Action A: turn left', x: 260, y: 60, w: 190, h: 64, opacity: 0, role: 'neutral', identity: 'candidate-a' } },
    { id: 'action-b', type: 'box', semanticId: 'action-b', conceptId: 'world-model-planning',
      initialState: { label: 'Action B: brake', x: 260, y: 220, w: 190, h: 64, opacity: 0, role: 'neutral', identity: 'candidate-b' } },
    { id: 'action-c', type: 'box', semanticId: 'action-c', conceptId: 'world-model-planning',
      initialState: { label: 'Action C: continue', x: 260, y: 380, w: 190, h: 64, opacity: 0, role: 'neutral', identity: 'candidate-c' } },
    { id: 'future-a', type: 'box', semanticId: 'future-a', conceptId: 'world-model-planning',
      initialState: { label: 'predicted: collision risk', x: 540, y: 60, w: 210, h: 64, opacity: 0, role: 'prediction', identity: 'candidate-a' } },
    { id: 'future-b', type: 'box', semanticId: 'future-b', conceptId: 'world-model-planning',
      initialState: { label: 'predicted: safe stop', x: 540, y: 220, w: 210, h: 64, opacity: 0, role: 'prediction', identity: 'candidate-b' } },
    { id: 'future-c', type: 'box', semanticId: 'future-c', conceptId: 'world-model-planning',
      initialState: { label: 'predicted: near miss', x: 540, y: 380, w: 210, h: 64, opacity: 0, role: 'prediction', identity: 'candidate-c' } },
    { id: 'observed', type: 'box', semanticId: 'observed-outcome', conceptId: 'world-model-planning',
      initialState: { label: 'observed: safe stop', x: 800, y: 220, w: 180, h: 64, opacity: 0, role: 'observed' } },
    { id: 'a-cs-a', type: 'arrow', semanticId: 'a-cs-a', conceptId: 'world-model-planning',
      initialState: { from: { x: 200, y: 252 }, to: { x: 250, y: 92 }, opacity: 0, role: 'neutral' } },
    { id: 'a-cs-b', type: 'arrow', semanticId: 'a-cs-b', conceptId: 'world-model-planning',
      initialState: { from: { x: 200, y: 252 }, to: { x: 250, y: 252 }, opacity: 0, role: 'neutral' } },
    { id: 'a-cs-c', type: 'arrow', semanticId: 'a-cs-c', conceptId: 'world-model-planning',
      initialState: { from: { x: 200, y: 252 }, to: { x: 250, y: 412 }, opacity: 0, role: 'neutral' } },
    { id: 'a-a-fa', type: 'arrow', semanticId: 'a-a-fa', conceptId: 'world-model-planning',
      initialState: { from: { x: 460, y: 92 }, to: { x: 518, y: 92 }, opacity: 0, role: 'neutral' } },
    { id: 'a-b-fb', type: 'arrow', semanticId: 'a-b-fb', conceptId: 'world-model-planning',
      initialState: { from: { x: 460, y: 252 }, to: { x: 530, y: 252 }, opacity: 0, role: 'neutral' } },
    { id: 'a-c-fc', type: 'arrow', semanticId: 'a-c-fc', conceptId: 'world-model-planning',
      initialState: { from: { x: 460, y: 412 }, to: { x: 530, y: 412 }, opacity: 0, role: 'neutral' } },
    { id: 'a-fb-obs', type: 'arrow', semanticId: 'a-fb-obs', conceptId: 'world-model-planning',
      initialState: { from: { x: 760, y: 252 }, to: { x: 785, y: 252 }, opacity: 0, role: 'success' } },
    // y raised from 292 to 312 - the app-review "cramped under the observed
    // box" finding: observed's own bottom edge sits at 220+64=284, so the
    // original y left only an 8px gap between the box and the label's own
    // glyph top, effectively touching it.
    { id: 'chosen-label', type: 'text', semanticId: 'chosen-label', conceptId: 'world-model-planning',
      initialState: { text: 'only this branch actually happens', x: 800, y: 312, opacity: 0, typography: 'annotation', role: 'success' } },
    // h raised from 90 to 160 - the app-review "tiny A/B/C cost chart doesn't
    // support the headline claim" finding: a 90px-tall chart read as a minor
    // footnote next to three 64px-tall boxes it is meant to justify; this
    // gives it real visual weight instead of trimming its own claim down.
    { id: 'cost-bars', type: 'bars', semanticId: 'predicted-cost', conceptId: 'world-model-planning',
      initialState: { label: 'predicted cost (lower is better)', x: 260, y: 480, h: 160, peak: 10, opacity: 0, role: 'prediction', labels: ['A', 'B', 'C'], values: [...COSTS] } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 685 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'the model predicts what happens under a few different actions before picking one', duration: 1.6 },
    { at: 0.6, action: 'appear', target: 'current', duration: 0.4 },
    { at: 1.2, action: 'appear', target: 'a-cs-a', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'a-cs-b', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'a-cs-c', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'action-a', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'action-b', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'action-c', duration: 0.4 },
    { at: 2.4, action: 'change_text', target: 'caption', value: 'each action is rolled forward through the world model into a predicted future' },
    { at: 2.6, action: 'appear', target: 'a-a-fa', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'a-b-fb', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'a-c-fc', duration: 0.3 },
    { at: 2.8, action: 'appear', target: 'future-a', duration: 0.4 },
    { at: 2.8, action: 'appear', target: 'future-b', duration: 0.4 },
    { at: 2.8, action: 'appear', target: 'future-c', duration: 0.4 },
    { at: 3.8, action: 'appear', target: 'cost-bars', duration: 0.4 },
    { at: 4.4, action: 'change_text', target: 'caption', value: 'action B has the lowest predicted cost, so it is the one actually taken' },
    { at: 4.6, action: 'highlight_cell', target: 'cost-bars', value: 1 },
    { at: 5.0, action: 'appear', target: 'a-fb-obs', duration: 0.5 },
    { at: 5.2, action: 'appear', target: 'observed', duration: 0.4 },
    { at: 5.6, action: 'appear', target: 'chosen-label', duration: 0.3 },
    { at: 6.0, action: 'type_text', target: 'note', value: 'the other two branches were predicted but never happened - only one future is ever observed', duration: 2.0 },
  ],
};

// --- canvas 5: Large Codebase - Architecture Orientation ---------------------
// VOCABULARY GAP NOTES (docs/features/static-app-review-gallery.md's own
// invitation to record these rather than expand scope):
//
//  - "you are here" is a fact about the VIEWER, not the object - there is no
//    ROLE or STATE for it in scene-vocab.js. Resolved by composing two things
//    that already exist: the `highlight` timeline action (a real STATE,
//    already used everywhere else in this gallery) rings the `model` box, and
//    a plain `text` object ("you are here") sits beside it. Neither is new;
//    this is exactly the composition the spec itself suggested as a first
//    thing to try, and it was sufficient - no gap to report here after all.
//  - A breadcrumb is a path through a hierarchy, which the vocabulary also has
//    no dedicated primitive for. A single `text` object ("nanoGPT -> model.py
//    -> Block -> CausalSelfAttention.forward()") was enough - a breadcrumb is
//    just a short string, and nothing about it needs a shape, a connector or
//    an interactive affordance. Also not a gap.
//  - What this scene deliberately leaves OUT: nanoGPT's own repository is the
//    running example (real files, real subsystem boundaries - the same
//    prepare/train/generate pipeline nanogpt-lesson.js already draws), so the
//    "4-6 relevant files or functions" is authored as a `table` BLOCK
//    alongside this animation rather than crammed into the SVG as a sixth
//    object group - the diagram stays a flow diagram, and the file index
//    stays a file index, rather than one object type doing both jobs.

// The app-review "two disagreeing orientation levels" finding: "you are
// here" pointed at the subsystem-level `model` box while the breadcrumb below
// it named a specific function four levels deeper (repo -> file -> class ->
// function) - a reader could not tell which of those levels was actually
// meant. Fixed by drawing the intermediate levels the breadcrumb already
// claimed but the diagram never showed: model.py (file, the existing `model`
// box, relabelled), Block (class, a new box under it), and its three methods
// LayerNorm/CausalSelfAttention/MLP (function, three new boxes under that) -
// composed entirely from existing vocabulary (box, arrow, text, highlight),
// no new primitive. "you are here" now rings the CausalSelfAttention box
// itself, agreeing with the breadcrumb's own deepest segment.
export const codebaseOrientationScene = {
  id: 'codebase-architecture-orientation',
  title: 'Large Codebase — Architecture Orientation',
  width: 900,
  height: 650,
  duration: 10.2,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 24 } },
    // Level 1: repo -> subsystems.
    { id: 'dataprep', type: 'box', semanticId: 'subsystem-dataprep', conceptId: 'repo-architecture',
      initialState: { label: 'Data Prep', x: 40, y: 90, w: 170, h: 64, opacity: 0, role: 'neutral' } },
    { id: 'training', type: 'box', semanticId: 'subsystem-training', conceptId: 'repo-architecture',
      initialState: { label: 'Training', x: 280, y: 90, w: 170, h: 64, opacity: 0, role: 'neutral' } },
    { id: 'sampling', type: 'box', semanticId: 'subsystem-sampling', conceptId: 'repo-architecture',
      initialState: { label: 'Sampling', x: 520, y: 90, w: 170, h: 64, opacity: 0, role: 'neutral' } },
    // Level 2: subsystem -> file.
    { id: 'model', type: 'box', semanticId: 'subsystem-model', conceptId: 'repo-architecture',
      initialState: { label: 'model.py', x: 280, y: 230, w: 450, h: 64, opacity: 0, role: 'neutral' } },
    // Level 3: file -> class.
    { id: 'block', type: 'box', semanticId: 'class-block', conceptId: 'repo-architecture',
      initialState: { label: 'Block', x: 280, y: 354, w: 450, h: 56, opacity: 0, role: 'neutral' } },
    // Level 4: class -> function/method. Three sub-layers a Block actually
    // owns, matching model.py's own Block.forward() (canvas 2 above).
    { id: 'layernorm', type: 'box', semanticId: 'method-layernorm', conceptId: 'repo-architecture',
      initialState: { label: 'LayerNorm', x: 280, y: 460, w: 110, h: 56, opacity: 0, role: 'neutral' } },
    { id: 'attn', type: 'box', semanticId: 'method-attn', conceptId: 'repo-architecture',
      initialState: { label: 'CausalSelfAttention', x: 405, w: 210, y: 460, h: 56, opacity: 0, role: 'neutral' } },
    { id: 'mlp', type: 'box', semanticId: 'method-mlp', conceptId: 'repo-architecture',
      initialState: { label: 'MLP', x: 630, y: 460, w: 100, h: 56, opacity: 0, role: 'neutral' } },
    { id: 'a-dp-tr', type: 'arrow', semanticId: 'a-dp-tr', conceptId: 'repo-architecture',
      initialState: { from: { x: 210, y: 122 }, to: { x: 278, y: 122 }, opacity: 0, role: 'neutral' } },
    { id: 'a-tr-sp', type: 'arrow', semanticId: 'a-tr-sp', conceptId: 'repo-architecture',
      initialState: { from: { x: 450, y: 122 }, to: { x: 518, y: 122 }, opacity: 0, role: 'neutral' } },
    { id: 'a-model-tr', type: 'arrow', semanticId: 'a-model-tr', conceptId: 'repo-architecture',
      initialState: { from: { x: 365, y: 230 }, to: { x: 365, y: 154 }, opacity: 0, role: 'neutral' } },
    { id: 'a-model-sp', type: 'arrow', semanticId: 'a-model-sp', conceptId: 'repo-architecture',
      initialState: { from: { x: 600, y: 230 }, to: { x: 600, y: 154 }, opacity: 0, role: 'neutral' } },
    { id: 'a-model-block', type: 'arrow', semanticId: 'a-model-block', conceptId: 'repo-architecture',
      initialState: { from: { x: 505, y: 294 }, to: { x: 505, y: 354 }, opacity: 0, role: 'neutral' } },
    { id: 'a-block-ln', type: 'arrow', semanticId: 'a-block-ln', conceptId: 'repo-architecture',
      initialState: { from: { x: 335, y: 410 }, to: { x: 335, y: 460 }, opacity: 0, role: 'neutral' } },
    { id: 'a-block-attn', type: 'arrow', semanticId: 'a-block-attn', conceptId: 'repo-architecture',
      initialState: { from: { x: 505, y: 410 }, to: { x: 510, y: 460 }, opacity: 0, role: 'neutral' } },
    { id: 'a-block-mlp', type: 'arrow', semanticId: 'a-block-mlp', conceptId: 'repo-architecture',
      initialState: { from: { x: 680, y: 410 }, to: { x: 680, y: 460 }, opacity: 0, role: 'neutral' } },
    { id: 'here-label', type: 'text', semanticId: 'here-label', conceptId: 'repo-architecture',
      initialState: { text: '↑ you are here', x: 405, y: 542, opacity: 0, typography: 'annotation', role: 'tutor' } },
    { id: 'breadcrumb', type: 'text', semanticId: 'breadcrumb', conceptId: 'repo-architecture',
      initialState: { text: 'nanoGPT → model.py → Block → CausalSelfAttention.forward()', x: 40, y: 578, opacity: 0, typography: 'annotation', role: 'code' } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 610 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: "before reading one function, get oriented: where does it sit in the whole repo?", duration: 1.8 },
    { at: 0.8, action: 'appear', target: 'dataprep', duration: 0.4 },
    { at: 1.2, action: 'appear', target: 'a-dp-tr', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'training', duration: 0.4 },
    { at: 1.8, action: 'appear', target: 'a-tr-sp', duration: 0.3 },
    { at: 1.8, action: 'appear', target: 'sampling', duration: 0.4 },
    { at: 2.6, action: 'change_text', target: 'caption', value: "model.py underpins both training and sampling - it's the shared implementation" },
    { at: 2.8, action: 'appear', target: 'model', duration: 0.5 },
    { at: 3.4, action: 'appear', target: 'a-model-tr', duration: 0.4 },
    { at: 3.4, action: 'appear', target: 'a-model-sp', duration: 0.4 },
    { at: 4.0, action: 'change_text', target: 'caption', value: 'inside model.py, the Block class defines one transformer layer' },
    { at: 4.2, action: 'appear', target: 'a-model-block', duration: 0.3 },
    { at: 4.2, action: 'appear', target: 'block', duration: 0.4 },
    { at: 4.8, action: 'change_text', target: 'caption', value: 'Block owns three sub-layers - LayerNorm, self-attention, and an MLP' },
    { at: 5.0, action: 'appear', target: 'a-block-ln', duration: 0.3 },
    { at: 5.0, action: 'appear', target: 'a-block-attn', duration: 0.3 },
    { at: 5.0, action: 'appear', target: 'a-block-mlp', duration: 0.3 },
    { at: 5.2, action: 'appear', target: 'layernorm', duration: 0.4 },
    { at: 5.2, action: 'appear', target: 'attn', duration: 0.4 },
    { at: 5.2, action: 'appear', target: 'mlp', duration: 0.4 },
    { at: 6.0, action: 'appear', target: 'here-label', duration: 0.3 },
    { at: 6.3, action: 'highlight', target: 'attn' },
    { at: 6.8, action: 'change_text', target: 'caption', value: 'Follow the path from the repository to the function we are studying.' },
    { at: 7.2, action: 'appear', target: 'breadcrumb', duration: 0.4 },
    { at: 8.0, action: 'type_text', target: 'note', value: 'orientation first, implementation second - knowing WHERE a function lives is half of understanding it', duration: 2.0 },
  ],
};

// --- the board: five lesson compositions, stacked -----------------------------
const explanation = (title, body, more) => ({ id: uid(), type: 'explanation', dx: 0, dy: 0, title, body, ...(more ? { more } : {}) });
const animation = (scene, time, selectedObject = null) => ({ id: uid(), type: 'animation', dx: 0, dy: 0, title: scene.title, scene, time, selectedObject, marked: null });
const snippet = (title, brief, code) => ({ id: uid(), type: 'snippet', dx: 0, dy: 0, title, brief, code });
const table = (title, caption, columns, rows) => ({ id: uid(), type: 'table', dx: 0, dy: 0, title, caption, columns, rows });
const quiz = (question, options, why) => ({ id: uid(), type: 'quiz', dx: 0, dy: 0, question, options, why, choice: options.find(o => o.correct).key });

const ATTENTION_SNIPPET = "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))\natt = att.masked_fill(self.bias[:, :, :T, :T] == 0, float('-inf'))\natt = F.softmax(att, dim=-1)\ny = att @ v  # (B, nh, T, hs)";

export function staticAppReviewBlocks() {
  return [
    // 1. nanoGPT - Self-Attention. Reuses the existing benchmarked scene.
    explanation('nanoGPT — Self-Attention',
      'Self-attention lets each token gather information from the tokens before it. Every token is projected into a query, a key and a value; the query and key decide *how much* to attend, and the value is *what* gets carried forward.\n\nBecause nanoGPT predicts the next character, a token must never see the future — the causal mask blocks every score above the diagonal before the softmax runs.\n\nSource: nanoGPT’s `model.py` — `CausalSelfAttention.forward()`.'),
    animation(causalAttentionScene, 17.2),
    snippet("nanoGPT's CausalSelfAttention (model.py)", 'The same Q·Kᵀ, mask, softmax, ·V pipeline shown above, as it actually appears in the repo.', ATTENTION_SNIPPET),
    quiz('Why is every score above the diagonal masked out before softmax?', [
      { key: 'A', text: 'So position i cannot attend to positions after it — attending to the future would leak the answer.', correct: true },
      { key: 'B', text: 'To make the softmax numerically stable.' },
      { key: 'C', text: 'To reduce the number of floating point operations.' },
    ], 'nanoGPT predicts the next token from only what came before it. If position i could see position i+1, training would be trivially solved by copying — the model would never learn to predict.'),

    // 2. nanoGPT - Transformer Block.
    explanation('nanoGPT — Transformer Block',
      'Each transformer block wraps two sub-layers — attention, then an MLP — in the same pattern: normalize, transform, and add the result back to the input. That addition is the residual connection: it means a sub-layer only has to learn the *change* it makes, not the whole representation.\n\nThe shape (batch, sequence length, embedding width) never changes across a block — everything that goes in comes out the same size.\n\nSource: nanoGPT’s `model.py` — the `Block` class.'),
    animation(transformerBlockScene, 10.8),
    snippet("nanoGPT's Block.forward() (model.py)", 'Two sub-layers, two residual adds — the whole diagram above, in three lines.', 'def forward(self, x):\n    x = x + self.attn(self.ln_1(x))\n    x = x + self.mlp(self.ln_2(x))\n    return x'),
    quiz('If x has shape (B, T, C) going into the block, what shape does it have coming out?', [
      { key: 'A', text: 'B, T, C — a transformer block preserves shape so blocks can be stacked.', correct: true },
      { key: 'B', text: 'B, T, 4C — the MLP expansion changes the output width.' },
      { key: 'C', text: 'B, 4T, C — attention lengthens the sequence.' },
    ], "The MLP's inner expansion to 4C is undone by its own output projection back to C before the residual add, and attention never changes T. Shape preservation is exactly what lets N identical blocks stack."),

    // 3. VLM - Image to Patches to Projector to LLM.
    explanation('VLM — Image to Patches to Projector to LLM',
      'A vision-language model reads an image the same way it reads text: as a sequence of tokens. The image is cut into fixed-size patches, a vision encoder turns each patch into a visual token, and a small projector maps those tokens from the vision model’s width into the language model’s width so they can sit in the same sequence as text tokens.\n\nThe projector is usually the only new, trained-from-scratch part — the vision encoder and the language model are both reused, pretrained separately.\n\nReference: the LLaVA-style image → patches → encoder → projector → LLM pipeline (Liu et al., *Visual Instruction Tuning*).'),
    animation(vlmScene, 10.4),
    snippet('A minimal vision-to-language projector', 'The projector is a small module bridging two pretrained models — often just a linear layer or a small MLP.',
      'patches = image_to_patches(image, patch_size=14)   # (num_patches, 3, 14, 14)\nvisual_tokens = vision_encoder(patches)             # (num_patches, 1152)\nprojected = mm_projector(visual_tokens)             # nn.Linear(1152, 4096)\nllm_input = torch.cat([projected, text_tokens], dim=0)'),
    quiz('Why does the projector need to exist, instead of feeding visual tokens straight into the language model?', [
      { key: 'A', text: "The vision encoder's token width (1152) and the language model's embedding width (4096) are different — the projector maps one into the other.", correct: true },
      { key: 'B', text: "Images need to be resized to match the language model's input length." },
      { key: 'C', text: 'The projector converts pixel values into RGB tokens.' },
    ], "The vision encoder and the language model are two separately pretrained networks with their own hidden widths. Nothing else in the pipeline reconciles that mismatch — that is the projector's one job."),

    // 4. World Model - Branching Futures.
    explanation('World Model — Branching Futures',
      "A model-based planner doesn't just react — it imagines. From the current state, it rolls a handful of candidate actions forward through a learned world model, one predicted future per action, and scores each by a cost function.\n\nOnly one action is actually taken, and only that branch is ever observed; the others stay predictions forever. The distinction matters: a *prediction* can be wrong, an *observation* already happened.\n\nThis pattern — predict, score, pick the cheapest, then observe what really happens — underlies model-predictive control and most modern planning agents."),
    animation(worldModelScene, 8.0, 'action-b'),
    snippet('A minimal planning loop', 'Pseudocode for what the diagram above draws: predict, score, pick, act.',
      'best_action, best_cost = None, float(\'inf\')\nfor action in candidate_actions:\n    future_state = world_model.predict(state, action)\n    cost = cost_fn(future_state, goal)\n    if cost < best_cost:\n        best_action, best_cost = action, cost\nexecute(best_action)'),
    quiz('After the chosen action runs, what happens to the other two predicted futures?', [
      { key: 'A', text: 'They are discarded — only the branch that was actually taken is ever observed.', correct: true },
      { key: 'B', text: 'They are averaged together with the observed outcome.' },
      { key: 'C', text: 'They become the new candidate actions for the next planning step.' },
    ], 'A predicted future is a hypothesis the model never gets to test unless that action is chosen. Once action B runs, futures A and C stay exactly what they always were — predictions that were never observed.'),

    // 5. Large Codebase - Architecture Orientation.
    explanation('Large Codebase — Architecture Orientation',
      "Before reading one function, it helps to know where it sits. nanoGPT has four real subsystems: data preparation, the model definition, training, and sampling. `model.py` is the one piece shared by both training and sampling, and inside it, the `Block` class's `CausalSelfAttention` method — the exact function explained earlier — is highlighted below as *you are here*.\n\nThe breadcrumb under the diagram is the exact path from the repo root down to that function."),
    animation(codebaseOrientationScene, 10.2),
    table('Where the code lives', "Five files across nanoGPT's four subsystems.", ['File', 'Subsystem', 'Key symbol'], [
      ['`data/prepare.py`', 'Data Prep', 'tokenizes raw text into `train.bin` / `val.bin`'],
      ['`model.py`', 'Model', '`GPT`, `Block`, `CausalSelfAttention`'],
      ['`train.py`', 'Training', 'the training loop'],
      ['`sample.py`', 'Sampling', 'generation from a checkpoint'],
      ['`configurator.py`', '(all)', 'plain-text CLI config overrides'],
    ]),
    snippet("nanoGPT's CausalSelfAttention.forward() (model.py)", 'Reached by the breadcrumb above — the same function explained at the start of this lesson.', ATTENTION_SNIPPET),
    quiz('Why does model.py sit below Training and Sampling in the diagram, feeding both, instead of next to them in the same row?', [
      { key: 'A', text: 'Because it is a shared dependency, not a pipeline stage — both Training and Sampling load the same GPT implementation.', correct: true },
      { key: 'B', text: 'Because model.py runs after both Training and Sampling finish.' },
      { key: 'C', text: 'Because model.py is the entry point that calls Training and then Sampling.' },
    ], "Data Prep -> Training -> Sampling is a real sequence — each stage's output feeds the next. model.py isn't a stage in that sequence at all; it's the shared implementation both Training and Sampling import, which is why the diagram draws it underneath, feeding upward into both."),
  ];
}
