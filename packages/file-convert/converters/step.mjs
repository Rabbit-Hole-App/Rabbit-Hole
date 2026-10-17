// STEP -> GLB viewing mesh with occt-import-js (OpenCascade 7.6.1 compiled to WebAssembly).
// The original STEP stays the source of truth; the mesh is a tessellated preview without the
// B-rep, parametric history or PMI.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { LIMITS } from '../contract.mjs';
import { occtToGlb, outline } from './glb.mjs';

// The length unit the file declares for its geometry: the LENGTH_UNIT among the units of its
// GLOBAL_UNIT_ASSIGNED_CONTEXT(s). null when none or several differ: the card must not show
// measurements then. (A CONVERSION_BASED_UNIT('INCH', ...) points at an SI millimetre for its
// factor; only the unit the context assigns counts.)
export function stepLengthUnit(text) {
  const entities = new Map();
  for (const m of text.matchAll(/#(\d+)\s*=([^;]*);/g)) entities.set(m[1], m[2]);
  const found = new Set();
  for (const m of text.matchAll(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\s*\(([^)]*)\)/g)) {
    for (const ref of m[1].matchAll(/#(\d+)/g)) {
      const stmt = entities.get(ref[1]) || '';
      if (!/LENGTH_UNIT/.test(stmt)) continue;
      const conv = stmt.match(/CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/i);
      if (conv) { found.add(conv[1].toLowerCase()); continue; }
      const si = stmt.match(/SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/);
      if (si) found.add({ $: 'metre', '.MILLI.': 'millimetre', '.CENTI.': 'centimetre', '.DECI.': 'decimetre', '.KILO.': 'kilometre', '.MICRO.': 'micrometre' }[si[1]] || 'metre (prefixed)');
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

const QUALITY = { draft: [0.005, 1.0], normal: [0.001, 0.5], fine: [0.0005, 0.25] };

export async function stepToGlb(bytes, { quality = 'normal', occtDir, version = 'unknown' } = {}) {
  const require = createRequire(import.meta.url);
  const occt = await require(join(occtDir, 'occt-import-js.js'))();
  const sourceUnit = stepLengthUnit(bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024)).toString('latin1'));
  const [linearDeflection, angularDeflection] = QUALITY[quality];
  const t0 = performance.now();
  const result = occt.ReadStepFile(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection, angularDeflection });
  const read_ms = Math.round(performance.now() - t0);
  if (!result?.success) throw Object.assign(new Error('OpenCascade could not read this STEP file'), { code: 'invalid_source' });
  const { glb, stats } = occtToGlb(result, {
    generator: `rabbit-hole file-convert step-glb (occt-import-js ${version})`,
    extras: { source_unit: sourceUnit, unit: 'metre', axis: 'source Z-up rotated to glTF Y-up at the root node' },
    maxElements: LIMITS.glb_max_accessor_elements, maxNodes: LIMITS.glb_max_nodes,
  });
  if (glb.length > LIMITS.glb_max_bytes) throw Object.assign(new Error(`the viewing mesh is ${glb.length} bytes, over the ${LIMITS.glb_max_bytes}-byte viewer limit; try quality "draft"`), { code: 'too_complex' });
  const limitations = ['Tessellated preview: no B-rep, parametric features or PMI', 'Not for engineering or manufacturing measurement'];
  if (!sourceUnit) limitations.push('The file declares no single length unit: do not show measurements');
  return {
    glb,
    structure: { source_unit: sourceUnit, unit: 'metre', quality, ...stats, tree: outline(result.root || {}), read_ms },
    limitations,
  };
}
