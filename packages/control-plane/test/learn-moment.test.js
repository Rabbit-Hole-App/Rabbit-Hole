import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTrack, parseTimedText, fetchCaptions } from '../src/learn-captions.js';
import { cutWindows, scoreWindows, topPassages, clock } from '../src/learn-moment-retrieve.js';
import { FIND_VIDEO_MOMENTS_TOOL, SHOW_VIDEO_TOOL, validateShowVideo, findVideoMoments } from '../src/learn-youtube.js';

// Fixtures shaped like the live responses this was built against, not like
// documentation: YouTube's manual captions are flat <p> lines, auto captions
// carry per-word <s> segments and <w> window markers.
const MANUAL_XML = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="4060" d="4820">Here, we tackle backpropagation, the core algorithm behind how neural networks learn.</p>
<p t="9400" d="3979">After a quick recap, the first thing I&#39;ll do is an intuitive walkthrough</p>
<p t="13379" d="3621">for what the algorithm is actually doing.</p>
<p t="17000" d="1000">[Music]</p>
</body></timedtext>`;
const AUTO_XML = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<head><ws id="0"/><wp id="1" ap="6"/></head>
<body>
<w t="0" id="1" wp="1" ws="1"/>
<p t="5200" d="5120" w="1"><s ac="255">hi</s><s t="240" ac="255"> everyone</s><s t="720" ac="255"> i&#39;ll</s><s t="880" ac="255"> start</s></p>
<p t="10320" d="4000" w="1"><s ac="252">gradient</s><s t="300"> descent</s><s t="900"> updates</s><s t="1400"> weights</s></p>
</body></timedtext>`;

// --- parsing what YouTube serves ---

test('manual caption lines parse with seconds and clean text', () => {
  const lines = parseTimedText(MANUAL_XML);
  assert.equal(lines.length, 3, '[Music] is not a caption');
  assert.deepEqual(lines[0], { start: 4.06, duration: 4.82, text: 'Here, we tackle backpropagation, the core algorithm behind how neural networks learn.' });
  assert.equal(lines[1].text.includes("I'll"), true, 'entities decode');
});

test('auto captions join their word segments into lines', () => {
  const lines = parseTimedText(AUTO_XML);
  assert.equal(lines.length, 2, 'the <w> marker is not a line');
  assert.equal(lines[0].text, "hi everyone i'll start");
  assert.equal(lines[1].text, 'gradient descent updates weights');
});

test('junk in is an empty list, not a crash', () => {
  assert.deepEqual(parseTimedText(''), []);
  assert.deepEqual(parseTimedText('<html>not captions</html>'), []);
  assert.deepEqual(parseTimedText(null), []);
});

test('English manual beats English auto beats nothing; other languages never win', () => {
  const manual = { languageCode: 'en', kind: undefined, baseUrl: 'm' };
  const auto = { languageCode: 'en', kind: 'asr', baseUrl: 'a' };
  const french = { languageCode: 'fr', baseUrl: 'f' };
  assert.equal(pickTrack([french, auto, manual]), manual);
  assert.equal(pickTrack([french, auto]), auto);
  assert.equal(pickTrack([french]), null, 'English only, like the wiki source');
  assert.equal(pickTrack([]), null);
  assert.equal(pickTrack(undefined), null);
});

// --- the fetch, against a fake InnerTube ---

const player = (tracks, extra = {}) => ({
  ok: true, status: 200,
  json: async () => ({ playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Backprop, intuitively', lengthSeconds: '767' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } }, ...extra }),
});
const xmlReply = xml => ({ ok: true, status: 200, text: async () => xml });

test('a good video yields lines, kind, duration and title', async () => {
  const fake = async url => (String(url).includes('/player') ? player([{ languageCode: 'en', baseUrl: 'https://tt/x' }]) : xmlReply(MANUAL_XML));
  const result = await fetchCaptions('Ilg3gGewQ5U', fake);
  assert.equal(result.lines.length, 3);
  assert.equal(result.kind, 'manual');
  assert.equal(result.duration, 767);
  assert.equal(result.title, 'Backprop, intuitively');
});

test('every failure is a reason for the negative cache, never a throw', async () => {
  const cases = [
    ['no-track', async url => (String(url).includes('/player') ? player([{ languageCode: 'fr', baseUrl: 'f' }]) : xmlReply(MANUAL_XML))],
    ['rate-limited', async () => ({ ok: false, status: 429 })],
    ['blocked', async () => { throw new Error('network'); }],
    ['empty', async url => (String(url).includes('/player') ? player([{ languageCode: 'en', baseUrl: 't' }]) : xmlReply('<timedtext></timedtext>'))],
  ];
  for (const [reason, fake] of cases) {
    const result = await fetchCaptions('Ilg3gGewQ5U', fake);
    assert.equal(result.lines, null, reason);
    assert.equal(result.reason, reason);
  }
});

test('an unplayable video is its own reason, not a parse failure', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) });
  assert.equal((await fetchCaptions('Ilg3gGewQ5U', fake)).reason, 'unplayable');
});

