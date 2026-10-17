// Turns a planned model bundle into three.js objects for the shared viewer (three-d-renderer.js). Imported lazily by the
// model card only, so neither three's loaders nor Spark reach the initial canvas bundle. Every resource a loader asks
// for goes through one URL modifier: a file in the submitted bundle becomes a local blob: URL, an embedded data: URI
// or blob: URL passes, and anything else (http, https, file, an absolute path that names no bundle file) is answered with an empty
// data: URL and listed, so a model can never make the browser fetch a network or filesystem location.
import * as THREE from 'three';
import { baseName, findInBundle, referenceOf, threeMfUnit } from './model-formats.js';
import { packBundle, zipEntries, zipEntryBytes } from './model-archive.js';

const BASE = 'rhbundle:/'; // the loaders' resource path; never a fetchable scheme
const EMPTY = 'data:,';
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bin: 'application/octet-stream' };

// A LoadingManager that resolves only bundle files. `files`: Map(path -> Uint8Array).
export function bundleManager(files, report = { missing: [], blocked: [] }) {
  const manager = new THREE.LoadingManager(), urls = new Map(), paths = [...files.keys()];
  manager.setURLModifier(url => {
    // data: is embedded; blob: is a same-tab object the loaders make from embedded bytes (GLB images, FBX Video content).
    if (/^(data|blob):/i.test(url)) return url;
    const rest = url.startsWith(BASE) ? url.slice(BASE.length) : null;
    if (rest == null) { if (!report.blocked.includes(url)) report.blocked.push(url); return EMPTY; }
    const ref = referenceOf('', rest);
    const hit = ref.blocked === undefined && !ref.embedded ? findInBundle(paths, ref) : null;
    if (!hit) { const name = ref.name || baseName(ref.path || rest); if (!report.missing.includes(name)) report.missing.push(name); return EMPTY; }
    if (!urls.has(hit)) urls.set(hit, URL.createObjectURL(new Blob([files.get(hit)], { type: MIME[hit.split('.').pop().toLowerCase()] || 'application/octet-stream' })));
    return urls.get(hit);
  });
  manager.revoke = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  return { manager, report };
}

const dirOf = path => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// Counts for the card and the budget check.
export function modelStats(root) {
  const stats = { meshes: 0, triangles: 0, vertices: 0, points: 0, materials: 0, textures: 0, textureBytes: 0 };
  const materials = new Set(), textures = new Set();
  root.traverse(object => {
    const geometry = object.geometry;
    if (!geometry?.attributes?.position) return;
    const count = geometry.attributes.position.count;
    if (object.isPoints) stats.points += count;
    else if (object.isMesh) { stats.meshes++; stats.vertices += count; stats.triangles += Math.floor((geometry.index ? geometry.index.count : count) / 3) * (object.isInstancedMesh ? object.count : 1); }
    for (const material of [object.material].flat()) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && !textures.has(value)) {
        textures.add(value);
        const image = value.image; if (image?.width && image?.height) stats.textureBytes += image.width * image.height * 4;
      }
    }
  });
  stats.materials = materials.size; stats.textures = textures.size;
  return stats;
}

// Z-up formats (STL and 3MF as exported by CAD and slicers) stand upright in three's Y-up world.
const zUp = object => { const group = new THREE.Group(); object.rotation.x = -Math.PI / 2; group.add(object); return group; };
const defaultMaterial = colors => new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0x9aa7b8, vertexColors: !!colors, metalness: 0, roughness: 0.75, side: THREE.DoubleSide });

