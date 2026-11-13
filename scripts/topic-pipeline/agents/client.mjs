import Ajv from 'ajv';
import { getEncoding } from 'js-tiktoken';
import { agentSettings, callPrice, ceilings, estimateTopic, recordSpend } from '../budget.mjs';
import { redact } from '../config.mjs';
import { saveState } from '../state.mjs';

const ajv = new Ajv({ allErrors: true, strict: false });
const encoding = getEncoding('cl100k_base');
// Local estimates only: reserve Anthropic's maximum native visual-token budget
// for each image, regardless of compression. Provider usage is authoritative.
const imageEstimate = 4784;
const unsupported = new Set(['pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'maxItems', 'uniqueItems']);

function anthropicSchema(schema) {
  const output = {};
  const constraints = [];
  for (const [key, value] of Object.entries(schema)) {
    if (unsupported.has(key) || (key === 'minItems' && value > 1)) {
      constraints.push(`${key}: ${JSON.stringify(value)}`);
    } else if (['properties', '$defs', 'definitions'].includes(key)) {
      output[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, anthropicSchema(child)]));
    } else if (['anyOf', 'allOf', 'oneOf'].includes(key)) {
      output[key] = value.map(anthropicSchema);
    } else if (key === 'items') {
      output[key] = anthropicSchema(value);
    } else output[key] = value;
  }
  if (output.type === 'object' || output.properties) output.additionalProperties = false;
  if (constraints.length) output.description = [output.description, `Constraints: ${constraints.join('; ')}`].filter(Boolean).join('\n');
  return output;
}

function requestBody(provider, model, effort, agent, inputs, system, schema, images, feedback) {
  const text = JSON.stringify(inputs) + (feedback ? `\nValidation errors: ${feedback}\nReturn corrected JSON matching the schema.` : '');
  if (provider === 'openai') return {
    model, instructions: system, input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    reasoning: { effort }, text: { format: { type: 'json_schema', name: agent, schema, strict: true } },
    max_output_tokens: ceilings[agent].output, tools: [], tool_choice: 'none', stream: false,
    // Background mode: the POST returns at once and the result is polled, so a long max-effort call never hits the ~300 s fetch header timeout (reviewer 2026-11-12, store accepted).
    background: true, store: true,
  };
  return {
    model, system, messages: [{ role: 'user', content: [
      ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })),
      { type: 'text', text },
    ] }],
    max_tokens: ceilings[agent].output, output_config: { effort, format: { type: 'json_schema', schema: anthropicSchema(schema) } },
    stream: false,
  };
}

function estimateInput(body, images) {
  const estimateBody = { ...body };
  if (body.messages) estimateBody.messages = body.messages.map(message => ({ ...message,
    content: message.content.filter(block => block.type !== 'image'),
  }));
  // cl100k is a local text estimate, including prompts, schema and JSON framing.
  // This is not a provider tokenizer; the persisted actual count governs spend.
  return encoding.encode(JSON.stringify(estimateBody), [], []).length + images.length * imageEstimate;
}

function usageFrom(payload, provider) {
  const usage = payload?.usage;
  const valid = value => Number.isSafeInteger(value) && value >= 0;
  if (!valid(usage?.input_tokens) || !valid(usage?.output_tokens)) return null;
  let inputTokens = usage.input_tokens;
  if (provider === 'anthropic') {
    for (const key of ['cache_read_input_tokens', 'cache_creation_input_tokens']) {
      if (usage[key] !== undefined && !valid(usage[key])) return null;
      inputTokens += usage[key] ?? 0;
    }
  }
  const reasoningTokens = provider === 'openai'
    ? usage.output_tokens_details?.reasoning_tokens ?? 0
    : usage.output_tokens_details?.thinking_tokens ?? 0;
  if (!valid(reasoningTokens) || reasoningTokens > usage.output_tokens) return null;
  return { inputTokens, outputTokens: usage.output_tokens, reasoningTokens };
}

function outputText(payload, provider) {
  if (provider === 'anthropic') return (payload?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('');
  return (payload?.output ?? []).filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content ?? []).filter(block => block.type === 'output_text').map(block => block.text).join('');
}

