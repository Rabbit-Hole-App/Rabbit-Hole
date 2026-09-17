import { threeDContext } from './three-d-context.js';
import { graphContext } from './graph-context.js';

export const sigmoidObjects = {
  introduction: { kind: 'title', label: 'What is logistic regression?', originalText: 'Logistic regression estimates the probability of a binary outcome.', relatedObjectIds: ['uses'] },
  uses: { kind: 'annotation', label: 'When to use logistic regression', originalText: 'Use it for two-outcome predictions such as spam or not spam, or customer churn. It estimates a probability; a separate threshold chooses a class.', relatedObjectIds: ['introduction'] },
  'formula-title': { kind: 'title', label: 'The logistic regression formula', originalText: 'A weighted score is converted into a probability using the sigmoid.', relatedObjectIds: ['score', 'probability'] },
  score: { kind: 'equation', label: 'Weighted score', originalText: 'z = b + w₁x₁ + w₂x₂. The x values are features, the w values are learned weights, and b is the bias.', relatedObjectIds: ['probability'] },
  probability: { kind: 'equation', label: 'Predicted probability', originalText: 'P(y=1 | x) = σ(z) = 1 / (1 + exp(-z)).', relatedObjectIds: ['score'] },
  title: { kind: 'title', label: 'Sigmoid lesson', originalText: 'The sigmoid function', relatedObjectIds: ['equation'] },
  equation: { kind: 'equation', label: 'Sigmoid equation', originalText: 'σ(x) = 1 / (1 + exp(-x))', relatedObjectIds: ['curve'] },
  curve: { kind: 'curve', label: 'Sigmoid curve', originalText: 'σ(x) = 1 / (1 + exp(-x))', domain: [-6, 6], relatedObjectIds: ['equation', 'axes-x', 'axes-y'] },
  midpoint: { kind: 'point', label: 'Sigmoid midpoint (0, 0.5)', originalText: 'σ(0) = 0.5', mathPosition: { x: 0, y: 0.5 }, relatedObjectIds: ['equation', 'curve'] },
  'limit-left': { kind: 'annotation', label: 'Left limit', originalText: 'As x approaches negative infinity, σ(x) approaches 0.', relatedObjectIds: ['curve', 'equation'] },
  'limit-right': { kind: 'annotation', label: 'Right limit', originalText: 'As x approaches positive infinity, σ(x) approaches 1.', relatedObjectIds: ['curve', 'equation'] },
  'axes-x': { kind: 'axis', label: 'Input x axis', originalText: 'Horizontal axis: input x, shown from -6 to 6.', relatedObjectIds: ['curve'] },
  'axes-y': { kind: 'axis', label: 'Output σ(x) axis', originalText: 'Vertical axis: output σ(x), shown from 0 to 1.', relatedObjectIds: ['curve'] },
};

// The snapshot contract allows at most 12 shapes per object; capture always
// stays under it so a dense scene degrades to a representative subset instead
// of failing validation at ask time.
export const SHAPE_CAP = 12;

export function captureSelection(editor, lesson) {
  const ids = editor.getSelectedShapeIds();
  const shapes = ids.map(id => editor.getShape(id));
  if (!ids.length || shapes.some(s => !s?.meta.objectId || !['script', 'assistant'].includes(s.meta.author) || s.meta.runId !== lesson?.runId)) return null;
  const objects = new Set(shapes.map(s => s.meta.objectId));
  if (objects.size !== 1) return null;
  return { shapeIds: ids.slice(0, SHAPE_CAP), objectId: shapes[0].meta.objectId, runId: lesson.runId, label: shapes[0].meta.label };
}

export function selectionSnapshot(editor, lesson, selection) {
  if (!lesson) return null;
  if (lesson.pageId && editor.getCurrentPageId() !== lesson.pageId) return null;
  if (selection && lesson.runId !== selection.runId) throw new Error('The lesson was replayed. Select an object again.');
  const shapes = editor.getCurrentPageShapes();
  const chosen = selection ? selection.shapeIds.map(id => editor.getShape(id)) : [];
  if (chosen.some(s => !s || !shapes.some(p => p.id === s.id) || s.meta.runId !== lesson.runId || s.meta.objectId !== selection.objectId)) {
    throw new Error('The selected object was deleted or changed. Select an object again.');
  }
  const object = (id, prefer = []) => {
    const all = shapes.filter(s => s.meta.runId === lesson.runId && s.meta.objectId === id);
    if (!all.length) return null;
    const parts = [...all.filter(s => prefer.includes(s.id)), ...all.filter(s => !prefer.includes(s.id))].slice(0, SHAPE_CAP);
    const meta = parts[0].meta;
    const axis = parts.find(s => s.type === 'line' && s.meta.kind === 'axis');
    const transform = axis && editor.getShapePageTransform(axis.id);
    const coordinateMapping = transform ? {
      origin: transform.applyToPoint({ x: 315, y: 470 }),
      positiveUnitPoint: transform.applyToPoint(id === 'axes-x' ? { x: 315 + 490 / 12, y: 470 } : { x: 315, y: 220 }),
      variable: id === 'axes-x' ? 'x' : 'sigmoid(x)',
    } : undefined;
    return { ...meta, shapeIds: parts.map(s => s.id),
      ...(parts[0].type === 'three-d-viewer' ? { threeD: threeDContext(parts[0]) } : {}),
      ...(parts[0].type === 'interactive-graph' ? { graph: graphContext(parts[0], true) } : {}),
      ...(coordinateMapping ? { coordinateMapping } : {}),
      renderStatus: parts.every(s => s.meta.renderStatus === 'complete') ? 'complete' : 'drawing',
      shapes: parts.map(s => {
        const b = editor.getShapePageBounds(s.id);
        return { shapeId: s.id, pageBounds: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null,
          ...(s.type === 'text' ? { displayedText: s.props.richText.content?.map(p => p.content?.map(t => t.text || '').join('') || '').join('\n') || '' } : {}) };
      }),
    };
  };
  const selectedIds = selection ? selection.shapeIds.slice(0, SHAPE_CAP) : [];
  const target = selection && object(selection.objectId, selectedIds);
  return { lessonId: lesson.lessonId || 'sigmoid-demo', runId: lesson.runId,
    lessonContext: { topic: lesson.topic || 'Sigmoid function', currentStage: lesson.currentStage, ...(lesson.pageNumber ? { pageNumber: lesson.pageNumber, pageTitle: lesson.pageTitle, animationProgress: lesson.animationProgress } : {}), recentExplanations: lesson.recentExplanations.slice(-4) },
    ...(target ? { target: { ...target, method: 'explicit-selection', selectedShapeIds: selectedIds },
      relatedObjects: target.relatedObjectIds.map(object).filter(Boolean) }
      : { method: 'lesson', target: null, relatedObjects: [...new Set(shapes.filter(s => s.meta.runId === lesson.runId && ['script', 'assistant'].includes(s.meta.author)).map(s => s.meta.objectId))].slice(-12).map(object).filter(Boolean) }) };
}
