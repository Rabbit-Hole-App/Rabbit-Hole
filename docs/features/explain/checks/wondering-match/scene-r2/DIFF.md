# SCN-r2: scene-side defaults (code on feat/visual-sprint 3e564b028)

`natural.svg` is drawn by the server path (`renderToStaticMarkup` of the real `Frame`, no browser); `natural-2x.png` is that SVG rasterised. `standard-theme.*` is the same scene in the app's own scene theme (not changed by this round, except that role `operator` has tokens there).

## What changed (7 files, packages/web/src)
1. `tutor-diagrams/teaching-theme.js`: **`TEACHING_ROLE_FILL`, the one role-to-fill table** (input blue, output teal, observed olive, prediction and operator lavender, learner mustard, tutor rose, code slate, warning coral, success teal-dark `#3A7E69`; neutral has no entry: transparent plus outline). It uses the same fills as the written diagrams, at 100%.
2. `interact-style.js`: reads that table (`hueFor`); neutral is `fill: none` with the outline; a data cell (strip, grid, bars, chips) is the role's fill at 100%, no 22% or 58% tint (a blocked cell keeps its quiet 10%).
3. `scene-vocab.js`: role `operator`. `index.css`: `--viz-operator` and `--viz-operator-text` (= prediction) in the light and dark themes, so the standard theme can draw it.
4. `animation-scene.js`: `duration` 0 is accepted (a timeline on it is refused); a strip may carry `cellH` (cell height; the strip's height follows it).
5. `AnimatedScene.jsx` (composed theme only unless stated): strip cells 1.5 px dividers in the role's ink, 1.5 px #32211C outline, rx 6, clipped to it; blank cells print nothing; bars take the warm ramp (mustard, orange, coral by value) when the values sum to 1 within 0.01, 18 px wide on a 24 pitch, 1.5 px ink outline and baseline, the label centred under the baseline at 13 px muted; connectors are the shared `wire`: 2.5 px, 12 x 8 head, one rounded elbow (radius 8) when the ends differ in x and y, horizontal then vertical for a mostly horizontal run; an operator circle's symbol is 22 px / 700; a caption (typography caption) wraps at the scene width as one object; bar motion fills use `initial={false}` so a server render draws them (all themes).
6. `explain-program/frame-look.js`: the stray blue: an arrow whose id merely started with a kind word (`v-arrow`) was drawn as a velocity vector; an id now names a kind only when it is that one word. A circle with a role of its own (not neutral) is no longer recoloured as an identity body. A caption is no longer clamped to x = 0.

## Layout (item 8)
The scene is authored at 520 x 400 (strips 8 x 32 = 256 wide, operators 44, a 48 gap), so the card gets a near-square figure. `scene.json` changed for it: `duration` 0, strips `cell` 32 and `cellH` 28, roles output (Key) and observed (Value) kept from r1, circles role `operator`, one caption object. The Value row moved from y 260 to 280 so the weights label and the weights-to-sigma arrow fit between the bars and sigma.

## Not done / open
- Neutral circles that an old program drew as identity bodies still are bodies; only a circle with a non-neutral role is exempt. A neutral operator would need the role.
- The standard theme's strips, bars and arrows are unchanged (the old look); only the composed (`interact`) path has the new defaults.
- No test was run or updated: scene, frame-look, interact-style and animation-scene tests that pin the old tint, neutral fill, vector heuristic and duration rule will move; they belong to the ship round.
