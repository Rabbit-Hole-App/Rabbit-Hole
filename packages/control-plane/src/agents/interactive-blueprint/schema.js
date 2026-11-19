// Brief 38 spec section 7.6: the blueprint field by field with every limit, the rules for the math function, and what the program tests. Hand-written wording, but every number is read from LIMITS
// (packages/web/src/interact-blueprint.js), so a lowered limit is one edit there; schema.test.mjs checks each phrase against LIMITS. Only BUILT options are described (the named ones are not told).
import { LIMITS as L } from '../../../../web/src/interact-blueprint.js';

const range = ([low, high]) => `${low} to ${high}`;

export const SCHEMA = `## The blueprint

Return one JSON object, the interactive-blueprint, in the shape of the response schema. Its fields come in the order of the reasoning: the relationship, the quantities, the controls, the math, the pictures, and the words last. Everything the learner reads is plain text: no markdown, no HTML, and no ellipsis.

relationship: what answers the question.
- statement: the rule, law or procedure, in one or two sentences (at most ${L.statement} characters)
- formula: its central equation as one line of TeX of at most ${L.formula} characters, shown on the card; null when there is none
- assumptions: ${range(L.assumptions)} short sentences naming what is idealised or held fixed (at most ${L.assumption} characters each)

quantities: every quantity that plays a part in the question, ${range(L.quantities)}, each { id, label, unit, role, meaning }. role is "control" (the learner changes it), "fixed" (held constant in this scene) or "result" (computed, then shown or drawn). label is at most ${L.quantityLabel} characters, meaning at most ${L.meaning}. Each control quantity is one of the inputs below, under the same id. Each result quantity is one of the math function's outputs, under the same id.

things: the ${range(L.things)} objects the scene is about, each { id, label } (label at most ${L.thingLabel} characters). Each thing gets its own colour. A part, a graph line or a value that is "of" a thing is drawn in that colour, which is how the learner connects a number to the object it measures.

inputs: the controls, ${range(L.inputs)}, one for each control quantity. Labels are at most ${L.inputLabel} characters.
- number: { type, id, label, unit, min, max, default, step }, a slider
- select: { type, id, label, options: ${range(L.options)} of { value, label }, default }, a choice between named cases
- boolean: { type, id, label, default }, a switch
Choose the smallest set that lets the learner find the answer. A control earns its place only if moving it changes something the learner can see, or demonstrates that something stays the same. Give each a range in which the scene stays readable and a default that is a sensible place to start.

time: { mode: "continuous", duration, label, unit }. The scene plays from 0 to duration seconds (${range(L.duration)}), and the learner can pause and scrub. If something repeats, choose a duration that shows a few repetitions.

math
- code: the source of one JavaScript function, at most ${L.code[1]} characters:
    function compute(inputs, t) { return { name: value }; }
  inputs holds each control's current value under its id: a number, an option's value string, or true or false. t is the time in seconds.
- outputs: one entry { id, kind, unit, meaning } for every name the function returns. kind is "number" (a finite number) or "flag" (true or false).

Rules for the function:
- It reads only inputs and t, and uses only Math and its own inner functions.
- It returns every declared output on every call, for every setting of the controls and every time from 0 to the duration. Every number is finite.
- The same inputs and time always give the same outputs.
- It knows nothing about the screen. Positions are in the lesson's own units, with x to the right and y up.
- Math functions take radians. If the learner should read degrees, return degrees.
- Fixed quantities are written as constants inside the function.
- Keep it cheap: it is called many times for each frame.

pictures
- main: { type: "parts", unit, parts }. unit names the picture's unit. parts is ${range(L.parts)} parts, drawn in order. A coordinate is a number, or the id of a number output. A part may name the thing it belongs to with "of"; a part without it is drawn in a neutral colour.
  - line: { type, id, from: [x, y], to: [x, y], of }
  - dot: { type, id, at: [x, y], size, of }. size is "small", "medium" or "large", or the id of an output between 0 and 1.
  - arrow: { type, id, from: [x, y], to: [x, y], label, of }, for a quantity that has a direction. label is at most ${L.arrowLabel} characters.
  - trace: { type, id, at: [xOutput, yOutput], of }, the path that point has drawn since time 0.
  - label: { type, id, at: [x, y], text, of }, fixed text of at most ${L.partText} characters.
  Everything is drawn at one scale, so keep the parts within a region whose width and height are of similar size.
- panel: a graph, or null for a scene with one picture.
  { type: "kind", kind: "coordinate-plot", title, x: { over, label, unit }, y: { label, unit }, series: ${range(L.series)} of { value, label, of, style: "line" } }
  x.over is "time" (each line is drawn against time) or the id of a number control (each line is drawn against that control, across its range). value is a number output. The title is at most ${L.title} characters, an axis label ${L.axisLabel}, a line's label ${L.seriesLabel}. A line can turn at most 11 times across the graph.

values: ${range(L.values)} live numbers shown in the scene, most important first: { value, label, unit, decimals, of }. value is a number output. label is at most ${L.valueLabel} characters, unit at most ${L.valueUnit}, decimals ${range(L.decimals)}. Each is shown as one short box, "label: number unit"; when the boxes do not all fit, the last ones are left out, so put the most important first and keep labels short.

explanation: what the scene says in words. Each line is at most ${L.line} characters, which is one line of the card.
- always: ${range(L.always)} lines shown in every state
- cases: ${range(L.cases)} of { when, text }. when is a flag output. The first case whose flag is true shows its text.
- otherwise: one line shown when no case is true (optional)
At least one line must show in every state. Use cases to say what the current settings show.

layout: three answers about the scene's shape. A program maps them to a layout.
- pictureCount: "two" when there is a panel, "one" when panel is null
- runs: how the main picture reads: "left-to-right", "top-to-bottom", or "compact" when it has no direction
- panelRole: "none" with one picture; "records-main" when the graph records a measurement of the main picture as it goes; "equal" when the two pictures matter equally; "aligned" when the graph lines up item by item with the main picture

claims: ${range(L.claims)} statements about your math that must be true. The program tests each one by running your function, so a claim is how you state the lesson's point in a form that gets checked.
- { type: "unchanged", value, when }: the output stays the same while the control "when" goes across its whole range
- { type: "increases", value, with } and { type: "decreases", value, with }: the output rises, or falls, as the control "with" rises
- { type: "equal", value, to }: two outputs are equal
Any claim may add at: a list of ${range(L.at)} of { input, value }, to hold those controls at those settings while it is tested. Controls not named stay at their defaults. At least one claim names a control.

lesson: the words around the scene, written last.
- title: the card's title, a question or a statement (at most ${L.lessonTitle} characters)
- description: what the learner sees and does, shown above the scene; two sentences, ${L.description[0]} to ${L.description[1]} characters in all
- instructions: how to use the controls (at most ${L.instructions} characters)
- goal: the one thing the learner should leave knowing (at most ${L.goal} characters)

Ids are letters, digits and underscores and start with a letter. An id is unique within its group: the quantities; the things; the controls and outputs together; the parts. A control quantity and its control share one id, and a result quantity and its output share one id.

## What the program tests

1. The blueprint matches the schema and every limit above.
2. Every name used is a declared output of the right kind; every "of" names a thing; every control quantity is an input and every result quantity is an output.
3. The function runs at every setting and time and returns every output.
4. Something moves during the run.
5. Every control changes something the learner can see.
6. The parts' movement is large enough to see at the scale needed to show all of them.
7. No graph line is flat, and none turns more than 11 times.
8. Every claim holds.
9. The texts fit their boxes and the graph fits its panel.
10. One frame computes quickly.

Return the JSON object only.`;
