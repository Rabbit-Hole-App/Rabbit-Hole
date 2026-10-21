// The make_animation tool's authoring contract (learn-artifact.js appends it to the primitive's description): the frozen
// scene format of the authored Learn cards (web/src/animation-scene.js, scene-inputs.js, scene-derive.js,
// scene-evaluate.js), told to the model as data it fills. Server-only; the example is checked against the real gates by
// test/learn-scene-author.test.js, so the contract cannot drift from the validator.

export const SCENE_EXAMPLE = {
  id: 'weighted-grade',
  title: 'How weights decide a final grade',
  width: 760, height: 420, duration: 2,
  inputs: [
    { name: 'scheme', type: 'choice', label: 'Weighting', default: 'equal', options: [{ id: 'equal', label: 'Equal weights' }, { id: 'exam', label: 'Exam counts most' }] },
    { name: 'showParts', type: 'bool', label: 'Show each contribution', default: true },
  ],
  exampleData: {
    scores: [80, 60, 90],
    weightSets: { equal: [0.34, 0.33, 0.33], exam: [0.2, 0.2, 0.6] },
    partsOn: 'Each bar is score x weight; the bars add up to the grade.',
    partsOff: 'Turn on the contributions to see where the grade comes from.',
  },
  derived: {
    weights: { op: 'pick', args: ['weightSets', 'scheme'] },
    parts: { op: 'elementwise', args: ['scores', 'weights'] },
    grade: { op: 'sum', args: ['parts'] },
    partsNote: { op: 'choose', args: ['showParts', 'partsOn', 'partsOff'] },
  },
  objects: [
    { id: 'question', type: 'text', initialState: { text: 'Why can the same three scores give different grades?', x: 40, y: 40, typography: 'heading' } },
    { id: 'scores', type: 'strip', initialState: { label: 'scores: homework, quiz, exam', x: 40, y: 110, cell: 56, numberFormat: 'integer', role: 'input', values: { $derive: 'scores' } } },
    { id: 'weights', type: 'strip', initialState: { label: 'weights (sum to 1)', x: 40, y: 200, cell: 56, role: 'input', values: { $derive: 'weights' } } },
    { id: 'parts', type: 'bars', initialState: { label: 'contribution of each score', x: 400, y: 110, h: 120, cell: 64, role: 'output', labels: ['homework', 'quiz', 'exam'], values: { $derive: 'parts' } } },
    { id: 'grade', type: 'text', initialState: { text: 'Final grade: {{grade}}', x: 40, y: 300, typography: 'heading' } },
    { id: 'note', type: 'text', initialState: { text: '{{partsNote}}', x: 40, y: 340, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'scores', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'weights', duration: 0.4 },
    { at: 1, action: 'appear', target: 'parts', duration: 0.5 },
  ],
};

export const SCENE_AUTHORING = `

WHAT YOU WRITE: scene JSON for a fixed SVG renderer - data, never code. The learner moves your controls (inputs); every value on screen follows from them. One idea per card.

SCENE: {id, title, width (320-1120), height (200-860), duration (seconds, 1-12), inputs?, exampleData?, derived?, objects (at most 40), timeline}. Coordinates are pixels, x right, y down, inside width x height; leave 40px margins. Text never wraps: keep each text line under about 70 characters at body size, 55 at heading size. Leave at least 24px between objects; data objects (strip, grid, bars, tokens) draw their label 24px above their own y, so leave room there.

OBJECTS: {id (unique), type, initialState}. Types and their initialState fields:
- text: text, x, y (where the line starts), typography (heading | body | caption | annotation), role.
- box: x, y, w, h, label (drawn inside), role. circle: x, y (its centre), w (diameter), label, role.
- arrow, line: from {x, y}, to {x, y}, label, role. An arrowhead must not land on text.
- equation: text (TeX), x, y, w, h. code: text, x, y.
- strip (one row of numbers): x, y, values [numbers], cell (pixel pitch, 40-64), label, numberFormat (decimal | integer).
- grid (a table of numbers): x, y, rows, cols, values (row-major, rows x cols numbers), cell, label, rowLabels (one per row), columnLabels (one per column), matrixKind (input = given data, derived = computed, relational = compares two labelled sets: REQUIRED whenever values are present).
- bars (a bar chart): x, y, h (chart height), values [numbers], labels (one per bar, at most 24 characters), cell (bar pitch: about 10px per label character).
- tokens (a row of chips): x, y, tokens [short strings], label.
Optional on any: opacity (0-1; start at 0 to make it appear later), role (neutral | input | output | prediction | observed | warning | success; role is the colour - never write colours), cellHighlight (on grid, strip, bars, tokens: a position, a list of positions, {row} / {col}, or "max"), heat (true on a grid or strip colours cells by value: then valueScale is required: local, fixed for probabilities 0-1, or shared with a valueScaleGroup name).
No images. No other fields.

INPUTS (the learner's controls, at most 4): {name (letters/digits), type, label (max 60 chars, names the control), default, ...}.
- bool: default true/false. Toggles.
- choice: options [{id, label}] (2-5), default an option id.
- index: of (an exampleData list), default a position, presentation (picker | slider). A picker (up to 8 settings) shows each entry of that list as a button, so make the list short strings naming each setting ("10°", "20°", "30°"); a slider (longer lists) shows only "3 of 12", so also print the current setting in a text with {{...}}. Keep the numbers for each setting in separate lists picked by the same input.
Input names may not reuse exampleData or derived names.

VALUES: exampleData holds the given data (numbers, lists, records, strings). derived names each calculation once, in order, and may use earlier names; args are names, dotted paths ("table.2", "rec.field") or plain numbers. Ops:
- pick [list, indexInput] or [record, choiceInput]: one entry (a number, list or record).
- choose [boolInput, whenTrue, whenFalse]: one of two named values (often strings).
- add, sub, elementwise (multiply) [vectorA, vectorB]: same-length lists, position by position.
- scale [vector or list of vectors, number or name of a number]: multiply every entry.
- sum [vector]: one number. dot [a, b]: one number. weighted_sum [weights, rows]. softmax [vector or rows]. argmin [vector]: a position.
- concat [numbers or vectors...]: one list. matmul [rowsA, rowsB]: rowsA x rowsBᵀ. gate [value, boolInput]: the value, or blanks until the input is true. causal_mask [square matrix, bool].
Nothing else exists: no division by a name, no powers, roots, logs, trigonometry or conditions. Use a value anywhere in initialState with {"$derive": "name"} (values, cellHighlight, x, y, w, h), and inside any text with "{{name}}" or "{{record.field}}" (a number or string, never a list).

CALCULATION (set the tool's "calculation" field honestly):
- live: every number the learner sees is computed by derived ops from the inputs (picking a parameter value from a list is fine).
- precomputed: some shown results are stored values you worked out (for example a table of results per setting, because the ops above cannot compute them). Then the controls only select stored samples: use index or choice inputs over exactly the samples you stored, never imply a continuous range, and check every stored number. The card adds the note "Precomputed samples" itself; do not write one.
- none: the scene shows no numbers.

TIMELINE (plays once when the card appears; at most 30 events): {at (seconds), action, target, duration?, value?}. Actions: appear, disappear, highlight, unhighlight, emphasize, move (value {x, y}), change_text (value a string), set_values (value a list the same length as the target's values), highlight_cell, sweep. Every event ends within duration. Objects shown from the start need no event.

Use the learner's topic, real terms and correct numbers. Show the idea, then let the controls reveal its consequence; a heading-sized question or claim at the top says what to look for.

A complete valid scene (a different topic - write your own): ${JSON.stringify(SCENE_EXAMPLE)}`;
