import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A synthetic_internal reference (a fixture WE drew, not a capture of the
// real source - see REFERENCE-LICENSING.md) has already nearly been deleted
// twice by an agent who mistook it for an unlicensed external capture and
// went to remove it, catching the mistake only by separately reading
// target.json's referenceProvenance. Metadata a reader has to notice is not
// protection. This makes it a structural, tested fact instead: every case
// declaring referenceType: synthetic_internal must enumerate its protected
// files in target.json's syntheticReferenceFiles, and every one of them
// must exist.

const here = dirname(fileURLToPath(import.meta.url));

function findTargetJsonFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.local-benchmark-cache' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const targetPath = join(full, 'target.json');
    if (existsSync(targetPath)) found.push(targetPath);
    else found.push(...findTargetJsonFiles(full));
  }
  return found;
}

test('every synthetic_internal case enumerates its protected files, and every one exists', () => {
  const targetFiles = findTargetJsonFiles(here);
  const synthetic = targetFiles
    .map(path => ({ path, target: JSON.parse(readFileSync(path, 'utf8')) }))
    .filter(({ target }) => target.referenceType === 'synthetic_internal');

  assert.ok(synthetic.length > 0, 'expected at least one synthetic_internal case to check (illustrated-transformer/01) - did the fixture move or its referenceType change?');

  for (const { path, target } of synthetic) {
    const caseDir = dirname(path);
    assert.ok(
      Array.isArray(target.syntheticReferenceFiles) && target.syntheticReferenceFiles.length > 0,
      `${path}: referenceType is synthetic_internal but syntheticReferenceFiles is missing or empty - a refresh cannot protect what it cannot see`,
    );
    for (const relativeFile of target.syntheticReferenceFiles) {
      const filePath = join(caseDir, relativeFile);
      assert.ok(existsSync(filePath), `${path}: declared synthetic fixture missing: ${relativeFile}`);
    }
  }
});
