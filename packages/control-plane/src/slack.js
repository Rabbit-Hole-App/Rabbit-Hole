// Slack adapter for Ask — a transport, not a new agent. Every message becomes a
// /api/ask call; every proposal becomes Run/Cancel buttons that hit /api/ask/approve.
// Deps (ask, approve, slackApi) are injected so unit tests mock Slack cleanly.

const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function verifySlackSignature(secret, timestamp, rawBody, signature) {
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // stale = replay
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, te.encode(`v0:${timestamp}:${rawBody}`)));
  return `v0=${mac}` === signature;
}

// Minimal Slack Web API caller (bot token per org).
export function slackApi(token) {
  return async (method, payload) => {
    const resp = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(`slack ${method}: ${data.error}`);
    return data;
  };
}

// Slack user → small actor. Slack identity is never trusted on its own: the
// resolved email must belong to the installing org (domain or explicit member).
export async function resolveActor(env, install, api, slackUserId) {
  const info = await api('users.info', { user: slackUserId });
  const email = (info.user?.profile?.email || '').toLowerCase();
  if (!email) return null;
  const domainOrg = email.split('@')[1]?.toLowerCase().replace(/\./g, '-');
  if (domainOrg === install.org) return { email, org: install.org };
  const member = await env.DB.prepare(
    'SELECT 1 AS x FROM members m JOIN apps a ON a.id = m.app_id WHERE a.org = ? AND m.email = ? LIMIT 1'
  ).bind(install.org, email).first();
  return member ? { email, org: install.org } : null;
}

export const SIGN_IN_REPLY = "I don't know you — sign in at small.app with your work email first.";

// ---------- Block Kit builders ----------

export function chooseBlocks(message, candidates) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: 'Which app do you mean?' } },
    {
      type: 'actions',
      elements: [{
        type: 'static_select',
        action_id: 'ask_choose',
        placeholder: { type: 'plain_text', text: 'Pick an app' },
        options: candidates.slice(0, 25).map((c) => ({
          text: { type: 'plain_text', text: c.app.slice(0, 75) },
          value: JSON.stringify({ app: c.app, message }).slice(0, 2000),
        })),
      }],
    },
  ];
}

export function proposalBlocks(proposal) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${proposal.tool}?*\n\`\`\`${JSON.stringify(proposal.args, null, 2).slice(0, 2500)}\`\`\`` } },
    {
      type: 'actions',
      elements: [
        { type: 'button', style: 'primary', action_id: 'ask_approve', text: { type: 'plain_text', text: 'Run' }, value: proposal.id },
        { type: 'button', action_id: 'ask_cancel', text: { type: 'plain_text', text: 'Cancel' }, value: proposal.id },
      ],
    },
  ];
}

// ---------- helpers over the injected ask() transport ----------

