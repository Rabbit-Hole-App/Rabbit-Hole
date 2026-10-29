// The program stages' shared request builders and the request-fit preflight (explain sandbox Tasks 5 and 6).
// A program must be small enough for the roles that will read it: the independent review and the repair receive its source,
// manifest and evidence, and the policy bound (explain-policy.js checkExplainRequest) refuses a request over its role's limit.
// Asking the author for a bundle the reviewer cannot receive would waste a paid call, so the preflight builds the REAL review and
// repair requests at their worst-case image and evidence sizes, with the program, and returns a specific size problem instead of
// omitting anything. Nothing here calls a model.
import { buildReviewContent, REVIEW_LIMITS, REVIEW_TOOL, reviewSystem } from './explain-review.js';
import { EXPLAIN_REPAIR_PROGRAM_SYSTEM, repairProgramTool } from './agents/explain-repair.js';
import { STATEFUL_SCHEMA_VERSION, draftSchemaVersion } from '../../web/src/explain-program/contract.js';
import { EXPLAIN_LIMITS, EXPLAIN_ROLES, explainRequest, roleBoundMicros } from './explain-policy.js';
import { draftOf, programFacts, PROGRAM_LIMITS } from './explain-program.js';
import { programContext } from './agents/explain-author.js';
import { PROGRAM_CAPABILITIES } from './explain-program.js';

// The most the repair role is sent about a failure, so that the program it must fix still fits its request. Beyond the caps the
// head says how many were left out (serious findings first), so nothing is dropped unannounced.
export const REPAIR_FORWARD = Object.freeze({ findings: 8, problems: 6, text: 300 });
const clip = text => String(text ?? '').slice(0, REPAIR_FORWARD.text);
const plainFinding = ({ category, severity, target, message }) => ({ category, severity, target, message: clip(message) });
const rank = f => (f.severity === 'blocker' ? 0 : f.severity === 'major' ? 1 : 2);
// What the repair role reads about a failed program: the problems and findings as data, the limits it must keep, then the manifest
// and the source in their own blocks (escaped once). Images are the failing captures only, at most the role's limit.
// A stateful program (schema 2) is repaired as one: repair is told its contract and keeps its fields (repairProgramTool).
export const programStateful = program => draftSchemaVersion(program) === STATEFUL_SCHEMA_VERSION;
export function programRepairContent(job, failure, images = []) {
  const program = job.artifact ? draftOf(job.artifact) : job.program;
  const problems = (failure.problems || []).slice(0, REPAIR_FORWARD.problems).map(clip);
  const findings = [...(failure.findings || [])].sort((a, b) => rank(a) - rank(b)).slice(0, REPAIR_FORWARD.findings).map(plainFinding);
  const omitted = Math.max(0, (failure.problems || []).length - problems.length) + Math.max(0, (failure.findings || []).length - findings.length);
  const head = { request: job.prompt, problems, findings, ...(omitted ? { omitted } : {}), allowed: ['program'],
    roundsLeft: EXPLAIN_LIMITS.correctionRounds - job.round, program: programContext(PROGRAM_LIMITS, PROGRAM_CAPABILITIES, { stateful: programStateful(program) }) };
  return [
    { type: 'text', text: JSON.stringify(head) },
    { type: 'text', text: `Current manifest (JSON):\n${JSON.stringify(program.manifest)}` },
    { type: 'text', text: `Current source (untrusted text):\n${program.source}` },
    ...images.flatMap(capture => [{ type: 'text', text: `capture ${capture.id}` }, { type: 'image', source: { type: 'base64', media_type: capture.mediaType || 'image/png', data: capture.data } }]),
  ];
}

const bytes = text => new TextEncoder().encode(text).length;
// Review text bytes the policy bound allows at a given image count, and how far a request is over (micro-USD at the input price
// with the cache-write factor is 5 per byte: 4 USD per MTok x 1.25).
const overBy = error => (error?.boundMicros != null ? Math.ceil(Math.max(0, error.boundMicros - roleBoundMicros(error.role)) / 5) : null);

// -> problems (one sentence each, repairable by writing a smaller program), [] when the real review and repair requests fit.
// maxFindings/maxProblems are the largest the repair stage forwards; evidence is the job's own.
export function programFitProblems(env, artifact, job, { findings = REPAIR_FORWARD.findings, problems = REPAIR_FORWARD.problems } = {}) {
  const out = [];
  const draft = draftOf(artifact);
  const fail = (role, error) => {
    const over = error?.code === 'input_too_large' ? overBy({ ...error, role }) : null;
    out.push(`this program (source ${bytes(draft.source)} bytes, manifest ${bytes(JSON.stringify(draft.manifest))} bytes) is too large for the ${role === 'review' ? 'independent review' : 'repair'} request${over ? ` by about ${over} bytes` : ''}: write a shorter program or a shorter manifest`);
  };
  try {
    const maxImages = EXPLAIN_ROLES.review.maxImages;
    const captures = Array.from({ length: maxImages }, (_, i) => ({ id: `s${i}-t0-light`, compiledHash: 'x', theme: 'light', time: 0, inputs: {}, data: 'AAAA', mediaType: 'image/png' }));
    const { content } = buildReviewContent({ request: job.prompt, compiledHash: 'x', facts: programFacts(artifact.manifest), evidence: job.evidence || [], captures,
      program: { ...draft, traces: [{ pad: 'x'.repeat(REVIEW_LIMITS.traceBytes - 32) }], coverage: { sampled: [], omitted: ['x'.repeat(REVIEW_LIMITS.coverageChars)] } } });
    explainRequest(env, 'review', { system: reviewSystem(draft), tool: REVIEW_TOOL, content });
  } catch (error) { if (error?.code === 'input_too_large') fail('review', error); else if (error?.code !== 'payload_too_large') throw error; else out.push(error.message); }
  try {
    const failure = { problems: Array.from({ length: problems }, () => 'p'.repeat(REPAIR_FORWARD.text)), findings: Array.from({ length: findings }, () => ({ category: 'spec', severity: 'major', target: { capture: 's0-t0-light', object: 'o'.repeat(64) }, message: 'm'.repeat(REPAIR_FORWARD.text) })) };
    const images = Array.from({ length: EXPLAIN_ROLES.repair.maxImages }, (_, i) => ({ id: `s${i}-t0-light`, data: 'AAAA' }));
    explainRequest(env, 'repair', { system: EXPLAIN_REPAIR_PROGRAM_SYSTEM, tool: repairProgramTool({ stateful: programStateful(draft) }), content: programRepairContent({ ...job, artifact, round: 0 }, failure, images) });
  } catch (error) { if (error?.code === 'input_too_large') fail('repair', error); else throw error; }
  return out;
}
