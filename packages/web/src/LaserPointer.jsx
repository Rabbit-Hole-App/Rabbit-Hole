import { useEffect, useRef } from 'react';

// Present mode's laser pointer: a red glowing dot on the pointer with a short
// trail that fades, drawn on a canvas over the presented surface. It only
// draws - never selects, moves or saves anything - and the system cursor is
// hidden over the surface while it is on.
const TRAIL_MS = 450;

export default function LaserPointer({ on }) {
  const canvas = useRef(null);
  useEffect(() => {
    const node = canvas.current;
    if (!on || !node) return;
    const surface = node.parentElement;
    const context = node.getContext('2d');
    const trail = [];
    let frame, last = null;
    const size = () => {
      const scale = window.devicePixelRatio || 1, box = node.getBoundingClientRect();
      node.width = Math.round(box.width * scale); node.height = Math.round(box.height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const move = event => {
      const box = node.getBoundingClientRect();
      last = { x: event.clientX - box.left, y: event.clientY - box.top, t: performance.now() };
      trail.push(last);
    };
    const leave = () => { last = null; trail.length = 0; };
    const draw = () => {
      const now = performance.now();
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
      context.clearRect(0, 0, node.width, node.height);
      context.lineCap = 'round'; context.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const fade = 1 - (now - trail[i].t) / TRAIL_MS;
        context.strokeStyle = `rgba(239, 68, 68, ${0.55 * fade})`;
        context.lineWidth = 2 + 5 * fade;
        context.beginPath(); context.moveTo(trail[i - 1].x, trail[i - 1].y); context.lineTo(trail[i].x, trail[i].y); context.stroke();
      }
      if (last) {
        context.shadowColor = 'rgba(239, 68, 68, 0.9)'; context.shadowBlur = 16;
        context.fillStyle = '#ef4444';
        context.beginPath(); context.arc(last.x, last.y, 6, 0, Math.PI * 2); context.fill();
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(255, 255, 255, 0.85)';
        context.beginPath(); context.arc(last.x, last.y, 2, 0, Math.PI * 2); context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(node);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerleave', leave);
    const cursor = surface.style.cursor;
    surface.style.cursor = 'none';
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', leave);
      surface.style.cursor = cursor;
    };
  }, [on]);
  return on ? <canvas ref={canvas} aria-hidden data-laser className="pointer-events-none absolute inset-0 z-40 h-full w-full" /> : null;
}
