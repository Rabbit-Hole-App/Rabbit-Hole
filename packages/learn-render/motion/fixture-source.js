// A pinned repository fixture as a grounding source ({repository, commit, files, read}), for
// tests and the development harness. Every file is checked against its MANIFEST sha256 on load,
// so the fixture cannot drift from the commit it claims.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function fixtureSource(name = 'nanogpt-3adf61e') {
  const dir = fileURLToPath(new URL(`./fixtures/sources/${name}/`, import.meta.url));
  const manifest = JSON.parse(readFileSync(`${dir}MANIFEST.json`, 'utf8'));
  const cache = new Map();
  const read = path => {
    if (!(path in manifest.files)) throw new Error(`${path} is not in ${manifest.repository}@${manifest.commit.slice(0, 7)}`);
    if (!cache.has(path)) {
      const bytes = readFileSync(`${dir}${path}`);
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (sha !== manifest.files[path]) throw new Error(`${path} does not match its pinned sha256 (${sha})`);
      cache.set(path, bytes.toString('utf8'));
    }
    return cache.get(path);
  };
  return { repository: manifest.repository, commit: manifest.commit, files: Object.keys(manifest.files), read };
}
