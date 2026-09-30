export { LEARN_SYSTEM, LEARN_SNAPSHOT_SYSTEM } from './agents/learn-chat.js';

export function validateLessonSnapshot(value) {
  const text = (s, max = 1000) => typeof s === 'string' && s.length > 0 && s.length <= max;
  const ids = a => Array.isArray(a) && a.length <= 12 && a.every(s => text(s, 150));
  if (!value || JSON.stringify(value).length > 24000 || !/^(sigmoid-demo|learn-freeform|course-\d+-\d+)$/.test(value.lessonId) || !text(value.runId, 150)) throw new Error('Invalid lesson snapshot');
  const general = value.method === 'lesson' && value.target === null;
  const objects = [...(general ? [] : [value.target]), ...(Array.isArray(value.relatedObjects) ? value.relatedObjects : [])];
  if (!Array.isArray(value.relatedObjects) || objects.length > 12 || (!general && (value.target?.method !== 'explicit-selection' || !ids(value.target.selectedShapeIds) || !value.target.selectedShapeIds.length))) throw new Error('Invalid selected target');
  for (const obj of objects) {
    if (!obj || !text(obj.objectId, 150) || obj.runId !== value.runId || obj.lessonId !== value.lessonId || !['script', 'assistant'].includes(obj.author) || !text(obj.kind, 40) || !text(obj.originalText) || !ids(obj.relatedObjectIds) || !ids(obj.shapeIds) || !obj.shapeIds.length || !['drawing', 'complete'].includes(obj.renderStatus)) throw new Error('Invalid lesson object');
    if (!Array.isArray(obj.shapes) || obj.shapes.length !== obj.shapeIds.length || obj.shapes.some(s => !obj.shapeIds.includes(s.shapeId) || !s.pageBounds || ['x', 'y', 'w', 'h'].some(k => !Number.isFinite(s.pageBounds[k])) || s.pageBounds.w < 0 || s.pageBounds.h < 0)) throw new Error('Invalid canvas bounds');
  }
  if (new Set(objects.map(o => o.objectId)).size !== objects.length || (!general && (value.target.selectedShapeIds.some(id => !value.target.shapeIds.includes(id)) || value.relatedObjects.some(o => !value.target.relatedObjectIds.includes(o.objectId))))) throw new Error('Invalid object relationships');
  const context = value.lessonContext;
  if (!context || !text(context.topic, 150) || !text(context.currentStage, 100) || !Array.isArray(context.recentExplanations) || context.recentExplanations.length > 4 || context.recentExplanations.some(s => !text(s, 2000))) throw new Error('Invalid lesson context');
  if (context.courseBrief !== undefined && (!context.courseBrief || Array.isArray(context.courseBrief) || typeof context.courseBrief !== 'object' || Object.entries(context.courseBrief).some(([key, value]) => !['audience', 'goal', 'knowledge', 'duration'].includes(key) || !text(value, 600)))) throw new Error('Invalid course brief');
  return value;
}

// The lesson's table of contents, as the learner sees it in the right panel.
// It is what the canvas's heading blocks say, so the model can answer about
// structure instead of guessing at it. Data, never instructions.
export function validateOutline(value) {
  const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
  if (!Array.isArray(value) || value.length > 60) throw new Error('Invalid lesson outline');
  for (const entry of value) {
    if (!entry || !text(entry.id, 150) || !text(entry.label, 200)
      || ![1, 2, 3].includes(entry.level) || typeof entry.done !== 'boolean') throw new Error('Invalid outline entry');
  }
  if (new Set(value.map(entry => entry.id)).size !== value.length) throw new Error('Duplicate outline entry');
  return value;
}

// Indented so depth is legible without the model parsing a level field.
export function renderOutline(outline) {
  return outline.map(entry => `${'  '.repeat(entry.level - 1)}- [${entry.done ? 'x' : ' '}] ${entry.label}`).join('\n');
}
