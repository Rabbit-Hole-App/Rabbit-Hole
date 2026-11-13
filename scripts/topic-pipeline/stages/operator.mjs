import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { redact } from '../config.mjs';
import { readJson, writeJson, saveState } from '../state.mjs';
import { recordSpend } from '../budget.mjs';
import { makeSet } from '../sets.mjs';

const execute = promisify(execFile);
export const artefactTopic = ctx => ctx.fixture && ctx.dryRun ? `${ctx.topic}-dryrun` : ctx.topic;
export async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function manifest(ctx, name, value) {
  await mkdir(ctx.topicDir, { recursive: true });
  const file = join(ctx.topicDir, name);
  await writeJson(file, value);
  return file;
}
export function scrub(text, ctx) {
  return redact(String(text), ctx.config)
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:workspace|home|tmp|Users|private|var)\/)[^\s"'<>]*/g, '[redacted-path]')
    .replace(/\b(?:sk-ant-|sk-proj-|sk-)[A-Za-z0-9_-]+/g, '[redacted]');
}
export function childEnv() {
  return Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
}
export async function command(ctx, stage, label, executable, args, { cwd, allowFailure = false, verbatim = false } = {}) {
  const log = join(ctx.topicDir, `${stage}-${label}.log`);
  await mkdir(ctx.topicDir, { recursive: true });
  let result;
  try {
    result = await (ctx.execFile ?? execute)(executable, args, {
      cwd: cwd ?? ctx.config.repo.root, env: childEnv(), encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024,
      windowsHide: true, ...(verbatim ? { windowsVerbatimArguments: true } : {}),
    });
  } catch (error) {
    result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.code ?? 1 };
  }
  const output = scrub(`${result?.stdout ?? ''}${result?.stderr ? `\n${result.stderr}` : ''}`, ctx);
  await writeFile(log, output, { mode: 0o600 });
  const code = result?.exitCode ?? result?.code ?? 0;
  if (code !== 0 && !allowFailure) throw new Error(`${label} failed; inspect its captured stage log.`);
  return { stdout: String(result?.stdout ?? ''), stderr: String(result?.stderr ?? ''), code, log };
}
export async function configuredCommand(ctx, stage, label, text, cwd) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const windows = process.platform === 'win32';
  // cmd /s /c "<text>" with the text passed verbatim: Node's own quoting turned a command that starts with a quoted path into \"...\", which cmd cannot run (stack start and stop failed).
  return command(ctx, stage, label, windows ? 'cmd.exe' : '/bin/sh', windows ? ['/d', '/s', '/c', `"${text}"`] : ['-c', text], { cwd, verbatim: windows });
}
export async function integration(ctx) {
  const value = await readJson(join(ctx.topicDir, 'integration.json'));
  if (value.status !== 'ok' || !value.worktree || !value.branch) throw new Error('Stage 05 must complete its required integration checks first.');
  const branch = ctx.fixture && ctx.dryRun ? `release/dryrun-${ctx.topic}` : ctx.config.repo.releaseBranch;
  if (value.branch !== branch) throw new Error('Integration belongs to a different release branch.');
  const head = await command(ctx, '06', 'integration-branch', 'git', ['branch', '--show-current'], { cwd: value.worktree });
  if (head.stdout.trim() !== branch) throw new Error('Integration worktree no longer checks out its recorded release branch.');
  if (value.head) {
    const head = await command(ctx, '06', 'integration-head', 'git', ['rev-parse', 'HEAD'], { cwd: value.worktree });
    if (head.stdout.trim() !== value.head) throw new Error('Integration candidate changed after its required checks. Rerun stage 05.');
  }
  return value;
}
export async function topicSet(ctx, benchPath) {
  const prompts = (await readJson(join(ctx.topicDir, 'prompts.json'))).prompts;
  const author = await readJson(join(ctx.topicDir, 'author.json'));
  const coverage = await readJson(join(ctx.topicDir, 'coverage.json'));
  const covered = Array.isArray(coverage) ? coverage : coverage.prompts ?? coverage.coverage ?? [];
  const rows = prompts.map(p => {
    const authored = (author.references ?? []).filter(r => r.promptIds?.some(id => String(id) === String(p.id)));
    if (authored.length > 1) throw new Error('A prompt maps to more than one authored reference.');
    const reuse = covered.find(r => String(r.id) === String(p.id) && r.decision === 'REUSE');
    const referenceId = p.referenceId ?? authored[0]?.id ?? reuse?.firstHit;
    if (!referenceId) throw new Error('Every prompt needs an explicit intended reference mapping before the pack runs.');
    return { ...p, referenceId };
  });
  const set = makeSet({ topic: artefactTopic(ctx), prompts: rows, estUsdPerCard: ctx.config.bench.estUsdPerCard });
  const file = join(dirname(benchPath), 'sets', `${set.name}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeJson(file, set);
  const copy = await manifest(ctx, 'bench-set.json', set);
  return { set, file, copy, prompts: rows, author };
}
export function benchArgs(ctx, set, tree, out, only = []) {
  const c = ctx.config;
  for (const value of [c.stack?.baseUrl, c.stack?.varsFile, c.stack?.appLog, c.stack?.persistDir, out]) {
    if (!value) throw new Error('Configure every stack path, URL and bench output path in config.local.json.');
  }
  if (!(c.bench.capUsd > 0) || !(c.bench.judgeCapUsd >= 0)) throw new Error('Configure bench generation and judge caps.');
  return ['--base', c.stack.baseUrl, '--vars', c.stack.varsFile, '--log', c.stack.appLog, '--persist', c.stack.persistDir,
    '--tree', tree, '--sets', set, '--runs', '1', '--judge', '--judge-only', 'factual', '--cap', String(c.bench.capUsd),
    '--judge-cap', String(c.bench.judgeCapUsd), '--out', out, ...(only.length ? ['--only', only.join(',')] : [])];
}
export async function benchSupportsConfig(ctx, benchPath) {
  // ponytail: the pinned bench has a hardcoded judge credential file. Do not let it read outside config.local.json.
  const judge = join(dirname(benchPath), 'judge.mjs');
  if (await exists(judge)) {
    const source = await readFile(judge, 'utf8');
    if (/const CREDENTIALS_FILE\s*=\s*['"]/.test(source)) {
      throw new Error('The approved tooling merge must wire bench judge credentials from config.local.json; its current default reads another credential file.');
    }
  }
}
export async function runBench(ctx, stage, label, benchPath, set, tree, only = [], judge = true) {
  if (!ctx.state || ctx.state.usageKnown === false || ctx.state.calls?.some(c => c.usageKnown === false)) throw new Error('Bench calls require reconciled usage and an admitted pipeline state.');
  const out = resolve(ctx.config.bench.outRoot, `${stage}-${artefactTopic(ctx)}${only.length ? '-regenerate' : ''}`);
  const args = benchArgs(ctx, set, tree, out, only);
  if (!judge) args.splice(args.indexOf('--judge'), 1);
  if (judge && !ctx.execFile) await benchSupportsConfig(ctx, benchPath);
  const result = await command(ctx, stage, label, process.execPath, [benchPath, ...args], { cwd: ctx.config.repo.toolingRoot, allowFailure: true });
  const match = result.stdout.match(/^RESULT[^\n]*\breport=(.+)[\\/]report\.md\s*$/m);
  const run = match ? resolve(match[1]) : null;
  let report;
  try { if (run) report = await readJson(join(run, 'results.json')); } catch { /* usage remains unknown */ }
  const cards = report?.cards ?? [];
  const generationUsd = cards.filter(c => c.costSource === 'ledger' && Number.isFinite(c.costUsd)).reduce((s, c) => s + c.costUsd, 0);
  const judgeUsd = Number.isFinite(report?.judge?.spent) ? report.judge.spent : 0;
  const usageKnown = !!report && cards.every(c => c.costSource === 'ledger' && Number.isFinite(c.costUsd))
    && (!judge || !!report.judge && Number.isFinite(report.judge.spent) && report.judge.failed === 0)
    && !/STOP stack unreachable/.test(result.stdout);
  const usageId = report?.meta?.runId ?? `unknown-${stage}-${label}-${Date.now()}`;
  if (!ctx.state.calls.some(c => c.agent === 'bench' && c.run === usageId)) {
    try {
      if (!usageKnown) ctx.state.usageKnown = false;
      recordSpend(ctx.state, { agent: 'bench', run: usageId, model: 'stack-and-factual-judge', usd: generationUsd + judgeUsd, generationUsd, judgeUsd, usageKnown, inputTokens: 0, outputTokens: 0, ms: 0 });
    } finally { await saveState(ctx.topicDir, ctx.state); }
  }
  if (!usageKnown) throw new Error('Bench charge usage is unknown or estimated; saved usage requires reconciliation before any later paid calls.');
  return { run, code: result.code, log: result.log };
}
export async function withStack(ctx, stage, tree, work) {
  const { startCmd, stopCmd } = ctx.config.stack ?? {};
  if (!startCmd?.trim() || !stopCmd?.trim()) throw new Error('Stack commands are empty; no stack or bench was started. Configure both startCmd and stopCmd.');
  try {
    await configuredCommand(ctx, stage, 'stack-start', startCmd, tree);
    return await work();
  } finally {
    await configuredCommand(ctx, stage, 'stack-stop', stopCmd, tree);
  }
}
