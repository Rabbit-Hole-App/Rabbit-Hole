// Structured runbook (docs/features/runbook.md). The control plane fills every
// deterministic field; the model fills ONLY its row of the source table via a
// forced submit tool; validation drops uncheckable claims into `warnings`.
// Ask reads the JSON, people read renderMarkdown()'s output.
import { anthropic, parseBundle } from './ask.js';

const MODEL_FIELDS_SYSTEM = [
  'You fill the analysis fields of a structured runbook for one deployed app.',
  'Investigate with your tools first (read_source on the files that matter,',
  'list_runs / read_log / list_outputs for reality checks), then call',
  'submit_runbook exactly once with your findings.',
  'Rules, in force for every field:',
  '- Every claim is checkable: needs, talks_to, endpoints, known_limits and',
  'commands cite file:line exactly as read_source returned the lines.',
  'Uncitable claims are omitted, never approximated.',
  '- Omit rather than fill: leave arrays empty and strings null when the code',
  'has nothing to say. Absent means "not applicable".',
  '- No secret VALUES ever, names and locations only.',
  '- Plain English, short lines, no em dashes.',
  '- what_it_does: at most 2 sentences. who_its_for: 1 sentence.',
  '- when_to_use: include a negative if the code implies one, else null.',
  '- how_to_use: at most 5 steps for the person who opens the app link.',
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
    },
    required: ['what_it_does', 'who_its_for', 'how_to_use'],
  },
};

const READ_TOOLS = [
  { name: 'read_source', description: 'Read one file from the deployed bundle (or get the file list if the path is wrong).', input_schema: { type: 'object', properties: { path: S }, required: ['path'] } },
  { name: 'list_runs', description: 'Recent runs: run_id, status, exit code, inputs, timing.', input_schema: { type: 'object', properties: {} } },
  { name: 'read_log', description: 'Tail of one run log.', input_schema: { type: 'object', properties: { run_id: S, tail: { type: 'number' } }, required: ['run_id'] } },
  { name: 'list_outputs', description: 'Output files one run produced (name, bytes).', input_schema: { type: 'object', properties: { run_id: S }, required: ['run_id'] } },
];

