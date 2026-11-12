import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson } from '../state.mjs';
import { configuredCommand, integration, manifest, scrub } from './operator.mjs';

export async function run(ctx) {
  const artefacts = [];
  try {
    if (ctx.dryRun || ctx.fixture) return { status: 'fail', artefacts, notes: 'Preview deployment is a no-op in dry-run/fixture mode; no READY recording checkpoint was created.' };
    const { deployCmd, urlFile } = ctx.config.preview ?? {};
    if (!deployCmd?.trim() || !urlFile) return { status: 'fail', artefacts, notes: 'Preview command or URL file is empty; no preview was deployed and no READY recording checkpoint was created.' };
    const audit = await readJson(join(ctx.topicDir, 'audit.json'));
    const verdicts = Array.isArray(audit) ? audit : audit.cards ?? audit.verdicts ?? [];
    const pack = await readJson(join(ctx.topicDir, 'pack.json'));
    const ships = verdicts.filter(r => r.verdict === 'ship');
    if (verdicts.length !== 12 || ships.length < 11 || verdicts.some(r => r.verdict === 'hold')) throw new Error('The pack must pass its audit before preview deployment.');
    const integrated = await integration(ctx);
    const deployed = await configuredCommand(ctx, '08', 'preview', deployCmd, integrated.worktree);
    artefacts.push(deployed.log);
    const url = (await readFile(urlFile, 'utf8')).trim();
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('The configured preview URL file must contain one HTTP(S) URL without credentials.');
    const card = v => pack.rows.find(r => String(r.id) === String(v.id) || r.name === v.id || Number(r.promptId) === Number(v.id));
    if (verdicts.some(v => !card(v))) throw new Error('Audit card ids do not match the saved pack.');
    const detail = [`Preview: ${url}`, '', 'Record list:',
      ...ships.map(v => { const r = card(v); return `- ${r.promptId}: ${r.prompt}`; }), '', 'Skipped:',
      ...verdicts.filter(v => v.verdict !== 'ship').map(v => { const r = card(v); return `- ${r.promptId}: ${v.reason ?? v.reasons?.join('; ') ?? v.verdict}`; }),
      ...(ships.length === verdicts.length ? ['- none'] : []), '', `Cost so far: US$${Number(ctx.state?.spendUsd ?? 0).toFixed(4)}`, '', 'STOP-4 — owner records from this preview; release requires --go.'].join('\n');
    const ready = join(ctx.topicDir, 'READY.md');
    await writeFile(ready, `# READY\n\nTopic ${ctx.topic}\n\n${detail}\n`, { mode: 0o600 });
    artefacts.push(ready, await manifest(ctx, 'ready.json', { preview: url, integrationHead: integrated.head, recordIds: ships.map(v => v.id), status: 'ready' }));
    return { status: 'stop', stop: 'STOP-4', artefacts, notes: 'Configured preview command completed; READY contains the preview, record prompts, skipped cards and cost. Owner recording checkpoint saved.', notificationText: detail };
  } catch (error) { return { status: 'fail', artefacts, notes: scrub(error.message, ctx) }; }
}
