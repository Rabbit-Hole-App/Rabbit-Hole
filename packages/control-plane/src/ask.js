import { subscriptionTransport } from './subscription-transport.js';
import { researchAnswer } from './learn-research.js';
import { learnMomentsDb } from './learn-storage.js';
import { base64 } from './token.js';
import { MODEL, planUsesOpenAI, loggedModel } from './learn-models.js';
// Ask (phase 1 - read only): one agent function, scoped per question. This module
// holds the model call + prompt; index.js owns auth, scope resolution, and context
// assembly so permissions are enforced by queries, never by the prompt.
// Model ids and per-task settings live in learn-models.js; re-exported for existing importers.
export { ASK_MODELS, askModel } from './learn-models.js';

export const ASK_SYSTEM = [
  'You are the built-in assistant of "small", a platform where teams deploy Python apps',
  '(servers and jobs) behind a work-email login. The context below includes the DEPLOYED',
  'source as a bundle of files prefixed with === path === - the code that actually shipped,',
  'not what may be on anyone\'s laptop now.',
  'Rules:',
  '1. Every claim about the code cites file:line - "the threshold is clamped in app.py:40",',
  'never "the code clamps the threshold". Count lines within each === file === section.',
  '2. If the answer is not in the bundle, say "not in the deployed code" - never infer',
  'code behaviour from the runbook or review.',
  '3. For behaviour questions ("what happens when X?"), trace the actual path through the',
  'code and quote the relevant lines.',
  '4. If a skipped-files note lists a file that might matter, say which and offer to look',
  'at it specifically.',
  '5. No greeting, no self-introduction, no offers of further help. Answer, cite, stop.',
  '6. Match the reply to the question. A greeting or small talk ("hi", "thanks") gets one',
  'short line back - never an unprompted summary of the run, app, or context.',
  '7. Never use em dashes. Use commas, colons, periods, or middle dots instead.',
  '8. Write for a non-technical teammate who is glancing, not reading: lead with one short',
  'plain-language line that settles the question (outcome first, e.g. "Finished fine in 50',
  'seconds."), then at most two short supporting lines. Keep env vars, paths, ids and',
  'file:line references OUT of the body unless the question is about the code itself;',
  'run ids and technical trails belong in the Sources line. Detail waits until asked.',
  'Without tools you cannot run, re-run, deploy, share, pause, or change anything; if',
  'asked for an action, name exactly who could (owner and edit members are in the context).',
  'Be concise. Markdown allowed (lists, `code`, **bold**).',
  'End answers that USED sources with a final line starting with "Sources: " naming them -',
  'file:line ranges, run ids, "runbook", "review", "log lines N-M", "diff", "AGENT.md".',
  'If nothing was used (greetings, small talk), no Sources line at all.',
].join(' ');

// One deploy's stored source ({bundle, skipped}) from R2, or null for pre-feature deploys.
export async function getBundle(env, appId, deployId) {
  if (!env.RUNS || !deployId) return null;
  const obj = await env.RUNS.get(`bundles/${appId}/${deployId}`);
  if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}

export const parseBundle = (bundle) => {
  // split alternates [pre, path1, body1, path2, body2, ...] - immune to the
  // multiline-$ trap that truncates lazy [\s\S]*? at the first line end
  const parts = String(bundle).split(/^=== (.+?) ===\n/m);
  const files = {};
  for (let i = 1; i < parts.length; i += 2) files[parts[i]] = parts[i + 1].replace(/\n+$/, '');
  return files;
};