// { object, animations, kind, splat?, units, stats, report, dispose }. `entry` is from planBundle; `files` a Map.
export async function loadModel({ files, entry, renderer = null, scene = null }) {
  const { manager, report } = bundleManager(files);
  const bytes = files.get(entry.path), path = BASE + dirOf(entry.path);
  let object, animations = [], units = entry.units || null, splat = null, extraDispose = null;
  try {
    switch (entry.format) {
      case 'glb': case 'gltf': {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
        const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.parseAsync(entry.format === 'glb' ? ab(bytes) : new TextDecoder().decode(bytes), path);
        object = gltf.scene; animations = gltf.animations || []; units = 'm';
        break;
      }
      case 'obj': {
        const [{ OBJLoader }, { MTLLoader }] = await Promise.all([import('three/addons/loaders/OBJLoader.js'), import('three/addons/loaders/MTLLoader.js')]);
        const loader = new OBJLoader(manager);
        const text = new TextDecoder().decode(bytes);
        const libs = [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map(m => findInBundle([...files.keys()], referenceOf(entry.path, m[1]))).filter(Boolean);
        if (libs[0]) {
          const creator = new MTLLoader(manager).parse(new TextDecoder().decode(files.get(libs[0])), BASE + dirOf(libs[0]));
          creator.preload(); loader.setMaterials(creator);
        }
        object = loader.parse(text);
        object.traverse(o => { if (o.isMesh && !libs[0]) o.material = defaultMaterial(false); });
        break;
      }
      case 'fbx': {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        object = new FBXLoader(manager).parse(ab(bytes), path); animations = object.animations || [];
        break;
      }
      case 'stl': {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const geometry = new STLLoader().parse(ab(bytes));
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        object = zUp(new THREE.Mesh(geometry, defaultMaterial(geometry.hasColors)));
        break;
      }
      case '3mf': {
        zipEntries(bytes); // the archive guards run before three's own unzip
        const model = zipEntries(bytes).find(e => /\.model$/i.test(e.path));
        if (model) units = threeMfUnit(new TextDecoder().decode(zipEntryBytes(bytes, model)));
        const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
        object = zUp(new ThreeMFLoader(manager).parse(ab(bytes)));
        break;
      }
      case 'ply': {
        if (entry.render === 'splat') { ({ object: splat, dispose: extraDispose } = await loadSplat({ bytes, fileName: baseName(entry.path), renderer, scene })); object = splat; break; }
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
        const geometry = new PLYLoader().parse(ab(bytes)), colors = !!geometry.attributes.color;
        if (entry.render === 'points') {
          geometry.computeBoundingSphere();
          const size = Math.max(geometry.boundingSphere.radius / 300, 1e-4);
          object = new THREE.Points(geometry, new THREE.PointsMaterial({ size, sizeAttenuation: true, vertexColors: colors, color: colors ? 0xffffff : 0x4b6a8f }));
        } else {
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          object = new THREE.Mesh(geometry, defaultMaterial(colors));
        }
        break;
      }
      case 'splat': case 'ksplat': case 'spz': case 'sog': {
        // An unpacked SOG folder (meta.json + WebP planes) travels to Spark as the .sog ZIP it would have been.
        const source = entry.packed === 'sog-folder' ? packBundle([entry.path, ...entry.deps].map(p => ({ path: p.slice(dirOf(entry.path).length), bytes: files.get(p) }))) : bytes;
        ({ object: splat, dispose: extraDispose } = await loadSplat({ bytes: source, fileName: entry.packed === 'sog-folder' ? 'scene.sog' : baseName(entry.path), renderer, scene }));
        object = splat;
        break;
      }
      default: throw new Error(`.${entry.format} has no viewer here`);
    }
  } catch (problem) { manager.revoke(); throw problem; }
  const stats = splat ? { splats: splat.numSplats ?? splat.packedSplats?.numSplats ?? 0 } : modelStats(object);
  return {
    object, animations, kind: splat ? 'splat' : entry.render, units, stats, report,
    dispose() { manager.revoke(); extraDispose?.(); },
  };
}

// Spark (@sparkjsdev/spark, pinned 2.3.1, MIT): one SparkRenderer per viewer, fed the file's bytes - never a URL.
async function loadSplat({ bytes, fileName, renderer, scene }) {
  const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark');
  if (!renderer || !scene) throw new Error('A splat needs the viewer renderer');
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);
  const mesh = new SplatMesh({ fileBytes: bytes.slice(), fileName });
  try { await mesh.initialized; } catch (problem) { scene.remove(spark); spark.dispose?.(); throw new Error(`Spark could not read this splat (${problem?.message || problem})`); }
  mesh.numSplats = mesh.packedSplats?.numSplats ?? mesh.splats?.getNumSplats?.() ?? 0;
  return { object: mesh, dispose() { mesh.dispose?.(); scene.remove(spark); spark.dispose?.(); } };
}
