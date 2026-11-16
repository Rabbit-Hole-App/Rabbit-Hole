const sharp = require('C:/s/teaching-palette/scripts/topic-pipeline/node_modules/sharp');
const fs = require('fs');
const GROUND = [255, 252, 240], INK = [50, 33, 28];
const FILLS = { blue: '#8DBFEF', coral: '#F58371', mustard: '#E5AA46', teal: '#67B9A0', olive: '#95A448', lavender: '#B9A4E8', orange: '#F89830' };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const PAL = [['ground', GROUND], ['ink', INK], ...Object.entries(FILLS).map(([k, v]) => [k, hex(v)])];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const med = xs => xs.sort((a, b) => a - b)[xs.length >> 1];
(async () => {
  const rows = [];
  for (const id of 'abcdef') {
    const { data, info } = await sharp(`${id}-ill0-v2.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info, px = (x, y) => [data[(y * w + x) * 3], data[(y * w + x) * 3 + 1], data[(y * w + x) * 3 + 2]];
    // ground: median colour of the 8 px frame around the image
    const edge = []; for (let x = 0; x < w; x++) for (let k = 0; k < 8; k++) { edge.push(px(x, k), px(x, h - 1 - k)); } for (let y = 0; y < h; y++) for (let k = 0; k < 8; k++) { edge.push(px(k, y), px(w - 1 - k, y)); }
    const g = [0, 1, 2].map(c => med(edge.map(p => p[c])));
    const gd = Math.max(...g.map((v, c) => Math.abs(v - GROUND[c])));
    let white = 0, near = 0, other = 0, total = w * h; const counts = {};
    for (let i = 0; i < total; i++) {
      const p = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
      if (p[0] >= 250 && p[1] >= 250 && p[2] >= 248) white++; // white: blue channel at or above 248 (the ground's is 240)
      let best = null, bd = 1e9; for (const [n, c] of PAL) { const d = dist(p, c); if (d < bd) { bd = d; best = n; } }
      if (bd <= 20) { near++; counts[best] = (counts[best] || 0) + 1; } else other++;
    }
    rows.push({ id, size: `${w}x${h}`, groundMedian: g.join(','), groundMaxChannelDiff: gd, groundPass: gd <= 3, whitePct: +(100 * white / total).toFixed(3), inPalettePct: +(100 * near / total).toFixed(1), offPalettePct: +(100 * other / total).toFixed(1), byColour: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(100 * v / total).toFixed(1)])) });
  }
  fs.writeFileSync('measure.json', JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(r.id, 'ground', r.groundMedian, 'diff', r.groundMaxChannelDiff, r.groundPass ? 'PASS' : 'FAIL', '| white%', r.whitePct, '| palette%', r.inPalettePct, 'off%', r.offPalettePct);
})();
