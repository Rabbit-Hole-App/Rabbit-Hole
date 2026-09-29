// One invariant for every paid provider (docs/features/learn-artifact-generation.md):
// OpenAI images, FAL video, Manim, Blender, fish.audio narration, and any
// provider added later. A request that would spend money starts only with
// confirmed: true, which the UI sends only from a Generate press. This is the
// server/job boundary, so no UI path can skip it.
export function paidRefusal(body) {
  if (body?.confirmed === true) return null;
  return Response.json({ error: 'This uses paid generation. Confirm it first.', needsConfirm: true }, { status: 428, headers: { 'Cache-Control': 'no-store' } });
}
