// Run against an explicit, locally reviewed context file. Saves the actual API response.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { createCurriculumApi, EVALUATOR_PROMPT } from './curriculum-api.mjs';
import { OUTLINE_SYSTEM, outlineMarkdown } from '../packages/control-plane/src/curriculum-outline.js';

const [inputFile, outputBase] = process.argv.slice(2);
if (!inputFile || !outputBase) throw new Error('Usage: node scripts/run-curriculum-experiment.mjs input.json output-path-without-extension');
const input = JSON.parse(readFileSync(inputFile, 'utf8').replace(/^\uFEFF/, ''));
const prompts = { generator: OUTLINE_SYSTEM, evaluator: EVALUATOR_PROMPT };
writeFileSync(`${outputBase}.request.json`, JSON.stringify({ prompts, input }, null, 2) + '\n');
const token = randomBytes(32).toString('hex');
const trace = [];
const server = createCurriculumApi({ token, onEvent: event => {
  trace.push(event);
  writeFileSync(`${outputBase}.trace.json`, JSON.stringify(trace, null, 2) + '\n');
  if (event.phase === 'candidate') console.log(`Candidate ${event.iteration} generated`);
  if (event.phase === 'evaluation') console.log(`Candidate ${event.iteration}: ${event.evaluation.verdict}; ${event.evaluation.findings.filter(f => f.severity === 'blocking').length} blocking findings`);
}, onError: error => {
  console.error(error.message);
  writeFileSync(`${outputBase}.failure.json`, JSON.stringify({ error: error.message, providerError: error.providerError, candidate: error.candidate, history: error.history }, null, 2) + '\n');
} });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/api/curriculum`;
console.log(`POST ${url} using Claude subscription`);
try {
  // Six bounded model calls can exceed fetch's default response-header timeout.
  // Use Node's HTTP client with an explicit whole-workflow deadline instead.
  const { status, result } = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    }, timeout: 19 * 60 * 1000 }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, result: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Curriculum workflow timed out')));
    req.end(JSON.stringify(input));
  });
  if (status !== 200) throw new Error(`${status}: ${result.error}`);
  writeFileSync(`${outputBase}.json`, JSON.stringify({ prompts, input, ...result }, null, 2) + '\n');
  const summary = `Workflow status: **${result.workflow.status}** (evaluator judgment; owner approval still required).\n\n`;
  writeFileSync(`${outputBase}.md`, summary + outlineMarkdown(result.curriculum));
  console.log(JSON.stringify(result.generation));
  console.log(summary + outlineMarkdown(result.curriculum));
} finally { server.close(); server.closeAllConnections(); }
