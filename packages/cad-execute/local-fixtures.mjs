// Deterministic local geometry for the five cad-params fixtures (C:/s/spec/cad-controls/design.md). It runs only the
// handwritten fixture sources in fixtures/, never generated code, with the pinned kernel (cadgen 0.7.21, build123d
// 0.11.1). Values pass through the same server validators as a real rebuild; checks re-derive from the same
// expressions; trusted inspection is the same validate.py.
// shortcut: runs outside sandbox/cad-sandbox, which needs Linux namespaces and cgroups; isolation and resource limits are
// not exercised here (use linux-probe.mjs on the image for that).
// Not a CI test: needs a local Python with the pinned kernel. Never calls a model or a hosted executor.
// usage: node packages/cad-execute/local-fixtures.mjs <python> [report.json]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { validateDesign, resolveCadChecks, controlScope } from '../control-plane/src/cad-contract.js';
import { modelRejection } from '../control-plane/src/cad-failure.js';
import { cadControlsManifest } from '../control-plane/src/cad-artifacts.js';
import { validateValues } from '../web/src/cad-parameters.js';
import { quickEditModel } from '../web/src/cad-quick-edit-model.js';
import { cadDimensions } from '../web/src/cad-dimensions.js';
import { parseControls } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const python = process.argv[2], reportPath = process.argv[3];
if (!python) { console.error('usage: node local-fixtures.mjs <python> [report.json]'); process.exit(64); }
// The executor contract fixes /tmp/job; on Windows this resolves on the current drive (C:\tmp\job).
const JOB = resolve('/tmp/job');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)));
Object.assign(env, { PYTHONPATH: join(here, 'runtime'), DO_NOT_TRACK: '1', CADGEN_TELEMETRY: '0', CADGEN_UPDATE_CHECK: '0', CADGEN_DAEMON: '0', CI: '1' });
const cadgen = join(dirname(python), process.platform === 'win32' ? 'cadgen.exe' : 'cadgen');

function fresh() { rmSync(JOB, { recursive: true, force: true }); mkdirSync(join(JOB, 'in'), { recursive: true }); mkdirSync(join(JOB, 'out')); }
function run(args, cwd) { const started = Date.now(); const r = spawnSync(args[0], args.slice(1), { cwd, env, encoding: 'utf8', timeout: 300000 }); return { status: r.status, stderr: (r.stderr || '') + (r.error ? String(r.error) : ''), ms: Date.now() - started }; }

function build(source, values) {
  fresh();
  writeFileSync(join(JOB, 'in/model.py'), source);
  if (values) writeFileSync(join(JOB, 'in/parameters.json'), JSON.stringify({ schema: 'cad-param-values/1', values }));
  const r = run([python, join(JOB, 'in/model.py')], join(JOB, 'out'));
  if (r.status !== 0) return { ok: false, ms: r.ms, diagnostics: r.stderr.slice(-4000) };
  const controls = existsSync(join(JOB, 'out/controls.json')) ? parseControls(readFileSync(join(JOB, 'out/controls.json'))) : null;
  return { ok: true, ms: r.ms, step: readFileSync(join(JOB, 'out/model.step')), controls };
}
function check(step, units, checks) {
  fresh();
  writeFileSync(join(JOB, 'in/model.step'), step);
  writeFileSync(join(JOB, 'in/request.json'), JSON.stringify({ phase: 'check', requirements: { units, checks }, limits: { stage_seconds: 300 } }));
  const r = run([python, '-I', join(here, 'validate.py')], join(JOB, 'out'));
  const report = existsSync(join(JOB, 'out/validation.json')) ? JSON.parse(readFileSync(join(JOB, 'out/validation.json'), 'utf8')) : null;
  return { status: r.status, ms: r.ms, report, stderr: r.status === 0 ? '' : r.stderr.slice(-2000) };
}
function glb(step) {
  fresh();
  writeFileSync(join(JOB, 'in/model.step'), step);
  const r = run([cadgen, 'glb', 'build', join(JOB, 'in/model.step'), join(JOB, 'out/model.glb')], join(JOB, 'out'));
  if (r.status !== 0) return { ok: false, stderr: r.stderr.slice(-1000) };
  const bytes = readFileSync(join(JOB, 'out/model.glb')), length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  return { ok: true, bytes: bytes.length, nodes: json.nodes?.map(n => ({ rotation: n.rotation, scale: n.scale, translation: n.translation, matrix: n.matrix })), positions: (json.accessors || []).filter(a => a.min?.length === 3).map(a => ({ min: a.min, max: a.max })) };
}