// Unified-ish diff between two stored bundles. ponytail: one trimmed hunk per
// changed file (common prefix/suffix stripped), not minimal Myers hunks.
export function diffBundles(oldBundle, newBundle) {
  const a = parseBundle(oldBundle);
  const b = parseBundle(newBundle);
  const out = [];
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[path] === b[path]) continue;
    if (!(path in a)) { out.push(`+++ ${path} (new file, ${b[path].split('\n').length} lines)`); continue; }
    if (!(path in b)) { out.push(`--- ${path} (deleted)`); continue; }
    const al = a[path].split('\n');
    const bl = b[path].split('\n');
    let s = 0;
    while (s < al.length && s < bl.length && al[s] === bl[s]) s++;
    let e = 0;
    while (e < al.length - s && e < bl.length - s && al[al.length - 1 - e] === bl[bl.length - 1 - e]) e++;
    out.push([
      `--- ${path}`,
      `+++ ${path}`,
      `@@ old lines ${s + 1}-${al.length - e} → new lines ${s + 1}-${bl.length - e} @@`,
      ...al.slice(s, al.length - e).map((l) => `-${l}`),
      ...bl.slice(s, bl.length - e).map((l) => `+${l}`),
    ].join('\n'));
  }
  return out.join('\n\n').slice(0, 40000) || null;
}

export const DIAGNOSIS_PROMPT = 'Why did this fail, in one sentence, and where should I look?';

// Phase 2: tools map one-to-one to existing routes, attached ONLY when the asking
// user has edit on the scope (enforced in index.js). A tool call never executes -
// it becomes a proposal the client must approve via POST /api/ask/approve.
// ponytail: no redeploy tool - deploys need the CLI's build, there is no route.
export const ASK_TOOLS_ADDENDUM = [
  'You have tools that PROPOSE actions (run a job, set/pause/resume its schedule, share).',
  'Calling a tool does not execute it - the platform shows the user a proposal card',
  'and executes only after they approve. Never claim an action already happened;',
  'say what you are proposing and why. Include exact inputs when proposing a run.',
  'The CURRENT state in the context (schedule, members, runs) is authoritative -',
  'conversation history may be stale: an action approved earlier can have been undone',
  'outside this chat. When the user asks for an action, CALL THE TOOL so they get the',
  'proposal card; only skip if the current context already shows that exact state,',
  'and then quote the context line proving it.',
].join(' ');

export const ASK_TOOLS = [
  {
    name: 'run',
    description: 'Start a run of a job with the given inputs (values must satisfy the [inputs] schema). If the user attached a file in this chat, the context names its upload id - pass it as attachment_id with attachment_input naming the file-type input it fills.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'app name' },
        inputs: { type: 'object', description: 'scalar input name → value; omit for jobs without inputs' },
        attachment_id: { type: 'string', description: 'upload id of the chat attachment to use as a file input' },
        attachment_input: { type: 'string', description: 'name of the file-type input the attachment fills' },
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
    name: 'set_schedule',
    description: 'Set or replace a job\'s cron schedule (5-field cron, UTC). Several crons may be joined with "; " - to ADD to an existing schedule, include the current crons from the context plus the new one. An empty schedule removes all crons.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        schedule: { type: 'string', description: '5-field cron like "0 9 * * 1-5", multiple joined by "; ", empty string to remove' },
      },
      required: ['app', 'schedule'],
    },
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

// Per-org AI settings (Settings > Account): provider + model. Cached briefly -
// an agent loop makes a dozen calls and must not read D1 for each.
const aiCache = new Map(); // org -> { at, row }
// No DB (a dev worker without production D1): the default provider, never a customer's settings.
export async function aiSettings(env, org) {
  if (!org || !env.DB) return null;
  const hit = aiCache.get(org);
  if (hit && Date.now() - hit.at < 60000) return hit.row;
  const row = await env.DB.prepare('SELECT provider, model, bedrock_region, bedrock_role_arn, openai_base_url, openai_api_key FROM org_ai WHERE org = ?').bind(org).first().catch(() => null);
  aiCache.set(org, { at: Date.now(), row });
  return row;
}
export function aiCacheDrop(org) { aiCache.delete(org); }

