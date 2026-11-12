import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redact } from './config.mjs';

export async function notify(ctx, stop, notes, { fetchImpl = globalThis.fetch } = {}) {
  const name = stop === 'STOP-4' ? 'READY.md' : 'STOPPED.md';
  const text = redact(`# ${stop === 'STOP-4' ? 'READY' : 'STOPPED'}\n\nTopic ${ctx.topic}\n\n${stop}\n\n${notes}\n`, ctx.config);
  const path = join(ctx.topicDir, name);
  await writeFile(path, text);
  if (ctx.config?.notify?.webhookUrl && !ctx.fixture && !ctx.dryRun) {
    const response = await fetchImpl(ctx.config.notify.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(ctx.config.notify.channel ? { channel: ctx.config.notify.channel } : {}) }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Notification returned HTTP ${response.status}`);
  }
  return path;
}
