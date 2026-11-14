// Shared bits of the post tools: where ffmpeg and sharp come from. packages/web has neither `sharp` nor a system ffmpeg on the owner's machine, so both are configured:
//   FILM_FFMPEG       path to an ffmpeg with libx264 (default "ffmpeg" on PATH). The first film used the H.264 build bundled in Remotion's compositor package, copied to C:/s/tools/ffmpeg-remotion/.
//   FILM_SHARP_FROM   a package.json whose node_modules has `sharp` (tried after packages/web itself); the first film used scripts/topic-pipeline/package.json of a topic-pipeline checkout.
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const FFMPEG = process.env.FILM_FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FILM_FFPROBE || (process.env.FILM_FFMPEG ? process.env.FILM_FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1') : 'ffprobe');

export function loadSharp() {
  const tries = [join(process.cwd(), 'package.json'), process.env.FILM_SHARP_FROM].filter(Boolean);
  for (const from of tries) { try { return createRequire(from)('sharp'); } catch { /* try the next */ } }
  throw new Error(`sharp not found: set FILM_SHARP_FROM to a package.json whose node_modules has it (tried ${tries.join(', ')})`);
}
