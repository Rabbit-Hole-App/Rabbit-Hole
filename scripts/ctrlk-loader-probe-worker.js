// Throwaway probe Worker, deployed only by scripts/ctrlk-loader-probe.mjs under a rabbit-hole-loader-probe-* name and deleted
// afterwards. It runs the REAL inline-code runtime against the Dynamic Workers loader. No D1, R2, Durable Object or secret.
import { createInlineCodeRuntime } from '../packages/control-plane/src/inline-code-runtime.js';

export default {
  async fetch(request, env) {
    // A random per-run token: without it the Worker answers like any unknown path.
    if (!env.PROBE_TOKEN || request.headers.get('authorization') !== `Bearer ${env.PROBE_TOKEN}`) return new Response('Not found', { status: 404 });
    const { code, input = null } = await request.json();
    return Response.json(await createInlineCodeRuntime({ loader: env.INLINE_CODE_LOADER }).run({ language: 'javascript', code, input }));
  },
};
