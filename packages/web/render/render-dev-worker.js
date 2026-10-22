// Dev-only render service for Lane D's clone: renders scene JSON through the production render entry with
// Browser Rendering (explain-render.js renderStates) and returns the PNGs. One browser session per request.
// Bearer token (secret RENDER_DEV_TOKEN) required; no assets or other routes are served publicly.
//   POST /__explain/render  { items: [{ name, scene, entries: [{ id, theme, time, inputs, target }] }] }
import { RENDER_LIMITS, compiledHash, launchBrowser, renderStates } from '../../control-plane/src/explain-render.js';

const MAX_ITEMS = 24, MAX_BYTES = 4 * 1024 * 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/__explain/render' || request.method !== 'POST') return json({ error: 'not found' }, 404);
    if (!env.RENDER_DEV_TOKEN || request.headers.get('authorization') !== `Bearer ${env.RENDER_DEV_TOKEN}`) return json({ error: 'unauthorized' }, 401);
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ error: 'too large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) return json({ error: `1 to ${MAX_ITEMS} items` }, 400);
    const opened = Date.now();
    let browser;
    try { browser = await launchBrowser(env); } catch (error) { return json({ error: `browser: ${error.message}` }, 503); }
    const items = [];
    try {
      for (const item of body.items) {
        const scene = item.scene;
        try {
          const entries = (item.entries || [{}]).map((e, i) => ({ id: e.id || `c${i}`, width: scene.width, height: scene.height, dpr: 2, theme: 'light', inputs: {}, time: scene.duration, ...e }));
          const manifest = { version: 1, compiledHash: await compiledHash(scene), reserved: { captures: entries.length, pixels: entries.reduce((s, e) => s + e.width * e.height * e.dpr * e.dpr, 0) }, entries };
          const out = await renderStates(env, { scene }, manifest, { browser, limits: { totalMs: RENDER_LIMITS.totalMs } });
          items.push({ name: item.name, ok: true, blocked: out.requests.blocked, served: out.requests.served.length,
            captures: out.captures.map(c => ({ id: c.id, aliases: c.aliases, theme: c.theme, sha256: c.sha256, png: b64(c.png) })) });
        } catch (error) { items.push({ name: item.name, ok: false, code: error.code || null, error: String(error.message).slice(0, 500) }); }
      }
    } finally { await browser.close().catch(() => {}); }
    return json({ items, browserMs: Date.now() - opened });
  },
};
