import { textWidth } from './tutor-diagrams/primitives.js';
import { TEACHING_TEXT } from './tutor-diagrams/teaching-theme.js';
import { LAYOUT_BODY_SIZE } from './scene-style.js';

// Brief 35: the /interactive scene layouts of docs/features/interact/layout.md (the spec; section numbers below are its). Data plus pure functions used when a card's program is built: no SDK change, no renderer
// change (tutor-diagrams/ is read, never edited; textWidth is its width model, imported only). A card that declares no layout never reaches this module.
// The six layouts, each box [x, y, w, h] in scene px exactly as the doc's section 5 JSON (the test derives every one again from the grid of section 1).
export const LAYOUTS = Object.freeze([
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
      "stage": {
        "cols": [
          1,
          12
        ],
        "rows": [
          1,
          8
        ],
        "box": [
          12.0,
          12.0,
          616.0,
          299.2
        ],
        "keepClear": "reset cell"
      },
      "values": {
        "cols": [
          1,
          12
        ],
        "rows": [
          9,
          9
        ],
        "box": [
          12.0,
          319.2,
          616.0,
          30.4
        ],
        "count": [
          1,
          4
        ],
        "split": "columns"
      },
      "formula": {
        "cols": [
          1,
          5
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          12.0,
          357.6,
          252.0,
          30.4
        ]
      },
      "note": {
        "cols": [
          6,
          12
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          272.0,
          357.6,
          356.0,
          30.4
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  },
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
      "stage": {
        "cols": [
          1,
          6
        ],
        "rows": [
          1,
          8
        ],
        "box": [
          12.0,
          12.0,
          304.0,
          299.2
        ]
      },
      "panel": {
        "cols": [
          7,
          12
        ],
        "rows": [
          1,
          8
        ],
        "box": [
          324.0,
          12.0,
          304.0,
          299.2
        ],
        "keepClear": "reset cell"
      },
      "values": {
        "cols": [
          1,
          12
        ],
        "rows": [
          9,
          9
        ],
        "box": [
          12.0,
          319.2,
          616.0,
          30.4
        ],
        "count": [
          1,
          4
        ],
        "split": "columns"
      },
      "formula": {
        "cols": [
          1,
          5
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          12.0,
          357.6,
          252.0,
          30.4
        ]
      },
      "note": {
        "cols": [
          6,
          12
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          272.0,
          357.6,
          356.0,
          30.4
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  },
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
      "stage": {
        "cols": [
          1,
          6
        ],
        "rows": [
          1,
          8
        ],
        "box": [
          12.0,
          12.0,
          304.0,
          299.2
        ]
      },
      "panel": {
        "cols": [
          7,
          12
        ],
        "rows": [
          1,
          8
        ],
        "box": [
          324.0,
          12.0,
          304.0,
          299.2
        ],
        "keepClear": "reset cell"
      },
      "values": {
        "cols": [
          1,
          12
        ],
        "rows": [
          9,
          9
        ],
        "box": [
          12.0,
          319.2,
          616.0,
          30.4
        ],
        "count": [
          1,
          4
        ],
        "split": "columns"
      },
      "formula": {
        "cols": [
          1,
          5
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          12.0,
          357.6,
          252.0,
          30.4
        ]
      },
      "note": {
        "cols": [
          6,
          12
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          272.0,
          357.6,
          356.0,
          30.4
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  },
  {
    "id": "stacked",
    "pictureCount": "two",
    "runs": "left-to-right",
    "panelRole": "aligned",
    "useWhen": "Two rows describe the same items in the same left-to-right order, so each item in the top row sits directly above its counterpart: tokens above their weights, scores above their probabilities, a signal above its smoothed version. The learner reads straight down from an item to its result.",
    "notWhen": "The two pictures do not share positions (use side-by-side or equal-split). Either picture needs height, such as a tree or a full chart (each picture is only 152 px tall here).",
    "examples": [
      "a token row above its attention weights",
      "scores above their softmax probabilities",
      "a signal above its moving average"
    ],
    "slots": {
      "stage": {
        "cols": [
          1,
          12
        ],
        "rows": [
          1,
          4
        ],
        "box": [
          12.0,
          12.0,
          616.0,
          145.6
        ],
        "keepClear": "reset cell"
      },
      "panel": {
        "cols": [
          1,
          12
        ],
        "rows": [
          5,
          8
        ],
        "box": [
          12.0,
          165.6,
          616.0,
          145.6
        ]
      },
      "values": {
        "cols": [
          1,
          12
        ],
        "rows": [
          9,
          9
        ],
        "box": [
          12.0,
          319.2,
          616.0,
          30.4
        ],
        "count": [
          1,
          4
        ],
        "split": "columns"
      },
      "formula": {
        "cols": [
          1,
          5
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          12.0,
          357.6,
          252.0,
          30.4
        ]
      },
      "note": {
        "cols": [
          6,
          12
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          272.0,
          357.6,
          356.0,
          30.4
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  },
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
      "stage": {
        "cols": [
          1,
          7
        ],
        "rows": [
          1,
          10
        ],
        "box": [
          12.0,
          12.0,
          356.0,
          376.0
        ]
      },
      "values": {
        "cols": [
          8,
          12
        ],
        "rows": [
          1,
          4
        ],
        "box": [
          376.0,
          12.0,
          252.0,
          145.6
        ],
        "count": [
          1,
          4
        ],
        "split": "rows",
        "keepClear": "reset cell"
      },
      "formula": {
        "cols": [
          8,
          12
        ],
        "rows": [
          5,
          7
        ],
        "box": [
          376.0,
          165.6,
          252.0,
          107.2
        ]
      },
      "note": {
        "cols": [
          8,
          12
        ],
        "rows": [
          8,
          10
        ],
        "box": [
          376.0,
          280.8,
          252.0,
          107.2
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  },
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
      "stage": {
        "cols": [
          1,
          6
        ],
        "rows": [
          1,
          10
        ],
        "box": [
          12.0,
          12.0,
          304.0,
          376.0
        ]
      },
      "panel": {
        "cols": [
          7,
          12
        ],
        "rows": [
          1,
          6
        ],
        "box": [
          324.0,
          12.0,
          304.0,
          222.4
        ],
        "keepClear": "reset cell"
      },
      "values": {
        "cols": [
          7,
          12
        ],
        "rows": [
          7,
          8
        ],
        "box": [
          324.0,
          242.4,
          304.0,
          68.8
        ],
        "count": [
          1,
          4
        ],
        "split": "columns",
        "splitAtFour": "2x2"
      },
      "formula": {
        "cols": [
          7,
          12
        ],
        "rows": [
          9,
          9
        ],
        "box": [
          324.0,
          319.2,
          304.0,
          30.4
        ]
      },
      "note": {
        "cols": [
          7,
          12
        ],
        "rows": [
          10,
          10
        ],
        "box": [
          324.0,
          357.6,
          304.0,
          30.4
        ]
      },
      "reset": {
        "cols": [
          12,
          12
        ],
        "rows": [
          1,
          1
        ],
        "box": [
          604,
          12,
          24,
          24
        ]
      }
    }
  }
].map(layout => Object.freeze(layout)));

export const SCENE = Object.freeze({ width: 640, height: 400 });
// The reset cell (column 12, row 1): whatever slot covers it keeps it clear.
export const RESET_CELL = Object.freeze([580, 8, 52, 38.4]);
// Amendment H: the grid sits inside an 8 px padding (624 x 384 at 640 x 400): a column is 52 px, a row 38.4 px; every slot is 12 px from the scene's edge and 8 px from its neighbour.
export const GRID = Object.freeze({ columns: 12, rows: 10, padding: 8, columnWidth: 52, rowHeight: 38.4, inset: 4, valueGap: 8, textClear: 8, resetClearRight: 576 });
// The sizes a frame text object draws on a card with a layout (amendment G): the SDK gives a text object no typography, so every text is the body style, 14 px there (scene-style.js LAYOUT_BODY_SIZE). The doc's own sizes (section 2: label 13, number 17,
// formula 14, note 13) stay available as DOC_TEXT_SIZES for a renderer that can draw them; a card checks its text at the size it is drawn at.
export const DRAWN_TEXT_SIZES = Object.freeze({ value: LAYOUT_BODY_SIZE, formula: LAYOUT_BODY_SIZE, note: LAYOUT_BODY_SIZE });
export const DOC_TEXT_SIZES = Object.freeze({ label: TEACHING_TEXT.caption.size, number: TEACHING_TEXT.display.size, formula: TEACHING_TEXT.equation.size, note: TEACHING_TEXT.caption.size });

export class LayoutError extends Error {
  constructor(code, message, path = []) { super(message); this.name = 'LayoutError'; this.code = code; this.path = path; }
}

export const layoutById = id => LAYOUTS.find(layout => layout.id === id) ?? null;

// Section 4: the code's map from the three answers to one layout (12 rows).
const PICK = Object.freeze([
  ['one', 'left-to-right', 'none', 'wide'], ['one', 'compact', 'none', 'wide'],
  ['two', 'compact', 'records-main', 'side-by-side'], ['two', 'left-to-right', 'records-main', 'side-by-side'],
  ['two', 'compact', 'equal', 'equal-split'], ['two', 'left-to-right', 'equal', 'equal-split'],
  ['two', 'left-to-right', 'aligned', 'stacked'], ['two', 'compact', 'aligned', 'stacked'],
  ['one', 'top-to-bottom', 'none', 'tall'],
  ['two', 'top-to-bottom', 'records-main', 'tall-with-panel'],
  ['two', 'top-to-bottom', 'equal', 'equal-split'], ['two', 'top-to-bottom', 'aligned', 'equal-split'], // fallbacks: each half is too narrow when tall
]);

// hasPanel: whether the card declares a panel picture (undefined: not known here, only the answers are checked). Refused: "one" with a panelRole other than none or with a panel; "two" with none or with no panel.
export function pickLayout({ pictureCount, runs, panelRole }, { hasPanel } = {}) {
  if (pictureCount === 'one' && (panelRole !== 'none' || hasPanel === true)) throw new LayoutError('layout_contradiction', 'pictureCount "one" has no panel: panelRole is "none" and no panel is declared', ['layout', 'panelRole']);
  if (pictureCount === 'two' && (panelRole === 'none' || hasPanel === false)) throw new LayoutError('layout_contradiction', 'pictureCount "two" needs a panel: panelRole is not "none" and a panel is declared', ['layout', 'panelRole']);
  const row = PICK.find(([count, direction, role]) => count === pictureCount && direction === runs && role === panelRole);
  if (!row) throw new LayoutError('layout_unpicked', `no layout for ${pictureCount} / ${runs} / ${panelRole}`, ['layout']);
  return row[3];
}

// Section 2, the values section: 1 to 4 values divide the section's box equally with 8 px between them. A box is [x, y, w, h]; stacked (h of 64 or more) puts the label above the number, else one line with the
// number at the right. maxRight: where the text must end (the box's right less 8, and left of the reset cell in layout 5's top value).
const cut = (start, length, count) => { const size = (length - GRID.valueGap * (count - 1)) / count; return Array.from({ length: count }, (_, i) => [Math.round((start + i * (size + GRID.valueGap)) * 100) / 100, Math.round(size * 100) / 100]); };
export function valueBoxes(layoutId, count) {
  const layout = layoutById(layoutId);
  if (!layout) throw new LayoutError('layout_unknown', `no layout "${layoutId}"`, ['layout']);
  const { box, count: [min, max], split, splitAtFour } = layout.slots.values;
  if (!Number.isInteger(count) || count < min || count > max) throw new LayoutError('values_count', `a card shows ${min} to ${max} values, not ${count}`, ['values']);
  const [x, y, w, h] = box;
  let boxes;
  if (splitAtFour === '2x2' && count === 4) {
    const columns = cut(x, w, 2), rows = cut(y, h, 2);
    boxes = rows.flatMap(([ry, rh]) => columns.map(([cx, cw]) => [cx, ry, cw, rh]));
  } else if (split === 'rows') boxes = cut(y, h, count).map(([ry, rh]) => [x, ry, w, rh]);
  else boxes = cut(x, w, count).map(([cx, cw]) => [cx, y, cw, h]);
  return boxes.map(([bx, by, bw, bh], i) => ({ box: [bx, by, bw, bh], stacked: bh >= 64, maxRight: layoutId === 'tall' && i === 0 ? Math.min(bx + bw - GRID.textClear, GRID.resetClearRight) : bx + bw - GRID.textClear }));
}

// A value's role colour is a small dot inside its box (amendment D): 10 px across, its centre 14 px from the box's left edge, vertically centred. The box's own text is centred, so it keeps 6 px clear of the dot on
// both sides to stay centred: the text may be at most the box width less 2 x (14 + 5 + 6) = 50 px wide.
export const VALUE_DOT = Object.freeze({ diameter: 10, centreX: 14, textClear: 6 });
const dotSide = VALUE_DOT.centreX + VALUE_DOT.diameter / 2 + VALUE_DOT.textClear;

// Section 2, text (amendments C and D): a value is ONE box with its own centred text "Label: value unit"; the whole text must fit the box width less the dot's room on each side (and, in layout 5, the top value stays
// left of the reset cell). When the values do not all fit, the last one is dropped and the box divided again, so the order of the list is the order of importance. values: [{ text }]. Returns { values, boxes, dropped }.
export function fitValues(layoutId, values, sizes = DRAWN_TEXT_SIZES) {
  for (let count = Math.min(values.length, layoutById(layoutId)?.slots.values.count[1] ?? 0); count >= 1; count--) {
    const boxes = valueBoxes(layoutId, count);
    const fits = values.slice(0, count).every(({ text }, i) => { const { box: [bx, , bw], maxRight } = boxes[i]; return textWidth(text, sizes.value) <= Math.min(bw - 2 * dotSide, 2 * (maxRight - (bx + bw / 2))); });
    if (fits) return { values: values.slice(0, count), boxes, dropped: values.length - count };
  }
  throw new LayoutError('values_none', 'not even one value fits its box', ['values']);
}

// Formula and note: a text that does not fit its box is refused when the card is built; never shrunk, never cut. Layout 5's note may take up to three lines of the box's width (words wrap).
export function textLines(text, size, room) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) { const next = line ? `${line} ${word}` : word; if (line && textWidth(next, size) > room) { lines.push(line); line = word; } else line = next; }
  return [...lines, line];
}
export function checkText(layoutId, { formula, note }, sizes = DRAWN_TEXT_SIZES) {
  const layout = layoutById(layoutId);
  if (!layout) throw new LayoutError('layout_unknown', `no layout "${layoutId}"`, ['layout']);
  const room = slot => layout.slots[slot].box[2] - 2 * GRID.textClear, report = {};
  for (const [slot, text, size] of [['formula', formula, sizes.formula], ['note', note, sizes.note]]) {
    // brief 36: a formula is one math run and never wraps, so it is one line measured whole (cutting it at its spaces measures halves of a TeX string, which is not what is drawn)
    const maxLines = slot !== 'note' ? 1 : layoutId === 'tall' ? 3 : layoutId === 'tall-with-panel' ? 2 : 1, lines = slot === 'formula' ? [text] : textLines(text, size, room(slot));
    const widest = Math.max(...lines.map(line => textWidth(line, size)));
    if (lines.length > maxLines || widest > room(slot)) throw new LayoutError('text_too_wide', `the ${slot} "${text}" needs ${Math.round(widest)} px on ${lines.length} line(s); its box allows ${maxLines} line(s) of ${room(slot)} px`, [slot]);
    report[slot] = { lines, width: Math.round(textWidth(text, size) * 100) / 100, room: room(slot) };
  }
  return report;
}

// A box that lies inside a layout's panel and keeps the reset cell clear (amendment A: the plot figure is drawn in such a box).
export function panelBoxOk(layoutId, [x, y, w, h]) {
  const panel = layoutById(layoutId)?.slots.panel?.box;
  if (!panel) return false;
  const [px, py, pw, ph] = panel, [rx, ry, rw, rh] = RESET_CELL;
  return x >= px && y >= py && x + w <= px + pw && y + h <= py + ph && (x + w <= rx || x >= rx + rw || y + h <= ry || y >= ry + rh);
}

// Section 7 point 5: the panel's picture is measured at build time (its natural size from the renderer, read only) and drawn at the width where its height fits the panel box. The frame's scale for a diagram is
// min(1, w / natural width, (frame height - y) / natural height), so the width alone sets it. clearRight: the picture keeps left of this x (the reset cell). Centred in what is left of the box.
// amendment F: align 'left' puts the picture at the box's left edge instead of centring it.
export function fitPanel(natural, box, { clearRight = Infinity, align = 'centre' } = {}) {
  const [bx, by, bw, bh] = box, room = Math.min(bw, clearRight - bx);
  const w = Math.floor(Math.min(natural.width, room, natural.width * bh / natural.height) * 100) / 100, h = natural.height * w / natural.width;
  return { x: Math.round((bx + (align === 'left' ? 0 : (room - w) / 2)) * 100) / 100, y: Math.round((by + (bh - h) / 2) * 100) / 100, w, drawn: { w, h: Math.round(h * 100) / 100 } };
}

// Brief 36: how the layout's picture is drawn. The picture lives in the panel slot when the layout has one, else in the stage slot; it is asked of the written renderer with exactly that slot's box, every text
// size at the layout's body size, and the `parts` the card's answers name. The host (FrameFigures.jsx DiagramFigure) and the build (interact-templates/pendulum.js, the bake script) both call this, so they
// ask the same thing. at: where the picture's top left lands in the scene; options: renderTutorDiagram's third argument.
// Brief 37: height: the picture's box height the layout module chose for this card (a three-rows-tall text area takes the last picture row, arrangeText); absent, the slot's own.
export function figureOptions(answers, { height: chosen } = {}) {
  const id = pickLayout(answers, { hasPanel: answers.pictureCount === 'two' }), slots = layoutById(id).slots, slot = slots.panel ?? slots.stage, [x, y, width, slotHeight] = slot.box, size = LAYOUT_BODY_SIZE, height = chosen ?? slotHeight;
  return { layout: id, slot: slots.panel ? 'panel' : 'stage', at: [x, y], options: { box: { width, height }, sizes: { title: size, heading: size, body: size, small: size }, parts: { ...(answers.figureParts ?? {}) } } };
}

// Brief 37: a value's dot colour by rule. A value names what it measures (`of`). For a shape the program draws, the dot takes that shape's role (the card passes its shapes: { pendulumA: 'input', ... }); for a part
// of an /explain picture, one table per kind, here: token-links draws the picked word with its process fill (blue: the frame role input) and the word attended to most with its outcome fill (teal: output).
export const PICTURE_PART_ROLES = Object.freeze({ 'token-links': Object.freeze({ picked: 'input', attended: 'output' }) });
export function roleOf(of, { shapes = {}, kind = null } = {}) {
  const role = shapes[of] ?? PICTURE_PART_ROLES[kind]?.[of];
  if (!role) throw new LayoutError('value_of_unknown', `a value of "${of}" names no shape of the card and no part of ${kind ?? 'a picture'}`, ['values']);
  return role;
}

// ---- Brief 37: the text area, arranged by rule (layouts 1 to 4) ---------------------------------------------------------------------------------------------------------------------------------
// A card supplies content only: its values (in order of importance), its formula and its explanation (one to four lines, most important first; a line may carry the current values). The layout module chooses the
// arrangement and every box. ROWS (as built before): the explanation is one line that fits the note box. COLUMNS: anything else; the values stack in columns 1 to 4, the formula stands at the top of columns 6 to 12 (column 5 stays empty between the values and the text)
// and the explanation under it as bullets. Two rows tall when the card has at most two values and its explanation fits two lines; three rows tall when it needs more and every picture still fits; else two rows.
// What gives way when it does not all fit: first the last explanation line, then the last value. Never shrunk text, never overlap; a line wider than its room is refused.
export const COLUMNS = Object.freeze({
  valuesBox: [12, 200], textBox: [272, 356], formulaBand: 28, lineHeight: 17.5, bullet: '• ', textClear: 8,
  heights: Object.freeze({ 2: Object.freeze({ y: 319.2, h: 68.8, lastPictureRow: 8 }), 3: Object.freeze({ y: 280.8, h: 107.2, lastPictureRow: 7 }) }),
});
const TEXT_LAYOUTS = Object.freeze(['wide', 'side-by-side', 'equal-split', 'stacked']);
const NOTE_TWO_LINES_PX = 38; // two lines of the body size (17.5 px apart) and their padding; the formula's centred band ends 1.6 px above a 30.4 px note row, so a 38 px box stays clear of it
const r2 = value => Math.round(value * 100) / 100;
const gridBox = ([c0, c1], [r0, r1]) => [r2(GRID.padding + (c0 - 1) * GRID.columnWidth + GRID.inset), r2(GRID.padding + (r0 - 1) * GRID.rowHeight + GRID.inset), r2((c1 - c0 + 1) * GRID.columnWidth - 2 * GRID.inset), r2((r1 - r0 + 1) * GRID.rowHeight - 2 * GRID.inset)];
// The pictures' boxes: a slot that ends at row 8 ends at row 7 when the text area is three rows tall.
const pictureBoxes = (layout, rowsTall) => Object.fromEntries(['stage', 'panel'].filter(name => layout.slots[name]).map(name => {
  const { cols, rows, box } = layout.slots[name];
  return [name, rows[1] === 8 && rowsTall === 3 ? gridBox(cols, [rows[0], COLUMNS.heights[3].lastPictureRow]) : box];
}));

// variants: one entry per state the card can show: { values: [{ text }], explanation: [line] } (the texts at that state; every variant has the same number of values and lines). formula: TeX.
// pictureMins: { stage?: height, panel?: height }, the least height each picture can be drawn at (a renderer min.height, or a program-drawn stage's own stated minimum).
// -> { layout, arrangement: 'rows' | 'columns', rowsTall (null for rows), pictures: { stage, panel? }, values: { count, boxes: [[x, y, w, h]], dots: [[cx, cy, d]] }, formula: { at: [x, y], align },
//      explanation: { kind: 'box', box } | { kind: 'lines', x, ys: [centre y of each line] }, dropped: { explanationLines, values } }
export function arrangeText(layoutId, { variants, formula, pictureMins = {} }, sizes = DRAWN_TEXT_SIZES) {
  const layout = layoutById(layoutId);
  if (!layout) throw new LayoutError('layout_unknown', `no layout "${layoutId}"`, ['layout']);
  if (!variants?.length) throw new LayoutError('explanation_missing', 'a card supplies at least one state with its values and explanation', ['explanation']);
  const valueCount = variants[0].values.length, lineCount = variants[0].explanation.length;
  if (variants.some(variant => variant.values.length !== valueCount || variant.explanation.length !== lineCount)) throw new LayoutError('variants_differ', 'every state of a card has the same number of values and explanation lines', ['explanation']);
  if (lineCount < 1 || lineCount > 4) throw new LayoutError('explanation_lines', `an explanation is one to four lines, not ${lineCount}`, ['explanation']);
  const noteRoom = layout.slots.note.box[2] - 2 * GRID.textClear, lineRoom = COLUMNS.textBox[1] - 2 * COLUMNS.textClear;
  const widest = lines => Math.max(...lines.map(line => textWidth(line, sizes.note)));
  // ROWS: the old arrangement, as built (and the only one for layouts 5 and 6).
  const oneLine = lineCount === 1 && variants.every(variant => widest(variant.explanation) <= noteRoom);
  if (oneLine || !TEXT_LAYOUTS.includes(layoutId)) {
    if (lineCount !== 1) throw new LayoutError('explanation_lines', `layout ${layoutId} takes one explanation line, not ${lineCount}`, ['explanation']);
    for (const variant of variants) checkText(layoutId, { formula: `$${formula}$`, note: variant.explanation[0] }, sizes);
    const count = Math.min(...variants.map(variant => fitValues(layoutId, variant.values, sizes).values.length)), boxes = valueBoxes(layoutId, count);
    const centred = ([x, y, w, h]) => [x, r2(y + (h - 28) / 2), w, 28];
    // brief 44: a one-line explanation wider than the note box is given two lines (the box grows upward over the formula's free strip, 8 px clear of the formula's band) instead of a refusal; a layout whose note already takes three lines is unchanged
    const twoLines = layoutId !== 'tall' && variants.some(variant => textLines(variant.explanation[0], sizes.note, noteRoom).length > 1), grown = ([x, y, w, h]) => [x, r2(y + h - NOTE_TWO_LINES_PX), w, NOTE_TWO_LINES_PX];
    const [fx, fy, fw, fh] = layout.slots.formula.box;
    return {
      layout: layoutId, arrangement: 'rows', rowsTall: null, pictures: Object.fromEntries(['stage', 'panel'].filter(name => layout.slots[name]).map(name => [name, layout.slots[name].box])),
      values: { count, boxes: boxes.map(entry => centred(entry.box)), dots: boxes.map(({ box: [x, y, , h] }) => [x + VALUE_DOT.centreX, r2(y + h / 2), VALUE_DOT.diameter]) },
      formula: { at: [fx + fw / 2, fy + fh / 2], align: 'middle' }, explanation: { kind: 'box', box: twoLines ? grown(layout.slots.note.box) : centred(layout.slots.note.box) }, dropped: { explanationLines: 0, values: valueCount - count },
    };
  }
  // COLUMNS
  const formulaWidth = textWidth(`$${formula}$`, sizes.formula);
  if (formulaWidth > lineRoom) throw new LayoutError('text_too_wide', `the formula needs ${Math.round(formulaWidth)} px; its box allows ${lineRoom} px`, ['formula']);
  for (const variant of variants) for (const line of variant.explanation) {
    const width = textWidth(COLUMNS.bullet + line, sizes.note);
    if (width > lineRoom) throw new LayoutError('text_too_wide', `the explanation line "${line}" needs ${Math.round(width)} px; its box allows ${lineRoom} px`, ['explanation']);
  }
  const capacity = tall => ({ values: tall === 2 ? 2 : 3, lines: Math.floor((COLUMNS.heights[tall].h - COLUMNS.formulaBand) / COLUMNS.lineHeight) });
  const picturesFit = Object.entries(pictureMins).every(([name, min]) => !layout.slots[name] || min <= pictureBoxes(layout, 3)[name][3]);
  const rowsTall = valueCount <= 2 && lineCount <= capacity(2).lines ? 2 : picturesFit ? 3 : 2, { values: valueCap, lines: lineCap } = capacity(rowsTall), area = COLUMNS.heights[rowsTall];
  const lines = Math.min(lineCount, lineCap), valueRoom = COLUMNS.valuesBox[1] - 2 * dotSide;
  let count = Math.min(valueCount, valueCap);
  while (count > 0 && !variants.every(variant => variant.values.slice(0, count).every(({ text }) => textWidth(text, sizes.value) <= valueRoom))) count--;
  if (count < 1) throw new LayoutError('values_none', 'not even one value fits its box', ['values']);
  const slot = (area.h - GRID.valueGap * (count - 1)) / count;
  const boxes = Array.from({ length: count }, (_, i) => { const top = area.y + i * (slot + GRID.valueGap); return { box: [COLUMNS.valuesBox[0], r2(top + (slot - 28) / 2), COLUMNS.valuesBox[1], 28], dot: [COLUMNS.valuesBox[0] + VALUE_DOT.centreX, r2(top + slot / 2), VALUE_DOT.diameter] }; });
  const left = COLUMNS.textBox[0] + COLUMNS.textClear, below = area.y + COLUMNS.formulaBand;
  return {
    layout: layoutId, arrangement: 'columns', rowsTall, pictures: pictureBoxes(layout, rowsTall),
    values: { count, boxes: boxes.map(entry => entry.box), dots: boxes.map(entry => entry.dot) },
    formula: { at: [left, r2(area.y + COLUMNS.formulaBand / 2)], align: 'start' },
    explanation: { kind: 'lines', x: left, ys: Array.from({ length: lines }, (_, i) => r2(below + COLUMNS.lineHeight * (i + 0.5))) },
    dropped: { explanationLines: lineCount - lines, values: valueCount - count },
  };
}