// A whole non-streamed answer replayed as the anthropic-style SSE the chat
// reader expects (one big delta). Used by every non-Anthropic provider.
function sseFromMessage(msg) {
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const enc = new TextEncoder();
  const sse = [
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: msg.stop_reason || 'end_turn' }, usage: msg.usage || {} })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ].join('');
  return new Response(enc.encode(sse), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

// Anthropic Messages shape -> OpenAI chat/completions shape (and back). This is
// what lets a local LLM behind a tunnel (Ollama, LM Studio, vLLM - all speak
// the OpenAI API) power chat, search, review and the agents.
export function toOpenAI(body, modelId) {
  const msgs = [];
  if (body.system) msgs.push({ role: 'system', content: String(body.system) });
  for (const m of body.messages || []) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content || [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const tool_calls = blocks.filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      msgs.push({ role: 'assistant', content: text || null, ...(tool_calls.length ? { tool_calls } : {}) });
      continue;
    }
    for (const r of blocks.filter((b) => b.type === 'tool_result')) {
      msgs.push({ role: 'tool', tool_call_id: r.tool_use_id, content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content) });
    }
    const rest = blocks.filter((b) => b.type !== 'tool_result');
    if (rest.length) {
      msgs.push(rest.some((b) => b.type === 'image')
        ? { role: 'user', content: rest.map((b) => (b.type === 'image' ? { type: 'image_url', image_url: { url: b.source?.type === 'url' ? b.source.url : `data:${b.source?.media_type};base64,${b.source?.data}` } } : { type: 'text', text: b.text || '' })) }
        : { role: 'user', content: rest.map((b) => b.text || '').join('') });
    }
  }
  return {
    model: modelId,
    messages: msgs,
    max_tokens: body.max_tokens,
    ...(body.tools?.length ? { tools: body.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
    // A forced tool is the whole point of the planner calls; without this the
    // model is free to answer in prose and the caller sees no tool call.
    ...(body.tool_choice ? {
      tool_choice: body.tool_choice.type === 'tool' ? { type: 'function', function: { name: body.tool_choice.name } }
        : body.tool_choice.type === 'any' ? 'required' : 'auto',
      ...(body.tool_choice.disable_parallel_tool_use ? { parallel_tool_calls: false } : {}),
    } : {}),
  };
}
export function fromOpenAI(j) {
  const ch = j.choices?.[0] || {};
  const m = ch.message || {};
  const content = [];
  if (m.content) content.push({ type: 'text', text: String(m.content) });
  for (const tc of m.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* a local model's malformed args become {} */ }
    content.push({ type: 'tool_use', id: tc.id || `t_${crypto.randomUUID().slice(0, 8)}`, name: tc.function?.name, input });
  }
  return {
    content,
    stop_reason: m.tool_calls?.length ? 'tool_use' : ch.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    usage: j.usage || {},
  };
}

// Cards and the whiteboard. OpenAI is opt-in: it needs both the key and an
// explicit LEARN_PLAN_MODEL (the key alone also gates image generation and
// transcription), and subscription mode never leaves the bridge.
export async function planModel(env, body, model, org) {
  if (!planUsesOpenAI(env)) return anthropic(env, body, model, org);
  const { stream, ...rest } = body;
  const chosen = env.LEARN_PLAN_MODEL;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(toOpenAI(rest, chosen)),
  });
  if (!response.ok) {
    console.warn('openai API error', response.status, (await response.clone().text().catch(() => '')).slice(0, 300),
      JSON.stringify({ model: chosen, tools: (body.tools || []).map(t => t.name) }));
    return response;
  }
  return Response.json(fromOpenAI(await response.json()));
}

