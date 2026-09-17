// Capture the current viewport without adding a marker shape to the learner's board.
export async function canvasPreview(editor, snapshot, region) {
  const bounds = editor.getViewportPageBounds().clone();
  const scale = Math.min(1, 1000 / Math.max(bounds.w, bounds.h));
  const { blob } = await editor.toImage([...editor.getCurrentPageShapeIds()], { format: 'png', bounds, scale, pixelRatio: 1, padding: 0, background: true });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const sx = canvas.width / bounds.w, sy = canvas.height / bounds.h;
  const parts = snapshot.target.shapes.filter(s => snapshot.target.selectedShapeIds.includes(s.shapeId));
  const boxes = parts.map(s => s.pageBounds);
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  const w = Math.max(...boxes.map(b => b.x + b.w)) - x, h = Math.max(...boxes.map(b => b.y + b.h)) - y;
  // Keep the marker legible in the composer's 112 × 80 thumbnail.
  const thumbnailScale = Math.min(112 / canvas.width, 80 / canvas.height);
  context.strokeStyle = '#dc2626'; context.lineWidth = 3 / thumbnailScale;
  context.beginPath();
  if (region?.length) {
    const left = Math.min(...region.map(p => p.x)), right = Math.max(...region.map(p => p.x));
    const top = Math.min(...region.map(p => p.y)), bottom = Math.max(...region.map(p => p.y));
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const emphasis = Math.max(1, 18 / (Math.min((right - left) * sx, (bottom - top) * sy) * thumbnailScale));
    region.forEach((p, i) => context[i ? 'lineTo' : 'moveTo']((cx + (p.x - cx) * emphasis - bounds.x) * sx, (cy + (p.y - cy) * emphasis - bounds.y) * sy));
    context.closePath();
  } else {
    context.ellipse((x + w / 2 - bounds.x) * sx, (y + h / 2 - bounds.y) * sy, Math.max(w * sx / 2 + 10, 9 / thumbnailScale), Math.max(h * sy / 2 + 10, 9 / thumbnailScale), 0, 0, Math.PI * 2);
  }
  context.stroke();
  return canvas.toDataURL('image/png');
}
