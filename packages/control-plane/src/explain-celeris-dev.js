// DEV ONLY: an explicit Celeris route for the direct written /explain command (the internal command name is 'explanation'; 'explain' is /interactive)
// (owner, 2026-11-07). /api/learn/artifact with command 'explanation' makes its ONE authoring call to Celeris instead of the plan model, then goes through
// the same validation, the one repair and the written-explanation fallback as every other call (learn-artifact.js generateArtifact). Nothing else
// changes: every other command, and /explain anywhere the switch is off, keeps the plan model.
// Celeris answers in json_schema mode (the mode that worked in the diagram benchmark; its tool calls were unreliable: 8 of 20 first answers had no title).
// The schema is { title, body, diagram }: the TutorDiagram spec is its own structured field and RH writes the rh-diagram fence into the body, so the model
// never has to emit a fence. The field is required when the learner's words explicitly ask for a diagram, and may be null otherwise.
// For a same-schema comparison with another OpenAI-compatible fast model, EXPLAIN_DEV_MODEL, EXPLAIN_DEV_PARAMS (JSON, e.g. reasoning_effort) and CELERIS_BASE_URL
// with that provider's key in CELERIS_API_KEY point the same route at it; unset, it is Celeris.
// Three switches must all be on: the Worker is a dev or test deployment (SMALL_ENV), EXPLAIN_CELERIS_DEV is "true", and CELERIS_API_KEY is set.
// A production Worker has SMALL_ENV "production" and can never take this path.
import { parseTutorDiagram, tutorDiagramJsonSchema } from '../../web/src/tutor-diagrams/spec.js';
import { planModel } from './ask.js';

export const CELERIS_MODEL = 'celeris-1';
const BASE = 'https://inference.celeris.ai/celeris-1/v1';
// Words that explicitly ask for a picture. Anything else leaves the diagram to the model ("when useful"), as null or a spec.
export const ASKS_FOR_DIAGRAM = /\b(diagram|flow ?chart|draw|sketch|visuali[sz]e|illustrate|map out)\b/i;

// EXPLAIN_DEV_MODEL 'anthropic' (benchmarks only) sends the SAME request the app sends, through the real plan-model transport, and only records the usage and what became of each diagram,
// so the production model can be measured through this route with the same token and cost accounting as the others; its key is ANTHROPIC_API_KEY instead of CELERIS_API_KEY.
export const celerisExplainOn = (env, command) => command === 'explanation' && env.EXPLAIN_CELERIS_DEV === 'true' && (env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test') && !!(env.EXPLAIN_DEV_MODEL === 'anthropic' ? env.ANTHROPIC_API_KEY : env.CELERIS_API_KEY);

// Some providers (Cerebras) refuse `oneOf` in a strict json_schema but accept `anyOf`. The two mean the same ONLY when no value can match two branches, so every oneOf is
// rewritten only when each branch is an object pinned to its own value of one shared discriminator (the diagram's `kind` const); any other oneOf throws.
// The rewrite is only what is SENT to the provider: RH validates what comes back against its original parser (parseTutorDiagram) and the validator.
export function exclusiveOneOfToAnyOf(schema) {
  if (Array.isArray(schema)) return schema.map(exclusiveOneOfToAnyOf);
  if (!schema || typeof schema !== 'object') return schema;
  const out = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, exclusiveOneOfToAnyOf(value)]));
  if (!out.oneOf) return out;
  const keys = out.oneOf.map(branch => Object.entries(branch?.properties || {}).filter(([, v]) => v && v.const !== undefined).map(([k]) => k));
  const shared = (keys[0] || []).filter(k => keys.every(list => list.includes(k)));
  const key = shared.find(k => new Set(out.oneOf.map(branch => JSON.stringify(branch.properties[k].const))).size === out.oneOf.length);
  if (!key) throw new Error('oneOf branches are not mutually exclusive on a shared const property: refusing to rewrite it as anyOf');
  const { oneOf, ...rest } = out;
  return { ...rest, anyOf: oneOf };
}

// Retest arm (EXPLAIN_DEV_FLOW_RULES=true): the guidance every model gets already says how a flow must be wired, in one clause. This swaps ONLY that clause, in the copy sent to
// the provider, for the same rules written as a numbered list that also names the two the clause left out (every edge joins listed ids; a retry is its own outcome, never a loop).
// Production guidance is untouched. If the clause is not found (the guidance changed) it throws, so the arm can never silently run as the control.
const FLOW_CLAUSE = /one connected acyclic graph with exactly one start node; a decision has two or three outgoing edges with distinct short labels such as Yes and No, each to its own node, and a failed check ends in its own outcome; a process has one outgoing edge, an outcome has none; use cycle or relationship for a loop/;
export const FLOW_RULES = 'the app rejects the diagram if any of these is broken: (1) exactly one start node, and every other node reachable from it; (2) no edge points back to an earlier node, so a retry or a revision is its own outcome node, never a loop; (3) a decision node has two or three outgoing edges, each with a different non-empty label such as Yes and No, each to its own node; (4) a process node has exactly one outgoing edge; (5) an outcome node has none; (6) every edge from and to is the id of a listed node, and no pair of nodes is joined twice. Use cycle or relationship for a real loop';
export const withFlowRules = guidance => { if (!FLOW_CLAUSE.test(guidance)) throw new Error('flow-rules arm: the flow clause is not in the guidance'); return guidance.replace(FLOW_CLAUSE, FLOW_RULES); };

