// Small, real 3D fixtures for the model import tests (file-imports Lane 4), generated here so the repository holds no
// third-party model files: every byte below is written by this script from the formats' published layouts.
// `node e2e/model-fixtures.mjs <dir>` writes them all to <dir> (the shared fixture folder is C:/s/fi-fixtures/3d).
import { deflateSync, gzipSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'three/addons/libs/fflate.module.js';

const enc = s => new TextEncoder().encode(s);
const cat = parts => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const f32 = values => new Uint8Array(new Float32Array(values).buffer);
const u16s = values => new Uint8Array(new Uint16Array(values).buffer);

// ---- a unit cube: 24 vertices (4 per face, own UVs) and 12 triangles ---------------------------------------------------
const FACES = [
  [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
  [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
const half = 0.5;
export const CUBE = (() => {
  const positions = [], normals = [], uvs = [], indices = [];
  FACES.forEach(([n, quad], f) => {
    quad.forEach(([x, y, z], i) => { positions.push(x * half, y * half, z * half); normals.push(...n); uvs.push(...[[0, 0], [1, 0], [1, 1], [0, 1]][i]); });
    const b = f * 4; indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions, normals, uvs, indices };
})();
const tri = k => [0, 1, 2].map(j => CUBE.indices[k * 3 + j]);
const vtx = i => CUBE.positions.slice(i * 3, i * 3 + 3);

// ---- PNG (8x8 checker, RGB) --------------------------------------------------------------------------------------------
export function png(w = 8, h = 8) {
  const raw = [];
  for (let y = 0; y < h; y++) { raw.push(0); for (let x = 0; x < w; x++) raw.push(...(((x >> 1) + (y >> 1)) % 2 ? [230, 120, 30] : [30, 90, 200])); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), Buffer.from(data)]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]));
}

// ---- glTF / GLB ----------------------------------------------------------------------------------------------------------
function gltfParts({ texture = null, animation = false } = {}) {
  const pos = f32(CUBE.positions), nor = f32(CUBE.normals), uv = f32(CUBE.uvs), idx = u16s(CUBE.indices);
  const times = f32([0, 1, 2]), moves = f32([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const parts = [pos, nor, uv, idx, ...(animation ? [times, moves] : [])];
  const views = []; let offset = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: offset, byteLength: p.length }); offset += p.length; }
  const bin = cat(parts);
  const json = {
    asset: { version: '2.0', generator: 'rabbit-hole model-fixtures' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Cube', mesh: 0 }],
    meshes: [{ name: 'Cube', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'Checker', pbrMetallicRoughness: { metallicFactor: 0, ...(texture ? { baseColorTexture: { index: 0 } } : { baseColorFactor: [0.2, 0.5, 0.9, 1] }) } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-half, -half, -half], max: [half, half, half] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' },
      ...(animation ? [{ bufferView: 4, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [2] }, { bufferView: 5, componentType: 5126, count: 3, type: 'VEC3' }] : []),
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
    ...(texture ? { textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9728, minFilter: 9728 }], images: [texture] } : {}),
    ...(animation ? { animations: [{ name: 'Bounce', samplers: [{ input: 4, output: 5, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] } : {}),
  };
  return { json, bin };
}
const pad4 = (bytes, fill) => { const n = (4 - (bytes.length % 4)) % 4; return n ? cat([bytes, new Uint8Array(n).fill(fill)]) : bytes; };
export function glb({ animation = false, embedTexture = false, json: patch = null } = {}) {
  let { json, bin } = gltfParts({ animation, texture: embedTexture ? { bufferView: 0, mimeType: 'image/png' } : null });
  if (embedTexture) { // the PNG as one more buffer view
    const image = png(); const at = bin.length + ((4 - (bin.length % 4)) % 4);
    bin = cat([pad4(bin, 0), image]); json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: image.length }); json.images[0].bufferView = json.bufferViews.length - 1; json.buffers[0].byteLength = bin.length;
  }
  if (patch) json = patch(json);
  const jsonBytes = pad4(enc(JSON.stringify(json)), 0x20), binBytes = pad4(bin, 0);
  const header = new DataView(new ArrayBuffer(12)); header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, 12 + 8 + jsonBytes.length + 8 + binBytes.length, true);
  const chunkHead = (length, type) => { const v = new DataView(new ArrayBuffer(8)); v.setUint32(0, length, true); v.setUint32(4, type, true); return new Uint8Array(v.buffer); };
  return cat([new Uint8Array(header.buffer), chunkHead(jsonBytes.length, 0x4e4f534a), jsonBytes, chunkHead(binBytes.length, 0x004e4942), binBytes]);
}
export function gltfSeparate({ bin = 'cube.bin', image = 'textures/checker.png', patch = null } = {}) {
  const { json, bin: data } = gltfParts({ texture: { uri: image } });
  json.buffers[0].uri = bin;
  return { gltf: enc(JSON.stringify(patch ? patch(json) : json, null, 1)), bin: data };
}
export function gltfEmbedded() {
  const { json, bin } = gltfParts({});
  json.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bin).toString('base64')}`;
  return enc(JSON.stringify(json));
}

// ---- STL -----------------------------------------------------------------------------------------------------------------
export function stlBinary() {
  const out = new DataView(new ArrayBuffer(84 + 12 * 50));
  enc('rabbit-hole model-fixtures binary STL').forEach((c, i) => out.setUint8(i, c)); // a header that starts "solid" would be legal too
  out.setUint32(80, 12, true);
  for (let k = 0; k < 12; k++) { const at = 84 + k * 50; const n = CUBE.normals.slice(tri(k)[0] * 3, tri(k)[0] * 3 + 3); [...n, ...tri(k).flatMap(vtx)].forEach((v, i) => out.setFloat32(at + i * 4, v, true)); }
  return new Uint8Array(out.buffer);
}
export function stlAscii() {
  const rows = ['solid cube'];
  for (let k = 0; k < 12; k++) { const n = CUBE.normals.slice(tri(k)[0] * 3, tri(k)[0] * 3 + 3); rows.push(`facet normal ${n.join(' ')}`, 'outer loop', ...tri(k).map(i => `vertex ${vtx(i).join(' ')}`), 'endloop', 'endfacet'); }
  rows.push('endsolid cube');
  return enc(rows.join('\n') + '\n');
}

// ---- OBJ + MTL -------------------------------------------------------------------------------------------------------------
export function obj(mtl = 'cube.mtl') {
  const rows = ['# rabbit-hole model-fixtures', ...(mtl ? [`mtllib ${mtl}`] : []), 'o Cube'];
  for (let i = 0; i < 24; i++) rows.push(`v ${vtx(i).join(' ')}`);
  for (let i = 0; i < 24; i++) rows.push(`vt ${CUBE.uvs.slice(i * 2, i * 2 + 2).join(' ')}`);
  for (let i = 0; i < 24; i++) rows.push(`vn ${CUBE.normals.slice(i * 3, i * 3 + 3).join(' ')}`);
  if (mtl) rows.push('usemtl Checker');
  for (let k = 0; k < 12; k++) rows.push(`f ${tri(k).map(i => `${i + 1}/${i + 1}/${i + 1}`).join(' ')}`);
  return enc(rows.join('\n') + '\n');
}
export const mtl = (map = 'checker.png') => enc(`newmtl Checker\nKd 1 1 1\nmap_Kd ${map}\n`);

// ---- 3MF -----------------------------------------------------------------------------------------------------------------
export function threeMf(unit = 'millimeter') {
  const vertices = Array.from({ length: 24 }, (_, i) => `<vertex x="${vtx(i)[0] * 20}" y="${vtx(i)[1] * 20}" z="${vtx(i)[2] * 20}"/>`).join('');
  const triangles = Array.from({ length: 12 }, (_, k) => `<triangle v1="${tri(k)[0]}" v2="${tri(k)[1]}" v3="${tri(k)[2]}"/>`).join('');
  return zipSync({
    '[Content_Types].xml': enc('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': enc('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': enc(`<?xml version="1.0" encoding="UTF-8"?><model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="2"><base name="Blue" displaycolor="#3366CC"/></basematerials><object id="1" type="model" pid="2" pindex="0" name="Cube"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`),
  }, { mtime: new Date('2020-01-01T00:00:00Z') });
}

// ---- FBX (ASCII 7.3) -------------------------------------------------------------------------------------------------------
export function fbxAscii() {
  const verts = Array.from({ length: 8 }, (_, i) => [(i & 1) - 0.5, ((i >> 1) & 1) - 0.5, ((i >> 2) & 1) - 0.5]).flat();
  // Quads, the last index of each polygon stored as -(i + 1) (FBX's polygon end marker).
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const index = quads.flatMap(q => [q[0], q[1], q[2], -(q[3] + 1)]);
  return enc(`; FBX 7.3.0 project file
