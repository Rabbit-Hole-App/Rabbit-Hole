// Voice Mode TTS adapter (docs/features/voice-tutor-mvp.md §4): the Tutor's spoken words go to
// POST /api/learn/voice/tts (Fish, pinned narrator) and play through an HTMLAudioElement.
// speak() never throws: it resolves 'ended', 'stopped' or 'failed'. Only one speak at a time.
// Events carry the turn id and a timestamp only, never the words.

const SPEAK_CAP = 600;

// What must not be read aloud: code, math, markdown syntax and URLs. Link text stays.
export function speakable(text) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(?:https?:\/\/|www\.)\S+/g, ' ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= SPEAK_CAP) return plain;
  // End at the last full sentence inside the cap; otherwise at the last word.
  const sentence = plain.slice(0, SPEAK_CAP + 1).match(/^[\s\S]*[.!?](?=\s)/);
  if (sentence && sentence[0].length > SPEAK_CAP / 2) return sentence[0];
  return plain.slice(0, SPEAK_CAP).replace(/\s+\S*$/, '');
}

// post(path, body, signal) -> fetch Response; the hook adds credentials, workspace headers, app
// and pending.
export function createFishTts({ post, onEvent = () => {}, makeAudio = url => new Audio(url), now = () => performance.now() }) {
  let current = null;
  const stop = () => current?.finish('stopped');

  function speak(text, { turnId } = {}) {
    stop();
    const words = speakable(text);
    if (!words) return Promise.resolve('ended');
    const emit = type => onEvent({ type, turnId, at: now() });
    return new Promise(resolve => {
      const controller = new AbortController();
      const run = current = { audio: null, url: null, done: false };
      run.finish = outcome => {
        if (run.done) return;
        run.done = true;
        if (current === run) current = null;
        controller.abort();
        if (run.audio) {
          run.audio.onplaying = run.audio.onended = run.audio.onerror = null;
          run.audio.pause();
        }
        if (run.url) URL.revokeObjectURL(run.url);
        resolve(outcome);
      };
      const fail = () => {
        if (run.done) return;
        emit('tts_error');
        run.finish('failed');
      };
      (async () => {
        emit('tts_request_start');
        const response = await post('/api/learn/voice/tts', { text: words, trace_id: turnId, confirmed: true }, controller.signal);
        if (!response.ok || !response.body) throw new Error(`tts ${response.status}`);
        // ponytail: the whole body is buffered before play. MediaSource streaming of audio/mpeg is
        // the upgrade path when first-audio latency matters more than simplicity.
        const reader = response.body.getReader(), chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (run.done) return;
          if (done) break;
          if (!chunks.length) emit('tts_first_byte');
          chunks.push(value);
        }
        run.url = URL.createObjectURL(new Blob(chunks, { type: 'audio/mpeg' }));
        const audio = run.audio = makeAudio(run.url);
        audio.onplaying = () => { audio.onplaying = null; emit('tts_play_start'); };
        audio.onended = () => { emit('tts_play_end'); run.finish('ended'); };
        audio.onerror = fail;
        await audio.play(); // rejects when autoplay is blocked
      })().catch(fail);
    });
  }

  return { speak, stop };
}

// Same interface with no network or audio, for tests and scripted QA (?voice=fake). The options
// object is read on every speak, so the hook can flip `fail` or `ms` between turns.
export function createFakeTts(options = {}) {
  const { onEvent = () => {}, now = () => performance.now() } = options;
  let current = null;
  const stop = () => current?.('stopped');

  function speak(text, { turnId } = {}) {
    stop();
    const words = speakable(text);
    if (!words) return Promise.resolve('ended');
    const emit = type => onEvent({ type, turnId, at: now() });
    return new Promise(resolve => {
      emit('tts_request_start');
      if (options.fail) {
        emit('tts_error');
        return resolve('failed');
      }
      emit('tts_first_byte');
      emit('tts_play_start');
      const finish = outcome => {
        clearTimeout(timer);
        if (current === finish) current = null;
        resolve(outcome);
      };
      const timer = setTimeout(() => { emit('tts_play_end'); finish('ended'); }, options.ms ?? Math.min(words.length * 40, 8000));
      current = finish;
    });
  }

  return { speak, stop };
}
