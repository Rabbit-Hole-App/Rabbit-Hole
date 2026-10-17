// occt-import-js result -> one self-contained binary glTF 2.0 (GLB). No dependencies.
// - One glTF mesh per OpenCascade mesh; its triangles are grouped by B-rep face colour into
//   primitives (one material per distinct colour).
// - The assembly tree becomes the node hierarchy, with the source names.
// - Units: positions are whatever unit occt was asked for (metres here, glTF's unit).
// - Axes: STEP is conventionally Z-up, glTF Y-up; one root node rotates -90 degrees about X.
const DEFAULT_COLOR = [0.72, 0.74, 0.78];
const pad4 = n => (4 - (n % 4)) % 4;

export function occtToGlb(result, { generator = 'rabbit-hole file-convert', extras = {}, maxElements = Infinity, maxNodes = Infinity } = {}) {
  if (!result?.success) throw new Error('OpenCascade could not read the model');
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [], accessors = [], materials = [], meshes = [], nodes = [];
  const materialIndex = new Map();
  let elements = 0;
  const view = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const offset = byteLength;
    chunks.push(bytes); byteLength += bytes.length;
    const p = pad4(byteLength); if (p) { chunks.push(Buffer.alloc(p)); byteLength += p; }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    return bufferViews.length - 1;
  };
  const accessor = (a) => { elements += a.count; accessors.push(a); return accessors.length - 1; };
  const material = (color) => {
    const c = (color || DEFAULT_COLOR).map(v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000);
    const key = c.join(',');
    if (!materialIndex.has(key)) { materials.push({ pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0, roughnessFactor: 0.6 } }); materialIndex.set(key, materials.length - 1); }
    return materialIndex.get(key);
  };

  let triangles = 0, vertices = 0;
  for (const m of result.meshes || []) {
    const pos = Float32Array.from(m.attributes?.position?.array || []);
    const idx = m.index?.array || [];
    if (pos.length < 9 || idx.length < 3) { meshes.push(null); continue; }
    const count = pos.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { const k = i % 3; if (pos[i] < min[k]) min[k] = pos[i]; if (pos[i] > max[k]) max[k] = pos[i]; }
    const attributes = { POSITION: accessor({ bufferView: view(pos, 34962), componentType: 5126, count, type: 'VEC3', min, max }) };
    const nor = m.attributes?.normal?.array;
    if (nor && nor.length === pos.length) attributes.NORMAL = accessor({ bufferView: view(Float32Array.from(nor), 34962), componentType: 5126, count, type: 'VEC3' });
    // Triangle ranges per colour: brep_faces give [first, last] triangle indices and a colour.
    const groups = new Map();
    const faces = (m.brep_faces || []).length ? m.brep_faces : [{ first: 0, last: idx.length / 3 - 1, color: null }];
    for (const f of faces) {
      const color = f.color || m.color || null;
      const key = color ? color.join(',') : '';
      if (!groups.has(key)) groups.set(key, { color, tris: [] });
      groups.get(key).tris.push([f.first, f.last]);
    }
    const primitives = [];
    const Index = count < 65536 ? Uint16Array : Uint32Array;
    for (const { color, tris } of groups.values()) {
      const n = tris.reduce((s, [a, b]) => s + (b - a + 1) * 3, 0);
      const out = new Index(n);
      let o = 0;
      for (const [a, b] of tris) for (let t = a; t <= b; t++) { out[o++] = idx[t * 3]; out[o++] = idx[t * 3 + 1]; out[o++] = idx[t * 3 + 2]; }
      primitives.push({ attributes, indices: accessor({ bufferView: view(out, 34963), componentType: Index === Uint16Array ? 5123 : 5125, count: n, type: 'SCALAR' }), material: material(color), mode: 4 });
    }
    triangles += idx.length / 3; vertices += count;
    meshes.push({ name: m.name || undefined, primitives });
    if (elements > maxElements) throw Object.assign(new Error(`the viewing mesh has more than ${maxElements} accessor elements`), { code: 'too_complex' });
  }

  const gltfMeshes = [], meshMap = new Map();
  meshes.forEach((m, i) => { if (m) { meshMap.set(i, gltfMeshes.length); gltfMeshes.push(m); } });
  let parts = 0;
  const tree = n => {
    const node = { name: n.name || undefined, children: [] };
    nodes.push(node);
    const at = nodes.length - 1;
    const ms = (n.meshes || []).filter(i => meshMap.has(i));
    if (ms.length === 1 && !(n.children || []).length) { node.mesh = meshMap.get(ms[0]); parts++; }
    else for (const i of ms) { nodes.push({ name: meshes[i].name, mesh: meshMap.get(i) }); node.children.push(nodes.length - 1); parts++; }
    for (const c of n.children || []) node.children.push(tree(c));
    if (!node.children.length) delete node.children;
    if (nodes.length > maxNodes) throw Object.assign(new Error(`the model has more than ${maxNodes} nodes`), { code: 'too_complex' });
    return at;
  };
  const rootChild = tree(result.root || { name: 'model', meshes: meshes.map((_, i) => i), children: [] });
  nodes.push({ name: 'Z-up to Y-up', rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], children: [rootChild] });
  const top = nodes.length - 1;

  const json = {
    asset: { version: '2.0', generator, extras },
    scene: 0, scenes: [{ nodes: [top] }], nodes, meshes: gltfMeshes, materials, accessors, bufferViews,
    buffers: [{ byteLength }],
  };
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const bin = Buffer.concat(chunks);
  const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return { glb: Buffer.concat([header, jh, jsonPadded, bh, bin]), stats: { meshes: gltfMeshes.length, parts, nodes: nodes.length, triangles, vertices, materials: materials.length, accessor_elements: elements } };
}

// The assembly tree for structure.json: names only, bounded.
export function outline(n, budget = { left: 2000 }) {
  if (budget.left-- <= 0) return null;
  const kids = (n.children || []).map(c => outline(c, budget)).filter(Boolean);
  return { name: n.name || '', meshes: (n.meshes || []).length, ...(kids.length ? { children: kids } : {}) };
}