// One accepted revision: build, measure, publish the controls block exactly as the control plane would.
function revision(fixture, design, values) {
  const controls = values ? { ...design.brief.controls, parameters: design.brief.controls.parameters.map(p => p.role === 'input' ? { ...p, value: values[p.id] } : p) } : design.brief.controls;
  const scope = controls ? controlScope(controls) : design.brief.parameters;
  const checks = resolveCadChecks(design.checkSpecs, scope);
  const built = build(fixture.source, controls ? Object.fromEntries(controls.parameters.filter(p => p.role === 'input').map(p => [p.id, p.value])) : null);
  if (!built.ok) return { built, rejection: modelRejection(built.diagnostics) };
  const checked = check(built.step, design.brief.units, checks);
  const job = { revisionId: `local-${Math.random().toString(16).slice(2, 10)}`, brief: { ...design.brief, controls } };
  const manifest = { revisionId: job.revisionId, units: design.brief.units, validation: checked.report, ...(controls ? { controls: cadControlsManifest(job, { controls: built.controls }) } : {}) };
  return { built: { ok: true, ms: built.ms, controls: built.controls }, checked, manifest, step: built.step };
}
const facts = r => r.checked.report.facts;
const statuses = r => Object.fromEntries(r.checked.report.checks.map(c => [c.id, c.status]));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const results = [];
function record(name, fn) {
  const started = Date.now();
  try { const detail = fn(); results.push({ name, status: 'passed', ms: Date.now() - started, ...detail }); console.log(`passed  ${name}`); }
  catch (error) { results.push({ name, status: 'failed', ms: Date.now() - started, error: String(error.message).slice(0, 2000) }); console.log(`FAILED  ${name}\n${error.message}`); }
}
const load = name => {
  const raw = JSON.parse(readFileSync(join(here, 'fixtures', name, 'design.json'), 'utf8'));
  const design = validateDesign(structuredClone(raw), { requireVolumeExpressions: true, briefOnly: true });
  return { fixture: { source: readFileSync(join(here, 'fixtures', name, 'model.py'), 'utf8') }, design: { ...design, checkSpecs: raw.checks } };
};
const edit = (design, accepted, changes) => validateValues(design.brief.controls, changes, { bound: accepted.manifest.controls.bindings, current: accepted.manifest.controls.values });

// 1. Linked-dimension cube: one input drives three edges.
{
  const { fixture, design } = load('linked-cube');
  let base;
  record('cube: default build measures 20 mm on every axis', () => {
    base = revision(fixture, design);
    assert.equal(base.checked.status, 0, base.checked.stderr);
    assert.deepEqual(base.manifest.controls.bindings, ['edge']);
    for (const axis of ['x', 'y', 'z']) assert.ok(near(facts(base).bounds_mm[axis], 20));
    assert.ok(near(base.manifest.controls.computed.face_diagonal, 20 * Math.SQRT2));
    return { facts: facts(base), checks: statuses(base), computed: base.manifest.controls.computed, glb: glb(base.step) };
  });
  record('cube: edge 35 rebuilds all three linked edges and the volume', () => {
    const { values, problems } = edit(design, base, { edge: 35 });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    for (const axis of ['x', 'y', 'z']) assert.ok(near(facts(next).bounds_mm[axis], 35));
    assert.ok(near(facts(next).volume_mm3, 35 ** 3, 1e-3));
    assert.ok(near(next.manifest.controls.computed.face_diagonal, 35 * Math.SQRT2), 'computed follows the input');
    const dims = cadDimensions(next.manifest);
    assert.equal(dims.revisionId, next.manifest.revisionId);
    assert.ok(dims.overall.every(d => d.status === 'measured' && near(d.value, 35)));
    return { facts: facts(next), checks: statuses(next), dimensions: dims };
  });
  record('cube: out-of-range and wrong-type edits are refused before any build', () => {
    for (const bad of [{ edge: 500 }, { edge: '20' }, { edge: 20.25 }]) assert.ok(edit(design, base, bad).problems.length, JSON.stringify(bad));
    return {};
  });
}

