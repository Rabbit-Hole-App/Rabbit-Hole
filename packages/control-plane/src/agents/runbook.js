// The runbook agent: fills ONLY the model row of the structured runbook
// (docs/features/runbook.md, "Where each field comes from"). Deterministic
// fields are assembled by runbook-schema.js; validation happens there too.
import { toolLoop } from './loop.js';
import { APP_READ_TOOLS, appToolExec } from './tools.js';

const SYSTEM = [
  'You fill the analysis fields of a structured runbook for one deployed app.',
  'Investigate with your tools first (read_source on EVERY file in the bundle,',
  'not only the entry - the runbook documents the whole project the user wrote;',
  'list_runs / read_log / list_outputs for reality checks), then call',
  'submit_runbook exactly once with your findings.',
  '- files: one row per bundle file with its real role; helper modules get',
  'their behavior reflected in what_it_does, commands and known_limits too.',
  'Rules, in force for every field:',
  '- Every claim is checkable: needs, talks_to, endpoints, known_limits and',
  'commands cite file:line exactly as read_source returned the lines.',
  'ONE cite per claim (a single file:line or file:start-end), never comma lists;',
  'split a claim into two entries if it truly lives in two places.',
  'Uncitable claims are omitted, never approximated.',
  '- Omit rather than fill: leave arrays empty and strings null when the code',
  'has nothing to say. Absent means "not applicable".',
  '- No secret VALUES ever, names and locations only.',
  '- Never mention SMALL_* env vars anywhere: they are platform plumbing, not',
  'part of this app. Inputs reach the code automatically; describe inputs by',
  'their form names only. needs lists REAL secrets only (API keys, tokens).',
  '- Plain English, short lines, no em dashes.',
  '- what_it_does: at most 2 sentences. who_its_for: 1 sentence.',
  '- when_to_use: include a negative if the code implies one, else null.',
  '- how_to_use: at most 5 steps about the CODE, not the dashboard: what each',
  'input means and what comes out. Assume the reader may run this anywhere -',
  'locally, on AWS, on a schedule. Never walk through the Run form or app link;',
  'the form is self-explanatory.',
  '- appendix: optional overflow for real findings that fit no other section',
  '(edge cases, data formats, upgrade notes). Never pad it.',
  '- process_flow: the run as 3-7 ordered stages, each step under 7 words',
  '(e.g. "Download the source image"), each citing the file:line where that',
  'stage happens. The dashboard draws these as a diagram, so keep steps short.',
  '- if_it_breaks: symptom the person SEES first, then the likely cause, then',
  'where to look (a command, file:line, or log filter).',
  '- outputs_examples: for each output file, its SHAPE, not content: the first',
  'JSON object, header plus one row, or one sentence for binary.',
].join(' ');

const S = { type: 'string' };
const SUBMIT_TOOL = {
  name: 'submit_runbook',
  description: 'Submit the analysis fields of the runbook. Call exactly once, after investigating.',
  input_schema: {
    type: 'object',
    properties: {
      what_it_does: S,
      who_its_for: S,
      when_to_use: { type: ['string', 'null'] },
      how_to_use: { type: 'array', items: S },
      commands: { type: 'array', items: { type: 'object', properties: { what: S, command: S, from: S }, required: ['what', 'command', 'from'] } },
      needs: { type: 'array', items: { type: 'object', properties: { name: S, used_in: S, for: S, declared: { type: 'boolean' } }, required: ['name', 'used_in', 'for'] } },
      run_locally: { type: 'object', properties: { install: S, env: { type: 'array', items: S }, start: S } },
      storage_contains: { type: ['string', 'null'] },
      talks_to: { type: 'array', items: { type: 'object', properties: { host: S, mode: { type: 'string', enum: ['read', 'write', 'both'] }, for: S, at: S }, required: ['host', 'mode', 'for', 'at'] } },
      files: { type: 'array', items: { type: 'object', properties: { path: S, role: S, entry: { type: 'boolean' } }, required: ['path', 'role'] } },
      endpoints: { type: 'array', items: { type: 'object', properties: { route: S, method: S, does: S, at: S }, required: ['route', 'method', 'does', 'at'] } },
      known_limits: { type: 'array', items: { type: 'object', properties: { text: S, at: S }, required: ['text', 'at'] } },
      if_it_breaks: { type: 'array', items: { type: 'object', properties: { symptom: S, likely: S, look: S }, required: ['symptom', 'likely', 'look'] } },
      outputs_examples: { type: 'array', items: { type: 'object', properties: { name: S, example: S }, required: ['name', 'example'] } },
      appendix: { type: 'array', items: { type: 'object', properties: { title: S, body: S }, required: ['title', 'body'] } },
      process_flow: { type: 'array', items: { type: 'object', properties: { step: S, at: S }, required: ['step', 'at'] } },
    },
    required: ['what_it_does', 'who_its_for', 'how_to_use'],
  },
};

export async function runbookFields(env, app, files, deploy) {
  const intro = [
    `App: ${app.name} (kind: ${app.kind})`,
    app.inputs ? `inputs schema: ${app.inputs}` : null,
    app.outputs ? `outputs declared: ${app.outputs}` : null,
    app.agent_md ? `AGENT.md (builder notes):\n${String(app.agent_md).slice(0, 4000)}` : null,
    `files in the bundle: ${Object.keys(files).join(', ')}`,
    'Investigate, then call submit_runbook.',
  ].filter(Boolean).join('\n');

  return toolLoop(env, {
    system: SYSTEM,
    tools: [...APP_READ_TOOLS, SUBMIT_TOOL],
    exec: appToolExec(env, app, files, deploy),
    intro,
    submitName: 'submit_runbook',
    org: app.org,
  });
}
