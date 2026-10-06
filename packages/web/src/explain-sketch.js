// The Explain Back sketch (docs/features/explain-back-sketch.md): what counts as a mark, and the words a sketch
// holds, for the card's Submit, the grader and the Tutor's description of the card. Pure, so Node tests import it.

export const SKETCH_HEIGHT = 240;

// Sketch coordinates are the card's own pixels; 0.1 px keeps a long scribble small in the saved board.
const tenth = value => Math.round(value * 10) / 10;
export const roundPoint = point => ({ x: tenth(point.x), y: tenth(point.y) });

const said = value => String(value || '').replace(/\s+/g, ' ').trim();

// A mark: a stroke of two or more points, any shape, a text or note with words in it.
export function sketchMarks(sketch) {
  const { strokes = [], shapes = [], items = [] } = sketch || {};
  return strokes.filter(stroke => (stroke.points || []).length > 1).length + shapes.length + items.filter(item => said(item.text)).length;
}
export const hasMarks = sketch => sketchMarks(sketch) > 0;

const NAMES = { rect: 'box', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon', star: 'star', line: 'line', arrow: 'arrow', curve: 'curved arrow', elbow: 'elbow arrow' };
const plural = (name, count) => (count === 1 ? name : name.endsWith('x') ? `${name}es` : `${name}s`);

// What the grader and the Tutor read beside the image: the marks by kind, then every word written in the sketch
// in reading order - rows of 40 px by each mark's middle, top to bottom, then left to right - so a labelled
// pipeline reads box, arrow, box. At most 2,000 characters.
export function sketchText(sketch) {
  const { strokes = [], shapes = [], items = [] } = sketch || {};
  const counts = new Map();
  const count = name => counts.set(name, (counts.get(name) || 0) + 1);
  for (const stroke of strokes) if ((stroke.points || []).length > 1) count(stroke.tool === 'highlighter' ? 'highlight' : 'freehand stroke');
  for (const shape of shapes) count(NAMES[shape.kind] || 'shape');
  const words = [];
  for (const shape of shapes) {
    const at = { row: Math.round((shape.y1 + shape.y2) / 2 / 40), x: Math.min(shape.x1, shape.x2) }, name = NAMES[shape.kind] || 'shape';
    if (said(shape.text)) words.push({ ...at, text: `${name}: "${said(shape.text)}"` });
    if (said(shape.label)) words.push({ ...at, text: `${name} label: "${said(shape.label)}"` });
  }
  for (const item of items) if (said(item.text)) words.push({ row: Math.round((item.y + 10) / 40), x: item.x, text: `${item.kind === 'sticky' ? 'note' : 'text'}: "${said(item.text)}"` });
  words.sort((a, b) => a.row - b.row || a.x - b.x);
  const marks = [...counts].map(([name, n]) => `${n} ${plural(name, n)}`).join(', ');
  return [
    marks ? `Marks: ${marks}.` : 'Marks: none.',
    words.length ? `Written in the sketch: ${words.map(word => word.text).join('; ')}.` : 'Nothing is written in the sketch.',
  ].join(' ').slice(0, 2000);
}

// Submit is open with words typed, or with marks in the card's sketch - shown or hidden, since hiding is presentation
// only; text is never required. Only clearing the sketch takes it out of the answer.
export const canSubmit = (text, sketch) => !!said(text) || hasMarks(sketch);
