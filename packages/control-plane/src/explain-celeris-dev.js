// DEV ONLY: an explicit Celeris route for the direct written /explain command (the internal command name is 'explanation'; 'explain' is /interactive)
// (owner, 2026-11-07). /api/learn/artifact with command 'explanation' makes its ONE authoring call to Celeris instead of the plan model, then goes through
// the same validation, the one repair and the written-explanation fallback as every other call (learn-artifact.js generateArtifact). Nothing else
// changes: every other command, and /explain anywhere the switch is off, keeps the plan model.
// Celeris answers in json_schema mode (the mode that worked in the diagram benchmark; its tool calls were unreliable: 8 of 20 first answers had no title).
// The schema is { title, body, diagram }: the TutorDiagram spec is its own structured field and RH writes the rh-diagram fence into the body, so the model
// never has to emit a fence. The field is required when the learner's words explicitly ask for a diagram, and may be null otherwise.
// Three switches must all be on: the Worker is a dev or test deployment (SMALL_ENV), EXPLAIN_CELERIS_DEV is "true", and CELERIS_API_KEY is set.
// A production Worker has SMALL_ENV "production" and can never take this path.
import { parseTutorDiagram, tutorDiagramJsonSchema } from '../../web/src/tutor-diagrams/spec.js';

export const CELERIS_MODEL = 'celeris-1';
const BASE = 'https://inference.celeris.ai/celeris-1/v1';
// Words that explicitly ask for a picture. Anything else leaves the diagram to the model ("when useful"), as null or a spec.
export const ASKS_FOR_DIAGRAM = /\b(diagram|flow ?chart|draw|sketch|visuali[sz]e|illustrate|map out)\b/i;

export const celerisExplainOn = (env, command) => command === 'explanation' && env.EXPLAIN_CELERIS_DEV === 'true' && (env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test') && !!env.CELERIS_API_KEY;

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
- diagram: ${required ? 'REQUIRED, the learner asked for a diagram.' : 'the TutorDiagram spec object, or null when you choose no diagram.'} It is the same object the fence would hold, {"version":1,"diagram":{...}}, as a JSON object and never as a string. The app draws it; do not describe it twice.
- The whole card (title, body, table cells and every word in the diagram) must stay under the visible-character budget above; aim for 650 to 750 characters in total.`;

// -> { options, served() } for generateArtifact, or null when the switch is off. served() is what the provider said it ran (the response's model field)
// and what became of each attempt's diagram (omitted, present and valid, present and invalid).
export function celerisExplainRoute(env, command) {
  if (!celerisExplainOn(env, command)) return null;
  const seen = { models: [], calls: 0, inTokens: 0, outTokens: 0, attempts: [] };
  let last = null; // the previous raw answer text, sent back with the validator's words on the one repair
  const callModel = async (callEnv, body) => {
    seen.calls++;
    const first = body.messages?.[0]?.content;
    const firstText = typeof first === 'string' ? first : (first || []).map(part => part.text || '').join('');
    let learnerText = ''; try { learnerText = JSON.parse(firstText).learnerText || ''; } catch { /* not the author's JSON */ }
    const required = ASKS_FOR_DIAGRAM.test(learnerText);
    const guidance = body.tools?.find(tool => tool.name === 'make_explanation')?.description || '';
    const messages = [{ role: 'system', content: `${body.system}\n${guidance}\n${ADDENDUM(required)}` }, { role: 'user', content: firstText }];
    if (body.messages.length > 1 && last != null) {
      const result = body.messages.at(-1).content?.find?.(part => part.type === 'tool_result');
      messages.push({ role: 'assistant', content: last }, { role: 'user', content: `${typeof result?.content === 'string' ? result.content : 'Validation failed.'} Return the complete corrected JSON object.` });
    }
    const response = await fetch(`${(env.CELERIS_BASE_URL || BASE).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CELERIS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CELERIS_MODEL, stream: false, max_tokens: body.max_tokens || 4000, temperature: 0.4, messages,
        response_format: { type: 'json_schema', json_schema: { name: 'explanation_card', strict: true, schema: cardSchema(required) } } }),
    });
    if (!response.ok) return response; // the caller turns a non-ok status into its one-line error
    const json = await response.json();
    seen.models.push(json.model || null);
    seen.inTokens += json.usage?.prompt_tokens || 0; seen.outTokens += json.usage?.completion_tokens || 0;
    let card = null; try { card = JSON.parse(json.choices?.[0]?.message?.content ?? ''); } catch { /* an unreadable answer becomes an empty input: the validator names what is missing */ }
    const diagram = card?.diagram ?? null;
    let valid = false; if (diagram) { try { valid = !!parseTutorDiagram(diagram); } catch { valid = false; } }
    seen.attempts.push({ required, diagram: diagram ? (valid ? 'valid' : 'invalid') : 'omitted', chars: card ? String(card.title || '').length + String(card.body || '').length : null });
    last = json.choices?.[0]?.message?.content ?? "";
    const input = card ? { title: card.title, body: diagram ? `${String(card.body ?? '').trimEnd()}\n\n\`\`\`rh-diagram\n${JSON.stringify(diagram)}\n\`\`\`` : card.body } : {};
    return Response.json({ model: json.model, stop_reason: json.choices?.[0]?.finish_reason === 'length' ? 'max_tokens' : 'tool_use', usage: json.usage || {},
      content: [{ type: 'tool_use', id: `t_${seen.calls}`, name: 'make_explanation', input }] });
  };
  return { options: { callModel }, served: () => ({ requested: CELERIS_MODEL, models: [...new Set(seen.models)], calls: seen.calls, inTokens: seen.inTokens, outTokens: seen.outTokens, attempts: seen.attempts }) };
}
