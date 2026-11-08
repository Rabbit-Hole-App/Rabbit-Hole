// OWNER-AUTHORIZED ONLY (each run is 2 small paid calls, about US$0.01). The written /explain chain against the REAL providers: one author request per
// step of the production profile (fireworks-low: Fireworks gpt-oss-120b, then Gemini gemini-3.5-flash-lite), each built by the chain's own stepRequest
// from the real author request, sent with stream:false. A step passes when the provider answers HTTP 200 and the answer is a schema-valid make_explanation
// input whose every visual parses (artifactBlock + parseTutorDiagram/parseIllustration; the card's layout and wording checks are a model-quality question,
// not the provider's, and are not asserted). Written after 2026-11-08, when Gemini refused 9 of 9 fallback requests (HTTP 400) and no check ever sent one.
//
//   EXPLAIN_PROVIDER_SMOKE=yes-spend-approved FIREWORKS_API_KEY=... GEMINI_API_KEY=... node scripts/explain-provider-smoke.mjs
//
// Keys come from the environment of this one command; this script never reads a .env file and prints no key. Exit 0: every step passed; 1: a step failed;
// 2: refused to run (no approval word, or a key missing).
import { prepareArtifactAuthorRequest } from '../packages/control-plane/src/learn-artifact.js';
import { CHAIN_ENDPOINTS, stepRequest } from '../packages/control-plane/src/explanation-fast-chain.js';
import { EXPLANATION_PROFILE_SETTING, chainSteps } from '../packages/control-plane/src/explanation-models.js';
import { artifactBlock, markdownIllustrations, markdownVisuals } from '../packages/control-plane/src/learn-primitives.js';

const PROFILE = 'fireworks-low', PROMPT = 'Why does ice float on water?';
if (process.env.EXPLAIN_PROVIDER_SMOKE !== 'yes-spend-approved') { console.log('Refusing to run: set EXPLAIN_PROVIDER_SMOKE=yes-spend-approved only when the owner has authorized this spend.'); process.exit(2); }
const env = { [EXPLANATION_PROFILE_SETTING]: PROFILE, FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY || '', GEMINI_API_KEY: process.env.GEMINI_API_KEY || '', CEREBRAS_API_KEY: '' };
const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: PROMPT });
if (prepared.result) { console.log(`Refusing to run: ${prepared.message}`); process.exit(2); }
const author = prepared.profile.roles.author, steps = chainSteps(author);
const missing = steps.filter(s => !env[s.credentialRef]).map(s => s.credentialRef);
if (missing.length) { console.log(`Refusing to run: ${missing.join(', ')} not set in the environment.`); process.exit(2); }

let failed = 0;
for (const step of steps) {
  const request = stepRequest(step, author.settings.reasoning_effort, prepared.body, false);
  const t0 = performance.now();
  let line;
  try {
    const sent = await fetch(CHAIN_ENDPOINTS[step.provider].url, { method: 'POST', headers: { Authorization: `Bearer ${env[step.credentialRef]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(60000) });
    const text = await sent.text(), ms = Math.round(performance.now() - t0);
    let json = null; try { json = JSON.parse(text); } catch { /* reported below */ }
    if (!sent.ok) throw new Error(`HTTP ${sent.status} in ${ms} ms: ${String((Array.isArray(json) ? json[0] : json)?.error?.message ?? text).slice(0, 300)}`);
    const block = artifactBlock('explanation', JSON.parse(json?.choices?.[0]?.message?.content ?? '')); // throws on a schema-invalid answer
    const visuals = [...markdownVisuals(block.body).diagrams, ...markdownIllustrations(block.body)];
    if (!visuals.length || visuals.some(v => !v.ok)) throw new Error(`HTTP 200 in ${ms} ms, but a visual does not parse: ${visuals.map(v => v.problem || 'ok').join('; ') || 'none'}`);
    line = `PASS ${step.provider} ${step.model}: HTTP 200 in ${ms} ms, ${visuals.length} visual(s), usage ${JSON.stringify(json.usage ?? null)}`;
  } catch (error) { failed++; line = `FAIL ${step.provider} ${step.model}: ${error.message}`; }
  console.log(line);
}
process.exit(failed ? 1 : 0);
