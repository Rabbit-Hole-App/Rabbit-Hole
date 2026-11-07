// Review and e2e sessions are minted only on the Rabbit Hole dev control plane (P0-B Phase 2B,
// docs/features/rabbit-hole-dev.md), with RABBIT_HOLE_DEV_TEST_BYPASS from the repo-root .env.
// There is no production fallback: small-cp has no test bypass. The session is signed with the
// dev MASTER_KEY, so a dev/review worker (CONTROL_PLANE = rabbit-hole-cp-dev) accepts it as its cookie.
export const DEV_CP = process.env.RABBIT_HOLE_DEV_CP || 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';

// CR-1's chat route decision (C:/s/spec/day-1021/chat-route-interface.md section 3) for a chat line that is a question: every
// response field, as decideChat answers a JEV "answer" choice (an answer carries no route_token; only a capability route has
// one). The CI stack has no JEV key, so the real POST /api/learn/chat/route falls back (Answer normally / Retry) and the turn
// is never sent; a check that sends a routed Chat turn answers the route with this. generation-proposal-chat.test.mjs runs it
// through the client's own routeChat/routeOutcome and chat-capability-route.test.js compares it with the server's decision.
export const chatRouteAnswer = (body = {}) => ({
  route: 'answer', flow: null, via: 'jev', capability: null, args: String(body.text ?? '').trim(), confidence: 0.9, probability: 0.9,
  clarification: null, message: null, settings: null, paid: false, retryable: false, code: null, token: null,
  meta: { protocol: 'chat-route-c1', model: 'jev-1.13.0', ms: 1, input_tokens: 600, cost: 0.0000252, transport: 'gateway' },
});
// Answers POST /api/learn/chat/route on a page or context with chatRouteAnswer. Register it after any catch-all route on the
// same target: Playwright tries the last-registered handler first.
export const mockChatRoute = (target, seen = null) => target.route(/\/api\/learn\/chat\/route$/, route => {
  const body = JSON.parse(route.request().postData() || '{}');
  seen?.push(body);
  return route.fulfill({ json: chatRouteAnswer(body) });
});