; generated by the rabbit-hole model-fixtures script
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7300
	Creator: "rabbit-hole model-fixtures"
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 1001, "Geometry::Cube", "Mesh" {
		Vertices: *${verts.length} {
			a: ${verts.join(',')}
		}
		PolygonVertexIndex: *${index.length} {
			a: ${index.join(',')}
		}
		GeometryVersion: 124
	}
	Model: 1002, "Model::Cube", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
		}
	}
	Material: 1003, "Material::Orange", "" {
		Version: 102
		ShadingModel: "phong"
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",0.9,0.45,0.1
		}
	}
}
Connections:  {
	C: "OO",1002,0
	C: "OO",1001,1002
	C: "OO",1003,1002
}
`);
}

// ---- FBX (binary 7.4) ------------------------------------------------------------------------------------------------------
// Node records (u32 end offset, property count, property bytes, name), typed properties, a 13-byte null record after
// children, and the 160-byte footer readers expect. Same cube and material as the ASCII file.
export function fbxBinary() {
  const prop = v => {
    if (typeof v === 'bigint') { const b = new DataView(new ArrayBuffer(9)); b.setUint8(0, 76); b.setBigInt64(1, v, true); return new Uint8Array(b.buffer); }
    if (typeof v === 'string') { const t = enc(v), b = new DataView(new ArrayBuffer(5)); b.setUint8(0, 83); b.setUint32(1, t.length, true); return cat([new Uint8Array(b.buffer), t]); }
    if (v?.ints) { const b = new DataView(new ArrayBuffer(13 + v.ints.length * 4)); b.setUint8(0, 105); b.setUint32(1, v.ints.length, true); b.setUint32(5, 0, true); b.setUint32(9, v.ints.length * 4, true); v.ints.forEach((x, i) => b.setInt32(13 + i * 4, x, true)); return new Uint8Array(b.buffer); }
    if (v?.doubles) { const b = new DataView(new ArrayBuffer(13 + v.doubles.length * 8)); b.setUint8(0, 100); b.setUint32(1, v.doubles.length, true); b.setUint32(5, 0, true); b.setUint32(9, v.doubles.length * 8, true); v.doubles.forEach((x, i) => b.setFloat64(13 + i * 8, x, true)); return new Uint8Array(b.buffer); }
    if (v?.double !== undefined) { const b = new DataView(new ArrayBuffer(9)); b.setUint8(0, 68); b.setFloat64(1, v.double, true); return new Uint8Array(b.buffer); }
    const b = new DataView(new ArrayBuffer(5)); b.setUint8(0, 73); b.setInt32(1, v, true); return new Uint8Array(b.buffer);
  };
  const node = (name, props = [], children = []) => ({ name, props, children });
  const write = (n, offset) => {
    const props = cat(n.props.map(prop)), name = enc(n.name), headLen = 13 + name.length;
    let at = offset + headLen + props.length; const kids = [];
    for (const child of n.children) { const bytes = write(child, at); kids.push(bytes); at += bytes.length; }
    if (n.children.length) { kids.push(new Uint8Array(13)); at += 13; }
    const head = new DataView(new ArrayBuffer(13)); head.setUint32(0, at, true); head.setUint32(4, n.props.length, true); head.setUint32(8, props.length, true); head.setUint8(12, name.length);
    return cat([new Uint8Array(head.buffer), name, props, ...kids]);
  };
  const P = (...values) => node('P', values);
  const verts = Array.from({ length: 8 }, (_, i) => [(i & 1) - 0.5, ((i >> 1) & 1) - 0.5, ((i >> 2) & 1) - 0.5]).flat();
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const tree = [
    node('FBXHeaderExtension', [], [node('FBXHeaderVersion', [1003]), node('FBXVersion', [7400]), node('Creator', ['rabbit-hole model-fixtures'])]),
    node('GlobalSettings', [], [node('Version', [1000]), node('Properties70', [], [P('UpAxis', 'int', 'Integer', '', 1), P('UnitScaleFactor', 'double', 'Number', '', { double: 1 })])]),
    node('Objects', [], [
      node('Geometry', [1001n, 'Cube\x00\x01Geometry', 'Mesh'], [node('Vertices', [{ doubles: verts }]), node('PolygonVertexIndex', [{ ints: quads.flatMap(q => [q[0], q[1], q[2], -(q[3] + 1)]) }]), node('GeometryVersion', [124])]),
      node('Model', [1002n, 'Cube\x00\x01Model', 'Mesh'], [node('Version', [232])]),
      node('Material', [1003n, 'Green\x00\x01Material', ''], [node('Version', [102]), node('ShadingModel', ['phong']), node('Properties70', [], [P('DiffuseColor', 'Color', '', 'A', { double: 0.2 }, { double: 0.7 }, { double: 0.3 })])]),
    ]),
    node('Connections', [], [node('C', ['OO', 1002n, 0n]), node('C', ['OO', 1001n, 1002n]), node('C', ['OO', 1003n, 1002n])]),
  ];
  const magic = cat([enc('Kaydara FBX Binary  '), new Uint8Array([0, 0x1a, 0])]);
  const version = new DataView(new ArrayBuffer(4)); version.setUint32(0, 7400, true);
  let at = magic.length + 4; const body = [];
  for (const n of tree) { const bytes = write(n, at); body.push(bytes); at += bytes.length; }
  body.push(new Uint8Array(13)); at += 13; // the top-level null record
  const footer = new Uint8Array(160 + ((at + 160) % 16 === 0 ? 1 : 0));
  return cat([magic, new Uint8Array(version.buffer), ...body, footer]);
}

// ---- STEP (a header and a point: enough for detection; a real solid comes from the converter lane's fixtures) ---------
export const stepHeaderOnly = () => enc(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('rabbit-hole model-fixtures'),'2;1');
FILE_NAME('cube.step','2026-10-16T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1=CARTESIAN_POINT('',(0.,0.,0.));
ENDSEC;
END-ISO-10303-21;
`);

