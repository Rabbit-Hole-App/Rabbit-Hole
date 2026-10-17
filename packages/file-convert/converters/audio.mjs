// Audio -> a browser playback copy: AAC-LC in MP4 (.m4a, faststart), which current Chrome,
// Firefox, Safari and Edge decode. FFmpeg is an LGPL build with only the demuxers and decoders
// listed in the Dockerfile and the native aac encoder: an unsupported codec fails at probe time.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from '../contract.mjs';

function run(cmd, args, timeoutMs = 280000) {
  const r = spawnSync(cmd, args, { encoding: 'buffer', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw Object.assign(new Error(`${cmd} could not run: ${r.error.code || r.error.message}`), { code: r.error.code === 'ETIMEDOUT' ? 'timeout' : 'converter_failure' });
  return r;
}

export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 60000);
  if (r.status !== 0) return { error: r.stderr.toString('utf8').trim().slice(-300) || `ffprobe exit ${r.status}` };
  return JSON.parse(r.stdout.toString('utf8'));
}

const pick = (p) => {
  const a = (p.streams || []).find(s => s.codec_type === 'audio');
  return a && { codec: a.codec_name, profile: a.profile, sample_rate: Number(a.sample_rate), channels: a.channels, bit_rate: Number(a.bit_rate) || null, duration_seconds: Number(a.duration || p.format?.duration) || null, container: p.format?.format_name };
};

export function convertAudio({ input, out, options = {} }) {
  const src = probe(input);
  if (src.error) throw Object.assign(new Error(`not a supported audio file: ${src.error}`), { code: 'unsupported_format' });
  const a = pick(src);
  if (!a) throw Object.assign(new Error('the file has no audio stream this converter can read'), { code: 'unsupported_format' });
  if (!a.duration_seconds) throw Object.assign(new Error('the audio duration could not be read'), { code: 'invalid_source' });
  if (a.duration_seconds > LIMITS.audio_max_seconds) throw Object.assign(new Error(`the audio is ${Math.round(a.duration_seconds)} s long; the limit is ${LIMITS.audio_max_seconds} s`), { code: 'too_complex' });
  const channels = Math.min(a.channels || 2, 2);
  const rate = [44100, 48000].includes(a.sample_rate) ? a.sample_rate : 48000;
  const kbps = options.bitrate_kbps || 128;
  const dst = join(out, 'playback.m4a');
  const t0 = performance.now();
  const r = run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
    '-c:a', 'aac', '-b:a', `${kbps}k`, '-ac', String(channels), '-ar', String(rate), '-movflags', '+faststart', '-f', 'mp4', dst]);
  const encode_ms = Math.round(performance.now() - t0);
  if (r.status !== 0 || !existsSync(dst) || !statSync(dst).size) throw Object.assign(new Error(`ffmpeg could not convert the audio: ${r.stderr.toString('utf8').trim().slice(-300)}`), { code: 'invalid_source' });
  const outProbe = pick(probe(dst));
  if (!outProbe || outProbe.codec !== 'aac') throw Object.assign(new Error('the playback copy is not AAC'), { code: 'converter_failure' });
  writeFileSync(join(out, 'probe.json'), JSON.stringify({ source: a, playback: outProbe }));
  const limitations = [];
  if ((a.channels || 0) > 2) limitations.push(`Downmixed from ${a.channels} channels to stereo`);
  return {
    outputs: [
      { name: 'playback.m4a', kind: 'playback', media_type: 'audio/mp4', meta: { codec: 'aac', duration_seconds: outProbe.duration_seconds, sample_rate: outProbe.sample_rate, channels: outProbe.channels, bitrate_kbps: kbps } },
      { name: 'probe.json', kind: 'metadata', media_type: 'application/json', meta: { source_codec: a.codec, source_container: a.container } },
    ],
    coverage: { text: 'none', transcript: 'not run' },
    limitations,
    metrics: { encode_ms, realtime_factor: Math.round((a.duration_seconds * 1000 / Math.max(1, encode_ms)) * 10) / 10 },
  };
}
