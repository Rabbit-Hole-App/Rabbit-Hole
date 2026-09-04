// Deploy review: one Anthropic call per deploy, run in ctx.waitUntil concurrent with
// the Fly build. A control, not a chat — fixed prompt, schema-forced JSON, risk
// computed here in code. Must never break a deploy: every failure path just logs.

const MODEL = 'claude-opus-5';

// Outbound hosts that don't raise risk on their own. `*.x` matches x and subdomains.
const ALLOWED_HOSTS = ['api.stripe.com', '*.amazonaws.com', 'api.openai.com', 'api.anthropic.com'];

const SYSTEM_PROMPT = [
  'You are a deploy-time code reviewer for a hosting platform. You receive one Python',
  'app as a bundle of source files, each prefixed with === path ===, plus requirements.txt',
  'and small.toml (which declares required secrets under [secrets] required).',
  'Report what the app touches. Trace user input across files. Secret values are redacted',
  'before you see them — reason from names and line numbers only.',
  'Fill every field of the output schema; use empty arrays where a category does not apply.',
  'summary: one plain-English sentence saying what the app does.',
  'secrets: environment variables the code reads; declared = whether small.toml declares them.',
  'undeclared_secrets: names the code reads that small.toml does not declare.',
  'outbound: network destinations the code contacts. aws: AWS API actions and resources.',
  'shell_exec: subprocess/os.system/exec calls; user_input_reaches_it = true when data from',
  'a request can reach the command, including across files.',
  'user_input: request inputs traced to the sinks they flow into.',
  'findings: concrete security-relevant observations. Locations are path:line.',
  'risk: your overall estimate — low, medium, or high.',
].join(' ');

const S = { type: 'string' };
const arr = (items) => ({ type: 'array', items });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const REVIEW_SCHEMA = obj({
  summary: S,
  risk: { type: 'string', enum: ['low', 'medium', 'high'] },
  secrets: arr(obj({ name: S, declared: { type: 'boolean' }, used_at: S })),
  undeclared_secrets: arr(S),
  outbound: arr(obj({ host: S, purpose: S, at: S })),
  aws: arr(obj({ action: S, resource: S, at: S })),
  filesystem: obj({ reads: arr(S), writes: arr(S) }),
  shell_exec: arr(obj({ command: S, user_input_reaches_it: { type: 'boolean' }, at: S })),
  user_input: arr(obj({ source: S, flows_to: S, validated: { type: 'boolean' } })),
  findings: arr(obj({ severity: { type: 'string', enum: ['low', 'medium', 'high'] }, at: S, text: S })),
  skipped: arr(S),
});

function hostAllowed(host) {
  return ALLOWED_HOSTS.some((p) =>
    p.startsWith('*.') ? host === p.slice(2) || host.endsWith(p.slice(1)) : host === p
  );
}

// Risk comes from these rules, never from the model.
function computeRisk(review) {
  if ((review.shell_exec || []).some((s) => s.user_input_reaches_it)) return 'high';
  if ((review.undeclared_secrets || []).length) return 'medium';
  if ((review.outbound || []).some((o) => !hostAllowed(o.host))) return 'medium';
  return 'low';
}

const SEVERITY = { high: 0, medium: 1, low: 2 };

function validateReview(r) {
  if (!r || typeof r !== 'object') throw new Error('review is not an object');
  if (typeof r.summary !== 'string') throw new Error('review: bad summary');
  for (const k of ['secrets', 'undeclared_secrets', 'outbound', 'aws', 'shell_exec', 'user_input', 'findings', 'skipped']) {
    if (!Array.isArray(r[k])) throw new Error(`review: ${k} is not an array`);
  }
  if (!r.filesystem || !Array.isArray(r.filesystem.reads) || !Array.isArray(r.filesystem.writes)) {
    throw new Error('review: bad filesystem');
  }
  return r;
}

async function runReview(env, appId, bundle, skipped) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        fallbacks: 'default', // safety classifiers can decline; re-run on the recommended model
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
        messages: [{ role: 'user', content: bundle }],
      }),
    });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
    const msg = await resp.json();
    if (msg.stop_reason === 'refusal') throw new Error('model refused');
    const text = (msg.content || []).find((b) => b.type === 'text');
    if (!text) throw new Error('no text block in response');
    const review = validateReview(JSON.parse(text.text));
    review.skipped = skipped || []; // the CLI knows what it left out; the model can't
    review.risk = computeRisk(review);
    review.findings.sort((a, b) => (SEVERITY[a.severity] ?? 3) - (SEVERITY[b.severity] ?? 3));
    if (review.risk === 'high') console.log(`review: HIGH risk on app ${appId}: ${review.summary}`);
    await env.DB.prepare(
      "UPDATE apps SET review_prev = review, review = ?, reviewed_at = datetime('now'), review_model = ? WHERE id = ?"
    ).bind(JSON.stringify(review), MODEL, appId).run();
  } catch (e) {
    // Never let the review break (or block) a deploy — the CLI shows "review: unavailable".
    console.log(`review failed for app ${appId}: ${e.message}`);
  }
}

export { runReview, computeRisk, validateReview, hostAllowed, MODEL };