// ---- PLY -----------------------------------------------------------------------------------------------------------------
export function plyMesh(format = 'ascii') {
  const head = `ply\nformat ${format} 1.0\ncomment rabbit-hole model-fixtures\nelement vertex 24\nproperty float x\nproperty float y\nproperty float z\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n`;
  if (format === 'ascii') return enc(head + Array.from({ length: 24 }, (_, i) => vtx(i).join(' ')).join('\n') + '\n' + Array.from({ length: 12 }, (_, k) => `3 ${tri(k).join(' ')}`).join('\n') + '\n');
  const body = new DataView(new ArrayBuffer(24 * 12 + 12 * 13));
  for (let i = 0; i < 24; i++) vtx(i).forEach((v, a) => body.setFloat32(i * 12 + a * 4, v, true));
  for (let k = 0; k < 12; k++) { const at = 288 + k * 13; body.setUint8(at, 3); tri(k).forEach((v, j) => body.setInt32(at + 1 + j * 4, v, true)); }
  return cat([enc(head), new Uint8Array(body.buffer)]);
}
// A coloured point cloud on a sphere (binary).
export function plyPoints(count = 2000) {
  const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`;
  const body = new DataView(new ArrayBuffer(count * 15));
  for (let i = 0; i < count; i++) {
    const t = Math.acos(1 - 2 * (i + 0.5) / count), p = Math.PI * (1 + Math.sqrt(5)) * i;
    const xyz = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
    xyz.forEach((v, a) => body.setFloat32(i * 15 + a * 4, v, true));
    xyz.forEach((v, a) => body.setUint8(i * 15 + 12 + a, Math.round((v * 0.5 + 0.5) * 255)));
  }
  return cat([enc(head), new Uint8Array(body.buffer)]);
}

// Gaussian splats: a small coloured ring of blobs, the same set in every encoding.
export function splatSet(count = 512) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2, r = 1 + 0.15 * Math.sin(a * 6);
    return { x: Math.cos(a) * r, y: Math.sin(a * 3) * 0.2, z: Math.sin(a) * r, scale: [0.04, 0.04, 0.02], rot: [1, 0, 0, 0], rgb: [(Math.cos(a) * 0.5 + 0.5), 0.4, (Math.sin(a) * 0.5 + 0.5)], opacity: 0.9 };
  });
}
const SH_C0 = 0.28209479177387814;
const logit = p => Math.log(p / (1 - p));
export function plySplat({ rest = 0, set = splatSet(), drop = null } = {}) {
  const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', ...Array.from({ length: rest }, (_, i) => `f_rest_${i}`), 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'].filter(p => p !== drop);
  const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${set.length}\n${props.map(p => `property float ${p}`).join('\n')}\nend_header\n`;
  const body = new Float32Array(set.length * props.length);
  set.forEach((s, i) => {
    const row = { x: s.x, y: s.y, z: s.z, nx: 0, ny: 0, nz: 0, f_dc_0: (s.rgb[0] - 0.5) / SH_C0, f_dc_1: (s.rgb[1] - 0.5) / SH_C0, f_dc_2: (s.rgb[2] - 0.5) / SH_C0, opacity: logit(s.opacity), scale_0: Math.log(s.scale[0]), scale_1: Math.log(s.scale[1]), scale_2: Math.log(s.scale[2]), rot_0: s.rot[0], rot_1: s.rot[1], rot_2: s.rot[2], rot_3: s.rot[3] };
    props.forEach((p, j) => { body[i * props.length + j] = row[p] ?? 0; });
  });
  return cat([enc(head), new Uint8Array(body.buffer)]);
}
// antimatter15 .splat: position, linear scale (float32 x3 each), RGBA, quaternion w,x,y,z as u8 ((q * 128) + 128).
export function splatFile(set = splatSet()) {
  const out = new DataView(new ArrayBuffer(set.length * 32));
  set.forEach((s, i) => {
    const at = i * 32;
    [s.x, s.y, s.z, ...s.scale].forEach((v, k) => out.setFloat32(at + k * 4, v, true));
    [...s.rgb.map(c => Math.round(c * 255)), Math.round(s.opacity * 255)].forEach((v, k) => out.setUint8(at + 24 + k, v));
    s.rot.forEach((q, k) => out.setUint8(at + 28 + k, Math.max(0, Math.min(255, Math.round(q * 128 + 128)))));
  });
  return new Uint8Array(out.buffer);
}
// GaussianSplats3D .ksplat, compression level 0, one section, no buckets.
export function ksplatFile(set = splatSet()) {
  const n = set.length, header = new DataView(new ArrayBuffer(4096)), section = new DataView(new ArrayBuffer(1024)), data = new DataView(new ArrayBuffer(n * 44));
  header.setUint8(0, 0); header.setUint8(1, 1); header.setUint32(4, 1, true); header.setUint32(8, 1, true); header.setUint32(12, n, true); header.setUint32(16, n, true); header.setUint16(20, 0, true);
  section.setUint32(0, n, true); section.setUint32(4, n, true); section.setUint32(8, 256, true); section.setUint32(12, 0, true); section.setFloat32(16, 5, true); section.setUint16(20, 12, true); section.setUint32(24, 1, true);
  set.forEach((s, i) => {
    const at = i * 44;
    [s.x, s.y, s.z, ...s.scale, ...s.rot].forEach((v, k) => data.setFloat32(at + k * 4, v, true));
    [...s.rgb.map(c => Math.round(c * 255)), Math.round(s.opacity * 255)].forEach((v, k) => data.setUint8(at + 40 + k, v));
  });
  return cat([new Uint8Array(header.buffer), new Uint8Array(section.buffer), new Uint8Array(data.buffer)]);
}
// Niantic .spz version 2 (gzip): 24-bit fixed positions, sigmoid alpha, SH-DC colours, log scales, xyz of the quaternion.
export function spzFile(set = splatSet()) {
  const n = set.length, fractionalBits = 12, head = new DataView(new ArrayBuffer(16));
  head.setUint32(0, 0x5053474e, true); head.setUint32(4, 2, true); head.setUint32(8, n, true); head.setUint8(12, 0); head.setUint8(13, fractionalBits); head.setUint8(14, 0); head.setUint8(15, 0);
  const positions = new Uint8Array(n * 9), alphas = new Uint8Array(n), colors = new Uint8Array(n * 3), scales = new Uint8Array(n * 3), rotations = new Uint8Array(n * 3);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  set.forEach((s, i) => {
    [s.x, s.y, s.z].forEach((v, k) => { const fixed = Math.round(v * (1 << fractionalBits)) & 0xffffff; positions[i * 9 + k * 3] = fixed & 0xff; positions[i * 9 + k * 3 + 1] = (fixed >> 8) & 0xff; positions[i * 9 + k * 3 + 2] = (fixed >> 16) & 0xff; });
    alphas[i] = clamp(s.opacity * 255);
    s.rgb.forEach((c, k) => { colors[i * 3 + k] = clamp((((c - 0.5) / SH_C0) * 0.15 + 0.5) * 255); });
    s.scale.forEach((v, k) => { scales[i * 3 + k] = clamp((Math.log(v) + 10) * 16); });
    const [w, x, y, z] = s.rot, sign = w < 0 ? -1 : 1;
    [x, y, z].forEach((v, k) => { rotations[i * 3 + k] = clamp((v * sign + 1) * 127.5); });
  });
  return new Uint8Array(gzipSync(cat([new Uint8Array(head.buffer), positions, alphas, colors, scales, rotations])));
}

