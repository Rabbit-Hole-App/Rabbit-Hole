// The accepted-spec bank (EXP-T11, plan section 6): immutable records of
// accepted component specs with provenance, split, lineage and checks, and
// the one rule deciding which may teach composition to the author. No
// runtime retrieval here (that is T25); this only says what is eligible.
import { validateContract } from '../explain-contract.js';
import { contentHash } from './compile.js';
import { catalogue } from './registry.js';

// Why a record may not be used as an author example. Empty means eligible.
export function ineligibility(record, { records = [], spec, heldoutLineages = [] } = {}) {
  const reasons = [];
  if (record.reuse !== 'eligible') reasons.push(record.reuse === 'private' ? 'private: not for reuse' : 'quarantined');
  if (record.split === 'heldout') reasons.push('held out for evaluation');
  // A derivative shares its source's lineage: never an example if any member is held out.
  if (record.lineage && records.some(other => other.lineage === record.lineage && other.split === 'heldout')) reasons.push(`lineage "${record.lineage}" includes a held-out case`);
  if (record.lineage && heldoutLineages.includes(record.lineage)) reasons.push(`derived from the held-out corpus lineage "${record.lineage}"`);
  const current = new Map(catalogue().map(item => [item.name, item.version]));
  for (const [name, version] of Object.entries(record.componentVersions)) {
    if (current.get(name) !== version) reasons.push(`stale: ${name}@${version} is not the current ${name}${current.has(name) ? `@${current.get(name)}` : ''}`);
  }
  for (const check of ['compile', 'render', 'semantic']) {
    const state = record.checks?.[check] ?? 'unrun';
    if (state !== 'pass') reasons.push(`${check} check ${state}`);
  }
  // Accepted specs are immutable: a changed spec is a new record, not an edit.
  if (spec && contentHash(spec) !== record.specHash) reasons.push('spec changed since it was accepted');
  return reasons;
}

// Every record checked against the contract, joined with its spec.
// heldoutLineages: the corpus lineages split held out (Lane D's case.json).
export function loadBank(bank, specs) {
  const records = bank.records.map(({ example, ...rest }) => ({ ...validateContract('ExampleRecord', rest), example }));
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`duplicate bank record "${record.id}"`);
    ids.add(record.id);
  }
  return records.map(record => {
    const spec = record.spec ?? specs[record.example];
    if (!spec) throw new Error(`bank record "${record.id}" has no spec`);
    return { record, spec, reasons: ineligibility(record, { records, spec, heldoutLineages: bank.heldoutLineages || [] }) };
  });
}

// A component change quarantines every record that uses it until its
// compile, render and semantic checks pass again on the new version.
export function quarantineFor(entries, component) {
  return entries.filter(entry => component in entry.record.componentVersions).map(entry => entry.record.id);
}

// Library coverage for the benchmark reports: per component, how many bank
// records use it and how many of those are eligible. Counts, not scores.
export function bankCoverage(entries) {
  const out = Object.fromEntries(catalogue().map(item => [item.name, { records: 0, eligible: 0 }]));
  for (const { record, reasons } of entries) {
    for (const name of Object.keys(record.componentVersions)) {
      out[name] ??= { records: 0, eligible: 0 };
      out[name].records += 1;
      if (!reasons.length) out[name].eligible += 1;
    }
  }
  return out;
}
