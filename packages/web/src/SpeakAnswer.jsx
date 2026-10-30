import { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { wsHeaders } from './api.js';
import { claimMicrophone, microphoneHolder, releaseMicrophone } from './explain-back-media.js';

// Say the answer instead of typing it. The transcript lands in the same input
// the learner would have typed into, so it is visible and editable before it
// is graded - a misheard word is not a wrong answer.
// ponytail: MediaRecorder + server transcription; the browser SpeechRecognition
// API is Chrome-only and mishears technical words like "logits".

// One microphone owner per page (explain-back-media.js): an Explain-back voice note or Sketch narration in progress refuses
// dictation by name instead of competing for the microphone.
const OWNER = { id: 'speak-answer', label: 'Speak answer' };

export default function SpeakAnswer({ appName, onText, disabled }) {
  const recorder = useRef(null);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const stop = () => { recorder.current?.stop(); setRecording(false); };
  const start = async () => {
    setError('');
    if (!claimMicrophone(OWNER)) { setError(`${microphoneHolder()?.label || 'Another recording'} is using the microphone. Stop it first.`); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { releaseMicrophone(OWNER); setError('Microphone permission is needed to speak your answer.'); return; }
    const chunks = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    media.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      releaseMicrophone(OWNER);
      setWorking(true);
      try {
        const form = new FormData();
        form.set('audio', new Blob(chunks, { type: media.mimeType || 'audio/webm' }), 'answer.webm');
        form.set('app', appName || '');
        const response = await fetch('/api/learn/transcribe', { method: 'POST', headers: wsHeaders(), body: form });
        const heard = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(heard.error || `HTTP ${response.status}`);
        if (!heard.text) throw new Error('Nothing was picked up; try again a little closer to the microphone.');
        onText(heard.text);
      } catch (problem) { setError(problem.message); }
      finally { setWorking(false); }
    };
    recorder.current = media;
    media.start();
    setRecording(true);
  };
  return (
    <>
      <button type="button" data-speak-answer aria-pressed={recording} disabled={disabled || working}
        title={recording ? 'Stop and transcribe' : 'Speak your answer'} onClick={() => (recording ? stop() : start())}
        className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border ${recording ? 'border-red-600 bg-red-50 text-red-600' : 'border-line hover:bg-hover'} disabled:opacity-40`}>
        {working ? <Loader2 size={14} className="animate-spin" /> : recording ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
      </button>
      {(recording || error) && <p data-speak-status className={`mt-1 basis-full text-xs ${error ? 'text-red-700' : 'text-ink-2'}`}>{error || 'Listening. Click the square when you are done.'}</p>}
    </>
  );
}
