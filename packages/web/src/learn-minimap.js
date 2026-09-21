// Projects the canvas into the minimap. Frames the content AND the current
// viewport together, because the reason to look at a minimap is that you have
// panned somewhere empty and want to see where your work went relative to you.
const PAD = 6; // minimap pixels kept clear at the edges

// view is the camera {x, y, z}; surface is the canvas's size in screen pixels.
export function minimapLayout(boxes, view, surface, size) {
  if (!boxes.length) return null;
  // The viewport in world units: screen origin maps to -view/z, and the visible
  // span is the surface divided by the zoom.
  const port = { x: -view.x / view.z, y: -view.y / view.z, w: surface.w / view.z, h: surface.h / view.z };
  const all = [...boxes, port];
  const left = Math.min(...all.map(box => box.x));
  const top = Math.min(...all.map(box => box.y));
  const right = Math.max(...all.map(box => box.x + box.w));
  const bottom = Math.max(...all.map(box => box.y + box.h));
  const scale = Math.min((size.w - PAD * 2) / Math.max(1, right - left), (size.h - PAD * 2) / Math.max(1, bottom - top));
  // Centre whatever is framed, so a tall canvas is not pinned to one corner.
  const offsetX = (size.w - (right - left) * scale) / 2 - left * scale;
  const offsetY = (size.h - (bottom - top) * scale) / 2 - top * scale;
  const project = box => ({ x: box.x * scale + offsetX, y: box.y * scale + offsetY, w: box.w * scale, h: box.h * scale });
  return { scale, offsetX, offsetY, boxes: boxes.map(project), view: project(port) };
}

// The inverse: a press at (x, y) inside the minimap is a request to centre the
// camera on that point of the world.
export function minimapToView(point, layout, surface, zoom) {
  const world = { x: (point.x - layout.offsetX) / layout.scale, y: (point.y - layout.offsetY) / layout.scale };
  return { x: surface.w / 2 - world.x * zoom, y: surface.h / 2 - world.y * zoom };
}
