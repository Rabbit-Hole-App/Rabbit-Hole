import { sceneFetch } from '../control-plane/src/learn-scene.js';
import { repositoriesFetch, repositoryIdentity, ownerRepositories } from '../control-plane/src/repositories.js';
import { profileFetch, profileRoute } from '../control-plane/src/profile.js';
import { contextDocsFetch, contextDocsRoute } from '../control-plane/src/learn-context-docs.js';
import { canvasesFetch, canvasRoute, ownerCanvases, refuseCanvasAsk, refuseLiveLearnAsk, canvasAskSeam } from '../control-plane/src/canvases.js';
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
import { boardFetch, authorizedBoardApp, paperFetch, mediaFetch, momentFeedback, videoGone, canvasSearch, wikiArticle } from '../control-plane/src/learn-board.js';
import { learnGradeRoute, assessAnswer } from '../control-plane/src/learn-grade-routes.js';
import { tutorRoute } from '../control-plane/src/learn-tutor-routes.js';
import { journeyRoute } from '../control-plane/src/learn-journey.js';
import { homeAskFetch } from '../control-plane/src/learn-home-ask.js';
import { voiceRoute } from '../control-plane/src/learn-voice-routes.js';
import { learnBoardsRoute } from '../control-plane/src/learn-boards.js';
import { artifactFetch } from '../control-plane/src/learn-artifact.js';
import { paidRefusal } from '../control-plane/src/learn-paid.js';
import { feedbackFetch } from '../control-plane/src/learn-feedback.js';
import { videoFetch } from '../control-plane/src/learn-video.js';
import { forwardToProduction, guardControlPlane } from '../control-plane/src/dev-forwarding.js';
import { searchPexels } from '../control-plane/src/pexels.js';
import { subscriptionOwnerRefusal, subscriptionCourseRefusal } from '../control-plane/src/subscription-transport.js';
export { LearnVideos } from '../control-plane/src/learn-video.js';