// One chokepoint for every model call. Default: the platform's Anthropic key.
// bedrock = the org's AWS pays; openai = any OpenAI-compatible endpoint (a
// local LLM behind a tunnel, vLLM, a gateway). Non-Anthropic providers run
// non-streaming and a stream:true request gets the answer replayed as SSE.
export async function anthropic(env, body, model, org) {
  if (env.SUBSCRIPTION_ONLY === 'true') {
    const response = await subscriptionTransport(env, body, model || MODEL);
    return body.stream ? sseFromMessage(await response.json()) : response;
  }
  const ai = await aiSettings(env, org);
  if (ai?.provider === 'bedrock' && ai.bedrock_role_arn && ai.model) {
    const { assumeRole, bedrockInvoke } = await import('./aws.js');
    const creds = await assumeRole(env, ai.bedrock_role_arn, `small-ai-${org}`, org);
    const { model: _m, stream, fallbacks: _f, ...rest } = body;
    const resp = await bedrockInvoke(creds, ai.bedrock_region || 'us-east-1', ai.model, { anthropic_version: 'bedrock-2023-05-31', ...rest });
    if (!stream || !resp.ok) return resp;
    return sseFromMessage(await resp.json());
  }
  if (ai?.provider === 'openai' && ai.openai_base_url && ai.model) {
    const { stream, ...rest } = body;
    const resp = await fetch(`${ai.openai_base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ai.openai_api_key ? { Authorization: `Bearer ${ai.openai_api_key}` } : {}) },
      body: JSON.stringify(toOpenAI(rest, ai.model)),
    });
    if (!resp.ok) return resp;
    const msg = fromOpenAI(await resp.json());
    return stream ? sseFromMessage(msg) : new Response(JSON.stringify(msg), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  // Auto sends claude-opus-5 with fallbacks 'default' (a refusal fallback) and
  // the beta header; an explicit model (chat picker, org setting, cards, the
  // whiteboard) sends neither. The recorded reason, that the API 400s on an
  // explicit model with fallbacks, is unverified: Auto itself names
  // claude-opus-5 explicitly (models-9 in docs/features/learn-cleanup.md).
  const chosen = model || ai?.model || null;
  // body.betas (the Tutor planner's fast mode, Decision 5B) goes in the anthropic-beta header, not the body.
  const { betas = [], ...payload } = body;
  const beta = [...(chosen ? [] : ['server-side-fallback-2026-07-01']), ...betas].join(',');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      ...(beta ? { 'anthropic-beta': beta } : {}),
      'Content-Type': 'application/json',
      ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify(chosen ? { ...payload, model: chosen } : { model: MODEL, fallbacks: 'default', ...payload }),
  });
  // Surface the API's own reason in logs; callers only relay the status code.
  // The fingerprint (shapes and sizes only, never content) identifies which
  // payload construction produced an invalid_request_error.
  if (!resp.ok) {
    const kinds = {};
    for (const m of body.messages || []) for (const c of Array.isArray(m.content) ? m.content : [{ type: 'string' }]) { kinds[c.type] = (kinds[c.type] || 0) + 1; if (c.type === 'tool_result') for (const inner of Array.isArray(c.content) ? c.content : []) kinds[`tool_result.${inner.type}`] = (kinds[`tool_result.${inner.type}`] || 0) + 1; }
    console.warn('anthropic API error', resp.status, (await resp.clone().text().catch(() => '')).slice(0, 400),
      JSON.stringify({ model: chosen || MODEL, messages: (body.messages || []).length, blocks: kinds, tools: (body.tools || []).map(t => t.name), size: JSON.stringify(body).length }));
  }
  return resp;
}

// One non-streaming answer (failure diagnosis). Returns plain text or throws.
export async function askOnce(env, context, question, maxTokens = 300, org = null) {
  const resp = await anthropic(env, {
    max_tokens: maxTokens,
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\n---\n\n${question}` }],
  }, null, org);
  if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
  const msg = await resp.json();
  const text = (msg.content || []).find((b) => b.type === 'text');
  if (!text) throw new Error('no text in response');
  return text.text.trim();
}