// ---- lossless WebP (VP8L) and PlayCanvas SOG ---------------------------------------------------------------------------
// The smallest valid VP8L stream: no transforms, no colour cache, one prefix-code group in which every literal has an
// 8-bit code (a complete canonical code, so each byte is written as itself), and a one-symbol distance code.
export function webpLossless(width, height, rgba) {
  const bits = []; const put = (value, n) => { for (let i = 0; i < n; i++) bits.push((value >> i) & 1); };
  const code8 = s => { for (let i = 7; i >= 0; i--) bits.push((s >> i) & 1); }; // Huffman codes go MSB first
  put(0x2f, 8); put(width - 1, 14); put(height - 1, 14); put(1, 1); put(0, 3);
  put(0, 1); // no transform
  put(0, 1); // no colour cache
  put(0, 1); // no meta prefix codes
  const normalCode = alphabet => {
    put(0, 1); // not a simple code
    put(12 - 4, 4); // code-length code lengths for the first 12 entries of kCodeLengthCodeOrder
    for (const sym of [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8]) put(sym === 0 || sym === 8 ? 1 : 0, 3);
    put(0, 1); // max_symbol: all
    for (let s = 0; s < alphabet; s++) put(s < 256 ? 1 : 0, 1); // code-length symbol 8 is '1', 0 is '0'
  };
  normalCode(280); normalCode(256); normalCode(256); normalCode(256);
  put(1, 1); put(0, 1); put(0, 1); put(0, 1); // distance: simple code, one symbol (0), 1-bit symbol
  for (let i = 0; i < width * height; i++) { code8(rgba[i * 4 + 1]); code8(rgba[i * 4]); code8(rgba[i * 4 + 2]); code8(rgba[i * 4 + 3]); }
  const data = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => { data[i >> 3] |= b << (i & 7); });
  const chunk = data.length % 2 ? cat([data, new Uint8Array(1)]) : data;
  const head = new DataView(new ArrayBuffer(20));
  enc('RIFF').forEach((c, i) => head.setUint8(i, c)); head.setUint32(4, 12 + chunk.length, true);
  enc('WEBPVP8L').forEach((c, i) => head.setUint8(8 + i, c)); head.setUint32(16, data.length, true);
  return cat([new Uint8Array(head.buffer), chunk]);
}
// PlayCanvas SOG (v1 meta): 16-bit log-encoded means split over two images, log scales, packed quaternions, SH DC +
// opacity; zipped as .sog. Identity rotations, so the quaternion layout choice cannot change the picture.
export function sogFiles(set = splatSet()) {
  const n = set.length, w = 32, h = Math.ceil(n / w);
  const img = () => new Uint8Array(w * h * 4).fill(255);
  const means = set.map(s => [s.x, s.y, s.z].map(v => Math.sign(v) * Math.log(Math.abs(v) + 1)));
  const mins = [0, 1, 2].map(a => Math.min(...means.map(m => m[a]))), maxs = [0, 1, 2].map(a => Math.max(...means.map(m => m[a])));
  const logScales = set.map(s => s.scale.map(Math.log));
  const smin = [0, 1, 2].map(a => Math.min(...logScales.map(m => m[a]))), smax = [0, 1, 2].map(a => Math.max(...logScales.map(m => m[a])) + 1e-3);
  const dc = set.map(s => [...s.rgb.map(c => (c - 0.5) / SH_C0), logit(s.opacity)]);
  const dmin = [0, 1, 2, 3].map(a => Math.min(...dc.map(m => m[a])) - 1e-3), dmax = [0, 1, 2, 3].map(a => Math.max(...dc.map(m => m[a])) + 1e-3);
  const [ml, mu, sc, qu, sh] = [img(), img(), img(), img(), img()];
  const q = (v, lo, hi, top) => Math.max(0, Math.min(top, Math.round(((v - lo) / (hi - lo || 1)) * top)));
  set.forEach((_, i) => {
    for (let a = 0; a < 3; a++) { const v = q(means[i][a], mins[a], maxs[a], 65535); ml[i * 4 + a] = v & 255; mu[i * 4 + a] = v >> 8; sc[i * 4 + a] = q(logScales[i][a], smin[a], smax[a], 255); }
    for (let a = 0; a < 4; a++) sh[i * 4 + a] = q(dc[i][a], dmin[a], dmax[a], 255);
    qu.set([128, 128, 128, 252 + 3], i * 4);
  });
  const meta = {
    means: { shape: [n, 3], dtype: 'float32', mins, maxs, files: ['means_l.webp', 'means_u.webp'] },
    scales: { shape: [n, 3], dtype: 'float32', mins: smin, maxs: smax, files: ['scales.webp'] },
    quats: { shape: [n, 4], dtype: 'uint8', encoding: 'quaternion_packed', files: ['quats.webp'] },
    sh0: { shape: [n, 1, 4], dtype: 'float32', mins: dmin, maxs: dmax, files: ['sh0.webp'] },
  };
  return { 'meta.json': enc(JSON.stringify(meta)), 'means_l.webp': webpLossless(w, h, ml), 'means_u.webp': webpLossless(w, h, mu), 'scales.webp': webpLossless(w, h, sc), 'quats.webp': webpLossless(w, h, qu), 'sh0.webp': webpLossless(w, h, sh) };
}

