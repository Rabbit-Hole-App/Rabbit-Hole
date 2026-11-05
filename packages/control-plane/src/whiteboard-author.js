// /whiteboard author stage (roadmap v1 W1.3): one whiteboard_author call per scene, its reply normalised into a SceneManifest (the server sets
// the schema, the scene id and the beat ids) and checked by whiteboard-schema.js validateScene plus the W1 text rule (no URLs). A scene that
// fails its checks gets one correction call carrying the issues, from the job's two shared corrections; a scene still failing, or with no
// correction left, fails the job ("the plan could not be written"). The timing rewrite (rewriteScene) is the same call with the measured
// overrun, and also takes a shared correction.
import { SCENE_TOOL, WHITEBOARD_AUTHOR_SYSTEM } from './agents/whiteboard-author.js';
import { WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';
import { validateScene } from './whiteboard-schema.js';

const URL_LIKE = /\b(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai)\b/i;
const LIMITS = { primitives: L.primitivesPerScene, pointsPerPath: L.pointsPerPath, beats: L.beatsPerScene, beatChars: L.beatChars };

export function normaliseScene(input, sceneId) {
  return { schema: 'whiteboard-scene/1', sceneId, primitives: Array.isArray(input?.primitives) ? input.primitives : [],
    beats: (Array.isArray(input?.beats) ? input.beats : []).map((b, i) => ({ id: `b${i + 1}`, narration: typeof b?.narration === 'string' ? b.narration.trim() : b?.narration, reveals: b?.reveals, pauseFrames: b?.pauseFrames })) };
}
export function sceneIssues(scene) {
  const issues = validateScene(scene);
  if (issues.length) return issues;
  for (const [i, p] of scene.primitives.entries()) if (typeof p.text === 'string' && URL_LIKE.test(p.text)) issues.push(`primitives.${i}.text: no URLs or file names`);
  for (const [i, b] of scene.beats.entries()) if (URL_LIKE.test(b.narration)) issues.push(`beats.${i}.narration: no URLs or file names`);
  return issues;
}

const content = (job, index, extra) => JSON.stringify({ plan: { goal: job.plan.goal, audience: job.plan.audience, durationSeconds: job.plan.durationSeconds, scenes: job.plan.scenes },
  scene: job.plan.scenes[index], seconds: (job.plan.scenes[index].endFrame - job.plan.scenes[index].startFrame) / L.fps, limits: LIMITS, ...extra });
const unfit = (issues, answer) => Object.assign(new Error(`The scene does not fit the policy: ${issues.slice(0, 6).join('; ')}`), { code: 'scene_unfit', issues, answer });

// One scene, with at most one correction when one is left (job.corrections counts the job's shared ones). -> { scene, corrections }
export async function authorScene(job, index, ctx, extra = {}) {
  const id = job.plan.scenes[index].id;
  const ask = async more => normaliseScene((await ctx.call('author', { system: WHITEBOARD_AUTHOR_SYSTEM, tool: SCENE_TOOL, content: content(job, index, { ...extra, ...more }) })).input, id);
  let scene = await ask({}), issues = sceneIssues(scene), corrections = job.corrections || 0;
  if (!issues.length) return { scene, corrections };
  if (corrections >= L.authorCorrections) throw unfit(issues, scene);
  corrections++;
  scene = await ask({ correction: { previous: scene, issues } });
  issues = sceneIssues(scene);
  if (issues.length) throw Object.assign(unfit(issues, scene), { corrections });
  return { scene, corrections };
}

// The timing rewrite: the scene's narration shortened to fit its window. Takes one shared correction; none left -> null (the job fails).
export async function rewriteScene(job, index, ctx, overrun) {
  if ((job.corrections || 0) >= L.authorCorrections) return null;
  const out = await authorScene({ ...job, corrections: job.corrections + 1 }, index, ctx,
    { rewrite: { previous: job.scenes[index], neededSeconds: overrun.needed / L.fps, haveSeconds: overrun.window / L.fps } });
  return out;
}
