import { sceneFetch } from '../control-plane/src/learn-scene.js';
import { repositoriesFetch, repositoryIdentity, repositoryApp } from '../control-plane/src/repositories.js';
export { RepositoryImports } from '../control-plane/src/repositories.js';
export { LearnScenes } from '../control-plane/src/learn-scene.js';
import SHELL from './dist-dev/index.html';
import LANDING from './dist-dev/design/rabbit-hole-hero.html';
import BLOG from './dist-dev/design/rabbit-hole-blog.html';
import FEATURES from './dist-dev/design/rabbit-hole-features.html';
import PRICING from './dist-dev/design/rabbit-hole-pricing.html';
import MANIFESTO from './dist-dev/design/rabbit-hole-manifesto.html';
import TEAM from './dist-dev/design/rabbit-hole-team.html';
import DOCS from './dist-dev/design/rabbit-hole-docs.html';
import { DOCS_PATHS } from './src/landing/docs-content.js';
import AUTH from './dist-dev/design/rabbit-hole-auth.html';
import { AUTH_PATHS } from './src/landing/auth-routes.js';
import SUPPORT from './dist-dev/design/rabbit-hole-support.html';
import { SUPPORT_PATHS, isPublicPageRequest } from './src/landing/support-routes.js';
import { byocFetch } from '../control-plane/src/byoc.js';
import apiCode from '../byoc/api.py';
import signerCode from '../byoc/signer.py';
import permissionsCode from '../byoc/permissions.py';
import grantsCode from '../byoc/grants.py';
import { apiAsk } from '../control-plane/src/index.js';
import { boardFetch, authorizedBoardApp, paperFetch, paperSearch, wikiArticle, wikiSearch, youtubeSearch } from '../control-plane/src/learn-board.js';
import { videoFetch } from '../control-plane/src/learn-video.js';
import { searchPexels } from '../control-plane/src/pexels.js';
export { LearnVideos } from '../control-plane/src/learn-video.js';

