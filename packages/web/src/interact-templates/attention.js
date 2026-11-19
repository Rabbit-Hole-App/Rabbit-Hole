import { z } from 'zod';
import { DRAWN_TEXT_SIZES, LayoutError, VALUE_DOT, checkText, figureOptions, fitValues, layoutById, pickLayout, valueBoxes } from '../interact-layout.js';
import { layoutAnswers as answers } from '../interact-layout-answers.js';

// Brief 36: the "How does a word attend to the others?" card, on the wide scene layout. One /explain token-links diagram (sdk.diagram) in the stage box, drawn by the host with the layout's options
// (interact-layout.js figureOptions: the stage box, every text 14 px, no title and no caption); a step control picks the query word. The weights are a fixed 6 x 6 table in the card's data (each row sums to 1;
// illustrative, not from a model). The ring round the picked word and the dot on the target with the largest weight are frame objects placed from the token boxes the renderer returned for this diagram
// (scripts/interact/bake-attention-geometry.mjs; the same at every pick, which the bake checks). The values, the formula and the note stand in the layout's boxes like the pendulum card's.
// ponytail: one sentence, one head, one table; no softmax is computed in the program (the table is the data).
const text = max => z.string().min(1).max(max);
const token = z.object({ index: z.number().int().min(0).max(5), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict();
const rowSums = rows => rows.every(row => Math.abs(row.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9 && row.filter(weight => weight === Math.max(...row)).length === 1);
export const attentionSchema = z.object({
  title: text(60), start: z.number().int().min(0).max(5), words: z.array(text(12)).length(6),
  weights: z.array(z.array(z.number().min(0).max(1)).length(6)).length(6).refine(rowSums, 'every row sums to 1 and has one largest weight'),
  layout: answers,
  values: z.array(z.object({ quantity: z.enum(['word', 'target', 'weight']), label: text(16), role: text(16) }).strict()).min(1).max(4),
  formula: text(60), note: text(60), // note: "{word}" and "{target}" stand for the picked word and the word it looks most at
  // Brief 36: what the renderer returned for this diagram in the stage box (bake-attention-geometry.mjs): the least size it can be drawn at and the token boxes in the picture's own coordinates.
  geometry: z.object({ min: z.object({ width: z.number(), height: z.number() }).strict(), sources: z.array(token).length(6), targets: z.array(token).length(6) }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

const largest = row => row.reduce((best, weight, k) => (weight > row[best] ? k : best), 0);
const shownOf = (data, i) => { const row = data.weights[i], j = largest(row); return { word: data.words[i], target: data.words[j], weight: row[j].toFixed(2) }; };

// Everything the layout decides, once, when the program is built: the boxes, where each value stands, and the checks: the plot's least size against the stage box, and every text at every pick against its box.
function place(data) {
  const id = pickLayout(data.layout, { hasPanel: false }), layout = layoutById(id), size = DRAWN_TEXT_SIZES, figure = figureOptions(data.layout), { box } = figure.options, { min } = data.geometry;
  if (min.width > box.width || min.height > box.height) throw new LayoutError('figure_too_big', `the diagram needs at least ${min.width} x ${min.height} px; the ${figure.slot} box is ${box.width} x ${box.height} px`, ['geometry']);
  // The layout's rule for the values (interact-layout.js fitValues): when they do not all fit, the last is dropped and the boxes divided again. The picked word changes the texts, so the count that fits at every
  // pick is the least of the six; the boxes are then the same at every pick. The formula and the note are checked at every pick too (a text that does not fit is refused).
  const shown = data.words.map((_, i) => shownOf(data, i)), textsOf = (i, count) => data.values.slice(0, count).map(entry => ({ text: `${entry.label}: ${shown[i][entry.quantity]}` }));
  const count = Math.min(...data.words.map((_, i) => fitValues(id, textsOf(i, data.values.length), size).values.length)), boxes = valueBoxes(id, count);
  shown.forEach(one => checkText(id, { formula: `$${data.formula}$`, note: data.note.replace('{word}', one.word).replace('{target}', one.target) }, size));
  return {
    layout: id, figure: { at: figure.at, w: box.width },
    values: boxes.map(({ box: [x, y, w, h] }, i) => ({ ...data.values[i], box: [x, y + (h - 28) / 2, w, 28], dot: [x + VALUE_DOT.centreX, y + h / 2, VALUE_DOT.diameter] })),
    formulaAt: ((x, y, w, h) => [x + w / 2, y + h / 2])(...layout.slots.formula.box), noteBox: ((x, y, w, h) => [x, y + (h - 28) / 2, w, 28])(...layout.slots.note.box),
  };
}

export function source(ctx) {
  const data = ctx.geometry?.attention;
  if (!data) { const e = new Error('attention requires its validated data'); e.code = 'part_binding'; e.path = 'geometry.attention'; throw e; }
  let placed;
  try { placed = place(data); } catch (error) { if (error.name === 'LayoutError') { const e = new Error(error.message); e.code = error.code; e.path = error.path.join('.'); throw e; } throw error; }
  return `const T=${JSON.stringify(data)},L=${JSON.stringify(placed)};
const largest=${largest.toString()};
export function evaluate({inputs}){
  const i=inputs.step===undefined?T.start:inputs.step;
  if(!Number.isInteger(i)||i<0||i>=T.words.length)throw new RangeError('step outside the words');
  const row=T.weights[i],j=largest(row),shown={word:T.words[i],target:T.words[j],weight:row[j].toFixed(2)};
  const spec={version:1,diagram:{kind:'token-links',title:T.title,source:T.words,target:T.words,queries:[{index:i,weights:row}]}};
  const ax=L.figure.at[0],ay=L.figure.at[1],S=T.geometry.sources[i],D=T.geometry.targets[j];
  // the ring: 2 px outside the picked source token's box; the dot: under the target token with the largest weight, between its box and the panel's border
  const x0=ax+S.x-2,y0=ay+S.y-2,x1=ax+S.x+S.width+2,y1=ay+S.y+S.height+2;
  const objects=[sdk.diagram(spec,{x:ax,y:ay,w:L.figure.w}),sdk.polyline('ring',[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]],{role:'input'}),sdk.circle('dot',ax+D.x+D.width/2,ay+D.y+D.height+11,12,{role:'warning'})];
  L.values.forEach((entry,k)=>objects.push(sdk.box('value.'+k,entry.box[0],entry.box[1],entry.box[2],entry.box[3],{role:'neutral',text:entry.label+': '+shown[entry.quantity]}),sdk.circle('chip.'+k,entry.dot[0],entry.dot[1],entry.dot[2],{role:entry.role})));
  // the formula is a math run with no box: a text object's row sits 0.35 of its font size above the y given, so y is the slot's centre plus 5.25 at 15 px
  objects.push(sdk.math('formula',L.formulaAt[0],L.formulaAt[1]+5.25,T.formula,{align:'middle',role:'neutral'}));
  objects.push(sdk.box('note',L.noteBox[0],L.noteBox[1],L.noteBox[2],L.noteBox[3],{role:'neutral',text:T.note.replace('{word}',shown.word).replace('{target}',shown.target)}));
  return {frame:sdk.frame(objects,{width:640,height:400}),quantities:{}};
}`;
}