// --- windows and scoring ---

const line = (start, text) => ({ start, duration: 4, text });
const LINES = Array.from({ length: 60 }, (_, index) => line(index * 5, `line ${index} filler words here`));

test('windows cover the transcript at the stated stride', () => {
  const windows = cutWindows(LINES);
  assert.ok(windows.length >= 8);
  assert.equal(windows[0].start, 0);
  assert.ok(Math.abs(windows[1].start - 30) <= 5, 'second window starts near the stride');
  assert.ok(windows.every(entry => entry.end > entry.start));
});

// Reproduced live in review: a single 100s cue followed by silence stalled the
// stride and the old break threw away the entire rest of the transcript.
test('a long cue followed by silence does not swallow the rest of the video', async () => {
  const lines = [
    { start: 0, duration: 100, text: 'a very long introductory cue' },
    { start: 95, duration: 4, text: 'second line' },
    { start: 120, duration: 4, text: 'the answer about gradients' },
    { start: 180, duration: 4, text: 'later material' },
    { start: 300, duration: 4, text: 'closing remarks' },
  ];
  const windows = cutWindows(lines);
  assert.ok(windows.some(entry => entry.text.includes('the answer about gradients')), 'coverage continues past the long cue');
  assert.ok(windows.some(entry => entry.text.includes('closing remarks')), 'and reaches the tail');
  const passages = await topPassages('the answer about gradients', [{ videoId: 'AAAAAAAAAAA', title: 'T', lines }]);
  assert.ok(passages.length > 0, 'retrieval can now see it');
});

test('a short transcript is one window, not zero and not a loop', () => {
  const windows = cutWindows([line(0, 'only line')]);
  assert.equal(windows.length, 1);
  assert.deepEqual(cutWindows([]), []);
  assert.deepEqual(cutWindows(null), []);
});

test('the window with the answer outscores the rest of the haystack', () => {
  const lines = [...LINES];
  lines[40] = line(200, 'backpropagation computes the gradient of the loss for every weight');
  const windows = cutWindows(lines);
  const scores = scoreWindows('how does backpropagation compute gradients', windows);
  const best = windows[scores.indexOf(Math.max(...scores))];
  assert.ok(best.start <= 200 && best.end >= 200, `best window ${best.start}-${best.end} should cover the answer at 200s`);
});

test('no query terms means zero scores, not NaN', () => {
  const scores = scoreWindows('', cutWindows(LINES));
  assert.ok(scores.every(score => score === 0));
});

test('passages are capped per video, so a lecture cannot crowd the field', async () => {
  const lecture = { videoId: 'AAAAAAAAAAA', title: 'Lecture', lines: Array.from({ length: 200 }, (_, index) => line(index * 5, 'gradient descent gradient loss weights')) };
  const short = { videoId: 'BBBBBBBBBBB', title: 'Short', lines: [line(0, 'gradient descent explained with one clean example')] };
  const passages = await topPassages('gradient descent', [lecture, short], { top: 10, perVideo: 3 });
  assert.ok(passages.filter(passage => passage.videoId === 'AAAAAAAAAAA').length <= 3);
  assert.ok(passages.some(passage => passage.videoId === 'BBBBBBBBBBB'), 'the short video still appears');
});

test('passage text carries per-line timestamps the model can cite', async () => {
  const [passage] = await topPassages('backpropagation', [{ videoId: 'AAAAAAAAAAA', title: 'T', lines: [line(252, 'backpropagation is the algorithm')] }]);
  assert.match(passage.text, /\[4:12\] backpropagation/);
});

test('clock reads like a timestamp', () => {
  assert.equal(clock(252), '4:12');
  assert.equal(clock(0), '0:00');
});

// --- the orchestrator ---

