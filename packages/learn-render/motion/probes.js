// Deliberately unvalidated compositions for the M1 isolation proofs. They never pass static
// validation and are never accepted over HTTP: only the proof commands and the Linux service
// tests render them, to check the runtime boundary on its own.

// Tries the network every way a page can and logs one MOTION_NET_PROBE line with what happened.
export const NET_PROBE = `import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 };
const OUT = 'http://example.com/';
const wait = p => Promise.race([p, new Promise(r => setTimeout(() => r('timeout'), 8000))]);
const ev = make => wait(new Promise(r => { try { make(r); } catch (e) { r('threw: ' + e.name); } }));
export default function Probe() {
  const [h] = useState(() => delayRender('net probe'));
  useEffect(() => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective + ' ' + e.blockedURI));
    Promise.all([
      wait(fetch(OUT, { mode: 'no-cors' }).then(r => 'reached (' + r.type + ')', e => 'failed: ' + e.message)),
      ev(r => { const x = new XMLHttpRequest(); x.onload = () => r('reached ' + x.status); x.onerror = () => r('failed'); x.open('GET', OUT); x.send(); }),
      ev(r => { const w = new WebSocket('ws://example.com/'); w.onopen = () => r('reached'); w.onerror = () => r('failed'); }),
      ev(r => { const i = new Image(); i.onload = () => r('reached'); i.onerror = () => r('failed'); i.src = OUT + 'probe.png'; }),
      wait(fetch('http://127.0.0.1:59999/', { mode: 'no-cors' }).then(r => 'reached', e => 'failed: ' + e.message)),
      ev(r => r(navigator.sendBeacon(OUT, 'x') ? 'queued' : 'refused')),
      wait(fetch('/index.html').then(r => 'reached ' + r.status, e => 'failed: ' + e.message)),
    ]).then(([fetchOut, xhr, websocket, image, loopbackOtherPort, beacon, ownOrigin]) => {
      setTimeout(() => {
        console.log('MOTION_NET_PROBE ' + JSON.stringify({ fetchOut, xhr, websocket, image, loopbackOtherPort, beacon, ownOrigin, violations }));
        continueRender(h);
      }, 300);
    });
  }, []);
  return <AbsoluteFill style={{ backgroundColor: 'white' }} />;
}
`;
export const NET_PROBE_PREFIX = 'MOTION_NET_PROBE ';