// ask() = calls apiAsk as the actor and returns the parsed result:
// { kind: 'choose', candidates } | { kind: 'answer', text, threadId, proposals: [...] }
export async function runAsk(env, ctx, actor, body, askHandler) {
  const req = new Request('http://internal/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const resp = await askHandler(req, env, ctx, actor);
  const ctype = resp.headers.get('Content-Type') || '';
  if (ctype.includes('json')) {
    const d = await resp.json();
    if (d.choose) return { kind: 'choose', candidates: d.choose };
    return { kind: 'answer', text: `✗ ${d.error || 'ask failed'}`, threadId: null, proposals: [] };
  }
  const raw = await resp.text();
  const text = [...raw.matchAll(/event: chunk\ndata: (.+)/g)].map((m) => JSON.parse(m[1]).text).join('');
  const proposals = [...raw.matchAll(/event: proposal\ndata: (.+)/g)].map((m) => JSON.parse(m[1]));
  const doneRaw = (raw.match(/event: done\ndata: (.+)/) || [])[1];
  const threadId = doneRaw ? JSON.parse(doneRaw).threadId : null;
  return { kind: 'answer', text: text.trim(), threadId, proposals };
}

async function scopeForChannel(env, org, channelId) {
  const link = await env.DB.prepare('SELECT app FROM slack_channels WHERE org = ? AND channel_id = ?').bind(org, channelId).first();
  return link?.app ? { app: link.app } : {};
}

async function threadLink(env, org, channelId, threadTs) {
  const row = await env.DB.prepare('SELECT ask_thread_id FROM slack_threads WHERE org = ? AND channel_id = ? AND thread_ts = ?')
    .bind(org, channelId, threadTs).first();
  return row?.ask_thread_id || null;
}

async function saveThreadLink(env, org, channelId, threadTs, askThreadId) {
  if (!askThreadId) return;
  await env.DB.prepare('INSERT OR REPLACE INTO slack_threads (org, channel_id, thread_ts, ask_thread_id) VALUES (?, ?, ?, ?)')
    .bind(org, channelId, threadTs, askThreadId).run();
}

// ---------- inbound: events (app_mention / message.im) ----------

export async function handleSlackEvent(env, ctx, install, payload, deps) {
  const { api, askHandler } = deps;
  const ev = payload.event;
  if (!ev || ev.bot_id || ev.subtype) return; // never answer bots or edits
  const channel = ev.channel;
  const threadTs = ev.thread_ts || ev.ts;

  const actor = await resolveActor(env, install, api, ev.user);
  if (!actor) {
    await api('chat.postMessage', { channel, thread_ts: threadTs, text: SIGN_IN_REPLY });
    return;
  }

  const message = String(ev.text || '').replace(/<@[^>]+>\s*/g, '').trim();
  if (!message) return;
  const scope = await scopeForChannel(env, install.org, channel);
  const thread_id = await threadLink(env, install.org, channel, threadTs);
  const result = await runAsk(env, ctx, actor, { scope, message, thread_id }, askHandler);

  if (result.kind === 'choose') {
    await api('chat.postMessage', { channel, thread_ts: threadTs, text: 'Which app do you mean?', blocks: chooseBlocks(message, result.candidates) });
    return;
  }
  await saveThreadLink(env, install.org, channel, threadTs, result.threadId);
  if (result.text) await api('chat.postMessage', { channel, thread_ts: threadTs, text: result.text.slice(0, 3000) });
  for (const p of result.proposals) {
    await api('chat.postMessage', { channel, thread_ts: threadTs, text: `${p.tool}?`, blocks: proposalBlocks(p) });
  }
}

// ---------- inbound: /small slash command ----------

export async function handleSlackCommand(env, ctx, install, form, deps, baseUrl) {
  const { api, askHandler, canEditApp } = deps;
  const actor = await resolveActor(env, install, api, form.user_id);
  if (!actor) return { text: SIGN_IN_REPLY };
  const [verb, ...rest] = String(form.text || '').trim().split(/\s+/);
  const channel = form.channel_id;

  if (verb === 'link') {
    const app = rest[0];
    if (!app) return { text: 'usage: /small link <app>' };
    if (!(await canEditApp(env, actor, app))) return { text: `you need edit on ${app} to link it` };
    await env.DB.prepare('INSERT OR REPLACE INTO slack_channels (org, channel_id, app, digest) VALUES (?, ?, ?, 0)')
      .bind(install.org, channel, app).run();
    return { text: `✓ this channel is now linked to ${app} — @small here talks about it, and Watch posts new observations` };
  }
  if (verb === 'unlink') {
    await env.DB.prepare('DELETE FROM slack_channels WHERE org = ? AND channel_id = ?').bind(install.org, channel).run();
    return { text: '✓ unlinked' };
  }
  if (verb === 'digest') {
    // ponytail: the spec wanted this in /settings — a slash command is smaller and stays in Slack
    await env.DB.prepare('INSERT OR REPLACE INTO slack_channels (org, channel_id, app, digest) VALUES (?, ?, NULL, 1)')
      .bind(install.org, channel).run();
    return { text: '✓ the Monday watch digest will post here' };
  }
  if (verb === 'runs') {
    const app = rest[0] || (await scopeForChannel(env, install.org, channel)).app;
    if (!app) return { text: 'usage: /small runs <app> (or link the channel first)' };
    const req = new Request(`http://internal/api/runs?app=${encodeURIComponent(app)}`);
    const resp = await deps.runsHandler(req, env, actor);
    const d = await resp.json();
    if (d.error) return { text: `✗ ${d.error}` };
    const lines = (d.runs || []).slice(0, 5).map((r) => `${r.status === 'finished' ? '✓' : r.status === 'running' ? '…' : '✗'} ${r.run_id} · ${r.status} · ${r.started_at} · ${r.started_by}`);
    return { text: lines.length ? `last runs of ${app}:\n${lines.join('\n')}` : `${app} has no runs yet` };
  }
  if (verb === 'watch') {
    const app = rest[0] || (await scopeForChannel(env, install.org, channel)).app;
    const req = new Request(`http://internal/api/watch${app ? `?app=${encodeURIComponent(app)}` : ''}`);
    const resp = await deps.watchHandler(req, env, actor);
    const d = await resp.json();
    if (d.error) return { text: `✗ ${d.error}` };
    const lines = (d.observations || []).map((o) => `! ${o.slug} · ${o.check} · ${o.text}`);
    return { text: lines.length ? lines.join('\n') : '✓ nothing to report' };
  }
  if (verb === 'run') {
    const app = rest[0];
    if (!app) return { text: 'usage: /small run <app> --input value …' };
    const inputs = {};
    for (let i = 1; i < rest.length; i++) {
      if (rest[i].startsWith('--')) inputs[rest[i].slice(2).replace(/-/g, '_')] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    }
    const result = await runAsk(env, ctx, actor, {
      scope: { app },
      message: `run this job now with exactly these inputs: ${JSON.stringify(inputs)}. Propose the run tool.`,
    }, askHandler);
    const p = result.proposals[0];
    if (!p) return { text: result.text || '✗ no proposal came back' };
    await api('chat.postMessage', { channel, text: `${p.tool}?`, blocks: proposalBlocks(p) });
    return { text: '' };
  }
  return { text: 'commands: /small link <app> · unlink · digest · runs [app] · run <app> --input value · watch [app]' };
}

// ---------- inbound: interactivity (buttons, selects) ----------

export async function handleSlackInteract(env, ctx, install, payload, deps, baseUrl) {
  const { api, askHandler, approveHandler } = deps;
  const action = payload.actions?.[0];
  if (!action) return;
  const channel = payload.channel?.id;
  const threadTs = payload.message?.thread_ts || payload.message?.ts;
  const respond = (body) => fetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const actor = await resolveActor(env, install, api, payload.user?.id);
  if (!actor) {
    await respond({ response_type: 'ephemeral', replace_original: false, text: SIGN_IN_REPLY });
    return;
  }

  if (action.action_id === 'ask_choose') {
    const { app, message } = JSON.parse(action.selected_option.value);
    const result = await runAsk(env, ctx, actor, { scope: { app }, message }, askHandler);
    await respond({ replace_original: true, text: `*${app}* — ${result.text}`.slice(0, 3000) });
    for (const p of result.proposals) {
      await api('chat.postMessage', { channel, thread_ts: threadTs, text: `${p.tool}?`, blocks: proposalBlocks(p) });
    }
    return;
  }

  if (action.action_id === 'ask_cancel') {
    await respond({ replace_original: true, text: '✗ proposal cancelled' });
    return;
  }

  if (action.action_id === 'ask_approve') {
    const req = new Request('http://internal/api/ask/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: action.value }),
    });
    const resp = await approveHandler(req, env, ctx, actor, baseUrl);
    const d = await resp.json();
    if (!resp.ok || d.error) {
      // only the asker or an editor can run it — everyone else gets an ephemeral no
      await respond({
        response_type: 'ephemeral',
        replace_original: false,
        text: /access|edit/.test(d.error || '') ? 'only editors can run this' : `✗ ${d.error}`,
      });
      return;
    }
    const link = d.runId ? `\n<${baseUrl}/apps/${encodeURIComponent(payloadAppOf(payload) || '')}/runs/${d.runId}|open the run>` : '';
    await respond({ replace_original: true, text: `✓ approved by ${actor.email} → ${JSON.stringify(d).slice(0, 500)}${link}` });
  }
}