// Diagnostics (EXPLAIN_DEV_CAPTURE=true): per attempt the raw provider answer, the parser's exact errors, the validator's words sent back for the repair and, on a refused request, the
// provider's own error body. Nothing else is changed. The key is scrubbed from anything kept; request headers are never kept.
const scrub = (text, env) => String(text ?? '').split(env.CELERIS_API_KEY || '\u0000').join('[key]').replace(/Bearer\s+\S+/g, 'Bearer [redacted]');

const cardSchema = required => ({
  type: 'object', additionalProperties: false, required: ['title', 'body', 'diagram'],
  properties: {
    title: { type: 'string', description: 'A short title naming the topic.' },
    body: { type: 'string', description: 'The written explanation in Markdown: short paragraphs, a list or a pipe table (every row starts and ends with a pipe). No code fence for the diagram.' },
    diagram: required ? tutorDiagramJsonSchema : { anyOf: [tutorDiagramJsonSchema, { type: 'null' }] },
  },
});

// Only what the new response format needs. The authoring guidance itself (the make_explanation description: forms, diagram kinds, Depth budgets, "diagrams are
// optional") is sent unchanged, as the same text the plan model gets in its tool.
const ADDENDUM = required => `
Answer format for this request (it replaces the tool call and the fence instructions above): reply with exactly one JSON object {"title","body","diagram"}.
- title and body are required: the card's text, as the guidance describes, with no rh-diagram fence in the body.
- diagram: ${required ? 'REQUIRED, the learner asked for a diagram.' : 'the TutorDiagram spec object; a card without one is refused (EXP-13: every card has a visual).'} It is the same object the fence would hold, {"version":1,"diagram":{...}}, as a JSON object and never as a string. The app draws it before the last paragraph of the body, so write at least two paragraphs; do not describe it twice.
- Only the body's prose (paragraph, heading and list text) counts toward the budget above; the title, table cells and diagram words do not. Do not pad it.`;

