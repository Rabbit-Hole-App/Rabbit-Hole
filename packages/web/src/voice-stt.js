// Voice Mode's speech-to-text adapter. See docs/features/voice-tutor-mvp.md §3.
//
// The mic streams straight to ElevenLabs Scribe over a raw WebSocket; the
// worker only mints the single-use token. Scribe's VAD decides when an
// utterance is over and sends committed_transcript. The learner's words leave
// this module only through onEvent: never logged, never stored.

const SCRIBE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const RATE = 16000;
// ponytail: fixed RMS threshold for speech_start (telemetry only); calibrate on real mics.
const SPEECH_RMS = 0.02;
// Scribe's error message types; any frame with an `error` field counts too.
const ERRORS = new Set(['error', 'auth_error', 'quota_exceeded', 'commit_throttled', 'transcriber_error', 'unaccepted_terms',
  'rate_limited', 'input_error', 'queue_overflow', 'resource_exhausted', 'session_time_limit_exceeded', 'chunk_size_exceeded',
  'insufficient_audio_activity']);
// Voice Mode stays on until the learner turns it off: a dropped or failed stream reconnects with a
// fresh token. Only these, which a new token cannot fix, and RETRIES failed reconnects in a row stop it.
const FATAL = new Set(['auth_error', 'quota_exceeded', 'unaccepted_terms']);
const RETRIES = 3;

// language_code pins English (owner, 2026-10-01): left to auto-detect, a short or accented sentence came back
// as Spanish and the Tutor answered in Spanish.
export function scribeUrl(token) {
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime', token, audio_format: 'pcm_16000', language_code: 'en', commit_strategy: 'vad',
    vad_silence_threshold_secs: '1.0', min_speech_duration_ms: '100',
  });
  return `${SCRIBE}?${params}`;
}

// Int16Array bytes are platform-endian; every browser runs little-endian, which is what pcm_16000 wants.
export function encodeChunk(pcm) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { message_type: 'input_audio_chunk', audio_base_64: btoa(binary), commit: false, sample_rate: RATE };
}

export function parseScribeFrame(data) {
  let frame;
  try { frame = JSON.parse(data); } catch { return null; }
  if (!frame || typeof frame !== 'object') return null;
  if (frame.error || ERRORS.has(frame.message_type)) return { type: 'error', kind: frame.message_type || 'error' };
  if (frame.message_type === 'partial_transcript') return { type: 'partial', text: frame.text || '' };
  if (frame.message_type === 'committed_transcript') return { type: 'commit', text: frame.text || '' };
  return null;
}