// ---- ZIP packages ----------------------------------------------------------------------------------------------------------
const MTIME = new Date('2020-01-01T00:00:00Z');
export const zip = tree => zipSync(Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, [v, { mtime: MTIME }]])));
// A ZIP whose one entry is named to escape the package, or is a Unix symlink: zipSync cannot write either, so the name
// and the external attributes are patched in place (same length name).
export function zipWithEntryName(realName, fakeName, bytes = enc('x')) {
  if (realName.length !== fakeName.length) throw new Error('same-length names only');
  const out = zip({ [realName]: bytes }), name = enc(realName), fake = enc(fakeName);
  for (let i = 0; i + name.length <= out.length; i++) if (name.every((c, j) => out[i + j] === c)) out.set(fake, i);
  return out;
}
export function zipWithSymlink(name = 'link.png') {
  const out = zip({ [name]: enc('/etc/passwd') });
  for (let i = 0; i + 4 <= out.length; i++) if (out[i] === 0x50 && out[i + 1] === 0x4b && out[i + 2] === 0x01 && out[i + 3] === 0x02) { out[i + 5] = 3; new DataView(out.buffer).setUint32(i + 38, (0o120777 << 16) >>> 0, true); }
  return out;
}

export function allFixtures() {
  const separate = gltfSeparate();
  const external = gltfSeparate({ bin: 'https://example.com/cube.bin', image: 'file:///C:/Users/someone/checker.png' });
  return {
    'cube.glb': glb(), 'cube-textured.glb': glb({ embedTexture: true }), 'cube-animated.glb': glb({ animation: true }),
    'gltf-separate/cube.gltf': separate.gltf, 'gltf-separate/cube.bin': separate.bin, 'gltf-separate/textures/checker.png': png(),
    'cube-embedded.gltf': gltfEmbedded(), 'cube-external-refs.gltf': external.gltf,
    'cube-binary.stl': stlBinary(), 'cube-ascii.stl': stlAscii(),
    'obj/cube.obj': obj(), 'obj/cube.mtl': mtl(), 'obj/checker.png': png(), 'cube-no-mtl.obj': obj(null),
    'cube.3mf': threeMf(), 'cube-ascii.fbx': fbxAscii(), 'cube-binary.fbx': fbxBinary(), 'cube-header-only.step': stepHeaderOnly(),
    'mesh-ascii.ply': plyMesh('ascii'), 'mesh-binary.ply': plyMesh('binary_little_endian'), 'points.ply': plyPoints(),
    'splat-3dgs.ply': plySplat(), 'splat-3dgs-sh1.ply': plySplat({ rest: 9 }), 'bad-splat-missing-rot.ply': plySplat({ drop: 'rot_3' }),
    'ring.splat': splatFile(), 'ring.ksplat': ksplatFile(), 'ring.spz': spzFile(), 'ring.sog': zip(sogFiles()),
    ...Object.fromEntries(Object.entries(sogFiles()).map(([k, v]) => [`sog-folder/${k}`, v])),
    'gltf-bundle.zip': zip({ 'model/cube.gltf': separate.gltf, 'model/cube.bin': separate.bin, 'model/textures/checker.png': png() }),
    'two-models.zip': zip({ 'a/cube.stl': stlBinary(), 'b/cube.glb': glb() }),
    'traversal.zip': zipWithEntryName('aa/evil.png', '../evil.png'), 'symlink.zip': zipWithSymlink(),
    'bomb.zip': zipSync({ 'cube.bin': [new Uint8Array(8 * 1024 * 1024), { level: 9, mtime: MTIME }] }),
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node e2e/model-fixtures.mjs <dir>'); process.exit(2); }
  for (const [name, bytes] of Object.entries(allFixtures())) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), bytes); }
  console.log(`✓ wrote ${Object.keys(allFixtures()).length} model fixtures to ${dir}`);
}
