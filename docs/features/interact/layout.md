# /interactive scene layouts (layout.md)

Status: draft for the owner's check, 2026-11-18 (updated 12:10). Nothing here is built. Reviewed at 12:10 against the code on `proof/pendulum-b34` (d2b3d54d2); what the review found is in sections 2, 6 and 7. Positions and sizes come from the grid arithmetic below. Text widths are computed with the renderer's own width model. Supersedes the layout section of `claude/interactive-scene-grid-draft.md`.

Scope: `/interactive` at Deep depth only. Picking a layout with the fast classifier (JEV) is a later test.

Owner's decisions recorded here (11-18):

- The scene is the same size on every card. The whole card's height may change with the scene, because the controls area under it has more or fewer rows.
- Values are one section, not four fixed tiles. A card shows at least one value and at most four; they share the section's columns or rows equally. How the most important values are chosen is decided later.
- In layout 6 the arrangement of the values was left to my recommendation: side by side for one to three, a 2 × 2 grid for four.
- Reset is always inside the scene, top right. All other controls are under the card, timeline first, every row filling the width.
- The pick fields are named `pictureCount`, `runs` and `panelRole` (renamed from `pictures` and `second`).

## 1. The grid

| Item | Value |
|---|---|
| Scene | 640 × 320 px, on every card |
| Grid | 12 columns × 8 rows |
| Cell | 53.33 × 40 px |
| Column edges (px, rounded) | 0, 53, 107, 160, 213, 267, 320, 373, 427, 480, 533, 587, 640 |
| Row edges (px) | 0, 40, 80, 120, 160, 200, 240, 280, 320 |
| Inset | Every slot sits 4 px inside its cells, so neighbouring slots are 8 px apart and 4 px from the scene edge |
| Reset | Always inside the scene, top right. Reserved cell: column 12, row 1 (x 587, y 0, 53 × 40). Button 24 × 24 at x 608, y 8. Whatever slot covers that cell keeps it clear. It is the card's own button placed over the scene, not something the program draws |

A slot's box in pixels: x = left column edge + 4; y = (first row − 1) × 40 + 4; w = columns' width − 8; h = rows × 40 − 8.

How to read the drawings in section 5: each one is the whole scene. One grid column is 6 characters wide and one grid row is 2 lines tall, so the drawings keep the cell positions of the JSON beneath them. The 8 px gaps between slots are not drawn. The drawings are generated from the same column and row numbers as the JSON.

## 2. The slots

| Slot | Holds | Required |
|---|---|---|
| stage | The picture that moves: `/explain` primitives, or an `/explain` kind used as a fixed stage with program-drawn motion on top | Yes |
| panel | A second picture: one `/explain` kind, kept constant | Only in layouts 2, 3, 4, 6 |
| values | One section holding 1 to 4 values | Yes, at least one value |
| formula | The relation in use | Yes |
| note | One short line about what the current settings show. The program may switch between a few fixed sentences as the settings change | Yes |
| reset | The reset button | Yes, fixed |

### The values section

The layout gives the section one box. The card's 1 to 4 values divide that box equally, with 8 px between them. The model only lists the values; code divides the box.

How the values are arranged, per layout:

| Layout | Arrangement |
|---|---|
| 1. wide, 2. side-by-side, 3. equal-split, 4. stacked | Side by side in one row, equal widths |
| 5. tall | Stacked one under another, equal heights |
| 6. tall-with-panel | Side by side, equal widths, for 1 to 3 values; four values make a 2 × 2 grid |