// Box-filter decimation to PCM16. It is also pasted into the worklet below, so
// it must stay a self-contained function declaration.
export function downsample(input, inRate, outRate) {
  const ratio = inRate / outRate;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

// Buffers 100 ms of the first input channel at the context rate, then posts it
// as 16 kHz PCM16. 100 ms is a whole number of samples at 16, 44.1 and 48 kHz,
// so no fractional sample is dropped between frames. The helper is bound by name: the minifier renames
// the module function (downsample becomes va), and the worklet would call a name that does not exist.
export const WORKLET = `const downsample = ${downsample};
class ScribeCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(Math.round(sampleRate / 10)); this.filled = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.buffer.length) {
        const pcm = downsample(this.buffer, sampleRate, ${RATE});
        this.port.postMessage(pcm, [pcm.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('scribe-capture', ScribeCapture);
`;

const rms = pcm => {
  let sum = 0;
  for (const sample of pcm) sum += (sample / 0x8000) ** 2;
  return pcm.length ? Math.sqrt(sum / pcm.length) : 0;
};

export function createScribeStt({ fetchToken, onEvent, deps = {} }) {
  const {
    WebSocket: Socket = globalThis.WebSocket,
    getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints),
    AudioContext: Context = globalThis.AudioContext,
    AudioWorkletNode: WorkletNode = globalThis.AudioWorkletNode,
  } = deps;
  let stream = null, context = null, node = null, socket = null;
  let stopped = true, paused = false, heard = false, failed = false, retries = 0;
  // Bumped by start() and stop(): an await that resumes into a later generation acquires nothing.
  let generation = 0;

  const fail = kind => {
    if (failed || stopped) return;
    failed = true;
    onEvent({ type: 'error', kind });
  };

  async function connect() {
    const mine = generation;
    const minted = await fetchToken();
    // The session's fetchToken may hand back the route's { token } or the bare string.
    const token = typeof minted === 'string' ? minted : minted?.token;
    if (!token) throw new Error('Voice input is unavailable right now.');
    if (stopped || mine !== generation) return;
    const ws = new Socket(scribeUrl(token));
    socket = ws;
    ws.onmessage = ({ data }) => {
      if (ws !== socket) return;
      const event = parseScribeFrame(data);
      if (!event) return;
      if (paused) {
        // ponytail: nothing reaches the session while the Tutor is answering. A provider error
        // here (it may time out an idle stream) drops the socket and resume() reconnects.
        if (event.type === 'error') { socket = null; ws.close(); }
        return;
      }
      if (event.type === 'error') return dropped(ws, event.kind);
      if (event.type === 'partial' || event.type === 'commit') retries = 0;
      onEvent(event);
    };
    ws.onclose = () => {
      if (ws !== socket) return;
      socket = null;
      if (!paused) dropped(ws, 'closed');
    };
  }

  // A stream lost while listening reconnects; resume() reconnects one lost while paused.
  function dropped(ws, kind) {
    if (socket === ws) { socket = null; ws.close(); }
    if (stopped || failed) return;
    if (FATAL.has(kind) || ++retries > RETRIES) return fail(kind);
    connect().catch(() => fail('token'));
  }

  function send(pcm) {
    if (stopped || paused) return;
    if (!heard && rms(pcm) > SPEECH_RMS) { heard = true; onEvent({ type: 'speech_start' }); }
    // ponytail: audio before the socket opens is dropped; buffer it if first words get clipped.
    if (socket?.readyState === 1) socket.send(JSON.stringify(encodeChunk(pcm)));
  }

  const api = {
    async start() {
      const mine = ++generation;
      stopped = false; paused = false; heard = false; failed = false; retries = 0;
      try {
        // A stop() while the permission prompt is open: release the mic it grants, mint nothing.
        const mic = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (mine !== generation) return mic.getTracks().forEach(track => track.stop());
        stream = mic;
        context = new Context();
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
        try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        if (mine !== generation) return; // stop() already released this stream and context
        node = new WorkletNode(context, 'scribe-capture');
        node.port.onmessage = ({ data }) => send(data);
        context.createMediaStreamSource(stream).connect(node);
        // The processor writes no output; reaching the destination keeps it scheduled.
        node.connect(context.destination);
        await connect();
      } catch (error) {
        // NotAllowedError (mic denied) passes through by name; the session maps it.
        if (mine === generation) api.stop();
        throw error;
      }
    },
    pause() { paused = true; },
    async resume() {
      if (stopped) return;
      paused = false; heard = false;
      // A failed re-mint surfaces like any other STT failure, not as a rejection.
      if (!socket) await connect().catch(() => fail('token'));
    },
    stop() {
      stopped = true; paused = false; generation++;
      if (node) node.port.onmessage = null;
      stream?.getTracks().forEach(track => track.stop());
      context?.close();
      const ws = socket;
      socket = null;
      ws?.close();
      stream = null; context = null; node = null;
    },
  };
  return api;
}

// Same interface, no mic or network: unit tests and ?voice=fake scripted QA.
export function createFakeStt({ onEvent, denyPermission = false }) {
  let running = false, paused = false;
  return {
    async start() {
      if (denyPermission) throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      running = true; paused = false;
    },
    pause() { paused = true; },
    async resume() { paused = false; },
    stop() { running = false; paused = false; },
    // Like the real adapter, nothing is heard while paused or stopped.
    say(text) {
      if (!running || paused) return;
      onEvent({ type: 'speech_start' });
      onEvent({ type: 'partial', text });
      onEvent({ type: 'commit', text });
    },
    fail(kind = 'error') {
      if (running) onEvent({ type: 'error', kind });
    },
  };
}
