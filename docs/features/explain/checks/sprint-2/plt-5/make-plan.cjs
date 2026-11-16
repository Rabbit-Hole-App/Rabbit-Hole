// Builds the planned plot-lines.test.mjs (pre-sprint smooth expectations + one new case) and the diff against the current file.
const fs = require('fs');
const { execSync } = require('child_process');
const cur = 'C:/s/sprint2-plt/packages/web/src/tutor-diagrams/plot-lines.test.mjs';
const out = 'C:/s/sprint2-evidence/plt-5/plot-lines.test.new.mjs';
let s = fs.readFileSync(cur, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('miss ' + a.slice(0, 60)); s = s.replace(a, () => b); };
rep("// Sprint default: a line is straight between samples unless `smooth: true` (or 20 samples or more), and a line of up to 8 samples marks every sample.\ntest('basic and Phase 02 plots draw straight segments by default and smooth on opt-in', () => {",
  "// A line is smooth unless `smooth: false`; a line of up to 8 samples marks every sample (the first, the last and the labelled ones from 9).\ntest('basic and Phase 02 plots smooth lines by default and preserve straight segments on opt-out', () => {");
rep("    const plain = render();\n    assert.doesNotMatch(plain, /<path d=\"M[^\"]+C[^\"]+\"/);\n    assert.match(plain, /<polyline points=\"(?:[\\d.,]+ ){6}[\\d.,]+\"/);\n    series.smooth = true;\n    const svg = render();",
  "    const svg = render();");
rep("test('integer axis ticks show",
  `test('smooth: false draws straight segments with a marker on every sample, and 9 or more samples mark only the first, the last and the labelled ones', () => {
  const draw = (n, extra = {}) => {
    const points = Array.from({ length: n }, (_, x) => ({ x, y: (x * 7) % 5, ...(x === 2 ? { label: 'Peak' } : {}) }));
    const spec = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Samples', x: { label: 'X', min: 0, max: n }, y: { label: 'Y', min: 0, max: 5 },
      series: [{ kind: 'line', label: 'Samples', points, ...extra }] } };
    return renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
  };
  const straight = draw(6, { smooth: false });
  assert.doesNotMatch(straight, /<path d="M[^"]+C[^"]+"/);
  assert.match(straight, /<polyline points="(?:[\\d.,]+ ){5}[\\d.,]+"/);
  assert.equal([...straight.matchAll(/data-tutor-coordinate-point=/g)].length, 6);
  const long = draw(12);
  assert.match(long, /<path d="M[^"]+C[^"]+"/);
  assert.deepEqual([...long.matchAll(/data-tutor-coordinate-point="([^"]+)"/g)].map(match => match[1]), ['0,0', '2,4', '11,2']);
});

test('integer axis ticks show`);
rep("  // Sprint default: a contour is a straight closed polygon unless `smooth: true`, so the smooth closure opts in.\n  const smoothed = { ...periodic, smooth: true };\n  const geometry = path(smoothed);", "  const geometry = path(periodic);");
rep("path({ ...smoothed, points: [...periodic.points, { x, y }] })", "path({ ...periodic, points: [...periodic.points, { x, y }] })");
fs.writeFileSync(out, crlf ? s.replace(/\n/g, '\r\n') : s);
fs.writeFileSync(out + '.cur', fs.readFileSync(cur));
console.log('ok');