async function modelFields(env, app, files, deploy) {
  const exec = async (name, input) => {
    if (name === 'read_source') {
      const f = files[input.path];
      return f != null ? f.slice(0, 20000) : `no file named ${input.path}. Available: ${Object.keys(files).join(', ')}`;
    }
    if (name === 'list_runs') {
      const { results } = await env.DB.prepare(
        'SELECT run_id, status, exit_code, started_at, finished_at, inputs, deploy_id FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT 10'
      ).bind(app.id).all();
      return JSON.stringify(results.map((r) => ({ ...r, current_deploy: deploy ? r.deploy_id === deploy.id : null })));
    }
    if (name === 'read_log') {
      const { results } = await env.DB.prepare('SELECT line FROM run_logs WHERE run_id = ? ORDER BY seq DESC LIMIT ?')
        .bind(String(input.run_id), Math.min(Number(input.tail) || 40, 200)).all();
      return results.map((r) => r.line).reverse().join('\n') || '(empty log)';
    }
    if (name === 'list_outputs') {
      if (!env.RUNS) return '[]';
      const listed = await env.RUNS.list({ prefix: `runs/${String(input.run_id)}/outputs/` });
      return JSON.stringify(listed.objects.map((o) => ({ name: o.key.split('/').pop(), bytes: o.size })));
    }
    return `unknown tool ${name}`;
  };

  const intro = [
    `App: ${app.name} (kind: ${app.kind})`,
    app.inputs ? `inputs schema: ${app.inputs}` : null,
    app.outputs ? `outputs declared: ${app.outputs}` : null,
    app.agent_md ? `AGENT.md (builder notes):\n${String(app.agent_md).slice(0, 4000)}` : null,
    `files in the bundle: ${Object.keys(files).join(', ')}`,
    'Investigate, then call submit_runbook.',
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: intro }];
  for (let i = 0; i < 10; i++) {
    const resp = await anthropic(env, { max_tokens: 3000, system: MODEL_FIELDS_SYSTEM, tools: [...READ_TOOLS, SUBMIT_TOOL], messages });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
    const msg = await resp.json();
    messages.push({ role: 'assistant', content: msg.content });
    const submit = (msg.content || []).find((b) => b.type === 'tool_use' && b.name === 'submit_runbook');
    if (submit) return submit.input;
    if (msg.stop_reason !== 'tool_use') {
      messages.push({ role: 'user', content: 'Call submit_runbook with your findings now.' });
      continue;
    }
    const results = [];
    for (const b of msg.content) {
      if (b.type === 'tool_use') results.push({ type: 'tool_result', tool_use_id: b.id, content: String(await exec(b.name, b.input || {})).slice(0, 30000) });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('the runbook model never submitted');
}

// ---------- validation (spec: drop the claim, record a warning) ----------

const fileLineOk = (files, ref) => {
  const m = String(ref || '').match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (!m) return files[String(ref)] != null; // a bare path is fine if the file exists
  const f = files[m[1]];
  if (f == null) return false;
  const lines = f.split('\n').length;
  return +m[2] >= 1 && +(m[3] || m[2]) <= lines;
};

function validate(rb, files, bundleText) {
  const warnings = [];
  const drop = (what) => warnings.push(what);

  const citeFiltered = (arr, key, label) => (arr || []).filter((x) => {
    if (fileLineOk(files, x[key])) return true;
    drop(`${label} dropped: cite ${x[key]} not in the bundle`);
    return false;
  });

  rb.needs = (rb.needs || []).filter((n) => {
    if (!bundleText.includes(n.name)) { drop(`needs dropped: ${n.name} not found in the source`); return false; }
    if (!fileLineOk(files, n.used_in)) { drop(`needs dropped: cite ${n.used_in} not in the bundle`); return false; }
    return true;
  });
  rb.commands = (rb.commands || []).filter((c) => {
    const target = String(c.from || '').split(':')[0];
    if (files[target] != null || fileLineOk(files, c.from)) return true;
    drop(`command dropped: ${c.command} cites ${c.from} which is not in the bundle`);
    return false;
  });
  rb.talks_to = citeFiltered(rb.talks_to, 'at', 'talks_to');
  rb.endpoints = citeFiltered(rb.endpoints, 'at', 'endpoint');
  rb.known_limits = citeFiltered(rb.known_limits, 'at', 'known limit');
  rb.files = (rb.files || []).filter((f) => {
    if (files[f.path] != null) return true;
    drop(`files dropped: ${f.path} not in the bundle`);
    return false;
  });

  if (rb.data_flow) {
    for (const key of ['inputs_from', 'outputs_to']) {
      rb.data_flow[key] = (rb.data_flow[key] || []).filter((e) => {
        if (e.at === 'small.toml' || fileLineOk(files, e.at)) return true;
        drop(`data_flow.${key} dropped: cite ${e.at} not in the bundle`);
        return false;
      });
    }
  }

  const sentences = String(rb.what_it_does || '').split(/[.!?]+\s/).filter(Boolean).length;
  if (sentences > 2) {
    rb.what_it_does = String(rb.what_it_does).split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
    drop('what_it_does trimmed to 2 sentences');
  }
  if ((rb.how_to_use || []).length > 5) {
    rb.how_to_use = rb.how_to_use.slice(0, 5);
    drop('how_to_use trimmed to 5 steps');
  }
  return warnings;
}

// ---------- deterministic assembly ----------

async function accessOf(env, app) {
  if (app.visibility === 'domain') return `anyone @${app.org.replace(/^w-/, '').replace(/-/g, '.')}`;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE app_id = ?').bind(app.id).first();
  return `${(n?.n || 0) + 1} people`;
}

// runs_on: only what the platform can actually measure - absent means unknown (principle 5)
async function runsOn(env, app) {
  const { results } = await env.DB.prepare(
    "SELECT started_at, finished_at FROM runs WHERE app_id = ? AND status = 'finished' AND exit_code = 0 ORDER BY id DESC LIMIT 20"
  ).bind(app.id).all();
  const secs = results
    .map((r) => (new Date(r.finished_at.replace(' ', 'T') + 'Z') - new Date(r.started_at.replace(' ', 'T') + 'Z')) / 1000)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const fmt = (x) => (x < 60 ? `${Math.round(x)}s` : `${Math.round(x / 60)}m`);
  const q = (p) => secs[Math.min(secs.length - 1, Math.floor(secs.length * p))];
  return {
    where: 'small hosted',
    ...(app.kind === 'job' ? { scales_to_zero: true } : {}),
    last_run_took: secs.length ? fmt(secs[secs.length - 1] === undefined ? 0 : (new Date(results[0].finished_at.replace(' ', 'T') + 'Z') - new Date(results[0].started_at.replace(' ', 'T') + 'Z')) / 1000) : null,
    typical_run: secs.length >= 4 ? `${fmt(q(0.25))}-${fmt(q(0.75))}` : null,
  };
}

// data_flow: from [inputs]/[outputs]/[storage] in small.toml plus the review's
// aws/outbound observations. leaves_the_org is computed here, never model-written.
function dataFlow(app, files, review) {
  const schema = app.inputs ? JSON.parse(app.inputs) : {};
  const inputs_from = Object.entries(schema).map(([name, spec]) => ({
    source: spec.type === 'file' ? 'user upload' : /s3/.test(spec.pattern || '') ? 's3' : 'form field',
    what: `${name} via the Run form`,
    at: 'small.toml',
  }));
  const outputs_to = [];
  const declared = app.outputs ? JSON.parse(app.outputs) : {};
  for (const [key, o] of Object.entries(declared)) {
    outputs_to.push({ sink: 'run outputs', what: `${o.path || key} to $SMALL_OUTPUTS`, at: 'small.toml' });
  }
  for (const a of review?.aws || []) {
    const write = /put|upload|write|delete/i.test(a.action || '');
    (write ? outputs_to : inputs_from).push({
      ...(write ? { sink: 's3' } : { source: 's3' }),
      what: `${a.action}${a.resource ? ` ${a.resource}` : ''}`,
      at: a.at || 'small.toml',
    });
  }
  for (const o of review?.outbound || []) {
    if (/amazonaws\.com$/.test(o.host || '')) continue; // covered by the aws entries
    outputs_to.push({ sink: 'http', what: `${o.host}${o.purpose ? `: ${o.purpose}` : ''}`, at: o.at || 'small.toml' });
  }
  const persists = [];
  const toml = files['small.toml'] || '';
  if (/\[storage\]/.test(toml)) {
    const pm = toml.match(/\[storage\][^[]*?path\s*=\s*"([^"]+)"/);
    persists.push(pm ? `$SMALL_DATA/${pm[1].replace(/^\/*/, '')}` : '$SMALL_DATA');
  }
  // outside = any outbound host that is neither small nor the org's own AWS (role declared)
  const orgAws = !!app.aws_role_arn;
  const leaves = (review?.outbound || []).some((o) => {
    const h = o.host || '';
    if (/small(-cp)?\./.test(h)) return false;
    if (orgAws && /amazonaws\.com$/.test(h)) return false;
    return true;
  });
  return { inputs_from, outputs_to, ...(persists.length ? { persists } : {}), leaves_the_org: leaves };
}

export async function buildRunbook(env, app, deploy, stored, baseUrl) {
  const files = parseBundle(stored.bundle);
  const lastOk = await env.DB.prepare(
    "SELECT run_id, inputs, started_at, finished_at FROM runs WHERE app_id = ? AND status = 'finished' AND exit_code = 0 ORDER BY id DESC LIMIT 1"
  ).bind(app.id).first();

  let reviewJson = null;
  try { reviewJson = JSON.parse(app.review); } catch { /* unreviewed app */ }
  const m = await modelFields(env, app, files, deploy);

  const schema = app.inputs ? JSON.parse(app.inputs) : {};
  const exampleInputs = lastOk?.inputs ? JSON.parse(lastOk.inputs) : {};
  const inputs = Object.entries(schema).map(([name, spec]) => {
    const constraints = {};
    for (const k of ['accept', 'min', 'max', 'options', 'pattern']) if (spec[k] != null) constraints[k] = spec[k];
    return {
      name,
      type: spec.type || 'text',
      required: !!spec.required,
      default: spec.default ?? null,
      ...(Object.keys(constraints).length ? { constraints } : {}),
      help: spec.help ?? null,
      example: exampleInputs[name] ?? null,
      example_note: null, // AGENT.md has no per-input format yet - omitted, never invented
    };
  });

  const declaredOutputs = app.outputs ? JSON.parse(app.outputs) : {};
  const exShapes = Object.fromEntries((m.outputs_examples || []).map((o) => [o.name, o.example]));
  let produced = [];
  if (lastOk && env.RUNS) {
    const listed = await env.RUNS.list({ prefix: `runs/${lastOk.run_id}/outputs/` });
    produced = listed.objects.map((o) => o.key.split('/').pop());
  }
  const outNames = produced.length ? produced : Object.values(declaredOutputs).map((o) => o.path).filter(Boolean);
  const outputs = outNames.map((name) => {
    const dec = Object.entries(declaredOutputs).find(([, o]) => o.path === name);
    return { name, path: name, label: dec?.[1]?.label ?? null, example: exShapes[name] ?? null };
  });

  const took = lastOk?.started_at && lastOk?.finished_at
    ? `${Math.max(1, Math.round((new Date(lastOk.finished_at.replace(' ', 'T') + 'Z') - new Date(lastOk.started_at.replace(' ', 'T') + 'Z')) / 1000))}s`
    : null;

  const rb = {
    name: app.name,
    kind: app.schedule ? 'scheduled' : app.kind,
    owner: app.owner_email,
    generated_at: new Date().toISOString(),
    url: `${baseUrl}/a/${app.org}/${app.name}/`,
    access: await accessOf(env, app),
    deployed_from: deploy?.commit_sha
      ? { repo: deploy.repo_url || null, branch: deploy.branch || null, commit: deploy.commit_sha, dirty: !!deploy.dirty }
      : null,
    runs_on: await runsOn(env, app),
    data_flow: dataFlow(app, files, reviewJson),

    what_it_does: m.what_it_does || app.description || '',
    who_its_for: m.who_its_for || '',
    when_to_use: m.when_to_use ?? null,

    how_to_use: m.how_to_use || [],
    ...(inputs.length ? { inputs } : {}),
    ...(outputs.length ? { outputs } : {}),
    example_run: {
      command: `small run ${app.name}`,
      from_run: lastOk?.run_id ?? null,
      took,
      produced,
      untested: !lastOk,
    },

    ...(m.run_locally ? { run_locally: m.run_locally } : {}),
    ...(m.commands?.length ? { commands: m.commands } : {}),
    ...(m.needs?.length ? { needs: m.needs } : {}),
    storage: m.storage_contains ? { path: '$SMALL_DATA', contains: m.storage_contains } : null,
    ...(m.talks_to?.length ? { talks_to: m.talks_to } : {}),

    ...(m.files?.length ? { files: m.files } : {}),
    ...(m.endpoints?.length ? { endpoints: m.endpoints } : {}),
    schedule: app.schedule || null,

    ...(m.known_limits?.length ? { known_limits: m.known_limits } : {}),
    ...(m.if_it_breaks?.length ? { if_it_breaks: m.if_it_breaks } : {}),
    ask: app.owner_email,

    review: reviewSummary(app.review),
  };

  const warnings = validate(rb, files, stored.bundle);
  return { runbook: rb, warnings, markdown: renderMarkdown(rb) };
}

function reviewSummary(raw) {
  try {
    const r = JSON.parse(raw);
    return {
      risk: r.risk || 'low',
      secrets: (r.undeclared_secrets || []).length,
      outbound: (r.outbound || []).length,
      shell_exec: (r.shell_exec || []).length,
      findings: (r.findings || []).length,
    };
  } catch { return null; }
}

// ---------- rendering (spec order, tables, absent sections skipped) ----------

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');
const table = (headers, rows) =>
  [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');

export function renderMarkdown(rb) {
  const out = [];
  out.push(`# ${rb.name}`);
  const dep = rb.deployed_from;
  out.push([rb.kind, rb.access, rb.url].filter(Boolean).join(' · '));
  out.push([
    dep ? `deployed from ${dep.branch || '?'} · \`${(dep.commit || '').slice(0, 7)}\`${dep.dirty ? ' · dirty' : ''}` : null,
    `owner ${rb.owner}`,
  ].filter(Boolean).join(' · '));
  const ro = rb.runs_on;
  if (ro) {
    out.push([
      `Runs on ${ro.where}${ro.region ? ` (${ro.region})` : ''}`,
      ro.memory, ro.gpu === false ? 'no GPU' : ro.gpu ? 'GPU' : null,
      ro.cold_start ? `${ro.cold_start} cold start` : null,
      ro.scales_to_zero ? 'scales to zero' : null,
      ro.typical_run ? `typical run ${ro.typical_run}` : ro.last_run_took ? `last run ${ro.last_run_took}` : null,
      ro.cost_note,
    ].filter(Boolean).join(' · '));
  }

  const df = rb.data_flow;
  if (df && (df.inputs_from?.length || df.outputs_to?.length)) {
    out.push(`## Where data comes from and goes\n${[
      df.inputs_from?.length ? `In:\n${df.inputs_from.map((e) => `- ${e.what} (${e.source}) \`${e.at}\``).join('\n')}` : null,
      df.outputs_to?.length ? `Out:\n${df.outputs_to.map((e) => `- ${e.what} (${e.sink}) \`${e.at}\``).join('\n')}` : null,
      df.persists?.length ? `Survives between runs: ${df.persists.map((x) => `\`${x}\``).join(', ')}` : null,
      df.leaves_the_org ? '**This app sends data outside the organisation.**' : null,
    ].filter(Boolean).join('\n\n')}`);
  }

  if (rb.what_it_does) out.push(`## What it does\n${rb.what_it_does}${rb.who_its_for ? `\n\n${rb.who_its_for}` : ''}${rb.when_to_use ? `\n\n${rb.when_to_use}` : ''}`);
  if (rb.how_to_use?.length) out.push(`## How to use it\n${rb.how_to_use.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);

  const ex = rb.example_run;
  if (ex) {
    const l1 = `\`${ex.command}\`${ex.from_run ? ` · from run \`${ex.from_run}\`${ex.took ? `, ${ex.took}` : ''}` : ''}${ex.untested ? ' · untested: built from defaults, no successful run yet' : ''}`;
    const imgs = (ex.produced || []).filter((n) => /\.(jpe?g|png|gif|webp)$/i.test(n) && ex.from_run)
      .map((n) => `![${n}](/api/runs/${ex.from_run}/outputs/${encodeURIComponent(n)})`);
    out.push(`## Example\n${l1}${ex.produced?.length ? `\nReturns ${ex.produced.map((p) => `\`${p}\``).join(', ')}.` : ''}${imgs.length ? `\n\n${imgs.join('\n\n')}` : ''}`);
  }

  if (rb.inputs?.length) {
    out.push(`## Inputs\n${table(
      ['name', 'type', 'required', 'default', 'example', 'help'],
      rb.inputs.map((i) => [i.name, i.type, i.required ? 'yes' : '', i.default ?? '', i.example ?? '', i.help ?? ''])
    )}`);
  }
  if (rb.outputs?.length) {
    out.push(`## Outputs\n${rb.outputs.map((o) => `- \`${o.name}\`${o.label ? ` (${o.label})` : ''}${o.example ? `: ${o.example}` : ''}`).join('\n')}`);
  }

  if (rb.run_locally) {
    out.push(`## Run it locally\n${[
      rb.run_locally.install ? `- Install: \`${rb.run_locally.install}\`` : null,
      rb.run_locally.env?.length ? `- Env vars it reads: ${rb.run_locally.env.map((e) => `\`${e}\``).join(', ')}` : null,
      rb.run_locally.start ? `- Start: \`${rb.run_locally.start}\`` : null,
    ].filter(Boolean).join('\n')}`);
  }
  if (rb.commands?.length) out.push(`## Commands\n${table(['what', 'command', 'from'], rb.commands.map((c) => [c.what, `\`${c.command}\``, `\`${c.from}\``]))}`);
  if (rb.needs?.length) out.push(`## Needs\n${table(['secret', 'used in', 'for', 'declared'], rb.needs.map((n) => [`\`${n.name}\``, `\`${n.used_in}\``, n.for, n.declared === false ? 'NO' : 'yes']))}`);
  if (rb.storage) out.push(`## Storage\n\`${rb.storage.path}\`: ${rb.storage.contains}`);
  if (rb.talks_to?.length) out.push(`## Talks to\n${rb.talks_to.map((t) => `- ${t.host} (${t.mode}): ${t.for} \`${t.at}\``).join('\n')}`);

  if (rb.files?.length) out.push(`## Files\n${table(['path', 'role'], rb.files.map((f) => [`\`${f.path}\`${f.entry ? ' (entry)' : ''}`, f.role]))}`);
  if (rb.endpoints?.length) out.push(`## Endpoints\n${table(['route', 'method', 'does', 'at'], rb.endpoints.map((e) => [`\`${e.route}\``, e.method, e.does, `\`${e.at}\``]))}`);
  if (rb.schedule) out.push(`## Schedule\n\`${rb.schedule}\` (UTC)`);

  if (rb.known_limits?.length) out.push(`## Known limits\n${rb.known_limits.map((l) => `- ${l.text} \`${l.at}\``).join('\n')}`);
  if (rb.if_it_breaks?.length) {
    out.push(`## If it breaks\n${rb.if_it_breaks.map((b) => `- **You see:** ${b.symptom}\n  **Likely:** ${b.likely}\n  **Look:** ${/[\w./-]+:\d+/.test(b.look) ? `\`${b.look}\`` : b.look}`).join('\n')}`);
  }
  out.push(`## Ask\n${rb.ask}`);
  if (rb.review) out.push(`*review: risk ${rb.review.risk} · ${rb.review.secrets} undeclared secrets · ${rb.review.outbound} outbound · ${rb.review.shell_exec} shell exec · ${rb.review.findings} findings*`);

  return out.join('\n\n');
}
