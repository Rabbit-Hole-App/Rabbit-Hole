// Test helper (not shipped): a scripted transport in the session's contract (decide, generate, card, artifact) built from
// a test's own scripted pieces. Its decide runs the shared free checks and fixed routes (inline-ai-decide.js) as the worker
// does; a natural request is routed by the test's own route() (a scripted JEV answer), or goes to the note. Generation
// and cards reach the test's generate() and artifact() with the decided route, as the worker's handlers would.
import { checkDecision, checkRequest, fixedRoute, generationPrompt, INLINE_SLASH, settle } from './inline-ai-decide.js';

export function scripted(transport) {
  const decided = new Map();
  const withKind = request => (request.kind ? request : { ...request, kind: 'selection', targetIds: (request.context?.target?.objects || [{ id: 'x' }]).map(entry => entry.id) });
  return {
    async decide({ requestId, request, enabled }, options) {
      if (transport.decide) return transport.decide({ requestId, request, enabled }, options);
      const asked = withKind(request);
      const local = checkRequest(asked);
      if (local?.error) return { error: local.error, code: 'invalid', retryable: false };
      if (local) return local;
      const fixed = fixedRoute(asked, enabled);
      if (fixed?.decision) return fixed;
      let verdict = { decision: 'proceed', capability: 'note' };
      if (!fixed && transport.route) {
        const read = await transport.route({ requestId, prompt: asked.prompt, selection: '' }, options);
        if (read?.error) return { error: "Couldn't check this request. Try again.", code: read.error === 'timeout' ? 'timeout' : 'unavailable', retryable: true };
        verdict = read.confidence < 0.6 ? { decision: 'clarify', missing: ['format'] } : { decision: 'proceed', capability: INLINE_SLASH[read.choice] || read.choice };
      }
      const out = settle(fixed, verdict, enabled);
      if (out.decision === 'proceed') { out.token = `t-${requestId}`; decided.set(requestId, out.route.capability); }
      return { ...checkDecision(out), meta: { validator: 'jev' } };
    },
    generate({ requestId, request, token, revise }, options) {
      return transport.generate({ requestId, token, mode: request.mode, route: decided.get(requestId), prompt: generationPrompt(request), context: request.context, ...(revise ? { revise } : {}) }, options);
    },
    card({ requestId, request, token, revise }, options) {
      return transport.artifact({ requestId, token, command: decided.get(requestId), args: generationPrompt(request), context: request.context, ...(revise ? { revise } : {}) }, options);
    },
    artifact: (input, options) => transport.artifact(input, options),
  };
}
