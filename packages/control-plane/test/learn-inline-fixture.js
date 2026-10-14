// A generate body as the worker takes it since the request check (learn-inline-route.js): the request, decided by the
// real decide() with a fake JEV that says proceed, and the signed proceed it returns. No provider.
import { decide } from '../src/learn-inline-route.js';

export const KEY_ENV = Object.freeze({ TYPESAFE_API_KEY: 'test-only-key' });
const answer = choice => ({ type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } });
export const jevSays = (decision, route = 'note', missing = 'nothing') => async () => ({ body: { answers: { decision: answer(decision), route: answer(route), missing: answer(missing) } }, ms: 7, cost: 0.00001, inputTokens: 300 });

// fields: the old body's { app, request_id, mode, route, prompt, context } plus anything else the body carries (revise,
// board); kind and slash are the request's.
export async function decided({ app, request_id, mode = 'explain', route = 'note', prompt, context, kind = 'selection', slash, ...rest }, env = KEY_ENV) {
  const request = kind === 'creation'
    ? { kind, mode, anchor: { x: 0, y: 0 }, region: 'a blank canvas', prompt, ...(slash ? { slash } : {}), context }
    : { kind, mode, targetIds: context.target.ids, prompt, ...(slash ? { slash } : {}), context };
  const out = await decide(env, { app, requestId: request_id, request, enabled: ['note', 'shapes', route] }, { transport: 'direct', ask: jevSays('proceed', route) });
  if (!out.body.token) throw new Error(`no proceed: ${JSON.stringify(out.body)}`);
  return { app, request_id, request, token: out.body.token, ...rest };
}
