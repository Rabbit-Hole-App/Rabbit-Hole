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

// M7B: the same attempts from a HyperFrames page (hyperframes-renderer.mjs), for the same proofs:
// with the page CSP on (the authoring host) and off (the Linux network namespace alone).
export const HF_NET_PROBE = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body>
<div id="root" data-composition-id="net-probe" data-start="0" data-duration="5" data-width="1920" data-height="1080" data-no-timeline style="position: relative; width: 1920px; height: 1080px; background: #fff;"></div>
<script>
(function () {
  var OUT = 'http' + '://example.com/';
  var violations = [];
  document.addEventListener('securitypolicyviolation', function (e) { violations.push(e.violatedDirective + ' ' + e.blockedURI); });
  var wait = function (p) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r('timeout'); }, 8000); })]); };
  var ev = function (make) { return wait(new Promise(function (r) { try { make(r); } catch (e) { r('threw: ' + e.name); } })); };
  Promise.all([
    wait(fetch(OUT, { mode: 'no-cors' }).then(function (r) { return 'reached (' + r.type + ')'; }, function (e) { return 'failed: ' + e.message; })),
    ev(function (r) { var x = new XMLHttpRequest(); x.onload = function () { r('reached ' + x.status); }; x.onerror = function () { r('failed'); }; x.open('GET', OUT); x.send(); }),
    ev(function (r) { var w = new WebSocket('ws' + '://example.com/'); w.onopen = function () { r('reached'); }; w.onerror = function () { r('failed'); }; }),
    ev(function (r) { var i = new Image(); i.onload = function () { r('reached'); }; i.onerror = function () { r('failed'); }; i.src = OUT + 'probe.png'; }),
    wait(fetch('http' + '://127.0.0.1:59999/', { mode: 'no-cors' }).then(function () { return 'reached'; }, function (e) { return 'failed: ' + e.message; })),
    ev(function (r) { r(navigator.sendBeacon(OUT, 'x') ? 'queued' : 'refused'); }),
    wait(fetch('/index.html').then(function (r) { return 'reached ' + r.status; }, function (e) { return 'failed: ' + e.message; })),
  ]).then(function (v) {
    setTimeout(function () {
      console.log('MOTION_NET_PROBE ' + JSON.stringify({ fetchOut: v[0], xhr: v[1], websocket: v[2], image: v[3], loopbackOtherPort: v[4], beacon: v[5], ownOrigin: v[6], violations: violations }));
    }, 300);
  });
})();
</script>
</body></html>
`;
