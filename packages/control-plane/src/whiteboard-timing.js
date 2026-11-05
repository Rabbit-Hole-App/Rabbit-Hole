// /whiteboard timing (roadmap v1 section 6.1, timing row). The plan's scene windows are fixed (multiples of 30 frames summing to d x 30); each
// scene's beats play one after another from the start of its window, a beat taking its measured audio and then its pause. A scene whose beats
// need more frames than its window overruns: the job rewrites that scene's narration once and narrates it again (whiteboard-job.js); a scene
// that still overruns fails the job. No tempo change, no clipping: the audio is placed as measured, and the total is exactly d x 30 frames.
import { WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';

export const audioKeyOf = (sceneId, beatId) => `audio/${sceneId}-${beatId}.mp3`;
export const audioFramesOf = seconds => Math.ceil(seconds * L.fps - 1e-9);

// plan, scenes (SceneManifests in plan order), audio: Map(audioKey -> { seconds }) for every narrated beat.
// -> { timing } | { overrun: [sceneId] } (each with the frames it needed and had)
export function fitTiming(plan, scenes, audio) {
  const beats = [], overrun = [];
  plan.scenes.forEach((window, i) => {
    let frame = window.startFrame;
    for (const beat of scenes[i].beats) {
      const audioKey = audioKeyOf(window.id, beat.id), voiced = beat.narration.trim() !== '';
      const audioFrames = voiced ? audioFramesOf(audio.get(audioKey).seconds) : 0;
      beats.push({ id: beat.id, sceneId: window.id, startFrame: frame, audioKey, audioFrames });
      frame += audioFrames + beat.pauseFrames;
    }
    if (frame > window.endFrame) overrun.push({ sceneId: window.id, needed: frame - window.startFrame, window: window.endFrame - window.startFrame });
  });
  if (overrun.length) return { overrun };
  return { timing: { schema: 'whiteboard-timing/1', fps: L.fps, totalFrames: plan.durationSeconds * L.fps, beats } };
}
