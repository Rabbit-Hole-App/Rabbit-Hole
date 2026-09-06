// The runbook agent: a small tool loop that READS before it writes - the deployed
// source, real runs, real logs, real outputs - then emits one Markdown page for
// non-technical teammates. Code references are emitted as #src= links the web
// runbook turns into click-to-open file peeks.
import { anthropic, parseBundle } from './ask.js';

const SYSTEM = [
  'You write the runbook page for one deployed app. The reader is a NON-TECHNICAL',
  'teammate glancing at it to understand and run the app.',
  'First INVESTIGATE with your tools: list_runs (pick the latest finished run),',
  'read_log and list_outputs on that run, and read_source on the files that matter.',
  'Every example value, log line, and output name must come from a tool result,',
  'never invented. Then reply with ONLY the finished Markdown page.',
  'Structure, exactly these sections in this order:',
  '# <app name>, with one plain-language sentence under it.',
  '"## What it does": 2-3 short bullets, everyday words.',
  '"## How to run it": first two bullets are "From this page: open the Run tab,',
  'fill in the form, press Run." and "From the terminal: `small run <app>`".',
  'Then one bullet per input: its name in bold, what to type, and the real example',
  'value from the run you inspected.',
  '"## What you get": one bullet per output file the real run produced (its real',
  'name) and what is inside it in plain words.',
  '"## A good run looks like": start with one line naming the run these examples come',
  'from, its FULL run id as inline code, e.g. Examples come from `r-d904117412ae`.',
  'Then 2-4 REAL log lines in a ``` code block, then ONE line under it saying what',
  'they mean. Any other specific run you mention: full id as inline code too.',
  '"## Where it lives in the code": 2-4 bullets. Each bullet: plain-language what',
  'happens, ending with the reference as inline code, EXACTLY like `job.py:13-15`',
  'or `job.py:13` for one line. Never write it as a Markdown link.',
  'Count lines inside the file exactly as read_source returned them.',
  '"## Schedule & owner": schedule in plain words (or "runs on demand"), the owner,',
  'and who can run it.',
  'Style: short lines, no jargon outside the code section, no em dashes, no',
  'Sources line, Markdown only.',
].join(' ');

const TOOLS = [
  {
    name: 'read_source',
    description: 'Read one file from the deployed source bundle. Returns the file content, or the list of available files if the path is wrong.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'list_runs',
    description: 'The most recent runs: run_id, status, exit code, who started them, when, and their inputs JSON.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_log',
    description: 'Log lines from one run (tail).',
    input_schema: { type: 'object', properties: { run_id: { type: 'string' }, tail: { type: 'number' } }, required: ['run_id'] },
  },
  {
    name: 'list_outputs',
    description: 'The output files one run produced: name and size in bytes.',
    input_schema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
  },
];

export async function runbookAgent(env, app, stored, deploy = null) {
  const files = parseBundle(stored.bundle);
  const exec = async (name, input) => {
    if (name === 'read_source') {
      const f = files[input.path];
      return f != null ? f.slice(0, 20000) : `no file named ${input.path}. Available: ${Object.keys(files).join(', ')}`;
    }
    if (name === 'list_runs') {
      const { results } = await env.DB.prepare(
        'SELECT run_id, status, exit_code, started_by, started_at, finished_at, inputs, deploy_id FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT 12'
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
    app.description ? `description: ${app.description}` : null,
    app.inputs ? `inputs schema: ${app.inputs}` : null,
    app.outputs ? `outputs declared: ${app.outputs}` : null,
    app.schedule ? `schedule (cron, UTC): ${app.schedule}` : 'no schedule set',
    `owner: ${app.owner_email}`,
    deploy ? `current deploy: ${deploy.branch || '?'} · ${(deploy.commit_sha || '').slice(0, 7)}${deploy.dirty ? ' · dirty' : ''} (deploy_id ${deploy.id}). Base every example on runs where current_deploy is true; if none finished on it, say the examples come from an older deploy.` : null,
    `source files in the bundle: ${Object.keys(files).join(', ')}`,
    'Investigate with your tools, then write the runbook page.',
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: intro }];
  for (let i = 0; i < 10; i++) {
    const resp = await anthropic(env, { max_tokens: 2500, system: SYSTEM, tools: TOOLS, messages });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
    const msg = await resp.json();
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason !== 'tool_use') {
      const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (!text.trim()) throw new Error('the runbook agent returned nothing');
      return text.replace(/\n+Sources:.*$/is, '').trim();
    }
    const results = [];
    for (const b of msg.content) {
      if (b.type === 'tool_use') {
        results.push({ type: 'tool_result', tool_use_id: b.id, content: String(await exec(b.name, b.input || {})).slice(0, 30000) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('the runbook agent did not finish in time');
}