export function createClient({ config, state, topicDir, fetchImpl = globalThis.fetch }) {
  async function persist() {
    try { await saveState(topicDir, state); }
    catch { throw new Error('Cannot save provider usage state'); }
  }

  async function call(agent, inputs, { schema, system, images = [], validate } = {}) {
    if (!Object.hasOwn(ceilings, agent)) throw new Error('Unknown pipeline agent');
    if (state.calls?.some(entry => entry.usageKnown === false)) throw new Error('Unknown provider usage must be reconciled before another call');
    if (!schema || typeof schema !== 'object' || typeof system !== 'string' || !system.trim()) throw new Error('Agent call requires a JSON schema and system prompt');
    if (!Array.isArray(images) || images.some(image => !['image/png', 'image/jpeg'].includes(image?.mediaType)
      || typeof image.data !== 'string' || !image.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))) throw new Error('Images must be base64 PNG or JPEG data');
    const { provider, model, effort } = agentSettings(config, agent);
    const settings = config[provider];
    if (typeof settings?.apiKey !== 'string' || !settings.apiKey.trim() || typeof settings.endpoint !== 'string'
      || !settings.endpoint.trim() || typeof fetchImpl !== 'function') throw new Error('Configure provider credentials and endpoint in config.local.json');
    const flags = config.overrides ?? {};
    const selected = agent === 'author' ? flags['author-model'] ?? settings.authorModel
      : agent === 'coverage-judge' ? flags['judge-model'] ?? settings.judgeModel
        : flags['reviewer-model'] ?? settings.reviewerModel;
    if (typeof selected !== 'string' || !selected.trim()) throw new Error('Configure the selected agent model in config.local.json');
    if (provider === 'openai' && settings.api !== 'responses') throw new Error('Configure the author to use the Responses API');
    if (provider === 'openai' && images.length) throw new Error('Images require an Anthropic review agent');
    if (provider === 'openai' && settings.temperature !== undefined && !Number.isFinite(settings.temperature)) throw new Error('Configure a finite author temperature');
    const estimate = estimateTopic(config);
    state.estimateUsd ??= estimate;
    state.calls ??= [];
    state.spendUsd ??= 0;
    if (!Number.isFinite(state.estimateUsd) || state.estimateUsd <= 0 || state.spendUsd > state.estimateUsd * 1.2) throw new Error('Actual spend exceeds the preflight estimate');
    let check;
    try { check = ajv.compile(schema); }
    catch { throw new Error('Invalid agent JSON schema'); }
    let feedback = '', stopReason = 'unknown';
    for (let attempt = 1; attempt <= 2; attempt++) {
      let body;
      try {
        body = requestBody(provider, model, effort, agent, inputs, system, schema, images, feedback);
        if (provider === 'openai' && settings.temperature !== undefined) body.temperature = settings.temperature;
      }
      catch { throw new Error('Cannot serialize the agent input and schema'); }
      if (estimateInput(body, images) > ceilings[agent].input) throw new Error('Estimated input exceeds the agent input ceiling');
      const headers = { 'Content-Type': 'application/json', ...(provider === 'openai'
        ? { Authorization: `Bearer ${settings.apiKey}` }
        : { 'x-api-key': settings.apiKey, 'anthropic-version': settings.apiVersion ?? '2026-10-21' }) };
      const started = Date.now();
      let response, payload;
      let transportFailed = false, responseId;
      try {
        response = await fetchImpl(settings.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
        payload = await response.json();
        responseId = typeof payload?.id === 'string' ? payload.id.slice(0, 100) : undefined;
        const deadline = Date.now() + (settings.pollTimeoutMs ?? 3_600_000);
        for (let misses = 0; body.background && response.ok && responseId && ['queued', 'in_progress'].includes(payload?.status);) {
          if (Date.now() > deadline) throw new Error('Background response poll timed out');
          await new Promise(done => setTimeout(done, settings.pollMs ?? 10_000));
          try { response = await fetchImpl(`${settings.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(responseId)}`, { method: 'GET', headers }); payload = await response.json(); misses = 0; }
          catch (error) { if (++misses >= 5) throw error; }
        }
      } catch { transportFailed = true; }
      const usage = usageFrom(payload, provider);
      const entry = { agent, model, attempt, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
        reasoningTokens: usage?.reasoningTokens ?? 0, usageKnown: Boolean(usage),
        usd: usage ? callPrice(config, model, usage.inputTokens, usage.outputTokens) : 0, ms: Date.now() - started,
        ...(responseId && !usage ? { responseId } : {}) }; // the id lets unknown usage be reconciled from the stored response
      // recordSpend mutates before throwing on an overrun. Always save that charge.
      try { recordSpend(state, entry); }
      finally { await persist(); }
      if (transportFailed) throw new Error('Provider transport failed; reconcile unknown usage before retrying');
      if (!response.ok || payload?.error || payload?.status === 'failed') throw new Error(`Provider request failed: HTTP ${response.status}${/^[a-z_]{1,40}$/.test(payload?.error?.type ?? '') ? ` ${payload.error.type}` : ''}`); // status and error type only: provider message text stays out (it may echo request content)
      if (!usage) throw new Error('Provider returned unknown usage; reconcile it before retrying');
      stopReason = String(payload?.stop_reason ?? payload?.incomplete_details?.reason ?? payload?.status ?? 'unknown').slice(0, 40);
      try {
        let value;
        try { value = JSON.parse(outputText(payload, provider)); }
        catch { throw new Error('Response must contain valid JSON'); }
        if (!check(value)) throw new Error(ajv.errorsText(check.errors, { separator: '; ' }));
        if (validate && await validate(value) === false) throw new Error(validate.errors ? ajv.errorsText(validate.errors) : 'Custom validation failed');
        return value;
      } catch (error) {
        feedback = redact(error.message, config).slice(0, 4000);
      }
    }
    throw new Error(`Agent output failed schema validation after two attempts (last stop_reason ${stopReason}): ${feedback}`);
  }
  return { call };
}