// Streaming answer as an SSE Response. `history` is prior thread turns
// [{role, content}]; the context rides on the latest user turn. onDone(fullText)
// runs after the stream closes (store the message, etc.).
export function askStream(env, context, history, message, onDone, meta = {}, extraBlocks = [], toolOpts = null, model = null, org = null, system = ASK_SYSTEM, research = null) {
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
      if (research) {
        // The outline instructions ride with the tool, so the capability is only
        // stated when it is actually offered.
        const researchSystem = research.system ? `${system}
${research.system}` : system;
        const result = await researchAnswer(env, turns, researchSystem, model, { callModel: loggedModel('chat', anthropic), initialPapers: research.papers || [], tools: research.tools || [], runTool: research.runTool, onProgress: stage => send('progress', { stage }) });
        full = result.answer;
        if (result.papers.length) {
          // An uploaded PDF has no arXiv id or public link: its title alone.
          const references = result.papers.map(p => (p.pdfUrl ? `[${p.title} (arXiv:${p.id})](${p.pdfUrl})` : p.title)).join(' | ');
          full += `\n\nPapers read: ${references}`;
          await send('papers', { papers: result.papers });
        }
        await send('chunk', { text: full });
        const graph = research.getGraphView?.();
        if (graph) await send('graph', graph);
        // A proposal, not a change: the page shows it and the learner applies it.
        const ops = research.proposed?.();
        if (ops?.length) await send('outline', { ops });
        // Opening a reader destroys nothing, so unlike an outline proposal this
        // needs no approval - the learner closes it or detaches the source.
        if (result.shown) await send('paper', result.shown);
        // One reader, so one thing can be open. A paper wins because the tutor
        // read its actual pages; the article is named in the reply either way.
        const article = research.shownWiki?.();
        if (article && !result.shown) await send('wiki', article);
        // A video is a card, not the reader, so it does not compete with a
        // paper or an article for the panel - it can always land.
        const moment = research.shownVideo?.();
        if (moment) {
          // The moment log is written from day one; the hot path only starts
          // reading it in phase 4. A missing table must never cost an answer -
          // the card simply shows no keep/dismiss when there is no row id.
          let momentId = null;
          try {
            // `org` the parameter is null for learn conversations by design, so
            // the workspace rides on the research object instead - the log is
            // keyed per workspace or it is useless to the hot path.
            const written = await learnMomentsDb(env).prepare('INSERT INTO learn_moments (org, question, video_id, start, end, confidence, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .bind(research.org || org || 'unknown', message.slice(0, 500), moment.videoId, moment.start, moment.end, moment.confidence, moment.reason).run();
            momentId = written.meta?.last_row_id ?? null;
          } catch { /* logging is never worth an error mid-answer */ }
          await send('video', momentId ? { ...moment, momentId } : moment);
        }
      } else if (toolOpts) {
        // tools attached (user has edit): one non-streaming call so tool_use blocks
        // arrive whole; each becomes a proposal - never an execution
        const resp = await anthropic(env, {
          max_tokens: 2000,
          system: `${ASK_SYSTEM} ${ASK_TOOLS_ADDENDUM}`,
          tools: toolOpts.tools,
          messages: turns,
        }, model, org);
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
        const resp = await anthropic(env, { max_tokens: 2000, stream: true, system, messages: turns }, model, org);
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

// A chat attachment as model input, the same for every chat: an image or PDF
// rides as a vision/document block, anything else (CSV, text) inline and
// truncated.
export const ATTACHMENT_LIMIT = 4 * 1024 * 1024;
export async function attachmentBlocks(file) {
  if (file.size > ATTACHMENT_LIMIT) throw Error('attachment too large - 4 MB max');
  const type = file.type || '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (type.startsWith('image/')) return { bytes, blocks: [{ type: 'image', source: { type: 'base64', media_type: type, data: base64(bytes) } }] };
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { bytes, blocks: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } }] };
  return { bytes, blocks: [{ type: 'text', text: `Attached file ${file.name}:\n${new TextDecoder().decode(bytes).slice(0, 50000)}` }] };
}
// A chat request: JSON, or multipart with the JSON in `body` and one `file`.
export async function readAskRequest(req) {
  if (!(req.headers.get('Content-Type') || '').includes('multipart/form-data')) return { body: await req.json(), file: null };
  const form = await req.formData();
  const file = form.get('file');
  return { body: JSON.parse(form.get('body') || '{}'), file: file && typeof file !== 'string' ? file : null };
}
