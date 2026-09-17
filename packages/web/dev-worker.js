import { sceneFetch } from '../control-plane/src/learn-scene.js';
import { repositoriesFetch, repositoryIdentity, repositoryApp } from '../control-plane/src/repositories.js';
export { RepositoryImports } from '../control-plane/src/repositories.js';
export { LearnScenes } from '../control-plane/src/learn-scene.js';
import SHELL from './dist-dev/index.html';
import { byocFetch } from '../control-plane/src/byoc.js';
import apiCode from '../byoc/api.py';
import signerCode from '../byoc/signer.py';
import permissionsCode from '../byoc/permissions.py';
import grantsCode from '../byoc/grants.py';
import { apiAsk } from '../control-plane/src/index.js';
import { boardFetch, authorizedBoardApp, paperFetch } from '../control-plane/src/learn-board.js';
import { videoFetch } from '../control-plane/src/learn-video.js';
export { LearnVideos } from '../control-plane/src/learn-video.js';

// Authentication/app actions use the live backend. Dev Learn reuses the Ask handler
// and shared chat history, with support for selectable AI canvas objects.
export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
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
    if (path === '/api/learn/paper') return paperFetch(req, env);
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
    if (path.startsWith('/static/') || path.startsWith('/audio/') || path === '/favicon.svg' || path.startsWith('/icon-') || path === '/apple-touch-icon.png') {
      return env.ASSETS.fetch(req);
    }
    // Keep the dev request URL so sign-in links and cookies stay on the dev host.
    return env.CONTROL_PLANE.fetch(req);
  },
};
