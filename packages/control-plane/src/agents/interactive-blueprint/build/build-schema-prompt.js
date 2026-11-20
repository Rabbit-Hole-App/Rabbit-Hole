// Brief 45, step 3: the build-schema field by field, with every limit (spec section 10). Hand-written prose; every number is read from the reference schema
// (docs/features/interact/interactive-build-schema.schema.json, the file the response schema is made from), so the prompt and the schema cannot drift. No subject word, no example scene.
import schema from '../../../../../../docs/features/interact/interactive-build-schema.schema.json' with { type: 'json' };

const P = schema.properties, pictures = P.pictures.properties, [PARTS, KIND] = pictures.main.oneOf.map(entry => entry.properties), T = P.texts.properties, E = T.explanation.properties;
const list = values => values.map(value => `"${value}"`).join(', ');
const lengths = (spec, what = 'characters') => `at most ${spec.maxLength} ${what}`;
const items = spec => `at most ${spec.maxItems}`;
const range = spec => `from ${spec.minimum} to ${spec.maximum}`;

export const BUILD_SCHEMA_PROMPT = `## The build-schema you return

Return one JSON object with exactly these fields, in this order: version, layout, pictures, texts, time, changes. Nothing else.

version: the number ${P.version.const}.

layout: the id of the layout the card uses, one of ${list(P.layout.enum)}. The slot boxes follow from the layout; do not repeat them.

pictures: { main, panel }. main is the first picture and panel the second; panel is null when the lesson has one picture. A picture is one of two types, named by its type field.

A picture of type "parts" draws parts in the lesson's own units. It is { type, mapping, fixedParts, labels, arrows, dropped }:
- mapping: { pxPerUnit, originPx }. pxPerUnit is a number above 0; originPx is [x, y] in pixels. Mapping is in scene pixels, y down: x_px = originPx[0] + x*pxPerUnit, y_px = originPx[1] - y*pxPerUnit. Every part whose position comes from the lesson's math (a coordinate that is the id of a computed number) is placed through this mapping at every frame, so choose it so that the whole reach of the parts, given in the measurements, lies inside the picture's box with room to spare.
- fixedParts: ${items(PARTS.fixedParts)} parts whose coordinates the lesson typed, each { id, from, to, at, size }: the part's id as in the lesson, and the coordinate fields that part has, each an [x, y] pair still in the lesson's units (kept, or moved when it helps). A coordinate that is the id of a computed number stays that id. size, for a dot, is "small", "medium", "large" or the id of a computed number. You never give a pixel position.
- labels: ${items(PARTS.labels)} entries, each { id, near, side, text }: id is the label's id; near is the id of the part it is near (a part that is not a label); side is where the text goes on that part, one of ${list(PARTS.labels.items.properties.side.enum)}; text is the text as shown, ${lengths(PARTS.labels.items.properties.text)}, kept or shortened. A label has no position of its own: the program places the text on the side you chose.
- arrows: ${items(PARTS.arrows)} entries, each { id, lengthFactor, startAtEdge }: lengthFactor is a number above 0 and at most ${PARTS.arrows.items.properties.lengthFactor.maximum}, relative to the lesson: 1 draws the arrow as the lesson computes it, 0.5 half of it. startAtEdge, when true, starts an arrow that begins at a dot at that dot's edge instead of its centre.
- dropped: ${items(PARTS.dropped)} entries, each { id, why }: a part or label you leave out, and the reason, ${lengths(PARTS.dropped.items.properties.why)}.

A picture of type "kind" is drawn by the renderer from a description, and you decide only its texts. It is { type, kind, parts, texts, ranges }:
- kind: the name of the kind the lesson names, ${lengths(KIND.kind)}.
- parts: { title, legend }; each may be left out. title is true or false: whether the picture shows its title. legend is one of ${list(KIND.parts.properties.legend.enum)}.
- texts: { title, labels }; each may be left out. title is the title as shown, ${lengths(KIND.texts.properties.title)}. labels is ${items(KIND.texts.properties.labels)} texts, in the lesson's order, as shown: the labels of its lines, bars or other named items, each ${lengths(KIND.texts.properties.labels.items)}.
- ranges: { x, y, value }; each may be left out. Each is [min, max], two numbers: the range the picture is drawn over on that axis.

texts: { arrangement, values, formula, explanation }.
- arrangement: "rows" or "columns", as the layout offers them.
- values: ${items(T.values)} entries, each { id, label, decimals }: id is the id of the lesson's value; the lesson's order is kept; include at most what fits. label is the label as shown, ${lengths(T.values.items.properties.label)}. decimals is a whole number ${range(T.values.items.properties.decimals)}; it may be left out.
- formula: the formula as shown, ${lengths(T.formula.anyOf[0])}, or null when it does not fit.
- explanation: { always, cases, otherwise }. always is ${items(E.always)} lines, each ${lengths(E.always.items)}; cases is ${items(E.cases)} entries, each { when, text }, where when is the id of the lesson's true-or-false number that selects the line and text is ${lengths(E.cases.items.properties.text)}; otherwise, when the lesson has one, is a line of ${lengths(E.otherwise)}. Lines are as shown, shortened where needed.

time: { duration } for a scene that plays for a time, from ${P.time.properties.duration.minimum} to ${P.time.properties.duration.maximum} seconds; or { count } for a scene in steps, a whole number from ${P.time.properties.count.minimum} to ${P.time.properties.count.maximum}. Keep the lesson's, or shorten it when a graph line turns too often. The controls themselves are never changed and are not repeated here.

changes: ${items(P.changes)} sentences, each ${lengths(P.changes.items)}: everything you changed from the lesson, and why. An empty list when you changed nothing.

### What you may and may not do

You return decisions about placement and fit only. You never return a pixel position of a computed part (the program computes it from the mapping at every frame), a slot box, or program code. You may change: the layout, the mapping, a fixed position in units, a label's side or text, an arrow's length factor, a text (shortened), a label or decoration (dropped), a graph's title or legend, and the duration. You never change the math function, the controls' ranges, the claims or the meaning of the lesson.`;