// 2. Plate with hole diameter, count and spacing.
{
  const { fixture, design } = load('plate-holes');
  let base;
  record('plate: default build measures plate, holes and volume', () => {
    base = revision(fixture, design);
    assert.equal(base.checked.status, 0, base.checked.stderr);
    assert.deepEqual(statuses(base), { size_x: 'passed', size_y: 'passed', size_z: 'passed', volume: 'passed', hole_d: 'passed', one_solid: 'passed' });
    assert.equal(facts(base).circular_edges.filter(c => near(c.diameter_mm, 6)).length, 6, 'top and bottom edge of three holes');
    // GLB axes for the overlay: an asymmetric 120 x 40 x 5 mm plate shows how STEP mm maps to the viewer's mesh.
    const mesh = glb(base.step);
    assert.ok(mesh.ok, mesh.stderr);
    return { facts: facts(base), checks: statuses(base), computed: base.manifest.controls.computed, glb: mesh };
  });
  record('plate: hole diameter change leaves length, width and thickness unchanged', () => {
    const { values, problems } = edit(design, base, { hole_diameter: 9 });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    for (const axis of ['x', 'y', 'z']) assert.ok(near(facts(next).bounds_mm[axis], facts(base).bounds_mm[axis]), `${axis} unchanged`);
    assert.ok(facts(next).circular_diameters_mm.some(d => near(d, 9)) && !facts(next).circular_diameters_mm.some(d => near(d, 6)));
    assert.ok(facts(next).volume_mm3 < facts(base).volume_mm3);
    assert.equal(statuses(next).volume, 'passed', 'volume expectation re-derived from the new diameter');
    return { facts: facts(next), checks: statuses(next), computed: next.manifest.controls.computed };
  });
  record('plate: integer count 3 -> 4 adds one hole; 2.5 is refused', () => {
    assert.ok(edit(design, base, { hole_count: 2.5 }).problems.some(p => /whole number/.test(p.message)));
    const { values, problems } = edit(design, base, { hole_count: 4 });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    const centres = new Set(facts(next).circular_edges.filter(c => near(c.diameter_mm, 6)).map(c => c.center_mm[0].toFixed(3)));
    assert.equal(centres.size, 4);
    assert.ok(near(next.manifest.controls.computed.edge_margin, (120 - 3 * 30 - 6) / 2));
    return { facts: facts(next), holeCentresX: [...centres], computed: next.manifest.controls.computed };
  });
  record('plate: invalid combinations are refused by structured constraints', () => {
    const wide = edit(design, base, { hole_diameter: 30, width: 25 });
    assert.ok(wide.problems.some(p => p.constraint === 'hole_fits_width'), JSON.stringify(wide.problems));
    const overlap = edit(design, base, { hole_spacing: 5 });
    assert.ok(overlap.problems.some(p => p.constraint === 'holes_apart'));
    return { problems: [...wide.problems, ...overlap.problems].map(p => p.message) };
  });
  record('plate: a layout that does not fit is refused by the saved source; nothing is built', () => {
    const { values, problems } = edit(design, base, { hole_count: 8, hole_spacing: 20 });
    assert.deepEqual(problems, [], 'passes the linear constraints');
    const failed = revision(fixture, design, values);
    assert.equal(failed.built.ok, false);
    assert.match(failed.rejection, /holes need 146 mm but the plate is only 120 mm long/);
    return { rejection: failed.rejection };
  });
}

// 3. Cylinder: radius and height.
{
  const { fixture, design } = load('cylinder');
  let base;
  record('cylinder: radius change moves x/y and the rim diameter, height unchanged', () => {
    base = revision(fixture, design);
    assert.equal(base.checked.status, 0, base.checked.stderr);
    const { values, problems } = edit(design, base, { radius: 22.5 });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    assert.ok(near(facts(next).bounds_mm.x, 45) && near(facts(next).bounds_mm.y, 45));
    assert.ok(near(facts(next).bounds_mm.z, facts(base).bounds_mm.z), 'height unchanged');
    assert.ok(near(next.manifest.controls.computed.diameter, 45));
    return { before: facts(base), after: facts(next), checks: statuses(next) };
  });
}