test('find_video_moments reports captionless candidates as data, with passages from the rest', async () => {
  const search = async () => [
    { videoId: 'AAAAAAAAAAA', title: 'With captions', channel: 'C1' },
    { videoId: 'BBBBBBBBBBB', title: 'Silent', channel: 'C2' },
  ];
  const captions = async videoId => (videoId === 'AAAAAAAAAAA'
    ? { lines: [line(252, 'backpropagation is the core algorithm')], kind: 'manual', language: 'en', duration: 767, title: 'With captions (real)' }
    : { lines: null, reason: 'no-track' });
  const result = await findVideoMoments('backpropagation', {}, { search, captions });
  assert.equal(result.videos.length, 2);
  assert.equal(result.videos[0].hasCaptions, true);
  assert.equal(result.videos[0].title, 'With captions (real)', 'the player title beats the search title');
  assert.deepEqual(result.videos[1], { videoId: 'BBBBBBBBBBB', title: 'Silent', channel: 'C2', hasCaptions: false, hasPassages: false, captionNote: 'no-track', duration: null });
  assert.equal(result.videos[0].hasPassages, true, 'the gate keys on this, not on hasCaptions');
  assert.equal(result.passages.length, 1);
  assert.equal(result.passages[0].videoId, 'AAAAAAAAAAA');
});

// --- the gate on show_video ---

const FOUND = new Map([
  ['Ilg3gGewQ5U', { title: 'Backprop', hasCaptions: true, hasPassages: true, duration: 767 }],
  ['FaHHWdsIYQg', { title: 'Silent one', hasCaptions: false, hasPassages: false, duration: null }],
  // Captions parsed, but retrieval surfaced nothing - the model never saw a
  // word of it, so a window would be cited from nothing.
  ['aBcDeFgHiJk', { title: 'Captioned but unread', hasCaptions: true, hasPassages: false, duration: 600 }],
]);

test('a window comes only from a video whose passages were read', () => {
  assert.deepEqual(validateShowVideo({ videoId: 'Ilg3gGewQ5U', start: 252, end: 338, reason: 'shows the update', confidence: 0.85 }, FOUND),
    { videoId: 'Ilg3gGewQ5U', title: 'Backprop', start: 252, end: 338, unverified: false, confidence: 0.85, reason: 'shows the update' });
});

test('captions existing is not enough: zero passages means zero windows', () => {
  assert.throws(() => validateShowVideo({ videoId: 'aBcDeFgHiJk', start: 10, end: 70 }, FOUND), /No passages from this video/);
  const shown = validateShowVideo({ videoId: 'aBcDeFgHiJk' }, FOUND);
  assert.equal(shown.unverified, true, 'window-less, and honest about it');
});

test('a fake confidence is dropped, not clamped into credibility', () => {
  assert.equal(validateShowVideo({ videoId: 'Ilg3gGewQ5U', start: 252, end: 338, confidence: 7 }, FOUND).confidence, null);
});

test('a video outside this answer cannot be shown at all', () => {
  assert.throws(() => validateShowVideo({ videoId: 'aircAruvnKk', start: 0, end: 60 }, FOUND), /from this answer/);
});

test('a captionless video is shown without a window or not at all', () => {
  const shown = validateShowVideo({ videoId: 'FaHHWdsIYQg' }, FOUND);
  assert.equal(shown.start, 0);
  assert.equal(shown.end, null);
  assert.equal(shown.unverified, true);
  assert.throws(() => validateShowVideo({ videoId: 'FaHHWdsIYQg', start: 10, end: 60 }, FOUND), /without a window/);
});

test('window bounds hold: 5s to 5min, inside the video', () => {
  assert.throws(() => validateShowVideo({ videoId: 'Ilg3gGewQ5U', start: 100, end: 103 }, FOUND), /5s to 5min/);
  assert.throws(() => validateShowVideo({ videoId: 'Ilg3gGewQ5U', start: 100, end: 500 }, FOUND), /5s to 5min/);
  assert.throws(() => validateShowVideo({ videoId: 'Ilg3gGewQ5U', start: 700, end: 800 }, FOUND), /after the video does/);
});

test('the tools refuse arguments they do not define', () => {
  for (const tool of [FIND_VIDEO_MOMENTS_TOOL, SHOW_VIDEO_TOOL]) {
    assert.equal(tool.input_schema.additionalProperties, false, tool.name);
  }
});
