'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { call, apiBase } = require('./api');
const { gitignoreMatchers } = require('./bundle');
const { runtimeSource } = require('./generate');
const inputs = require('./inputs');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function target(name, required = false) {
  let connection;
  try { ({ connection } = await call('GET', '/api/byoc/connection')); }
  catch (error) { if (error.status !== 404) throw error; }
  if (connection && (required || connection.job_name === name || connection.state === 'connected')) {
    if (connection.state !== 'connected') throw new Error('Finish connecting AWS in the dev dashboard before deploying');
    const { apps: hosted } = await call('GET', '/api/apps');
    if (hosted.some((app) => app.name === name)) {
      if (required) throw new Error('This app name is already used by a hosted app; choose a different name');
      return null;
    }
    if (!/^[a-z0-9-]{1,40}$/.test(name)) {
      if (required) throw new Error('Use an AWS app name with 1-40 lowercase letters, numbers, or hyphens');
      return null;
    }
    if (required || connection.job_name === name || (await (await client(connection))('/apps')).apps.some((app) => app.name === name)) {
      return { ...connection, app_name: name };
    }
  }
  if (required) throw new Error('No AWS connection for this job - open the dev dashboard Settings > Connections > AWS; set SMALL_API to the dev URL');
  return null;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const filename = Buffer.from(name), data = zlib.deflateRawSync(content);
    let crc = 0xffffffff;
    for (const byte of content) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(filename.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(20, 4); header.copy(dir, 6, 4, 30);
    dir.writeUInt32LE(offset, 42);
    local.push(header, filename, data); central.push(dir, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function packageJob(dir, app) {
  const cfg = app.config;
  if (cfg.type !== 'job') throw new Error('AWS preview supports CPU jobs only: set type = "job"');
  if (cfg.schedule || cfg.storage || cfg.aws?.role_arn || cfg.secrets?.required?.length || cfg.system?.length || cfg.deps?.system?.length) {
    throw new Error('AWS preview does not yet support schedules, persistent volumes, app secrets, extra AWS roles, or system packages');
  }
  if (Object.values(cfg.inputs || {}).some((s) => !['text', 'number', 'bool', 'select'].includes(s.type))) throw new Error('AWS preview supports scalar inputs only');
  const validPath = (p) => typeof p === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(p) && !p.split('/').includes('..');
  if (!validPath(app.entry) || !app.entry.endsWith('.py')) throw new Error('Use a relative Python entry path');
  const deps = cfg.deps?.file || 'requirements.txt';
  if (!validPath(deps)) throw new Error('Use a relative requirements path');
  const excluded = new Set(['.git', '.small', '.claude', '.codex', '.aws', '.ssh', '.venv', 'venv', 'node_modules', '__pycache__', 'out',
    '.envrc', '.netrc', '_netrc', '.npmrc', '.pypirc', '.docker']);
  const ignored = [...gitignoreMatchers(dir), ...gitignoreMatchers(dir, '.dockerignore')], files = new Map();
  let total = 0;
  const walk = (relative = '') => {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (excluded.has(entry.name.toLowerCase()) || /^\.env(?:\.|$)/i.test(entry.name) || /\.(env|pem|key|p12|pfx|jsonl|pyc)$/i.test(entry.name) ||
          ignored.some((match) => match(name)) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) {
        const file = path.join(dir, name), size = fs.statSync(file).size;
        total += size;
        if (total > 50 * 1024 * 1024 || size > 10 * 1024 * 1024 || files.size >= 4000) throw new Error('Source exceeds the AWS MVP archive limit (50 MB, 10 MB per file, 4000 files)');
        files.set(name, fs.readFileSync(file));
      }
    }
  };
  walk();
  if (!files.has(app.entry)) throw new Error('Entry is excluded or missing: ' + app.entry);
  const docker = ['FROM public.ecr.aws/docker/library/python:3.13-slim', 'WORKDIR /app'];
  if (files.has(deps)) docker.push(`COPY ${JSON.stringify([deps, '/tmp/requirements.txt'])}`, 'RUN pip install --no-cache-dir -r /tmp/requirements.txt');
  docker.push('COPY . .', 'ENV PYTHONUNBUFFERED=1', 'CMD ' + JSON.stringify(['python', '.small/aws_runner.py', 'python', app.entry]));
  files.set('.small/Dockerfile', Buffer.from(docker.join('\n') + '\n'));
  files.set('.small/aws_runner.py', fs.readFileSync(runtimeSource('aws_runner.py')));
  // Our already-filtered archive is the build context. A stale user .dockerignore
  // must not silently drop the generated AWS runtime or the entry file.
  files.delete('.dockerignore');
  return zip(files);
}

async function client(connection) {
  const { createAwsClient } = await import('./byoc-client.mjs');
  return createAwsClient(() => call('POST', '/api/byoc/grant', {}), connection.api_url);
}

async function jobClient(connection) {
  const aws = await client(connection);
  const prefix = '/apps/' + encodeURIComponent(connection.app_name || connection.job_name);
  return (path, options) => aws(prefix + path, options);
}

async function deploy(dir, app, connection) {
  if (!connection.can_deploy) throw new Error('Only the installer can deploy this AWS job');
  const archive = packageJob(dir, app);
  console.log(`✓ target: workspace ${connection.org} · AWS ${connection.account_id} / ${connection.region}`);
  console.log(`✓ source: ${archive.length} bytes, sent directly to your AWS account`);
  const aws = await jobClient(connection);
  let doc = await aws('/deploys', { method: 'POST', body: { entry: app.entry, inputs: app.config.inputs || {} } });
  if (!/^https:\/\/[^/]+\.s3\.us-east-1\.amazonaws\.com\//.test(doc.upload_url)) throw new Error('Invalid AWS upload destination');
  const upload = await fetch(doc.upload_url, { method: 'PUT', body: archive, headers: { 'Content-Type': 'application/zip' }, redirect: 'error' });
  if (!upload.ok) throw new Error(`AWS source upload failed (${upload.status})`);
  await aws('/deploys/' + doc.id + '/build', { method: 'POST', body: {} });
  console.log('✓ build: started in your AWS account');
  let cursor;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    doc = await aws('/deploys/' + doc.id);
    const log = await aws('/deploys/' + doc.id + '/logs' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    for (const line of log.lines) console.log(line.line);
    cursor = log.cursor;
    if (doc.status === 'built') doc = await aws('/deploys/' + doc.id + '/finalize', { method: 'POST', body: {} });
    if (doc.status === 'ready') {
      console.log(`✓ deployed ${connection.app_name || connection.job_name} → ${apiBase()}/apps/${connection.app_name || connection.job_name}`);
      return doc;
    }
    if (doc.status === 'failed') throw new Error('AWS build failed - see build logs above');
    await pause(3000);
  }
  throw new Error('Build is still pending - inspect its status in the AWS preview');
}

async function printLogs(aws, id) {
  let cursor;
  for (let page = 0; page < 25; page++) {
    const log = await aws('/runs/' + id + '/logs' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    for (const line of log.lines) console.log(line.line);
    if (log.cursor === cursor || !log.lines.length) break;
    cursor = log.cursor;
  }
}

async function download(aws, id, directory) {
  const root = path.resolve(directory);
  fs.mkdirSync(root, { recursive: true });
  const actualRoot = fs.realpathSync(root);
  const { outputs } = await aws('/runs/' + id + '/outputs');
  for (const output of outputs) {
    if (path.isAbsolute(output.name) || output.name.split(/[\\/]/).includes('..') || /[:\x00]/.test(output.name)) throw new Error('Unsafe output filename');
    const dest = path.resolve(root, output.name);
    if (!dest.startsWith(root + path.sep)) throw new Error('Unsafe output filename');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const parent = fs.realpathSync(path.dirname(dest));
    if ((parent !== actualRoot && !parent.startsWith(actualRoot + path.sep)) || (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink())) throw new Error('Output path follows a symlink');
    if (!/^https:\/\/[^/]+\.s3\.us-east-1\.amazonaws\.com\//.test(output.url)) throw new Error('Invalid AWS output destination');
    const response = await fetch(output.url, { redirect: 'error' });
    if (!response.ok) throw new Error('AWS output download failed');
    fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    console.log(`✓ wrote ${dest} (${output.size} bytes)`);
  }
}

async function run(connection, flags) {
  const aws = await jobClient(connection);
  if (flags.download) {
    const { runs } = await aws('/runs');
    if (!runs.length) throw new Error('No runs yet');
    return download(aws, runs[0].run_id, typeof flags.download === 'string' ? flags.download : './out');
  }
  const job = await aws('/job');
  if (job.deployment?.status !== 'ready') throw new Error('Deploy the AWS job first');
  const { values, files } = inputs.validate(job.deployment.inputs, flags);
  if (Object.keys(files).length || Object.values(values).some((v) => typeof v === 'number' && !Number.isFinite(v))) throw new Error('Use finite scalar inputs');
  const started = await aws('/runs', { method: 'POST', body: { deploy_id: job.deployment.id, inputs: values } });
  console.log('✓ AWS run: ' + started.run_id);
  let cursor;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const record = await aws('/runs/' + started.run_id);
    const log = await aws('/runs/' + started.run_id + '/logs' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    for (const line of log.lines) console.log(line.line);
    cursor = log.cursor;
    if (['finished', 'failed'].includes(record.status)) {
      console.log(`✓ AWS run ${record.status} (exit ${record.exit_code})`);
      const { outputs } = await aws('/runs/' + started.run_id + '/outputs');
      for (const output of outputs) console.log(`  ${output.name} (${output.size} bytes)`);
      console.log(`fetch outputs: small run ${connection.app_name || connection.job_name} --workspace ${connection.org} --download ./out`);
      process.exitCode = record.status === 'finished' ? 0 : 1;
      return record;
    }
    await pause(3000);
  }
  throw new Error('Run is still pending - inspect it in the AWS preview');
}

async function runs(connection) {
  const aws = await jobClient(connection);
  for (const row of (await aws('/runs')).runs) console.log(`${row.run_id}  ${row.status}  ${row.started_at}`);
}
async function logs(connection, runId) {
  const aws = await jobClient(connection);
  const id = runId || (await aws('/runs')).runs[0]?.run_id;
  if (!id) return console.log('No runs yet');
  return printLogs(aws, id);
}

async function logsById(runId) {
  const { connection } = await call('GET', '/api/byoc/connection');
  if (connection?.state !== 'connected') throw new Error('Connect AWS in Settings > Connections first');
  const aws = await client(connection);
  for (const { name } of (await aws('/apps')).apps) {
    const scoped = (path, options) => aws('/apps/' + encodeURIComponent(name) + path, options);
    try { await scoped('/runs/' + runId); }
    catch (error) { if (error.status === 404) continue; throw error; }
    return printLogs(scoped, runId);
  }
  throw new Error('No such AWS run in this workspace');
}
module.exports = { target, packageJob, client, deploy, run, runs, logs, logsById };
