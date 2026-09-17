// Local experiment only. No app routes, database access, or persistence.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { OUTLINE_SYSTEM, validateOutline, validateOutlineRequest } from '../packages/control-plane/src/curriculum-outline.js';
import { EVALUATOR_SYSTEM } from '../packages/control-plane/src/curriculum-evaluator.js';
import { runCurriculumWorkflow } from '../packages/control-plane/src/curriculum-workflow.js';

export const EVALUATOR_PROMPT = `${EVALUATOR_SYSTEM}\n\n${readFileSync(new URL('../packages/control-plane/prompts/curriculum-review.md', import.meta.url), 'utf8')}`;

const MAX_BODY = 90000; // Bounded app evidence plus brief and optional references.
const MODEL_TIMEOUT = 180000; // Bound a subscription call that stops responding.

async function subscriptionCall(input, system) {
  const startedAt = Date.now();
  const env = { ...process.env };
  // This experiment uses the signed-in Claude subscription, never .env API keys.
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key];
  const raw = await new Promise((resolve, reject) => {
    const child = execFile('claude', ['--print', '--safe-mode', '--tools', '',
      '--no-session-persistence', '--output-format', 'json', '--model', 'opus',
      '--system-prompt', system], { env, timeout: MODEL_TIMEOUT, maxBuffer: 1024 * 1024, windowsHide: true },
    (error, stdout) => {
      if (!error) return resolve(stdout);
      const failure = new Error(`Claude subscription process failed (code=${error.code}, signal=${error.signal || 'none'}, killed=${!!error.killed})`);
      try {
        const result = JSON.parse(stdout);
        failure.providerError = typeof result.result === 'string' ? result.result.slice(0, 1000) : result.subtype;
      } catch { /* Process errors without JSON still report code/signal above. */ }
      reject(failure);
    });
    child.stdin.on('error', () => {}); // execFile reports an early process failure.
    child.stdin.end(JSON.stringify(input));
  });
  const message = JSON.parse(raw);
  if (message.is_error) throw new Error('Claude returned an unsuccessful generation');
  const value = JSON.parse(message.result.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
  // CLI can report auxiliary model calls as well as the main answer; retain all
  // usage instead of mislabelling the response with the first object's key.
  const modelUsage = message.modelUsage || {};
  const model = Object.entries(modelUsage).sort((a, b) => (b[1].outputTokens || 0) - (a[1].outputTokens || 0))[0]?.[0] || 'opus';
  return { value, model, modelUsage, usage: message.usage || null, elapsedMs: Date.now() - startedAt };
}

export async function subscriptionGenerate(input, revision = null) {
  const { value, ...call } = await subscriptionCall({ ...input, ...(revision ? { revision,
    instruction: 'Revise the candidate using the evaluator feedback while preserving the original brief and evidence. Correct supported defects; do not invent facts to satisfy a reviewer. Return only the complete revised curriculum in the original format.',
  } : {}) }, OUTLINE_SYSTEM);
  try { return { curriculum: validateOutline(value), ...call }; }
  catch (error) { error.candidate = value; throw error; }
}

export async function subscriptionEvaluate(input, candidate, reviewContext) {
  const { value, ...call } = await subscriptionCall({ ...input, candidate, ...reviewContext }, EVALUATOR_PROMPT);
  return { evaluation: value, ...call };
}

export function createCurriculumApi({ token, generate = subscriptionGenerate,
  evaluate = subscriptionEvaluate, onEvent = () => {}, onError = () => {} }) {
  if (!token || token.length < 24) throw new Error('Set a CURRICULUM_API_TOKEN of at least 24 characters');
  let busy = false;
  return createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    // No browser integration or CORS. Bind only to loopback and require a caller token.
    if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) return reply(403, { error: 'Forbidden' });
    if (req.url !== '/api/curriculum') return reply(404, { error: 'Not found' });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
    if (busy) return reply(429, { error: 'A curriculum is already generating' });
    let input;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return reply(413, { error: 'Request too large' });
        chunks.push(chunk);
      }
      input = validateOutlineRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch { return reply(400, { error: 'Invalid JSON or incomplete curriculum brief/app evidence' }); }
    // Recheck after body reads: simultaneous uploads must not start parallel calls.
    if (busy) return reply(429, { error: 'A curriculum is already generating' });
    busy = true;
    const start = Date.now();
    try {
      const result = await runCurriculumWorkflow(input, { generate, evaluate, onEvent });
      reply(200, { curriculum: result.curriculum,
        workflow: { status: result.status, history: result.history }, generation: {
        provider: 'claude-code-subscription', model: result.history.at(-1).generation.model,
        calls: result.history.flatMap(h => [{ role: 'generator', iteration: h.iteration, ...h.generation },
          { role: 'evaluator', iteration: h.iteration, ...h.evaluationCall }]),
        elapsedMs: Date.now() - start,
      } });
    } catch (error) {
      onError(error);
      reply(502, { error: 'Curriculum generation failed, timed out, or returned an invalid outline' });
    }
    finally { busy = false; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createCurriculumApi({ token: process.env.CURRICULUM_API_TOKEN });
  server.listen(Number(process.env.CURRICULUM_API_PORT || 0), '127.0.0.1', () => {
    console.log(`Curriculum API: http://127.0.0.1:${server.address().port}/api/curriculum`);
  });
}
