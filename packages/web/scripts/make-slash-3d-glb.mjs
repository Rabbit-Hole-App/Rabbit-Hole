// The /3d example's model in the Slash commands window (slash-sheet.js SAMPLES['3d']): the scene card's own sample
// operation (LearningBlocks BLOCK_TYPES.scene, "Perspective projection") built as a self-contained GLB - the camera
// frustum, its coordinate frame, the cube inside it, the ray from the camera to the cube, and the two 3 s rotations.
// Deterministic and offline: no model, no Blender, no randomness. slash-sheet.test.mjs rebuilds it and compares it with the
// committed file. usage: node scripts/make-slash-3d-glb.mjs   (writes public/lesson-assets/slash-3d-frustum.glb)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SLASH_3D_GLB = new URL('../public/lesson-assets/slash-3d-frustum.glb', import.meta.url);

// glTF colour factors are linear; the sample's colours are sRGB hex.
const linear = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const length = Math.hypot(...v) || 1; return v.map(x => x / length); };
// Triangles (counter-clockwise from outside) to flat-shaded positions and normals.
const flat = triangles => {
  const position = [], normal = [];
  for (const [a, b, c] of triangles) { const n = unit(cross(sub(b, a), sub(c, a))); position.push(...a, ...b, ...c); normal.push(...n, ...n, ...n); }
  return { position, normal };
};
const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
// An axis-aligned box from its min and max corners.
const box = ([x0, y0, z0], [x1, y1, z1]) => {
  const p = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
  return [
    ...quad(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)), ...quad(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)),
    ...quad(p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)), ...quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)),
    ...quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)), ...quad(p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)),
  ];
};
const yRotation = degrees => { const half = (degrees * Math.PI) / 360; return [0, Math.sin(half), 0, Math.cos(half)]; };

export function buildSlash3dGlb() {
  const chunks = [], bufferViews = [], accessors = [];
  let length = 0;
  // One bufferView per accessor, each 4-byte aligned.
  const add = (values, type, componentType, extra = {}) => {
    const array = componentType === 5126 ? new Float32Array(values) : new Uint16Array(values);
    const bytes = new Uint8Array(array.buffer.slice(0));
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4); padded.set(bytes);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(padded); length += padded.length;
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    accessors.push({ bufferView: bufferViews.length - 1, componentType, count: values.length / size, type, ...extra });
    return accessors.length - 1;
  };
  const vec3 = values => {
    const min = [0, 1, 2].map(i => Math.min(...values.filter((_, j) => j % 3 === i)));
    const max = [0, 1, 2].map(i => Math.max(...values.filter((_, j) => j % 3 === i)));
    return add(values, 'VEC3', 5126, { min, max });
  };
  const lit = ({ position, normal }, material) => ({ attributes: { POSITION: vec3(position), NORMAL: add(normal, 'VEC3', 5126) }, material });
  const lines = (points, pairs, material) => ({ attributes: { POSITION: vec3(points.flat()) }, indices: add(pairs.flat(), 'SCALAR', 5123), mode: 1, material });

  const materials = [
    ['frustum', '#2383e2'], ['cube', '#f59e0b'], ['ray', '#b42318'], ['x axis', '#d92d20'], ['y axis', '#079455'], ['z axis', '#1570ef'],
  ].map(([name, hex]) => ({ name, pbrMetallicRoughness: { baseColorFactor: [...linear(hex), 1], metallicFactor: 0, roughnessFactor: 0.7 } }));
  materials.push({ name: 'frustum volume', pbrMetallicRoughness: { baseColorFactor: [...linear('#2383e2'), 0.14], metallicFactor: 0, roughnessFactor: 1 },
    alphaMode: 'BLEND', doubleSided: true, extensions: { KHR_materials_unlit: {} } });

  // camera_frustum: fov 50, aspect 1.6, near 0.4, far 4, at the origin looking down -z.
  const corners = depth => { const h = depth * Math.tan((25 * Math.PI) / 180), w = h * 1.6; return [[-w, -h, -depth], [w, -h, -depth], [w, h, -depth], [-w, h, -depth]]; };
  const near = corners(0.4), far = corners(4);
  const frustumPoints = [[0, 0, 0], ...near, ...far];
  const edges = [[1, 2], [2, 3], [3, 4], [4, 1], [5, 6], [6, 7], [7, 8], [8, 5], [1, 5], [2, 6], [3, 7], [4, 8], [0, 1], [0, 2], [0, 3], [0, 4]];
  const sides = [0, 1, 2, 3].flatMap(i => quad(near[i], far[i], far[(i + 1) % 4], near[(i + 1) % 4]));
  const meshes = [
    { name: 'frustum', primitives: [lines(frustumPoints, edges, 0), { attributes: { POSITION: vec3(sides.flat(2)) }, material: 6 }] },
    // coordinate_frame: length 1, x red, y green, z blue.
    { name: 'frame', primitives: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis, i) => lines([[0, 0, 0], axis], [[0, 1]], 3 + i)) },
    // cube: a unit cube, scaled 0.6 by its node.
    { name: 'cube', primitives: [lit(flat(box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])), 1)] },
    // arrow from the camera to the cube centre: a shaft and a four-sided head ending at z = -3.
    { name: 'ray', primitives: [lit(flat([
      ...box([-0.025, -0.025, -2.75], [0.025, 0.025, 0]),
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y], i, all) => [[0, 0, -3], [all[(i + 1) % 4][0] * 0.09, all[(i + 1) % 4][1] * 0.09, -2.75], [x * 0.09, y * 0.09, -2.75]]),
      ...quad([-0.09, -0.09, -2.75], [0.09, -0.09, -2.75], [0.09, 0.09, -2.75], [-0.09, 0.09, -2.75]),
    ]), 2)] },
  ];
  const nodes = [
    { name: 'frustum', mesh: 0 }, { name: 'frame', mesh: 1 },
    { name: 'cube', mesh: 2, translation: [0, 0, -3], scale: [0.6, 0.6, 0.6] }, { name: 'ray', mesh: 3 },
  ];
  // The sample's animations, both 0 to 3 s about y: the ray sweeps -18 to 18 degrees, the cube turns -45 to 45.
  const times = add([0, 3], 'SCALAR', 5126, { min: [0], max: [3] });
  const turn = (node, from, to) => ({ node, sampler: add([...yRotation(from), ...yRotation(to)], 'VEC4', 5126) });
  const turns = [turn(3, -18, 18), turn(2, -45, 45)];
  const animations = [{ name: 'sweep', samplers: turns.map(({ sampler }) => ({ input: times, output: sampler, interpolation: 'LINEAR' })),
    channels: turns.map(({ node }, i) => ({ sampler: i, target: { node, path: 'rotation' } })) }];

  const bin = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bin.set(chunk, offset); offset += chunk.length; }
  const gltf = { asset: { version: '2.0', generator: 'rabbit-hole make-slash-3d-glb.mjs' }, extensionsUsed: ['KHR_materials_unlit'], scene: 0,
    scenes: [{ name: 'Perspective projection', nodes: [0, 1, 2, 3] }], nodes, meshes, materials, animations, accessors, bufferViews, buffers: [{ byteLength: length }] };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength); out.set(json, 20);
  view.setUint32(20 + jsonLength, length, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(bin, 28 + jsonLength);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const glb = buildSlash3dGlb();
  writeFileSync(SLASH_3D_GLB, glb);
  console.log(`wrote ${fileURLToPath(SLASH_3D_GLB)} (${glb.length} bytes)`);
}
