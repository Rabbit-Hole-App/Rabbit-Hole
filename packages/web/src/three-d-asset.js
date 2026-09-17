// Bound downloads before parsing. MVP models must contain their own buffers/textures.
export const MAX_MODEL_BYTES = 20 * 1024 * 1024;
export function inspectGlb(buffer) {
  if (buffer.byteLength > MAX_MODEL_BYTES || buffer.byteLength < 20) throw new Error('Use a GLB no larger than 20 MB');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Use a valid binary glTF 2.0 (.glb) model');
  const length = view.getUint32(12, true);
  if (20 + length > buffer.byteLength) throw new Error('Invalid GLB header');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  if ((json.buffers || []).some(b => b.uri) || (json.images || []).some(i => i.uri)) throw new Error('Export one self-contained GLB with embedded textures');
  if ((json.nodes?.length || 0) > 5000 || (json.accessors || []).reduce((n, a) => n + (a.count || 0), 0) > 5000000) throw new Error('Model is too complex for the lesson viewer');
  return json;
}
export async function fetchGlb(url, signal) {
  const parsed = new URL(url);
  const privateAsset = typeof window !== 'undefined' && parsed.origin === window.location.origin && parsed.pathname === '/api/learn/scene';
  const response = await fetch(url, { signal, credentials: privateAsset ? 'same-origin' : 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`Model download failed (${response.status})`);
  if (Number(response.headers.get('content-length')) > MAX_MODEL_BYTES) { await response.body?.cancel(); throw new Error('Use a GLB no larger than 20 MB'); }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_MODEL_BYTES) { await reader.cancel(); throw new Error('Use a GLB no larger than 20 MB'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  inspectGlb(bytes.buffer); return bytes.buffer;
}
