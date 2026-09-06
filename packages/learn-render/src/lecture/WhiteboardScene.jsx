// The whiteboard layer: every shape goes through rough.js, every stroke draws
// itself with the pathLength/stroke-dashoffset trick, handwritten text is Virgil
// revealed left-to-right, and a pen sprite rides the head of whatever is drawing.
import React, { useMemo } from 'react';
import rough from 'roughjs';
import { Code } from './Code.jsx';

const gen = rough.generator();

const ROUGH = { roughness: 1.4, bowing: 1.1 };

function drawablesFor(s, seed) {
  const o = { ...ROUGH, seed, stroke: s.color, strokeWidth: s.width || 3 };
  if (s.noStroke) o.stroke = 'none';
  if (s.fill) Object.assign(o, { fill: s.fill, fillStyle: s.fillStyle || 'hachure', fillWeight: 1.6, hachureGap: 10 });
  switch (s.type) {
    case 'rect': return [gen.rectangle(s.x, s.y, s.w, s.h, o)];
    case 'ellipse': return [gen.ellipse(s.cx, s.cy, s.rx * 2, s.ry * 2, o)];
    case 'line': return [gen.line(s.x1, s.y1, s.x2, s.y2, o)];
    case 'cross': return [
      gen.line(s.x, s.y, s.x + s.w, s.y + s.h, o),
      gen.line(s.x + s.w, s.y, s.x, s.y + s.h, { ...o, seed: seed + 1 }),
    ];
    case 'arrow': {
      const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = (da, i) => gen.line(s.x2, s.y2, s.x2 - 26 * Math.cos(a + da), s.y2 - 26 * Math.sin(a + da), { ...o, seed: seed + i });
      return [gen.line(s.x1, s.y1, s.x2, s.y2, o), head(0.45, 1), head(-0.45, 2)];
    }
    case 'path': return [gen.linearPath(s.points, o)];
    default: return [];
  }
}

// Where the pen tip sits at progress p, computed from the ideal geometry
// (rough wobbles a few px around it, which reads fine).
function penPointFor(s, p) {
  const lerp = (x1, y1, x2, y2, t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  const alongPoly = (pts, t) => {
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(l);
      total += l;
    }
    let d = t * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        return lerp(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lens[i] ? d / lens[i] : 0);
      }
      d -= lens[i];
    }
    return pts[0];
  };
  switch (s.type) {
    case 'rect': {
      const c = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h], [s.x, s.y]];
      return alongPoly(c, p);
    }
    case 'ellipse': {
      const a = -Math.PI / 2 + p * 2 * Math.PI;
      return [s.cx + s.rx * Math.cos(a), s.cy + s.ry * Math.sin(a)];
    }
    case 'line': return lerp(s.x1, s.y1, s.x2, s.y2, p);
    case 'arrow': return p < 0.75 ? lerp(s.x1, s.y1, s.x2, s.y2, p / 0.75) : [s.x2, s.y2];
    case 'cross': return p < 0.5
      ? lerp(s.x, s.y, s.x + s.w, s.y + s.h, p * 2)
      : lerp(s.x + s.w, s.y, s.x, s.y + s.h, p * 2 - 1);
    case 'path': return alongPoly(s.points, p);
    case 'text': return [s.x + p * s.text.length * s.size * 0.5, s.y + s.size * 0.85];
    case 'code': {
      const n = Math.floor(p * s.text.length);
      const before = s.text.slice(0, n).split('\n');
      const line = before.length - 1;
      const col = before[before.length - 1].length;
      return [s.x + col * s.size * 0.6, s.y + line * s.size * 1.5 + s.size];
    }
    default: return null;
  }
}

const Pen = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    <g transform="rotate(-42)">
      <polygon points="0,0 -6,-16 6,-16" fill="#2d2a26" />
      <rect x="-6.5" y="-52" width="13" height="37" rx="4" fill="#37352F" />
      <rect x="-6.5" y="-60" width="13" height="9" rx="3" fill="#2383E2" />
    </g>
  </g>
);

const RoughStroke = ({ s, p, seed }) => {
  const paths = useMemo(() => drawablesFor(s, seed).flatMap((d) => gen.toPaths(d)), [s, seed]);
  const n = paths.length;
  return paths.map((pa, i) => {
    const seg = Math.min(1, Math.max(0, p * n - i));
    if (seg <= 0) return null;
    return (
      <path
        key={i}
        d={pa.d}
        fill="none"
        stroke={pa.stroke === 'none' ? 'transparent' : pa.stroke}
        strokeWidth={pa.strokeWidth}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - seg}
      />
    );
  });
};

const HandText = ({ s, p }) => (
  <div
    style={{
      position: 'absolute',
      left: s.x,
      top: s.y,
      fontFamily: 'Virgil',
      fontSize: s.size,
      lineHeight: 1.25,
      color: s.color,
      whiteSpace: 'pre',
      clipPath: `inset(-15% ${(1 - p) * 103}% -15% -3%)`,
    }}
  >
    {s.text}
  </div>
);

// items: [{stroke, p, seed}] — already filtered to the visible board group.
export const WhiteboardScene = ({ items }) => {
  const drawing = [...items].reverse().find(({ p }) => p > 0 && p < 1);
  const pen = drawing ? penPointFor(drawing.stroke, drawing.p) : null;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {items.map(({ stroke, p, seed }, i) =>
          stroke.type !== 'text' && stroke.type !== 'code' ? <RoughStroke key={i} s={stroke} p={p} seed={seed} /> : null
        )}
      </svg>
      {items.map(({ stroke, p }, i) =>
        stroke.type === 'text' ? <HandText key={i} s={stroke} p={p} />
          : stroke.type === 'code' ? <Code key={i} s={stroke} p={p} /> : null
      )}
      {pen ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <Pen x={pen[0]} y={pen[1]} />
        </svg>
      ) : null}
    </>
  );
};
