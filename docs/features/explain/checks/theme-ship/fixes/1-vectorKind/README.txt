Fix 3: vectorKind in explain-program/frame-look.js. The id rule (one word only) rejected the sdk's own ids (vec.v, vec.v.toss, tossedVelocity); it now skips only a hyphenated, underscored or spaced id of several words ('v-arrow').
before.png: vec.v and vec.a lose their vector look (ink); after.png: v-arrow ink, vec.v blue, vec.a dashed. Same scene, 408 px window, 2x.
frame-look.test, frame-look-render.test pass unrewritten.
