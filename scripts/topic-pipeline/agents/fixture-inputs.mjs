import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { readJson } from '../state.mjs';

export async function fileExists(path) {
  try { await access(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function referenceInputs(root) {
  if (!await fileExists(root)) throw new Error('Required reference fixture directory is missing');
  const figures = [];
  async function visit(directory) {
    if (await fileExists(join(directory, 'spec.json'))) {
      const id = relative(root, directory).replaceAll('\\', '/');
      figures.push({ id, spec: await readJson(join(directory, 'spec.json')), directory });
      return;
    }
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) await visit(join(directory, entry.name));
    }
  }
  await visit(root);
  if (!figures.length) throw new Error('Required reference fixture contains no spec.json files');
  return figures;
}

export async function imageInputs(path) {
  const input = sharp(await readFile(path));
  const { width, height } = await input.metadata();
  if (!width || !height) throw new Error('Image has no dimensions');
  const images = [];
  // Preserve native card labels by slicing tall sheets instead of shrinking them.
  for (let top = 0; top < height; top += 1600) {
    const data = await sharp(await readFile(path)).extract({ left: 0, top, width, height: Math.min(1600, height - top) }).png().toBuffer();
    images.push({ mediaType: 'image/png', data: data.toString('base64') });
  }
  return images;
}

export async function cardComparison(directory, output) {
  const modelPath = await fileExists(join(directory, 'card.png')) ? join(directory, 'card.png') : join(directory, 'visual-1.png');
  const referencePath = join(directory, 'reference-408.svg');
  const model = await sharp(await readFile(modelPath)).resize({ width: 408 }).png().toBuffer();
  const reference = await sharp(await readFile(referencePath)).resize({ width: 408 }).png().toBuffer();
  const [a, b] = await Promise.all([sharp(model).metadata(), sharp(reference).metadata()]);
  await mkdir(join(output, '..'), { recursive: true });
  await sharp({ create: { width: 832, height: Math.max(a.height, b.height), channels: 4, background: '#ffffff' } })
    .composite([{ input: model, left: 0, top: 0 }, { input: reference, left: 424, top: 0 }]).png().toFile(output);
  return imageInputs(output);
}

export function validateIds(value, field, expectedIds, topic) {
  if (value.topic !== topic || !Array.isArray(value[field])) throw new Error('Agent returned a different topic or an invalid result array');
  const ids = value[field].map(row => row.id);
  if (ids.length !== expectedIds.length || new Set(ids).size !== ids.length || expectedIds.some(id => !ids.includes(id))) throw new Error('Agent must return every supplied id exactly once');
  return value;
}
