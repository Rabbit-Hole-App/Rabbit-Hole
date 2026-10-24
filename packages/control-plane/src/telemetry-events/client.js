// Browser failures (brief Task 11): what failed and where, never the message text, the stack, a URL, a query string or a share
// token. The anonymous error route accepts only this namespace (ingest: 'client'); the server stamps the environment, release and account.
//   fingerprint: a hash of the error's name and its top stack frame with URLs and line numbers removed (web client-telemetry.js).
//   route: a route template (routeTemplate in the contract). A failed request carries the request's trace_id (the envelope
//   field, from the x-rh-trace header the browser sent), which the server stamps on its own events for that request, so the
//   dashboard links the failure to the server timeline and its action.
export default {
  namespace: 'client',
  ingest: 'client',
  events: {
    'client.error': {
      kind: { enum: ['uncaught', 'unhandled_rejection', 'boundary', 'save_failed', 'load_failed', 'render_failed', 'network', 'long_task', 'slow_interaction'], required: true },
      fingerprint: { type: 'hex', required: true },
      route: { type: 'route', required: true },
      source: { type: 'token' },        // where it was caught: window, react, fetch, observer
      error_name: { type: 'token' },    // the constructor name only (TypeError), never the message
      artifact: { type: 'token' },      // the kind of card or artifact that failed to render
      browser: { type: 'token' }, device: { type: 'token' },
      status_code: { type: 'int' }, duration_ms: { type: 'ms' },
      count: { type: 'int' },           // occurrences this report stands for (repeats within one page are folded into one event)
      dropped: { type: 'int' },         // events this page dropped (rate limit, queue full, lost in transit) before this one
      online: { type: 'bool' },
    },
  },
};
