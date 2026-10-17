// What the parameterized import check (file-import-check.mjs) expects of one fixture, from the capability registry
// (src/file-capabilities.js, docs/features/canvas-file-imports.md section 2) and a fixture list (C:/s/fi-fixtures/manifest.json,
// Lane 5). Pure: no DOM, no network, so the unit tests and the check share it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A registry card is "type[:kind]" on the block it creates (file:clip is { type: 'file', kind: 'clip' }).
export function cardOf(card) {
  if (!card) return null;
  const [type, kind = null] = String(card).split(':');
  return { type, kind };
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The manifest, with each fixture's absolute path. `filter` keeps fixtures whose path or family matches (comma list).
export function loadFixtures(manifestPath, filter = '') {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const root = manifestPath.replace(/[\\/][^\\/]+$/, '');
  const wanted = String(filter).split(',').map(s => s.trim()).filter(Boolean);
  return manifest.fixtures
    .filter(f => !wanted.length || wanted.some(w => f.path.includes(w) || f.family === w || f.role === w))
    .map(f => ({ ...f, file: join(root, f.path) }));
}

// The decision the registry makes for a fixture, and what the check should see because of it.
//   offered: the fixture's family is shipped, so drop and Upload/Insert take the file; otherwise both refuse it.
//   detected: the family the registry gives the file name (null when no shipped family takes it).
//   misdetected: a shipped family claims the file but it is not the fixture's family.
//   byStructure: the extension alone cannot decide (splat-schema .ply vs mesh/point-cloud .ply); only an adapter that
//     reads the header can, so the check reads the card the app made instead.
export function expectation(fixture, registry) {
  const spec = registry.family(fixture.family);
  const detected = registry.familyOf({ name: fixture.path })?.id ?? null;
  const offered = spec?.status === 'shipped';
  const byStructure = fixture.ext === 'ply';
  return {
    known: !!spec,
    offered,
    detected,
    misdetected: detected !== null && detected !== fixture.family && !byStructure,
    byStructure,
    card: offered ? cardOf(spec.card) : null,
    chooser: offered ? spec.chooser : null,
    cap: offered ? spec.limits?.bytes ?? null : null,
    can: spec?.can ?? null,
    // A negative or over-the-cap fixture of an offered family must still end without a working card (refused or neutralised).
    mustRefuse: offered && (fixture.attack === 'mislabelled' || (fixture.role === 'boundary' && spec.limits?.bytes != null && fixture.bytes > spec.limits.bytes)),
  };
}

// A family's sniff on a fixture's first bytes: true/false, or null when the family declares none.
export function sniffs(registry, fixture, head) {
  const spec = registry.family(fixture.family);
  return spec?.sniff ? !!spec.sniff(head) : null;
}

// Board JSON must hold references and compact metadata, never the file (contract section 3): the growth one import caused,
// any long base64 run, data: or blob: URL, and the size of each fileRef. `limit` is the allowed growth in bytes.
export function compactness(beforeText, afterText, { limit = 16 * 1024, sourceBytes = 0 } = {}) {
  const growth = afterText.length - beforeText.length;
  const added = afterText.length > beforeText.length ? afterText : '';
  const base64Run = (added.match(/[A-Za-z0-9+/]{1024,}={0,2}/g) || []).reduce((n, run) => Math.max(n, run.length), 0);
  const dataUri = /"data:[a-z]+\/[a-z0-9.+-]+[;,]/i.test(added);
  const blobUrl = /"blob:/i.test(added);
  const refs = [];
  try { for (const block of JSON.parse(afterText).blocks || []) if (block.fileRef) refs.push(JSON.stringify(block.fileRef).length); } catch { /* not a board */ }
  const fileRefBytes = refs.length ? Math.max(...refs) : 0;
  const ok = growth <= limit && !base64Run && !dataUri && !blobUrl && fileRefBytes < 2048;
  return { ok, growth, sourceBytes, ratio: sourceBytes ? Math.round((growth / sourceBytes) * 1000) / 1000 : null, base64Run, dataUri, blobUrl, fileRefBytes };
}

// Every stored file a card points at, newest contract first: a fileRef source (GET /api/learn/files/<id>), then the board-file
// keys today's cards keep (GET /api/learn/boards/<app>/<board>/assets/<key>), as assetKeysOf lists them.
export function originalsOf(block) {
  const out = [];
  if (block?.fileRef?.source?.id) out.push({ via: 'file', id: block.fileRef.source.id, rev: block.fileRef.source.rev });
  for (const key of [block?.assetKey, block?.source_asset, block?.source?.assetKey]) if (key && !out.some(o => o.id === key)) out.push({ via: 'asset', id: key });
  return out;
}

// The blocks an import added: in `after`, not in `before` (by id).
export function addedBlocks(before, after) {
  const seen = new Set((before?.blocks || []).map(b => b.id));
  return (after?.blocks || []).filter(b => !seen.has(b.id));
}