// 4. Bracket with dependent dimensions and a discrete choice.
{
  const { fixture, design } = load('bracket');
  let base;
  record('bracket: computed hole offset matches the measured hole centre', () => {
    base = revision(fixture, design);
    assert.equal(base.checked.status, 0, base.checked.stderr);
    const holes = facts(base).circular_edges.filter(c => near(c.diameter_mm, 5));
    assert.ok(holes.length && holes.every(c => near(c.center_mm[0], base.manifest.controls.computed.hole_offset)), JSON.stringify(holes));
    return { facts: facts(base), computed: base.manifest.controls.computed, checks: statuses(base) };
  });
  record('bracket: base length drives the dependent hole offset; upright and width unchanged', () => {
    const { values, problems } = edit(design, base, { base_length: 90 });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    assert.ok(near(next.manifest.controls.computed.hole_offset, 47));
    assert.ok(facts(next).circular_edges.filter(c => near(c.diameter_mm, 5)).every(c => near(c.center_mm[0], 47)));
    assert.ok(near(facts(next).bounds_mm.z, facts(base).bounds_mm.z) && near(facts(next).bounds_mm.y, facts(base).bounds_mm.y));
    return { facts: facts(next), computed: next.manifest.controls.computed };
  });
  record('bracket: two-hole choice gives two hole centres across the width', () => {
    const { values, problems } = edit(design, base, { mounting: 'two_holes' });
    assert.deepEqual(problems, []);
    const next = revision(fixture, design, values);
    assert.equal(next.checked.status, 0, next.checked.stderr);
    const ys = new Set(facts(next).circular_edges.filter(c => near(c.diameter_mm, 5)).map(c => c.center_mm[1].toFixed(3)));
    assert.deepEqual([...ys].sort(), ['-7.500', '7.500']);
    assert.ok(edit(design, base, { mounting: 'three_holes' }).problems.length, 'unknown choice refused');
    return { holeCentresY: [...ys] };
  });
  record('bracket: two large holes are refused by the source with its explanation', () => {
    const { values, problems } = edit(design, base, { mounting: 'two_holes', hole_diameter: 20 });
    assert.deepEqual(problems, []);
    const failed = revision(fixture, design, values);
    assert.equal(failed.built.ok, false);
    assert.equal(failed.rejection, 'Two holes of this diameter do not fit across the width.');
    return { rejection: failed.rejection };
  });
}

// 5. Imported model: geometry only, no bindings, no controls.
{
  const { fixture, design } = load('imported-step');
  record('imported: STEP inspected; no controls, no Quick edit, overall size measured', () => {
    const built = build(fixture.source, null);
    assert.ok(built.ok, built.diagnostics);
    assert.equal(built.controls, null, 'a constants-only source reads no parameters');
    const checked = check(built.step, 'mm', resolveCadChecks(design.checkSpecs, {}));
    assert.equal(checked.status, 0, checked.stderr);
    const manifest = { revisionId: 'local-imported', units: 'mm', validation: checked.report };
    const quick = quickEditModel(manifest);
    assert.equal(quick.available, false);
    assert.equal(quick.parameters.length, 0);
    const dims = cadDimensions(manifest);
    assert.deepEqual(dims.overall.map(d => [d.axis, Math.round(d.value * 1000) / 1000]), [['x', 50], ['y', 30], ['z', 20]]);
    return { facts: checked.report.facts, quickEdit: quick, dimensions: dims };
  });
}

rmSync(JOB, { recursive: true, force: true });
const summary = { passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, skipped: 0 };
console.log(JSON.stringify(summary));
if (reportPath) writeFileSync(reportPath, JSON.stringify({ runtime: { python, platform: process.platform, cadgen: '0.7.21', build123d: '0.11.1', sandbox: 'not used (Linux-only)' }, summary, results }, null, 2));
process.exitCode = summary.failed ? 1 : 0;