// best-effort app name out of the proposal message text (```{ "app": ... }```)
function payloadAppOf(payload) {
  const m = JSON.stringify(payload.message?.blocks || '').match(/\\"app\\":\s*\\"([a-z0-9-]+)\\"/);
  return m ? m[1] : null;
}

// ---------- Watch → Slack (called from the nightly pass) ----------

export async function notifySlackObservation(env, org, slug, text) {
  try {
    const install = await env.DB.prepare('SELECT * FROM slack_installs WHERE org = ?').bind(org).first();
    if (!install) return;
    const link = await env.DB.prepare('SELECT channel_id FROM slack_channels WHERE org = ? AND app = ?').bind(org, slug).first();
    if (!link) return;
    await slackApi(install.bot_token)('chat.postMessage', { channel: link.channel_id, text: `⚠ ${slug}: ${text}` });
  } catch { /* slack down must not break the pass */ }
}

export async function slackWeeklyDigest(env, org, lines) {
  try {
    const install = await env.DB.prepare('SELECT * FROM slack_installs WHERE org = ?').bind(org).first();
    if (!install) return;
    const ch = await env.DB.prepare('SELECT channel_id FROM slack_channels WHERE org = ? AND digest = 1').bind(org).first();
    if (!ch) return;
    await slackApi(install.bot_token)('chat.postMessage', { channel: ch.channel_id, text: `Watch, this week:\n${lines.join('\n')}` });
  } catch { /* ditto */ }
}
