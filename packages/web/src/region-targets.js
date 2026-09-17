const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
export function ellipsePoints(start, end) {
  const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
  const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2;
  // Closed sampling is used for targeting; the gesture itself requires only one drag.
  return Array.from({ length: 65 }, (_, i) => ({ x: cx + rx * Math.cos(i * Math.PI / 32), y: cy + ry * Math.sin(i * Math.PI / 32) }));
}
export function inside(p, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function regionTargets(editor, lesson, points) {
  if (points.length < 8) return { error: 'Draw a loop around a lesson object.' };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  // A small gap is natural with a mouse; close gaps up to 20% of the loop diagonal.
  if (Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) > diagonal * 0.2) return { error: 'Close the loop, then release to find an object.' };
  const area = Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
  // Ignore accidental clicks/tiny gestures, measured in screen pixels at current zoom.
  if (area * editor.getZoomLevel() ** 2 < 100) return { error: 'Draw a larger loop around the object.' };
  const edges = points.map((p, i) => [p, points[(i + 1) % points.length]]);
  const candidates = new Map();
  for (const shape of editor.getCurrentPageShapes()) {
    if (!['script', 'assistant'].includes(shape.meta.author) || shape.meta.runId !== lesson.runId || shape.meta.renderStatus !== 'complete') continue;
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds || bounds.x > maxX || bounds.x + bounds.w < minX || bounds.y > maxY || bounds.y + bounds.h < minY) continue;
    const geometry = editor.getShapeGeometry(shape);
    const transform = editor.getShapePageTransform(shape.id);
    const parts = geometry.children || [geometry];
    let enclosed = false, touched = false;
    for (const part of parts) {
      const vertices = part.getVertices().map(p => transform.applyToPoint(p));
      if (!vertices.length) continue;
      const contained = vertices.map(p => inside(p, points));
      const segments = vertices.slice(1).map((p, i) => [vertices[i], p]);
      if (part.isClosed) segments.push([vertices.at(-1), vertices[0]]);
      const crossing = segments.some(([a, b]) => edges.some(([c, d]) => intersects(a, b, c, d)));
      enclosed ||= contained.every(Boolean) && !crossing;
      touched ||= contained.some(Boolean) || crossing || (part.isClosed && inside(points[0], vertices));
    }
    if (!enclosed && !touched) continue;
    const current = candidates.get(shape.meta.objectId) || { objectId: shape.meta.objectId, label: shape.meta.label, shapeIds: [], enclosed: false };
    current.shapeIds.push(shape.id);
    current.enclosed ||= enclosed;
    candidates.set(current.objectId, current);
  }
  // The ask snapshot allows at most 12 shapes per object; a capped subset still
  // selects the whole semantic object.
  const all = [...candidates.values()].map(c => ({ ...c, shapeIds: c.shapeIds.slice(0, 12) }));
  // A fully enclosed dot/label is more specific than a curve or axis passing through the loop.
  const enclosed = all.filter(c => c.enclosed);
  return { candidates: enclosed.length ? enclosed : all };
}
