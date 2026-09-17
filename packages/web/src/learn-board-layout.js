export function overlaps(a, b, gap = 24) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function connector(source, target, obstacles) {
  const right = target.x >= source.x + source.w / 2;
  const a = { x: right ? source.x + source.w + 8 : source.x - 8, y: source.y + source.h / 2 };
  const b = { x: right ? target.x - 8 : target.x + target.w + 8, y: Math.max(target.y + 12, Math.min(target.y + target.h - 12, a.y)) };
  if (Math.hypot(b.x - a.x, b.y - a.y) > 400) return null;
  const hits = r => {
    let lo = 0, hi = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.w - a.x], [-dy, a.y - r.y], [dy, r.y + r.h - a.y]]) {
      if (p === 0) { if (q < 0) return false; }
      else if (p < 0) lo = Math.max(lo, q / p);
      else hi = Math.min(hi, q / p);
    }
    return lo <= hi;
  };
  return obstacles.some(hits) ? null : { start: a, end: b };
}
