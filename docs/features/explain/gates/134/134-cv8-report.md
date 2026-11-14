# CV-8 (a Ctrl+K / Tutor card opens clipped at 520 px, a typed /explain opens whole): diagnosis and fix

Branch explain/canvas-cards-r4: old tip 991b71abe0fb4c93a5c3960c359b115d7ae0efed, new tip a825e25561a4ab66888dd26f00f0f88017bb5138 (plain push, fast-forward). CV-8 = a825e25561a4ab66888dd26f00f0f88017bb5138.

## The diagnosis, checked against the code: half right
- Right: only the typed path opens whole. insertBlock (AdaptiveCanvas.jsx) applies fullLength only when the caller passes fit; learn-slash.js:339 and LearnPage.jsx:492 pass it. A card with no layout is capped by BLOCK_TYPES.explanation autoMax (520) and scrolls; a card with a Full layout is not.
- Wrong for placeExplain: it returns null unless card.type is 'animation' (AdaptiveCanvas.jsx placeExplain), and the card it places is explainPendingBlock, an 'animation' block (explain-client.js:59), later replaced by a scene or program result. It is a v2 job card, never an Explanation, and card-layout.js fullLength is a no-op for it (supportsCardLayout is false for type animation). Adding fullLength there would change nothing, so I did not.
- The real gaps are the Explanation blocks that reach the canvas without fit:
  1. LearnPage.jsx:601 insertCard -> insertBlock(block) with no options (chat- and Tutor-made cards, learn-coaching-materials.js, chat-output-refs.js pass-throughs);
  2. insertImported (a card placed `at` a spot);
  3. placeRoadmapCard (the Tutor's delivered cards, placed by offsets, never through insertBlock).

## The fix (one commit, CV-8)
One helper, openedExplanation (explanation-card-width.js): a new Explanation (not a topic anchor, not a PDF excerpt) gets card-layout.js fullLength at the width its visual asks for (CV-1); a card that already has a layout is untouched.
Applied in insertBlock (for every Explanation, not only fit), insertImported (when it has no saved w or h) and placeRoadmapCard. insertBlock also frames a new Explanation whole (the reveal correction that fit gave a typed card). placeExplain is unchanged.

## Tests (focused; the gate is still held)
- explanation-card-width.test.mjs: openedExplanation opens a plot card in Full layout at the plot's width and prose at 440; a card with a layout, a v2 job card (animation), a topic anchor and a PDF excerpt are returned untouched; source guards that insertBlock, insertImported and placeRoadmapCard use it.
- explanation-full-length.test.mjs: the canvas calls fullLength nowhere itself (only through the helper) and insertBlock opens every new Explanation whole.
- A typed explain is still opened whole (learn-slash 'typed /explain' tests unchanged). Focused run: explanation-card-width + explanation-full-length + beside-placement + learn-slash = 64/64; related guards (canvas-refs-model, explain-inputs, roadmap-proposal-context, roadmap-canvas, roadmap-placement) 33/33.
- Not run yet: the full web unit and the browser capture (held for the film's machine use). The test the reviewer asked for, "a block placed through placeExplain has no autoMax clipping", does not apply: placeExplain places only animation blocks.