Side by side in one row (layouts 1 to 4):

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│      value      │      value      │      value      │      value      │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
┌───────────────────────┬───────────────────────┬───────────────────────┐
│         value         │         value         │         value         │
└───────────────────────┴───────────────────────┴───────────────────────┘
┌───────────────────────────────────┬───────────────────────────────────┐
│               value               │               value               │
└───────────────────────────────────┴───────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│                                 value                                 │
└───────────────────────────────────────────────────────────────────────┘
```

Size of one value, in px, by how many the card has:

| Layout | Section box | 1 value | 2 values | 3 values | 4 values |
|---|---|---|---|---|---|
| 1 to 4 (one row, side by side) | 632 × 32 | 632 × 32 | 312 × 32 | 205 × 32 | 152 × 32 |
| 5. tall (a column, stacked) | 259 × 152 | 259 × 152 | 259 × 72 | 259 × 45 | 259 × 32 |
| 6. tall-with-panel (two rows high, side by side) | 312 × 72 | 312 × 72 | 152 × 72 | 99 × 72 | 152 × 32 in a 2 × 2 grid |

Why layout 6 switches to a grid at four: four side by side would be 72 px wide each, too narrow for a label; four stacked would be 12 px tall each.

How a value is written depends on its height: under 64 px tall, one line with the label on the left and the number with its unit on the right; 64 px or taller, the label above the number.

In layout 5 the top value keeps clear of the reset cell (its text stays left of x 583).

Each value declares a kind, which sets its look and its place in the order:

| Kind | Changes when | Order | Look |
|---|---|---|---|
| live | Every frame while playing | First | Strongest |
| set | Only when the learner moves a control | Middle | Normal |
| fixed | Never | Last | Quiet |

### Text

Sizes are `/explain`'s theme sizes (`teaching-theme.js`, TEACHING_TEXT). Widths are computed with the renderer's own width model (`tutor-diagrams/primitives.js`, `plainWidth`): an ordinary character is 0.68 of the font size, a narrow one (a space, a full stop, an i) is 0.38, a wide one (m, w) is 0.94. A line of 13 px text is 17 px tall. Text keeps 8 px clear of each side of its box.

| Text | Size | Room | Guide for the model |
|---|---|---|---|
| Value label | caption, 13 px | shares one line with the number when the value is under 64 px tall | 8 characters |
| Value number with unit | display, 17 px | as above | 6 characters; 7 when the card has three values or fewer |
| Formula | equation, 14 px | one line: 243 px (296 px in layout 6) | 24 characters |
| Note | caption, 13 px | one line: 349 px in layouts 1 to 4, 296 px in layout 6; up to three lines of 243 px in layout 5 | 36 characters |
| Labels on the stage | caption, 13 px | the program's own | 20 characters each |
| Panel text | the kind's own | | |

The guides are what the model is told. Code decides by measuring every text against its box with the renderer's width function:

- Values: label width + 8 px + number width must fit the value's width minus 16 px. With four values in a row that is 136 px. It holds "Period B" with "2.01 s" (130 px). It does not hold a 10-character label with a 7-character number (about 155 px). When the values do not all fit, code drops the last value in the list and divides the box again, so the order of the list is the order of importance.
- Formula and note: a text that does not fit its box is refused when the card is built. Text is never shrunk and never cut.

Corrected in the review (11-18 12:10). The first draft allowed a 10-character label, a 30-character formula and a two-line note of 84 characters. Measured, none of those fit: two lines of note need 34 px and the note's box is 32 px tall. A two-line note needs the scene to be one grid row (40 px) taller; see section 6.

## 3. Controls area (under the card, outside the scene)

- Row 1: the timeline (play, scrub, time), when the card has time. Always first.
- Then sliders. Then selects, toggles and the step control.
- Every row fills the full 640 px: the controls in a row share the width equally.
- At most three controls per row; at most two rows under the timeline. A card declares at most 4 inputs in total (the card contract's limit), plus action buttons.
- No reset here.
- The model names each control with its type and range. Code lays them out.
- A card has only the rows it needs, so the whole card's height changes from card to card. The scene above does not.

```
┌───────────────────────────────────────────────────────────────────────┐
│                           the scene (640 px)                          │
└───────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│ play   ───────────●───────────────────────────────────────    0:03    │  timeline
├───────────────────────────────────┬───────────────────────────────────┤
│ slider A  ─────●────────          │ slider B  ──────────●───          │  sliders
├───────────────────────┬───────────┴───────────┬───────────────────────┤
│ select                │ toggle                │ step                  │  the rest
└───────────────────────┴───────────────────────┴───────────────────────┘
```

## 4. How a layout is picked

The model answers three questions about the scene, each from a fixed list of words. It never names a layout and never gives a position.

```json
{
  "pictureCount": "one | two",
  "runs": "left-to-right | top-to-bottom | compact",
  "panelRole": "none | records-main | equal | aligned"
}
```

What each field means:

| Field | Question | Answers |
|---|---|---|
| `pictureCount` | How many pictures does the scene have? | `one`: only the stage. `two`: the stage plus a panel |
| `runs` | Which way does the main picture read? | `left-to-right`: a pipeline, a sequence, a curve. `top-to-bottom`: a tree, a stack of layers, a vertical throw. `compact`: neither, such as a pendulum or a cluster of points |
| `panelRole` | What is the second picture for? | `none`: there is no panel. `records-main`: a smaller chart that records what the stage does. `equal`: two things compared at the same size. `aligned`: the two pictures share the same left-to-right positions, so one sits above the other |

Code maps the three answers to one layout:

| pictureCount | runs | panelRole | Layout |
|---|---|---|---|
| one | left-to-right | none | 1. wide |
| one | compact | none | 1. wide |
| two | compact | records-main | 2. side-by-side |
| two | left-to-right | records-main | 2. side-by-side |
| two | compact | equal | 3. equal-split |
| two | left-to-right | equal | 3. equal-split |
| two | left-to-right | aligned | 4. stacked |
| two | compact | aligned | 4. stacked |
| one | top-to-bottom | none | 5. tall |
| two | top-to-bottom | records-main | 6. tall-with-panel |
| two | top-to-bottom | equal | 3. equal-split (fallback: each half too narrow when tall) |
| two | top-to-bottom | aligned | 3. equal-split (fallback) |

Code refuses an answer that contradicts itself or the plan: `pictureCount: "one"` with a `panelRole` other than `none` or with a panel declared, and `pictureCount: "two"` with `panelRole: "none"` or with no panel declared.

## 5. The six layouts

`useWhen` says what kind of scene belongs in the layout: what the subject is, and what the learner watches. `notWhen` names the cases that belong in a neighbouring layout. Nothing reads these two to make the pick today (code maps the three answers in section 4); they are the text a picker such as JEV would match against, and their wording is unproven until tested on real prompts.

Boxes are `[x, y, w, h]` in px. Cells are `[first, last]`. In every `values` slot, `count` is the allowed number of values and `split` is how they divide the box: `columns` means side by side at equal widths, `rows` means stacked at equal heights.

### 1. Wide

One picture across the full width; text in rows beneath.

```
┌─────────────────────────────────────────────────────────────────┬─────┐
│                                                                 │reset│
│                                                                 └─────┤
│                                                                       │
│                                                                       │
│                                                                       │
│                                 STAGE                                 │
│                                                                       │
│                                                                       │
│                                                                       │
│                                                                       │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│              VALUES: 1 to 4, side by side, equal widths               │
├─────────────────────────────┬─────────────────────────────────────────┤
│           formula           │                  note                   │
└─────────────────────────────┴─────────────────────────────────────────┘
```

```json
{
  "id": "wide",
  "pictureCount": "one",
  "runs": "left-to-right",
  "panelRole": "none",
  "useWhen": "The subject is a sequence or a single curve that reads from left to right: the stages of a pipeline, a row of tokens, a window sliding along a sequence, one curve reshaped by a slider. The learner follows one thing across the picture. There is nothing to chart alongside. Also the default for a single picture that has no direction.",
  "notWhen": "The subject has levels or depth (use tall). A second picture should record or compare (use side-by-side, equal-split or stacked).",
  "examples": [
    "a pipeline: retrieve, then generate",
    "text turning into tokens",
    "a single curve with a slider",
    "a convolution sliding along a sequence"
  ],
  "slots": {
    "stage":   { "cols": [1, 12], "rows": [1, 6], "box": [4, 4, 632, 232], "keepClear": "reset cell" },
    "values":  { "cols": [1, 12], "rows": [7, 7], "box": [4, 244, 632, 32], "count": [1, 4], "split": "columns" },
    "formula": { "cols": [1, 5],  "rows": [8, 8], "box": [4, 284, 259, 32] },
    "note":    { "cols": [6, 12], "rows": [8, 8], "box": [271, 284, 365, 32] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

### 2. Side by side

A main picture on the left and a smaller one on the right that records what the main one does.

```
┌─────────────────────────────────────────┬───────────────────────┬─────┐
│                                         │                       │reset│
│                                         │                       └─────┤
│                                         │                             │
│                                         │                             │
│                                         │                             │
│                  STAGE                  │            PANEL            │
│                                         │                             │
│                                         │                             │
│                                         │                             │
│                                         │                             │
│                                         │                             │
├─────────────────────────────────────────┴─────────────────────────────┤
│              VALUES: 1 to 4, side by side, equal widths               │
├─────────────────────────────┬─────────────────────────────────────────┤
│           formula           │                  note                   │
└─────────────────────────────┴─────────────────────────────────────────┘
```

```json
{
  "id": "side-by-side",
  "pictureCount": "two",
  "runs": "compact",
  "panelRole": "records-main",
  "useWhen": "One main thing moves or changes, and a smaller chart records a measurement of it as it goes: an angle over time, loss per step, error per round. The learner watches the main picture and reads the chart as its record.",
  "notWhen": "The two pictures matter equally (use equal-split). The main picture runs top to bottom (use tall-with-panel). The second picture lines up position by position with the first (use stacked).",
  "examples": [
    "a pendulum with its angle against time",
    "gradient descent on a curve with loss per step",
    "k-means points with error per round"
  ],
  "slots": {
    "stage":   { "cols": [1, 7],  "rows": [1, 6], "box": [4, 4, 365, 232] },
    "panel":   { "cols": [8, 12], "rows": [1, 6], "box": [377, 4, 259, 232], "keepClear": "reset cell" },
    "values":  { "cols": [1, 12], "rows": [7, 7], "box": [4, 244, 632, 32], "count": [1, 4], "split": "columns" },
    "formula": { "cols": [1, 5],  "rows": [8, 8], "box": [4, 284, 259, 32] },
    "note":    { "cols": [6, 12], "rows": [8, 8], "box": [271, 284, 365, 32] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

### 3. Equal split

Two pictures at the same size, compared on equal footing.

```
┌───────────────────────────────────┬─────────────────────────────┬─────┐
│                                   │                             │reset│
│                                   │                             └─────┤
│                                   │                                   │
│                                   │                                   │
│                                   │                                   │
│               STAGE               │               PANEL               │
│                                   │                                   │
│                                   │                                   │
│                                   │                                   │
│                                   │                                   │
│                                   │                                   │
├───────────────────────────────────┴───────────────────────────────────┤
│              VALUES: 1 to 4, side by side, equal widths               │
├─────────────────────────────┬─────────────────────────────────────────┤
│           formula           │                  note                   │
└─────────────────────────────┴─────────────────────────────────────────┘
```

```json
{
  "id": "equal-split",
  "pictureCount": "two",
  "runs": "compact",
  "panelRole": "equal",
  "useWhen": "Two versions of the same thing are compared and neither is the main one: with and without a technique, a low and a high setting, before and after, model A and model B. The learner looks back and forth between them as a control changes one or both.",
  "notWhen": "One picture only records what the other does (use side-by-side). The two share the same left-to-right positions (use stacked).",
  "examples": [
    "with and without dropout",
    "low and high temperature",
    "two models' decision boundaries",
    "before and after normalisation"
  ],
  "slots": {
    "stage":   { "cols": [1, 6],  "rows": [1, 6], "box": [4, 4, 312, 232] },
    "panel":   { "cols": [7, 12], "rows": [1, 6], "box": [324, 4, 312, 232], "keepClear": "reset cell" },
    "values":  { "cols": [1, 12], "rows": [7, 7], "box": [4, 244, 632, 32], "count": [1, 4], "split": "columns" },
    "formula": { "cols": [1, 5],  "rows": [8, 8], "box": [4, 284, 259, 32] },
    "note":    { "cols": [6, 12], "rows": [8, 8], "box": [271, 284, 365, 32] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

### 4. Stacked

Two wide pictures, one above the other, sharing the same left-to-right positions.

```
┌─────────────────────────────────────────────────────────────────┬─────┐
│                                                                 │reset│
│                                                                 └─────┤
│                                 STAGE                                 │
│                                                                       │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│                                                                       │
│                                 PANEL                                 │
│                                                                       │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│              VALUES: 1 to 4, side by side, equal widths               │
├─────────────────────────────┬─────────────────────────────────────────┤
│           formula           │                  note                   │
└─────────────────────────────┴─────────────────────────────────────────┘
```

```json
{
  "id": "stacked",
  "pictureCount": "two",
  "runs": "left-to-right",
  "panelRole": "aligned",
  "useWhen": "Two rows describe the same items in the same left-to-right order, so each item in the top row sits directly above its counterpart: tokens above their weights, scores above their probabilities, a signal above its smoothed version. The learner reads straight down from an item to its result.",
  "notWhen": "The two pictures do not share positions (use side-by-side or equal-split). Either picture needs height, such as a tree or a full chart (each picture is only 112 px tall here).",
  "examples": [
    "a token row above its attention weights",
    "scores above their softmax probabilities",
    "a signal above its moving average"
  ],
  "slots": {
    "stage":   { "cols": [1, 12], "rows": [1, 3], "box": [4, 4, 632, 112], "keepClear": "reset cell" },
    "panel":   { "cols": [1, 12], "rows": [4, 6], "box": [4, 124, 632, 112] },
    "values":  { "cols": [1, 12], "rows": [7, 7], "box": [4, 244, 632, 32], "count": [1, 4], "split": "columns" },
    "formula": { "cols": [1, 5],  "rows": [8, 8], "box": [4, 284, 259, 32] },
    "note":    { "cols": [6, 12], "rows": [8, 8], "box": [271, 284, 365, 32] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

### 5. Tall

One picture at full height on the left; the text in a column on the right. The values are stacked, one under another, at equal heights.

```
┌─────────────────────────────────────────┬───────────────────────┬─────┐
│                                         │                       │reset│
│                                         │                       └─────┤
│                                         │                             │
│                                         │   VALUES: 1 to 4, stacked   │
│                                         │        equal heights        │
│                                         │                             │
│                                         │                             │
│                  STAGE                  ├─────────────────────────────┤
│                                         │                             │
│                                         │           formula           │
│                                         │                             │
│                                         ├─────────────────────────────┤
│                                         │                             │
│                                         │            note             │
│                                         │                             │
└─────────────────────────────────────────┴─────────────────────────────┘
```

```json
{
  "id": "tall",
  "pictureCount": "one",
  "runs": "top-to-bottom",
  "panelRole": "none",
  "useWhen": "The subject has levels or depth, and something moves through them: down a tree, up a stack of layers, through a call stack. The learner follows one thing level by level. There is nothing to chart alongside.",
  "notWhen": "The steps read as a sequence from left to right (use wide). A chart should record the movement (use tall-with-panel).",
  "examples": [
    "a point tracing down a decision tree",
    "a token passing up a stack of layers",
    "a call stack growing",
    "a ball thrown straight up"
  ],
  "slots": {
    "stage":   { "cols": [1, 7],  "rows": [1, 8], "box": [4, 4, 365, 312] },
    "values":  { "cols": [8, 12], "rows": [1, 4], "box": [377, 4, 259, 152], "count": [1, 4], "split": "rows", "keepClear": "reset cell" },
    "formula": { "cols": [8, 12], "rows": [5, 6], "box": [377, 164, 259, 72] },
    "note":    { "cols": [8, 12], "rows": [7, 8], "box": [377, 244, 259, 72] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

### 6. Tall with panel

One picture at full height on the left; a second picture top right, with the text under it. The values sit side by side at equal widths for one to three values; four values make a 2 × 2 grid.

```
┌───────────────────────────────────┬─────────────────────────────┬─────┐
│                                   │                             │reset│
│                                   │                             └─────┤
│                                   │                                   │
│                                   │               PANEL               │
│                                   │                                   │
│                                   │                                   │
│                                   │                                   │
│               STAGE               ├───────────────────────────────────┤
│                                   │   VALUES: 1 to 4, side by side    │
│                                   │   four values make a 2 × 2 grid   │
│                                   │                                   │
│                                   ├───────────────────────────────────┤
│                                   │              formula              │
│                                   ├───────────────────────────────────┤
│                                   │               note                │
└───────────────────────────────────┴───────────────────────────────────┘
```

```json
{
  "id": "tall-with-panel",
  "pictureCount": "two",
  "runs": "top-to-bottom",
  "panelRole": "records-main",
  "useWhen": "The subject has levels or depth, something moves or grows through them, and a chart records a measurement as it does: error against tree depth, height against time, a value per layer. The learner watches the tall picture and reads the chart as its record.",
  "notWhen": "There is nothing to chart (use tall). The main picture has no top-to-bottom direction (use side-by-side).",
  "examples": [
    "a tree growing deeper with error against depth",
    "a vertical toss with height against time",
    "a layer stack with a value per layer"
  ],
  "slots": {
    "stage":   { "cols": [1, 6],  "rows": [1, 8], "box": [4, 4, 312, 312] },
    "panel":   { "cols": [7, 12], "rows": [1, 4], "box": [324, 4, 312, 152], "keepClear": "reset cell" },
    "values":  { "cols": [7, 12], "rows": [5, 6], "box": [324, 164, 312, 72], "count": [1, 4], "split": "columns", "splitAtFour": "2x2" },
    "formula": { "cols": [7, 12], "rows": [7, 7], "box": [324, 244, 312, 32] },
    "note":    { "cols": [7, 12], "rows": [8, 8], "box": [324, 284, 312, 32] },
    "reset":   { "cols": [12, 12], "rows": [1, 1], "box": [608, 8, 24, 24] }
  }
}
```

## 6. To check when it is built

1. Scene height 320 px. The pendulum card at 290 px is fully visible at 100% zoom in a 1440 × 900 window, with roughly 100 px to spare (brief 34 page shots). 320 px has not been measured.
2. The note is one line of about 36 characters. If that is too short for real cards, the fix is one more grid row for the text (scene 360 px tall); the owner decides.
3. Four values in a row fit only with short labels (section 2).
4. In layout 4 each picture is 112 px tall. A chart kind may not fit that height; not tested.
5. The height of a panel (section 7, point 5).
6. Not included on purpose: mirrored layouts, and layouts with three pictures.

## 7. Checked against the code (`proof/pendulum-b34`, d2b3d54d2)

1. Scene size. A card declares its own frame size and every frame must be exactly that size (`explain-program/contract.js`, manifest viewport). 640 × 320 is allowed. The pendulum today is 640 × 290.
2. Reset. Today it is the card's own button in a row above the scene (`explain-program/ProgramScene.jsx`, `ResetButton`). Here the same button sits over the scene's top-right cell. This is card interface code, not the `/explain` renderer.
3. Values. Today the card writes them as a line of text under the scene (`data-interact-readouts` in `ProgramScene.jsx`). Here they are drawn inside the scene from the quantities the program already returns per frame, and the line under the scene is not shown for a card that has a layout.
4. Controls. Today sliders have a fixed width in a row that wraps. Here every row fills the width. The control types this doc names exist already: number (slider), select, boolean (toggle), index (step) and action buttons; at most 4 inputs and 8 action buttons per card.
5. Panel height. `sdk.diagram` takes x, y and a width. The height is the diagram's own, and the renderer scales a diagram down only to keep it inside the frame, not inside a panel (`explain-program/frame.js`, `FrameFigures.jsx` `DiagramFigure`). So code must measure the diagram at build time with a read-only call to the renderer and choose the width at which its height fits the panel box, then centre it in the box. Brief 34's pendulum already reads the plot's layout this way (`scripts/interact/bake-pendulum-geometry.mjs`).
6. No SDK change and no renderer change. The SDK is frozen (sdk-8), so the layouts are data plus functions used when a card's program is built. `packages/web/src/tutor-diagrams/` is read, never edited.
7. Object budget. A frame holds 60 objects by default and more with an approved budget. The values, formula and note add about 15.

## 8. What a card supplies (proposal; the owner has not checked this part)

```json
{
  "layout": { "pictureCount": "two", "runs": "compact", "panelRole": "records-main" },
  "values": [
    { "quantity": "angleB",  "label": "Angle B",  "unit": "°", "decimals": 0, "kind": "live" },
    { "quantity": "periodB", "label": "Period B", "unit": "s", "decimals": 2, "kind": "set" },
    { "quantity": "periodA", "label": "Period A", "unit": "s", "decimals": 2, "kind": "fixed" }
  ],
  "formula": "T = 2π√(L/g)",
  "note": "chosen by the program from its fixed sentences"
}
```

- `quantity` names one of the quantities the program returns with every frame. Code reads the number; the model never writes a number.
- The values are listed in order of importance.
- The stage and the panel are drawn by the card's program inside the boxes code hands it. The program never chooses a position outside its box.
- Controls are declared as they are today.

## 9. Decided later

- How the most important values are chosen when a scene has more than four.
- Whether JEV picks the layout.
