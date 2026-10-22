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
  presentation: {
    mode: 'static',
    experiments: [
      { id: 'weighting', input: 'scheme', purpose: 'Which score decides the grade when the exam counts most?', affects: ['weights', 'parts', 'grade'], contrasts: ['equal weights', 'exam counts most'] },
      { id: 'contributions', input: 'showParts', purpose: 'Where does the grade come from?', affects: ['note'], contrasts: ['contributions shown', 'contributions hidden'] },
    ],
  },
};

export const SCENE_AUTHORING = `

WHAT YOU WRITE: scene JSON for a fixed SVG renderer - data, never code. The learner moves your controls (inputs); every value on screen follows from them. One idea per card.

SCENE: {id, title, width (320-1120), height (200-860), duration (seconds, 1-12), inputs?, exampleData?, derived?, objects (at most 40), timeline}. Coordinates are pixels, x right, y down, inside width x height; leave 40px margins. Text never wraps: keep each text line under about 70 characters at body size, 55 at heading size. Leave at least 24px between objects; data objects (strip, grid, bars, tokens) draw their label 24px above their own y, so leave room there.

OBJECTS: {id (unique), type, initialState}. Types and their initialState fields:
- text: text, x, y (where the line starts), typography (heading | body | caption | annotation), role.
- box: x, y, w, h, label (drawn inside), role. circle: x, y (its centre), w (diameter), label, role.
- arrow, line: from {x, y}, to {x, y}, label, role. An arrowhead must not land on text.
- runs (on text, box, circle, arrow, line, instead of text or label): a line mixing words and formulas, [{"kind": "text", "text": "Period: "}, {"kind": "math", "tex": "T = 2\\pi\\sqrt{L/g}"}]. Write every formula as a math run in TeX, never as calculator text like 2*pi*sqrt(L/g); keep code as code.
- equation: text (TeX), x, y, w, h. An equation with an operator and "= <number>" (even "T = 2\\pi\\sqrt{L/g}") is read as a computed result, so its numbers must come from derived values ({{name}} in the TeX); write a general law as a text line instead. code: text, x, y.
- strip (one row of numbers): x, y, values [numbers], cell (pixel pitch, 40-64), label, numberFormat (decimal | integer).
- grid (a table of numbers): x, y, rows, cols, values (row-major, rows x cols numbers), cell, label, rowLabels (one per row), columnLabels (one per column), matrixKind (input = given data, derived = computed, relational = compares two labelled sets: REQUIRED whenever values are present).
- bars (a bar chart): x, y, h (chart height), values [numbers], labels (one per bar), cell (bar pitch: about 10px per label character).
- tokens (a row of chips): x, y, tokens [short strings], label.
Hard limits (anything over is refused): cell at most 80; rows and cols at most 64; at most 256 values; labels, rowLabels, columnLabels and tokens at most 24 characters each; label at most 200 and text at most 600 characters; w and h at most 2000.
Optional on any: opacity (0-1; start at 0 to make it appear later), role (neutral | input | output | prediction | observed | warning | success; role is the colour - never write colours), cellHighlight (on grid, strip, bars, tokens: a position, a list of positions, {row} / {col}, or "max"), heat (true on a grid or strip colours cells by value: then valueScale is required: local, fixed for probabilities 0-1, or shared with a valueScaleGroup name).
No images. No other fields.

INPUTS (the learner's controls, at most 4): {name (letters/digits), type, label (max 60 chars, names the control), default, ...}.
- bool: default true/false. Toggles.
- choice: options [{id, label}] (2-5), default an option id.
- index: of (an exampleData list), default a position, presentation (picker | slider). A picker (up to 8 settings) shows each entry of that list as a button, so make the list short strings naming each setting ("10°", "20°", "30°"); a slider (longer lists) shows only "3 of 12", so also print the current setting in a text with {{...}}. Keep the numbers for each setting in separate lists picked by the same input.
Input names may not reuse exampleData or derived names. The server checks every setting a learner can reach, each combination of the controls included: at most 64 in all (two toggles and a 16-position slider make 64); a scene with more is refused.

VALUES: exampleData holds the given data (numbers, lists, records, strings). derived names each calculation once, in order, and may use earlier names; args are names, dotted paths ("table.2", "rec.field") or plain numbers. Ops:
- pick [list, indexInput] (by position) or [record, choiceInput] (keys are the choice's option ids): one entry (a number, list or record). An index input never picks from a record.
- choose [boolInput, whenTrue, whenFalse]: one of two named values (often strings). Its first arg must be a bool input; to select by an index or choice input, use pick.
- add, sub, elementwise (multiply) [vectorA, vectorB]: same-length lists, position by position.
- scale [vector or list of vectors, number or name of a number]: multiply every entry.
- sum [vector]: one number. dot [a, b]: one number. weighted_sum [weights, rows]. softmax [vector or rows]. argmin [vector]: a position.
- concat [numbers or vectors...]: one list. matmul [rowsA, rowsB]: rowsA x rowsBᵀ. gate [value, boolInput]: the value, or blanks until the input is true. causal_mask [square matrix, bool].
Single numbers: scale and the vector ops take lists, so make a number a one-entry list with concat [a] and read the result back as "name.0" (to divide by a setting, store its reciprocal per setting and scale by that). Nothing else exists: no division by a name, no powers, roots, logs, trigonometry or conditions. Use a value anywhere in initialState with {"$derive": "name"} (values, cellHighlight, x, y, w, h, opacity - a number, never a bool: to show or hide with a toggle, choose between stored 1 and 0), and inside any text with "{{name}}" or "{{record.field}}" (a number or string, never a list). A dotted path holds fixed keys or positions only ("table.2"), never an input's value: pick by the input in derived first, then use the picked name.

CALCULATION (set the tool's "calculation" field honestly; prefer live: compute every result the ops can - a difference with sub, a total with sum, a product with scale or elementwise - and store only what they cannot):
- live: every number the learner sees is computed by derived ops from the inputs (picking a parameter value from a list is fine).
- precomputed: some shown results are stored values you worked out (for example a table of results per setting, because the ops above cannot compute them). Then the controls only select stored samples: use index or choice inputs over exactly the samples you stored, never imply a continuous range. Work each setting out step by step before you write it, and make every stored list for that setting (marks, numbers, counts, sentences) agree with the others. The server refuses a sentence its own card contradicts: a written calculation ("80 - 60 = 20") must hold, and a count or an index range ("cells 4..6") must name exactly the drawn entries it describes (derive a count with sum over the 0/1 list and print it with {{name}}). The card adds the note "Precomputed samples" itself; do not write one.
- none: the scene shows no numbers.

PRESENTATION (declare it): "presentation": {mode, steps?, experiments}. Choose the simplest that teaches:
- static (prefer it): the complete picture; the card shows its finished frame with no playback. A timeline that only reveals or highlights is static.
- steps: 2-12 named moments {id, title (max 120), at (seconds, increasing: the moment the step shows, after its events have finished)} on the timeline, each changing what is drawn (a highlight alone is not a step); earlier context stays on screen. The card shows Previous / Next by name.
- time: only when timing itself is the lesson (a process unfolding); the card gets Play and a scrubber.
- experiments: exactly one per control: {id, input (the control's name), purpose (the question moving it answers, shown above the controls, max 300), affects (ids of objects that EVERY setting of the control visibly changes), contrasts (1-8 short phrases naming what to compare), dependsOn? (other controls this effect needs set), invariant? (true when the point is that the listed results stay the same, for example "the period does not depend on mass"; then also draw the setting in effect or both values so the comparison is visible)}. The server evaluates every setting: a control whose listed objects stay the same between two settings without invariant, or that only moves a highlight, is refused.

TIMELINE (plays once when the card appears; at most 30 events): {at (seconds), action, target, duration?, value?}. Actions: appear, disappear, highlight, unhighlight, emphasize, move (value {x, y}), change_text (value a string), set_values (value a list the same length as the target's values), highlight_cell, sweep. Every event ends within duration. Objects shown from the start need no event.

Use the learner's topic, real terms and correct numbers. Show the idea, then let the controls reveal its consequence; a heading-sized question or claim at the top says what to look for.

A complete valid scene (a different topic - write your own): ${JSON.stringify(SCENE_EXAMPLE)}`;
