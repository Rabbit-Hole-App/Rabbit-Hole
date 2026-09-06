// Shared read-only tools over one app: deployed source, runs, logs, outputs.
// Agents compose these with their own submit tool.
const S = { type: 'string' };

export const APP_READ_TOOLS = [
  { name: 'read_source', description: 'Read one file from the deployed bundle (or get the file list if the path is wrong).', input_schema: { type: 'object', properties: { path: S }, required: ['path'] } },
  { name: 'list_runs', description: 'Recent runs: run_id, status, exit code, inputs, timing, whether they ran on the current deploy.', input_schema: { type: 'object', properties: {} } },
  { name: 'read_log', description: 'Tail of one run log.', input_schema: { type: 'object', properties: { run_id: S, tail: { type: 'number' } }, required: ['run_id'] } },
  { name: 'list_outputs', description: 'Output files one run produced (name, bytes).', input_schema: { type: 'object', properties: { run_id: S }, required: ['run_id'] } },
];

export function appToolExec(env, app, files, deploy = null) {
  return async (name, input) => {
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
}
