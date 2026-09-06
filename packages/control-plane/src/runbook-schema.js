// Structured runbook (docs/features/runbook.md). The control plane fills every
// deterministic field; the model fills ONLY its row of the source table via a
// forced submit tool; validation drops uncheckable claims into `warnings`.
// Ask reads the JSON, people read renderMarkdown()'s output.
import { parseBundle } from './ask.js';
import { runbookFields } from './agents/runbook.js';

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
    // SMALL_* is platform plumbing - it never appears in a runbook
    if (/^SMALL_/.test(n.name)) return false;
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
  rb.process_flow = citeFiltered(rb.process_flow, 'at', 'process step');
  if (!rb.process_flow.length) delete rb.process_flow;
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

  // the platform contract stays out of the reader's document entirely
  if (rb.run_locally) {
    // env entries must be actual env var names - a sentence here is model chatter
    rb.run_locally.env = (rb.run_locally.env || []).filter((e) => {
      if (/SMALL_/.test(e)) return false;
      if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(String(e).replace(/`/g, '').trim())) { drop(`run_locally env "${String(e).slice(0, 40)}" is not an env var name`); return false; }
      return true;
    });
    if (!rb.run_locally.env.length) delete rb.run_locally.env;
    if (/SMALL_/.test(rb.run_locally.start || '')) delete rb.run_locally.start;
    if (!Object.keys(rb.run_locally).length) delete rb.run_locally;
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
      // resource goes in a code span: markdown would swallow <placeholders> as HTML
      what: `${a.action}${a.resource ? ` \`${a.resource}\`` : ''}`,
      at: a.at || 'small.toml',
    });
  }
  for (const o of review?.outbound || []) {
    if (/amazonaws\.com/.test(o.host || '')) continue; // covered by the aws entries
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
  const m = await runbookFields(env, app, files, deploy);
  // the model occasionally hands back a string where the schema says array -
  // a malformed field is dropped, never allowed to crash the build
  for (const k of ['how_to_use', 'commands', 'needs', 'talks_to', 'files', 'endpoints', 'known_limits', 'if_it_breaks', 'outputs_examples', 'appendix', 'process_flow']) {
    if (m[k] != null && !Array.isArray(m[k])) delete m[k];
  }

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
    ...(m.process_flow?.length ? { process_flow: m.process_flow } : {}),
    // the role and what the code was observed doing with it - powers the role peek
    ...(app.aws_role_arn ? {
      aws_role: {
        arn: app.aws_role_arn,
        actions: (reviewJson?.aws || []).map((a) => ({ action: a.action, resource: a.resource ?? null, at: a.at ?? null })),
      },
    } : {}),
    // every file in the deployed bundle except empty ones (blank __init__.py is noise)
    source_files: Object.keys(files).filter((p) => String(files[p] || '').trim().length > 0).sort(),

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
    ...(m.appendix?.length ? { appendix: m.appendix } : {}),
    ask: app.owner_email,

    review: reviewSummary(app.review),
  };

  scrubPlatformVars(rb);
  const warnings = validate(rb, files, stored.bundle);
  return { runbook: rb, warnings, markdown: renderMarkdown(rb) };
}

// Platform env names never reach the reader (or Ask): rewrite them into the
// plain-language thing they stand for, everywhere in the document.
export function scrubPlatformVars(node) {
  const fix = (t) => String(t)
    .replace(/\$?SMALL_INPUT_OUTPUT_BUCKET/g, 'the output_bucket input')
    .replace(/\$?SMALL_INPUT_([A-Z0-9_]+)/g, (_, n) => `the ${n.toLowerCase()} input`)
    .replace(/\$?SMALL_OUTPUTS/g, 'the run outputs folder')
    .replace(/\$?SMALL_INPUTS/g, 'the uploaded files folder')
    .replace(/\$?SMALL_DATA/g, 'persistent storage')
    .replace(/\$?SMALL_RUN_[A-Z0-9_]+/g, 'platform run metadata')
    .replace(/the the/g, 'the')
    .replace(/input input/g, 'input');
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string') node[k] = fix(v);
    else if (v && typeof v === 'object') scrubPlatformVars(v);
  }
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
const table = (headers, rows) => {
  // columns where every row is empty carry no information - drop them
  const keep = headers.map((_, c) => rows.some((r) => String(r[c] ?? '').trim() !== ''));
  const pick = (r) => r.filter((_, c) => keep[c]);
  const h = pick(headers);
  return [`| ${h.join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${pick(r).map(esc).join(' | ')} |`)].join('\n');
};

// Bare refs in prose become chips: file:line tokens and s3:// uris get backticks
// so the web page makes them clickable/coloured. Fenced blocks stay untouched.
function chipify(md) {
  return md.split(/(```[\s\S]*?```)/).map((seg, i) => (i % 2 ? seg
    : seg
      .replace(/(?<![`\w/])((?:[\w-]+\/)*[\w-]+\.(?:py|toml|txt|md|json|csv|cfg|ini|ya?ml|js):\d+(?:-\d+)?)(?![`\w])/g, '`$1`')
      .replace(/(?<!`)(s3:\/\/[^\s`)\],<>]*[^\s`)\],<>.])(?!`)/g, '`$1`')
      .replace(/(?<![`\w/-])(r-[0-9a-f]{8,16})(?![`\w-])/g, '`$1`') // not after / : run ids inside URLs stay plain
      .replace(/the the /g, 'the ')
      .replace(/ input input/g, ' input')
      // clickable refs become #src=/#run= links (onSrcClick intercepts, CSS
      // underlines) - BlockNote drops bold/other marks on inline code, so a
      // link is the only mark that survives to signal "this opens the peek"
      .replace(/`((?:[\w-]+\/)*[\w-]+\.[A-Za-z]\w*:\d+(?:-\d+)?)`/g, (_, r) => `[${r}](#src=${r})`)
      .replace(/`(r-\w{6,})`/g, '[$1](#run=$1)')
      .replace(/`(arn:aws:iam::\d+:role\/[\w+=,.@/-]+)`/g, '[$1](#role=$1)')
      .replace(/(?<![`[\w=/])(arn:aws:iam::\d+:role\/[\w+=,.@-]+)(?![`\]\w])/g, '[$1](#role=$1)')
  )).join('');
}

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

  if (rb.process_flow?.length) {
    // the agent-authored run stages; the dashboard draws this same chain as the diagram
    out.push(`## Process flow\n${rb.process_flow.map((s, i) => `${i + 1}. ${s.step} \`${s.at}\``).join('\n')}`);
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
    // JSON-shaped examples read as code, not prose - backtick them for the chip colour
    const ex = (e) => (/^[[{]/.test(String(e).trim()) && !String(e).includes('`') ? `\`${e}\`` : e);
    out.push(`## Outputs\n${rb.outputs.map((o) => `- \`${o.name}\`${o.label ? ` (${o.label})` : ''}${o.example ? `: ${ex(o.example)}` : ''}`).join('\n')}`);
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
  if (rb.source_files?.length) {
    // ponytail: flat list; collapse into a toggle when a bundle outgrows one screen
    out.push(`## Project files\n${rb.source_files.map((p) => `- [${p}](#src=${encodeURIComponent(p)})`).join('\n')}`);
  }
  if (rb.endpoints?.length) out.push(`## Endpoints\n${table(['route', 'method', 'does', 'at'], rb.endpoints.map((e) => [`\`${e.route}\``, e.method, e.does, `\`${e.at}\``]))}`);
  if (rb.schedule) out.push(`## Schedule\n\`${rb.schedule}\` (UTC)`);

  if (rb.known_limits?.length) out.push(`## Known limits\n${rb.known_limits.map((l) => `- ${l.text} \`${l.at}\``).join('\n')}`);
  if (rb.if_it_breaks?.length) {
    out.push(`## If it breaks\n${rb.if_it_breaks.map((b) => `- **You see:** ${b.symptom}\n  **Likely:** ${b.likely}\n  **Look:** ${/[`\s]/.test(b.look) ? b.look : `\`${b.look}\``}`).join('\n')}`);
  }
  if (rb.appendix?.length) {
    out.push(`## Appendix\n${rb.appendix.map((a) => `### ${a.title}\n${a.body}`).join('\n\n')}`);
  }
  out.push(`## Ask\n${rb.ask}`);
  if (rb.review) out.push(`*review: risk ${rb.review.risk} · ${rb.review.secrets} undeclared secrets · ${rb.review.outbound} outbound · ${rb.review.shell_exec} shell exec · ${rb.review.findings} findings*`);

  return chipify(out.join('\n\n'));
}