// Authentication/app actions use the live backend. Dev Learn reuses the Ask handler
// and shared chat history, with support for selectable AI canvas objects.
export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
    if (DOCS_PATHS.includes(path.replace(/\/$/, ''))) {
      if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      return new Response(req.method === 'HEAD' ? null : DOCS, {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (SUPPORT_PATHS.includes(path.replace(/\/$/, ''))) {
      if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      return new Response(req.method === 'HEAD' ? null : SUPPORT, {
        status: path.replace(/\/$/, '') === '/404' ? 404 : 200,
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }
    if (AUTH_PATHS.includes(path.replace(/\/$/, ''))) {
      if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      return new Response(req.method === 'HEAD' ? null : AUTH, {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin' },
      });
    }
    const publicPage = {'/': LANDING, '/blog': BLOG, '/features': FEATURES, '/pricing': PRICING, '/manifesto': MANIFESTO, '/team': TEAM}[path.replace(/\/$/, '') || '/'];
    if (typeof publicPage === 'string') return new Response(publicPage, {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
    });
    if (path.startsWith('/api/repositories')) return repositoriesFetch(req, env, ctx);
    if (path === '/api/apps' && req.method === 'GET') {
      const catalog = await repositoryIdentity(req, env);
      if (catalog instanceof Response) return catalog;
      const { results } = await env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? ORDER BY created_at DESC').bind(catalog.org).all();
      return Response.json({ ...catalog, apps: [...catalog.apps, ...results.map(row => repositoryApp(row, catalog))] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const repositoryRoute = path.match(/^\/api\/apps\/(repo-[a-z0-9-]+)(\/learn-course)?$/);
    if (repositoryRoute) {
      const target = new URL(req.url); target.pathname = `/api/repositories/${repositoryRoute[1]}${repositoryRoute[2] || ''}`;
      return repositoriesFetch(new Request(target, req), env, ctx);
    }
    if (path === '/api/learn/graph-config' && req.method === 'GET') {
      const app = await authorizedBoardApp(req, env, new URL(req.url).searchParams.get('app'));
      if (app instanceof Response) return app;
      return Response.json({ desmosApiKey: env.DESMOS_API_KEY || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path === '/api/learn/photos' && req.method === 'GET') {
      const url = new URL(req.url);
      const app = await authorizedBoardApp(req, env, url.searchParams.get('app'));
      if (app instanceof Response) return app;
      try { return Response.json({ photos: await searchPexels(env, url.searchParams.get('query') || '') }, { headers: { 'Cache-Control': 'no-store' } }); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    }
    if (path === '/api/learn/image' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
      const access = await authorizedBoardApp(req, env, body?.app);
      if (access instanceof Response) return access;
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt || prompt.length > 1000) return Response.json({ error: 'Provide an image prompt under 1000 characters.' }, { status: 400 });
      if (!env.OPENAI_API_KEY) return Response.json({ error: 'Image generation is not configured on this environment.' }, { status: 503 });
      const upstream = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'low', n: 1 }),
        signal: AbortSignal.timeout(120000),
      });
      if (!upstream.ok) return Response.json({ error: `Image generation unavailable (${upstream.status})` }, { status: 502 });
      const result = await upstream.json();
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded) return Response.json({ error: 'The provider returned no image.' }, { status: 502 });
      return Response.json({ image: `data:image/png;base64,${encoded}` }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path === '/api/learn/scene') return sceneFetch(req, env);
    if (path === '/api/learn/video') return videoFetch(req, env);
    if (env.SUBSCRIPTION_ONLY === 'true' && req.method === 'POST' && (path === '/api/ask' || /\/learn-course$/.test(path))) {
      let action; try { action = (await req.clone().json()).action; } catch {}
      if (path === '/api/ask' || ['draft', 'generate'].includes(action)) return Response.json({ error: 'Subscription-only dev mode: use Learn chat. This action is not connected to the subscription yet.' }, { status: 503 });
    }
    if (env.SUBSCRIPTION_ONLY === 'true' && req.method === 'POST' && ['/api/learn/ask', '/api/learn/selection'].includes(path) && !req.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Attachments are not connected to the subscription yet. No API fallback.' }, { status: 503 });
    if (['/api/learn/selection', '/api/learn/ask'].includes(path) && req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
      let body;
      try { body = await req.clone().json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
      if (body.scope?.app?.startsWith('repo-')) {
        const target = new URL(req.url); target.pathname = `/api/repositories/${body.scope.app}/ask`;
        return repositoriesFetch(new Request(target, req), env, ctx);
      }
      {
        const access = await authorizedBoardApp(req, env, body.scope?.app);
        if (access instanceof Response) return access;
        if (env.SUBSCRIPTION_ONLY === 'true' && access.email !== env.SUBSCRIPTION_OWNER_EMAIL) return Response.json({ error: 'This personal dev subscription is available only to its owner.' }, { status: 403 });
        return apiAsk(req, env, ctx, { email: access.email, org: access.org, orgName: access.orgName }, 'learn');
      }
    }
    if (path === '/api/learn/tts' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
      if (!body?.text || typeof body.text !== 'string' || body.text.length > 4000) return Response.json({ error: 'Provide narration text under 4000 characters.' }, { status: 400 });
      const access = await authorizedBoardApp(req, env, body.app);
      if (access instanceof Response) return access;
      if (!env.FISH_AUDIO_API_KEY) return Response.json({ error: 'Narration audio is not configured on this environment.' }, { status: 503 });
      const upstream = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model: 's1' },
        // Same pinned narrator as the pre-generated lesson clips.
        body: JSON.stringify({ text: body.text, reference_id: '802e3bc2b27e49c2995d23ef70e6ac89', format: 'mp3', mp3_bitrate: 128, normalize: true }),
      });
      if (!upstream.ok) return Response.json({ error: 'Narration audio unavailable.' }, { status: 502 });
      return new Response(upstream.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    }
    // The learner can speak an answer instead of typing it; the transcript is
    // shown before anything is graded, so a misheard word can be corrected.
    if (path === '/api/learn/transcribe' && req.method === 'POST') {
      const form = await req.formData().catch(() => null);
      const clip = form?.get('audio');
      if (!clip || typeof clip === 'string') return Response.json({ error: 'Attach a recording to transcribe.' }, { status: 400 });
      if (clip.size > 20 * 1024 * 1024) return Response.json({ error: 'That recording is too long; keep it under a minute.' }, { status: 400 });
      const access = await authorizedBoardApp(req, env, form.get('app'));
      if (access instanceof Response) return access;
      if (!env.OPENAI_API_KEY) return Response.json({ error: 'Speech to text is not configured on this environment.' }, { status: 503 });
      const upload = new FormData();
      upload.set('file', clip, 'answer.webm');
      upload.set('model', 'gpt-4o-transcribe');
      const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: upload,
      });
      if (!upstream.ok) return Response.json({ error: 'Could not transcribe that recording.' }, { status: 502 });
      const heard = await upstream.json();
      return Response.json({ text: (heard.text || '').trim() });
    }
    if (path === '/api/learn/paper') return paperFetch(req, env);
    if (path === '/api/learn/arxiv') return paperSearch(req, env);
    if (path === '/api/learn/wiki') return wikiArticle(req, env);
    if (path === '/api/learn/wiki/search') return wikiSearch(req, env);
    if (path === '/api/learn/youtube') return youtubeSearch(req, env);
    if (path === '/api/learn/board') {
      if (env.SUBSCRIPTION_ONLY === 'true') {
        let body; try { body = await req.clone().json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
        const access = await authorizedBoardApp(req, env, body.app);
        if (access instanceof Response) return access;
        if (access.email !== env.SUBSCRIPTION_OWNER_EMAIL) return Response.json({ error: 'This personal dev subscription is available only to its owner.' }, { status: 403 });
      }
      return boardFetch(req, env);
    }
    if (path === '/aws') return Response.redirect(new URL('/apps', req.url), 302);
    if (path.startsWith('/api/byoc/')) return byocFetch(req, env, { apiCode, signerCode, permissionsCode, grantsCode });
    if (path === '/apps' || path === '/dash' || path === '/chat' || path === '/members' || path.startsWith('/apps/')) {
      return new Response(SHELL, {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (path.startsWith('/static/') || path.startsWith('/audio/') || path.startsWith('/lesson-assets/') || path.startsWith('/mascot/') || path.startsWith('/landing/') || path === '/favicon.svg' || path.startsWith('/icon-') || path === '/apple-touch-icon.png') {
      return env.ASSETS.fetch(req);
    }
    // Keep the dev request URL so sign-in links and cookies stay on the dev host.
    const response = await env.CONTROL_PLANE.fetch(req);
    if (response.status === 404 && isPublicPageRequest(req)) {
      return new Response(req.method === 'HEAD' ? null : SUPPORT, {
        status: 404,
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }
    return response;
  },
};
