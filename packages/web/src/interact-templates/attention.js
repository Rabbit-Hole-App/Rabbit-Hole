import { z } from 'zod';
import { COLUMNS, DRAWN_TEXT_SIZES, LayoutError, arrangeText, figureOptions, pickLayout, roleOf } from '../interact-layout.js';
import { layoutAnswers as answers } from '../interact-layout-answers.js';

// Brief 36/37: the "How does a word attend to the others?" card, on the wide scene layout. One /explain token-links diagram (sdk.diagram) in the stage box, drawn by the host with the layout's options
// (interact-layout.js figureOptions: the stage box, every text 14 px, no title and no caption); a step control picks the query word. The weights are a fixed 6 x 6 table in the card's data (each row sums to 1;
// illustrative, not from a model). The picture itself marks the picked word and the word with the largest weight. The card supplies content only (values, formula, explanation); the layout module chooses the
// arrangement and every box (arrangeText), and the dot colour of a value follows from what it is `of` (roleOf).
// ponytail: one sentence, one head, one table; no softmax is computed in the program (the table is the data).
const text = max => z.string().min(1).max(max);
const rowSums = rows => rows.every(row => Math.abs(row.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9 && row.filter(weight => weight === Math.max(...row)).length === 1);
export const attentionSchema = z.object({
  title: text(60), start: z.number().int().min(0).max(5), words: z.array(text(12)).length(6),
  weights: z.array(z.array(z.number().min(0).max(1)).length(6)).length(6).refine(rowSums, 'every row sums to 1 and has one largest weight'),
  layout: answers,
  // each value names what it measures: the picked word, or the word attended to most (a part of the token-links picture)
  values: z.array(z.object({ quantity: z.enum(['word', 'target', 'weight']), label: text(16), of: z.enum(['picked', 'attended']) }).strict()).min(1).max(4),
  formula: text(60),
  // one to four lines, most important first; "{word}", "{weight}" and "{target}" stand for the picked word, its largest weight and the word it gives it to ("itself" when that is the picked word)
  explanation: z.array(text(70)).min(1).max(4),
  // Brief 36: what the renderer returned for this diagram: the least size it can be drawn at.
  geometry: z.object({ min: z.object({ width: z.number(), height: z.number() }).strict() }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

const largest = row => row.reduce((best, weight, k) => (weight > row[best] ? k : best), 0);
const shownOf = (data, i) => { const row = data.weights[i], j = largest(row); return { word: data.words[i], target: data.words[j], weight: row[j].toFixed(2), same: i === j }; };
const linesOf = (data, shown) => data.explanation.map(line => line.replace('{word}', shown.word).replace('{weight}', shown.weight).replace('{target}', shown.same ? 'itself' : shown.target));

// Everything the layout decides, once, when the program is built: the arrangement and every box (arrangeText over every pick), the dot roles, and the picture's least size against its box.
function place(data) {
  const id = pickLayout(data.layout, { hasPanel: false }), size = DRAWN_TEXT_SIZES, shown = data.words.map((_, i) => shownOf(data, i));
  const variants = shown.map(one => ({ values: data.values.map(entry => ({ text: `${entry.label}: ${one[entry.quantity]}` })), explanation: linesOf(data, one) }));
  const arrangement = arrangeText(id, { variants, formula: data.formula, pictureMins: { stage: data.geometry.min.height } }, size), box = arrangement.pictures.stage;
  const { min } = data.geometry;
  if (min.width > box[2] || min.height > box[3]) throw new LayoutError('figure_too_big', `the diagram needs at least ${min.width} x ${min.height} px; the stage box is ${box[2]} x ${box[3]} px`, ['geometry']);
  const { dropped } = arrangement;
  if (dropped.explanationLines || dropped.values) console.log(JSON.stringify({ event: 'interact_layout_dropped', template: 'stepper-attention', arrangement: arrangement.arrangement, rowsTall: arrangement.rowsTall, droppedExplanationLines: dropped.explanationLines, droppedValues: dropped.values }));
  return {
    layout: id, arrangement: arrangement.arrangement, rowsTall: arrangement.rowsTall, figure: { at: [box[0], box[1]], w: box[2], h: box[3] },
    values: arrangement.values.boxes.map((boxOf, i) => ({ ...data.values[i], box: boxOf, dot: arrangement.values.dots[i], role: roleOf(data.values[i].of, { kind: 'token-links' }) })),
    formula: arrangement.formula, explanation: arrangement.explanation, bullet: COLUMNS.bullet,
  };
}
// The picture's box height the layout module chose (the host asks the renderer for exactly this box: the sealed manifest carries it).
export const figureHeight = ctx => place(ctx.geometry.attention).figure.h;

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
  const objects=[sdk.diagram(spec,{x:L.figure.at[0],y:L.figure.at[1],w:L.figure.w})];
  L.values.forEach((entry,k)=>objects.push(sdk.box('value.'+k,entry.box[0],entry.box[1],entry.box[2],entry.box[3],{role:'neutral',text:entry.label+': '+shown[entry.quantity]}),sdk.circle('chip.'+k,entry.dot[0],entry.dot[1],entry.dot[2],{role:entry.role})));
  // the formula is a math run with no box: a text object's row sits 0.35 of its font size above the y given, so y is the row's centre plus 5.25 at 15 px
  objects.push(sdk.math('formula',L.formula.at[0],L.formula.at[1]+5.25,T.formula,{align:L.formula.align,role:'neutral'}));
  const lines=T.explanation.map(line=>line.replace('{word}',shown.word).replace('{weight}',shown.weight).replace('{target}',i===j?'itself':shown.target));
  // one line in a box (rows), or bullets without a box (columns): a 14 px text row sits 0.35 of its size above the y given
  if(L.explanation.kind==='box')objects.push(sdk.box('note',L.explanation.box[0],L.explanation.box[1],L.explanation.box[2],L.explanation.box[3],{role:'neutral',text:lines[0]}));
  else L.explanation.ys.forEach((cy,k)=>objects.push(sdk.text('line.'+k,L.explanation.x,cy+4.9,L.bullet+lines[k],{align:'start',role:'neutral'})));
  return {frame:sdk.frame(objects,{width:640,height:400}),quantities:{}};
}`;
}
