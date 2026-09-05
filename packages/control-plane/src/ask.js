// Ask (phase 1 — read only): one agent function, scoped per question. This module
// holds the model call + prompt; index.js owns auth, scope resolution, and context
// assembly so permissions are enforced by queries, never by the prompt.
const MODEL = 'claude-opus-5';
// Model picker allowlist — "Auto" resolves to the default.
export const ASK_MODELS = { auto: MODEL, 'opus-5': 'claude-opus-5', 'sonnet-5': 'claude-sonnet-5', 'haiku-4.5': 'claude-haiku-4-5-20251001' };

export const ASK_SYSTEM = [
  'You are the built-in assistant of "small", a platform where teams deploy Python apps',
  '(servers and jobs) behind a work-email login. You answer questions about the apps,',
  'runs, and logs in the context below. You have NO tools and cannot take actions:',
  'you cannot run, re-run, deploy, share, pause, or change anything.',
  'If the user asks for an action, say you cannot do it yet and name exactly who could',
  '(the owner and edit members are listed in the context).',
  'Answer from the context only; if the context does not contain the answer, say what',
  'is missing. Be concise — a few sentences, markdown allowed (lists, `code`, **bold**).',
  'End EVERY answer with a final line starting with "Sources: " naming what you used —',
  'run ids, "runbook", "review", "log lines N-M", "request log", "AGENT.md" — or',
  '"Sources: none" when the context had nothing relevant.',
].join(' ');

export const DIAGNOSIS_PROMPT = 'Why did this fail, in one sentence, and where should I look?';

// Phase 2: tools map one-to-one to existing routes, attached ONLY when the asking
// user has edit on the scope (enforced in index.js). A tool call never executes —
// it becomes a proposal the client must approve via POST /api/ask/approve.
// ponytail: no redeploy tool — deploys need the CLI's build, there is no route.
export const ASK_TOOLS_ADDENDUM = [
  'You have tools that PROPOSE actions (run a job, pause/resume its schedule, share).',
  'Calling a tool does not execute it — the platform shows the user a proposal card',
  'and executes only after they approve. Never claim an action already happened;',
  'say what you are proposing and why. Include exact inputs when proposing a run.',
].join(' ');

export const ASK_TOOLS = [
  {
    name: 'run',
    description: 'Start a run of a job with the given inputs (values must satisfy the [inputs] schema; file-type inputs cannot be provided from chat).',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'app name' },
        inputs: { type: 'object', description: 'input name → value; omit for jobs without inputs' },
      },
      required: ['app'],
    },
  },
  {
    name: 'run_again',
    description: 'Re-run a previous run with exactly its stored inputs.',
    input_schema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
  },
  {
    name: 'pause_schedule',
    description: 'Pause the cron schedule of a job.',
    input_schema: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] },
  },
  {
    name: 'resume_schedule',
    description: 'Resume the paused cron schedule of a job.',
    input_schema: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] },
  },
  {
    name: 'share',
    description: 'Share the app with a person by email, role view or edit.',
    input_schema: {
      type: 'object',
      properties: { app: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['view', 'edit'] } },
      required: ['app', 'email'],
    },
  },
  {
    name: 'unshare',
    description: 'Remove a person from the app.',
    input_schema: { type: 'object', properties: { app: { type: 'string' }, email: { type: 'string' } }, required: ['app', 'email'] },
  },
];

// ~150k tokens ≈ 600k chars. Callers build newest-first lists; capJoin keeps the
// head and drops the oldest (tail) parts first.
export const CAP_CHARS = 600000;
export function capJoin(parts, cap = CAP_CHARS) {
  const out = [];
  let used = 0;
  for (const p of parts) {
    if (!p) continue;
    if (used + p.length > cap) break;
    out.push(p);
    used += p.length;
  }
  return out.join('\n\n');
}

async function anthropic(env, body, model) {
  body = { ...body, ...(model ? { model } : {}) };
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'Content-Type': 'application/json',
      ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({ model: MODEL, fallbacks: 'default', ...body }),
  });
}

// One non-streaming answer (failure diagnosis). Returns plain text or throws.
export async function askOnce(env, context, question, maxTokens = 300) {
  const resp = await anthropic(env, {
    max_tokens: maxTokens,
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\n---\n\n${question}` }],
  });
  if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
  const msg = await resp.json();
  const text = (msg.content || []).find((b) => b.type === 'text');
  if (!text) throw new Error('no text in response');
  return text.text.trim();
}

// Streaming answer as an SSE Response. `history` is prior thread turns
// [{role, content}]; the context rides on the latest user turn. onDone(fullText)
// runs after the stream closes (store the message, etc.).
export function askStream(env, context, history, message, onDone, meta = {}, extraBlocks = [], toolOpts = null, model = null) {
  const turns = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: extraBlocks.length
        ? [...extraBlocks, { type: 'text', text: `${context}\n\n---\n\n${message}` }]
        : `${context}\n\n---\n\n${message}`,
    },
  ];
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (event, data) => writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

  (async () => {
    let full = '';
    try {
      if (toolOpts) {
        // tools attached (user has edit): one non-streaming call so tool_use blocks
        // arrive whole; each becomes a proposal — never an execution
        const resp = await anthropic(env, {
          max_tokens: 2000,
          system: `${ASK_SYSTEM} ${ASK_TOOLS_ADDENDUM}`,
          tools: toolOpts.tools,
          messages: turns,
        }, model);
        if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
        const msg = await resp.json();
        for (const block of msg.content || []) {
          if (block.type === 'text' && block.text) {
            full += block.text;
            await send('chunk', { text: block.text });
          } else if (block.type === 'tool_use') {
            const p = await toolOpts.onProposal(block.name, block.input || {});
            full += `\n[proposed ${block.name}: ${JSON.stringify(block.input || {})}]`;
            await send('proposal', p);
          }
        }
      } else {
        const resp = await anthropic(env, { max_tokens: 2000, stream: true, system: ASK_SYSTEM, messages: turns }, model);
        if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(6)); } catch { continue; }
            if (ev.type === 'content_block_delta' && ev.delta?.text) {
              full += ev.delta.text;
              await send('chunk', { text: ev.delta.text });
            }
          }
        }
      }
      await onDone?.(full);
      await send('done', { ok: true, ...meta });
    } catch (e) {
      await send('error', { error: e.message }).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' },
  });
}
