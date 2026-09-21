// The layout lint. Second priority, deliberately: technical truth and
// structural continuity come first (see scene-consistency.js and
// scene-repeat.js). Runs on a scene already through validateScene, using the
// SAME geometry the renderer uses (scene-layout.js), so a collision the lint
// reports is a collision the renderer would actually draw - never a guess
// built separately from what AnimatedScene.jsx does.
import { getSceneState } from './animation-scene.js';
import { textStyle } from './scene-style.js';
import { centreOf, estimateTextBox, gridAxisLabelBoxes, labelAt } from './scene-layout.js';

// An arrowhead is not a point. The SVG marker (AnimatedScene.jsx's
// #animation-arrow-tinted, markerWidth 9 in strokeWidth units, refX 7) draws
// back from the line's own endpoint by several strokeWidths along the line's
// direction. This is a deliberate approximation of that footprint - a fixed
// radius around the endpoint, not a font-and-marker-accurate polygon - big
// enough to catch an obvious collision, which is the lint's whole job.
const ARROWHEAD_RADIUS = 14;

const overlaps = (box, x, y, radius) => x + radius > box.xMin && x - radius < box.xMax && y + radius > box.yMin && y - radius < box.yMax;

// Every label a scene can draw, as {text, x, y, fontSize, anchor, baseline,
// ownerId} - object captions (labelAt's job) and grid row/column axis names
// (gridAxisLabelBoxes' job), the same two sources AnimatedScene.jsx draws
// from. Takes EVALUATED objects (getSceneState's output, the same flat shape
// the renderer receives - type, x, y, w, h, from, to, label all at the top
// level) rather than raw initialState, so a move or resize already applied
// by the timeline is reflected here too, not just what was authored at t=0.
function collectLabels(objects) {
  const labels = [];
  for (const object of objects) {
    // An equation's own content fills its whole declared frame (rendered
    // through a foreignObject at (x, y, w, h) - see AnimatedScene.jsx's
    // `maths` branch), so an arrow terminating anywhere on that frame is
    // exactly as ordinary as one terminating on a box or a grid: arriving at
    // the shape is the point, not a collision. Only a SEPARATE, smaller
    // annotation attached near an edge - a grid's axis name, a data shape's
    // caption above it - is what this check exists to catch, so an equation
    // is excluded from the labels collected here entirely, the same way a
    // box's or a circle's own frame already is.
    if (object.type === 'equation') continue;
    const isText = ['text', 'code'].includes(object.type);
    const isData = ['grid', 'strip', 'bars', 'tokens'].includes(object.type);
    const isStroke = ['arrow', 'line'].includes(object.type);
    const isImage = object.type === 'image';
    if (object.label) {
      const position = labelAt(object, { stroke: isStroke, above: isData || isImage, text: isText }, centreOf(object));
      const typography = isData ? 'caption' : object.type === 'code' ? 'code' : object.type === 'text' ? (object.typography || 'body') : 'body';
      labels.push({ ownerId: object.id, text: object.label, ...position, fontSize: textStyle(typography).fontSize });
    }
    for (const axisLabel of gridAxisLabelBoxes(object)) {
      labels.push({ ownerId: object.id, fontSize: textStyle('annotation').fontSize, ...axisLabel });
    }
  }
  return labels;
}

// The one check named explicitly: an arrow or line's own arrowhead must not
// land inside any label's estimated box - not the label it is travelling
// towards as a shape (arriving at a grid's frame is the point), but the TEXT
// sitting near that frame's edge, which a reader has to be able to read
// after the arrow gets there.
function checkArrowIntoLabel(objects) {
  const labels = collectLabels(objects);
  const boxes = labels.map(label => ({ label, box: estimateTextBox(label) }));
  const issues = [];
  for (const object of objects) {
    if (!['arrow', 'line'].includes(object.type)) continue;
    const tip = object.to ?? object.from;
    if (!tip) continue;
    for (const { label, box } of boxes) {
      if (label.ownerId === object.id) continue; // an arrow's own caption sits at its own `from`, never its tip
      if (overlaps(box, tip.x, tip.y, ARROWHEAD_RADIUS)) {
        issues.push({
          check: 'edge-intersects-label', objectId: object.id,
          message: `"${object.id}" lands its arrowhead at (${tip.x}, ${tip.y}), inside the label "${label.text}" owned by "${label.ownerId}" (estimated box x:[${box.xMin.toFixed(0)},${box.xMax.toFixed(0)}] y:[${box.yMin.toFixed(0)},${box.yMax.toFixed(0)}])`,
        });
      }
    }
  }
  return issues;
}

// Text exceeding the box it was given, for the object types that declare
// one (equation - anything with an authored w). Not font-accurate; it exists
// to catch an equation authored far too narrow for what it says.
function checkTextExceedsBox(objects) {
  const issues = [];
  for (const object of objects) {
    if (object.type !== 'equation' || !object.w) continue;
    const estimatedWidth = (object.label?.length || 0) * textStyle('equation').fontSize * 0.5;
    if (estimatedWidth > object.w) {
      issues.push({
        check: 'text-exceeds-box', objectId: object.id,
        message: `"${object.id}" is declared ${object.w}px wide but its text needs roughly ${Math.round(estimatedWidth)}px`,
      });
    }
  }
  return issues;
}

// Takes a validated scene (validateScene's output) and, optionally, the time
// to render it at - the settled end state by default, which is what a
// static capture shows. Evaluates once, through the same getSceneState the
// renderer calls, so the lint checks the picture that would actually appear.
export function checkLayoutLint(scene, time = scene.duration) {
  const objects = getSceneState(scene, time).objects.filter(object => object.visible);
  const issues = [...checkArrowIntoLabel(objects), ...checkTextExceedsBox(objects)];
  return { passed: issues.length === 0, issues };
}
