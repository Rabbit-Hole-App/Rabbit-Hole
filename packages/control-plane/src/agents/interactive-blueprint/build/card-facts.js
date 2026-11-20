// Brief 45, step 1: card-facts, the part of the Build model's system prompt that says what the card is (spec section 5.1 without the kinds). Rendered from the config the code itself reads
// (packages/web/src/interact-card.config.json, spec 8.1) with fixed sentence templates; never written by hand and not committed as text. The frame rules are read from explain-program/frame-overlap.js
// (the shared Program runtime: read, not moved). No subject word anywhere; the layouts' useWhen / notWhen / examples texts are not sent.
import config from '../../../../../web/src/interact-card.config.json' with { type: 'json' };
import { HEAD_HALF_WIDTH, HEAD_LENGTH, LABEL_CLEARANCE, MARK_LENGTH } from '../../../../../web/src/explain-program/frame-overlap.js';
import { BODY_MIN } from '../../../../../web/src/explain-program/contract.js';

// accepted exception (owner 2026-11-19): copied from tutor-diagrams/primitives.js plainWidth, which is not exported; not in the config.
const WIDTH_NARROW = 0.38, WIDTH_WIDE = 0.94, WIDTH_OTHER = 0.68, WIDTH_SCRIPT = 1.03; // times the text size, per character (plainWidth also has a fourth class: code points above U+02FF)
const NARROW_CHARS = "space . , : ; ! i l I ' | and the typographic apostrophe", WIDE_CHARS = 'M W @ % & # m w';
const box = ([x, y, w, h]) => `[${x}, ${y}, ${w}, ${h}]`;
const SLOTS = ['stage', 'panel', 'values', 'formula', 'note'];

export function cardFacts() {
  const { scene, layouts, text, boxes, parts, controls } = config, { grid } = scene, columns = boxes.columns, lines = [];
  lines.push(
    '## The card',
    '',
    `The scene is ${scene.width} x ${scene.height} px with ${scene.padding} px of padding, on a grid of ${grid.columns} columns x ${grid.rows} rows: a cell is ${grid.columnWidth} x ${grid.rowHeight} px and a slot is inset ${grid.inset} px inside its cells. Every box below is [x, y, w, h] in scene pixels, x to the right and y down from the scene's top left corner.`,
    `The card's own Reset button is ${scene.reset.button[2]} x ${scene.reset.button[3]} px at (${scene.reset.button[0]}, ${scene.reset.button[1]}), in the cell ${box(scene.reset.cell)}; whatever covers that cell keeps it clear.`,
    '',
    '### The six layouts',
    '',
    'Choosing a layout is your decision. A slot a layout does not list is not there: a layout with no panel slot has room for one picture only.',
  );
  for (const [id, slots] of Object.entries(layouts)) lines.push(`- Layout ${id}: ${SLOTS.filter(name => slots[name]).map(name => `${name} ${box(slots[name])}`).join(', ')}.`);
  lines.push(
    '',
    '### Text',
    '',
    `Every text on the card is drawn at ${text.bodySize} px. A character is ${WIDTH_NARROW} x the size wide when it is one of ${NARROW_CHARS}, ${WIDTH_WIDE} x the size when it is one of ${WIDE_CHARS}, ${WIDTH_SCRIPT} x the size when its code point is above U+02FF, and ${WIDTH_OTHER} x the size otherwise; a text is as wide as its characters together. A line of text is ${text.lineHeight} px apart from the next.`,
    'A text that does not fit its box is refused: it is never shrunk and never cut, so decide what to shorten.',
    '',
    '### Values, formula and explanation',
    '',
    `A card shows one to four values. A value is one box ${boxes.valueHeight} px tall with its own centred text "label: number unit" and a colour dot of ${boxes.valueDot.diameter} px with its centre ${boxes.valueDot.centreX} px from the box's left edge; the text room is the box's width less ${boxes.valueTextRoomLess} px. Values are shown in order of importance; when they do not all fit, the last ones are dropped.`,
    `The formula is one line and never wraps. The explanation is one to four lines, most important first; a line may name a state of the lesson.`,
    'The text area is arranged in one of two ways, and you choose:',
    `- Rows: the values divide the layout's values slot equally with ${boxes.valueGap} px between them, the formula is centred in the formula slot, and the explanation is one line in the note slot (room: the slot's width less ${2 * boxes.textClear} px). In layout tall the note slot takes up to three lines of its width and in layout tall-with-panel up to two; in every other layout one.`,
    `- Columns (layouts wide, side-by-side, equal-split and stacked only): the values stack in a column ${columns.valuesBox[1]} px wide at x ${columns.valuesBox[0]}, the formula stands at the top of a text column ${columns.textBox[1]} px wide at x ${columns.textBox[0]}, in a band ${columns.formulaBand} px tall, and the explanation is under it as bullets (each starts with "${columns.bullet}" and is as wide as its text plus the bullet, within the column's width less ${2 * boxes.textClear} px), ${columns.lineHeight} px apart. The text area is two rows tall (y ${columns.heights['2'].y}, ${columns.heights['2'].h} px high, at most two values) or three rows tall (y ${columns.heights['3'].y}, ${columns.heights['3'].h} px high, at most three values); three rows tall takes the last picture row from the pictures, which then end at row ${columns.heights['3'].lastPictureRow}.`,
    '',
    '### Drawn parts',
    '',
    `A dot is ${parts.dot.small} px across when small, ${parts.dot.medium} when medium and ${parts.dot.large} when large; a dot whose size is a number between 0 and 1 is drawn from ${parts.dot.outputRange[0]} to ${parts.dot.outputRange[1]} px across, in proportion. The marker dots the program draws on a graph are ${parts.dot.small} px.`,
    `An arrow head is ${HEAD_LENGTH} px long and ${HEAD_HALF_WIDTH} px either side of the arrow's axis. An arrow that starts at a dot's centre starts at the dot's edge plus ${parts.arrowDotGap} px. A trace is drawn through at most ${parts.tracePoints} points.`,
    'The widths of lines and traces are not stated.',
    '',
    '### The rules the finished frame must meet',
    '',
    '- Text may not overlap text, a circle, a box or an arrowhead; any shared area is refused.',
    '- An arrowhead may not overlap a circle.',
    `- A text is kept ${LABEL_CLEARANCE} px clear of a line or an arrow shaft; a stroke shorter than ${MARK_LENGTH} px is a mark, and a text only has to not touch it.`,
    `- A text never sits on a circle of ${BODY_MIN} px or more.`,
    `- Everything stays inside the ${scene.width} x ${scene.height} px frame.`,
    '',
    '### Controls',
    '',
    `The learner's controls are shown under the card, one full-width row each, at most ${controls.max}. A row of choice buttons may be ${controls.selectRow} px wide: each button is its text's width plus ${controls.buttonPad} px, with ${controls.gap} px between buttons.`,
  );
  return lines.join('\n');
}
