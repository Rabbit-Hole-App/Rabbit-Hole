// Voice Mode routes on the dev worker (docs/features/voice-tutor-mvp.md §5):
//   POST /api/learn/voice/scribe-token  a single-use ElevenLabs Scribe token (learn-voice-scribe.js)
//   POST /api/learn/voice/tts           the Tutor's words as Fish audio (learn-voice-tts.js)
// Gate order as tutorRoute and contextDocsFetch: method, origin, JSON, app access, subscription
// owner, paid confirmation; the handlers then check their key and call the provider.
import { authorizedBoardApp } from './learn-board.js';
import { paidRefusal } from './learn-paid.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { scribeToken } from './learn-voice-scribe.js';
import { voiceSpeech } from './learn-voice-tts.js';

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const ROUTES = ['/api/learn/voice/scribe-token', '/api/learn/voice/tts'];

export async function voiceRoute(path, req, env, deps = {}) {
  if (!ROUTES.includes(path)) return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body?.app, body?.pending || null);
  if (access instanceof Response) return access;
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  // Both providers are paid; turning Voice Mode on is the learner's confirmation, and the client sends it.
  const refused = paidRefusal(body); if (refused) return refused;
  if (path === '/api/learn/voice/scribe-token') return (deps.scribeToken || scribeToken)(env, deps);
  return (deps.voiceSpeech || voiceSpeech)(env, body, deps);
}