// Authentication/app actions use the live backend. Dev Learn reuses the Ask handler
// and shared chat history, with support for selectable AI canvas objects.
export default {
  // The moment-index Queue consumer (flywheel phase 3), same as the live
  // worker's: bound only on clones whose config declares the consumer.
  async queue(batch, env) {
    env = guardControlPlane(env);
    if (!env.LEARN_MEDIA) throw new Error('LEARN_MEDIA is not bound on this dev worker');
    const { consumeIndexQueue } = await import('../control-plane/src/learn-moment-index.js');
    await consumeIndexQueue(batch, env);
  },
  async fetch(req, env, ctx) {
    // Every production call from any module passes the fail-closed allowlist, not only the fall-through.
    env = guardControlPlane(env);
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
    // Learn media must land in the dev bucket, never small-runs: without the
    // binding this worker serves nothing rather than fall back to live storage.
    if (!env.LEARN_MEDIA) return Response.json({ error: 'LEARN_MEDIA is not bound on this dev worker; add it to the wrangler config.' }, { status: 503 });
    if (path.startsWith('/api/repositories')) return repositoriesFetch(req, env, ctx);
    if (canvasRoute(new URL(req.url))) return canvasesFetch(req, env);
    // Settings > Profile: the person's own name and picture (LEARN_DB user_profiles).
    if (profileRoute(new URL(req.url))) return profileFetch(req, env);
    // Canvas context documents (docs/features/canvas-context-docs.md): upload, list, toggle, delete.
    if (contextDocsRoute(new URL(req.url))) return contextDocsFetch(req, env);
    if (path === '/api/apps' && req.method === 'GET') {
      const user = await repositoryIdentity(req, env);
      if (user instanceof Response) return user;
      const { userId, ...catalog } = user; // users.id stays server-side (journeys key on it, adaptive-learning-path-v1-architecture.md §10.2)
      // Dev apps only: listing live apps is production GET /api/apps, whose sweepStaleRuns writes
      // (docs/features/dev-prod-write-barrier.md). A live app still opens by name (GET /api/apps/<name>).
      return Response.json({ ...catalog, folders: [], apps: [...(await ownerRepositories(env, catalog)), ...(await ownerCanvases(env, catalog))] }, { headers: { 'Cache-Control': 'no-store' } });
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
      // Paid: only the learner's explicit confirmation starts it.
      const refused = paidRefusal(body); if (refused) return refused;
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
    // Canvas asks the Learn router below does not take: multipart (no canvas attachments yet) or the legacy Agent panels' /api/ask (live small-cp).
    const refused = await refuseCanvasAsk(req);
    if (refused) return refused;
    if (env.SUBSCRIPTION_ONLY === 'true' && req.method === 'POST' && (path === '/api/ask' || /\/learn-course$/.test(path))) {
      let action; try { action = (await req.clone().json()).action; } catch {}
      if (path === '/api/ask') return Response.json({ error: 'Subscription-only dev mode: use Learn chat. This action is not connected to the subscription yet.' }, { status: 503 });
      const courseRefused = subscriptionCourseRefusal(env, action);
      if (courseRefused) return courseRefused;
    }
    if (env.SUBSCRIPTION_ONLY === 'true' && req.method === 'POST' && ['/api/learn/ask', '/api/learn/selection'].includes(path) && !req.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Attachments are not connected to the subscription yet. No API fallback.' }, { status: 503 });
    // JSON, or multipart when the composer's + attached a file: both stay on
    // this dev worker (a multipart ask used to fall through to the live one).
    // Any other body type ends here too: proxied, live small-cp would answer it on the live D1.
    const learnAskType = req.headers.get('content-type') || '';
    if (['/api/learn/selection', '/api/learn/ask'].includes(path) && req.method === 'POST') {
      if (!learnAskType.includes('application/json') && !learnAskType.includes('multipart/form-data')) return Response.json({ error: 'Send a Learn question as JSON or multipart form data.' }, { status: 415 });
      let body;
      try { body = learnAskType.includes('multipart/form-data') ? JSON.parse((await req.clone().formData()).get('body') || '{}') : await req.clone().json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
      if (body.scope?.app?.startsWith('repo-')) {
        const target = new URL(req.url); target.pathname = `/api/repositories/${body.scope.app}/ask`;
        return repositoriesFetch(new Request(target, req), env, ctx);
      }
      {
        const access = await authorizedBoardApp(req, env, body.scope?.app, body.scope?.pending);
        if (access instanceof Response) return access;
        const liveRefused = refuseLiveLearnAsk(access);
        if (liveRefused) return liveRefused;
        const ownerRefused = subscriptionOwnerRefusal(env, access);
        if (ownerRefused) return ownerRefused;
        return apiAsk(req, env, ctx, { email: access.email, org: access.org, orgName: access.orgName }, 'learn', access.kind === 'canvas' ? canvasAskSeam(env, access) : undefined);
      }
    }
    if (path === '/api/learn/tts' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
      if (!body?.text || typeof body.text !== 'string' || body.text.length > 4000) return Response.json({ error: 'Provide narration text under 4000 characters.' }, { status: 400 });
      const access = await authorizedBoardApp(req, env, body.app);
      if (access instanceof Response) return access;
      // fish.audio is paid: only the learner's explicit confirmation starts it.
      const refused = paidRefusal(body); if (refused) return refused;
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
    // Voice Mode: the Scribe token and the Tutor's spoken words (docs/features/voice-tutor-mvp.md §5).
    if (path.startsWith('/api/learn/voice/')) { const voiced = await voiceRoute(path, req, env); if (voiced) return voiced; }
    if (path === '/api/learn/paper') return paperFetch(req, env);
    if (path === '/api/learn/media') return mediaFetch(req, env);
    if (path === '/api/learn/moment-feedback') return momentFeedback(req, env);
    if (path === '/api/learn/video-gone') return videoGone(req, env);
    if (path === '/api/learn/wiki') return wikiArticle(req, env);
    // The visible grade (owner decision 3, docs/features/learn-cleanup.md): one model call, nothing stored.
    if (path === '/api/learn/assess') return assessAnswer(req, env);
    if (path.startsWith('/api/learn/tutor/')) { const tutored = await tutorRoute(path, req, env); if (tutored) return tutored; }
    if (path.startsWith('/api/learn/journey')) { const routed = await journeyRoute(path, req, env); if (routed) return routed; }
    // Home answers, in place, from the signed-in user's own library (learn-home-ask.js); never the old apps agent.
    if (path === '/api/learn/home-ask') return homeAskFetch(req, env);
    // Jev side-by-side grading (docs/features/jev-grading.md).
    if (path.startsWith('/api/learn/grade')) { const graded = await learnGradeRoute(path, req, env); if (graded) return graded; }
    // Saved and shared canvas boards (docs/features/canvas-sharing.md). Before
    // the exact /api/learn/board route, which generates explanations.
    if (path.startsWith('/api/learn/boards/')) { const boards = await learnBoardsRoute(path, req, env); if (boards) return boards; }
    if (path === '/api/learn/search') return canvasSearch(req, env);
    // The Learn canvas's bug / idea button (docs/features/learn-feedback.md).
    if (path === '/api/learn/feedback') return feedbackFetch(req, env);
    // Learn Artifact Generation v1: a / command's validated canvas block
    // (docs/features/learn-artifact-generation.md).
    // Both refuse a non-owner in subscription mode after their own authorization.
    if (path === '/api/learn/artifact') return artifactFetch(req, env);
    if (path === '/api/learn/board') return boardFetch(req, env);
    if (path === '/aws') return Response.redirect(new URL('/apps', req.url), 302);
    if (path.startsWith('/api/byoc/')) return byocFetch(req, env, { apiCode, signerCode, permissionsCode, grantsCode });
    // /b/<token> is a shared board: served to anyone, the page decides what they may see.
    if (path === '/apps' || path === '/dash' || path === '/chat' || path === '/members' || path === '/library' || path === '/explore' || path.startsWith('/apps/') || /^\/b\/[A-Za-z0-9_-]{20,64}$/.test(path)) {
      return new Response(SHELL, {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (path.startsWith('/static/') || path.startsWith('/audio/') || path.startsWith('/lesson-assets/') || path.startsWith('/mascot/') || path.startsWith('/landing/') || path === '/favicon.svg' || path.startsWith('/icon-') || path === '/apple-touch-icon.png') {
      return env.ASSETS.fetch(req);
    }
    // A page Landing does not have is its 404 page. The barrier allows no page besides /, which Landing
    // serves, so such a request never needs production.
    if (isPublicPageRequest(req)) {
      return new Response(req.method === 'HEAD' ? null : SUPPORT, {
        status: 404,
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }
    // Production small-cp gets only allowlisted reads and sign-in; everything else is a 403 here
    // (dev-forwarding.js, P0-B). The dev request URL is kept so sign-in links and cookies stay on the dev host.
    return forwardToProduction(req, env);
  },
};