// -> { options, served() } for generateArtifact, or null when the switch is off. served() is what the provider said it ran (the response's model field)
// and what became of each attempt's diagram (omitted, present and valid, present and invalid).
export function celerisExplainRoute(env, command) {
  if (!celerisExplainOn(env, command)) return null;
  const capture = env.EXPLAIN_DEV_CAPTURE === 'true';
  const seen = { models: [], calls: 0, inTokens: 0, outTokens: 0, attempts: [], capture: [] };
  let last = null; // the previous raw answer text, sent back with the validator's words on the one repair
  if (env.EXPLAIN_DEV_MODEL === 'anthropic') {
    const recording = async (callEnv, body, model, org) => {
      seen.calls++;
      const response = await planModel(env, body, model, org);
      if (!response.ok) return response;
      try {
        const json = await response.clone().json();
        seen.models.push(json.model || null);
        seen.inTokens += (json.usage?.input_tokens || 0) + (json.usage?.cache_creation_input_tokens || 0) + (json.usage?.cache_read_input_tokens || 0); seen.outTokens += json.usage?.output_tokens || 0;
        const input = (json.content || []).find(part => part.type === 'tool_use')?.input || {};
        const text = [input.body || '', ...(input.more || []).map(section => section?.text || '')].join('\n');
        const fence = /```\s*rh-diagram\s*\n([\s\S]*?)\n```/i.exec(text);
        let valid = false; if (fence) { try { valid = !!parseTutorDiagram(JSON.parse(fence[1])); } catch { valid = false; } }
        seen.attempts.push({ required: ASKS_FOR_DIAGRAM.test(String(body.messages?.[0]?.content || '')), diagram: fence ? (valid ? 'valid' : 'invalid') : 'omitted', chars: String(input.title || '').length + String(input.body || '').length });
      } catch { /* the measurement is never worth a failed answer */ }
      return response;
    };
    return { options: { callModel: recording }, served: () => ({ requested: 'anthropic (plan model)', models: [...new Set(seen.models)], calls: seen.calls, inTokens: seen.inTokens, outTokens: seen.outTokens, attempts: seen.attempts }) };
  }
  const callModel = async (callEnv, body) => {
    seen.calls++;
    const first = body.messages?.[0]?.content;
    const firstText = typeof first === 'string' ? first : (first || []).map(part => part.text || '').join('');
    let learnerText = ''; try { learnerText = JSON.parse(firstText).learnerText || ''; } catch { /* not the author's JSON */ }
    const required = ASKS_FOR_DIAGRAM.test(learnerText);
    const toolGuidance = body.tools?.find(tool => tool.name === 'make_explanation')?.description || '';
    const guidance = env.EXPLAIN_DEV_FLOW_RULES === 'true' ? withFlowRules(toolGuidance) : toolGuidance;
    const messages = [{ role: 'system', content: `${body.system}\n${guidance}\n${ADDENDUM(required)}` }, { role: 'user', content: firstText }];
    let feedback = null;
    if (body.messages.length > 1 && last != null) {
      const result = body.messages.at(-1).content?.find?.(part => part.type === 'tool_result');
      feedback = typeof result?.content === 'string' ? result.content : 'Validation failed.';
      messages.push({ role: 'assistant', content: last }, { role: 'user', content: `${feedback} Return the complete corrected JSON object.` });
    }
    const response = await fetch(`${(env.CELERIS_BASE_URL || BASE).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CELERIS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.EXPLAIN_DEV_MODEL || CELERIS_MODEL, stream: false, max_tokens: body.max_tokens || 4000, temperature: 0.4, ...(env.EXPLAIN_DEV_PARAMS ? JSON.parse(env.EXPLAIN_DEV_PARAMS) : {}), messages,
        response_format: { type: 'json_schema', json_schema: { name: 'explanation_card', strict: true, schema: env.EXPLAIN_DEV_ANYOF === 'true' ? exclusiveOneOfToAnyOf(cardSchema(required)) : cardSchema(required) } } }),
    });
    if (!response.ok) {
      if (capture) seen.capture.push({ attempt: seen.calls, providerStatus: response.status, providerBody: scrub(await response.clone().text().catch(() => ''), env).slice(0, 2000), feedback });
      return response; // the caller turns a non-ok status into its one-line error
    }
    const json = await response.json();
    seen.models.push(json.model || null);
    seen.inTokens += json.usage?.prompt_tokens || 0; seen.outTokens += json.usage?.completion_tokens || 0;
    let card = null; try { card = JSON.parse(json.choices?.[0]?.message?.content ?? ''); } catch { /* an unreadable answer becomes an empty input: the validator names what is missing */ }
    const diagram = card?.diagram ?? null;
    let valid = false, issues = null; if (diagram) { try { valid = !!parseTutorDiagram(diagram); } catch (error) { valid = false; issues = Array.isArray(error?.issues) ? error.issues.slice(0, 8).map(i => ({ path: i.path.join('.'), message: i.message })) : [{ path: '', message: String(error?.message || 'invalid').slice(0, 200) }]; } }
    seen.attempts.push({ required, diagram: diagram ? (valid ? 'valid' : 'invalid') : 'omitted', chars: card ? String(card.title || '').length + String(card.body || '').length : null });
    if (capture) seen.capture.push({ attempt: seen.calls, finish: json.choices?.[0]?.finish_reason ?? null, usage: json.usage || null, raw: scrub(json.choices?.[0]?.message?.content, env).slice(0, 12000), diagramParseErrors: issues, feedback });
    last = json.choices?.[0]?.message?.content ?? "";
    // EXP-13: the diagram goes before the body's last paragraph, so it has prose before and after it (a one-paragraph body keeps it last and the layout check names it).
    const paras = String(card?.body ?? '').trim().split(/\n\s*\n/), fence = `\`\`\`rh-diagram\n${JSON.stringify(diagram)}\n\`\`\``;
    const input = card ? { title: card.title, body: diagram ? (paras.length > 1 ? [...paras.slice(0, -1), fence, paras.at(-1)] : [...paras, fence]).join('\n\n') : card.body } : {};
    return Response.json({ model: json.model, stop_reason: json.choices?.[0]?.finish_reason === 'length' ? 'max_tokens' : 'tool_use', usage: json.usage || {},
      content: [{ type: 'tool_use', id: `t_${seen.calls}`, name: 'make_explanation', input }] });
  };
  return { options: { callModel }, served: () => ({ requested: env.EXPLAIN_DEV_MODEL || CELERIS_MODEL, models: [...new Set(seen.models)], calls: seen.calls, inTokens: seen.inTokens, outTokens: seen.outTokens, attempts: seen.attempts, ...(capture ? { capture: seen.capture, flowRulesArm: env.EXPLAIN_DEV_FLOW_RULES === 'true' } : {}) }) };
}
