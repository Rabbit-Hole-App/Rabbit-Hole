// The Author proof's frame probe (harness code, never Author code): once the frame is laid out
// with its fonts, log one MOTION_PROBE line with the storyboard objects (data-object) and the
// text a viewer can actually see, with the font each text renders in (probe-dom.js, shared with
// the HyperFrames renderer). It holds the frame with delayRender until it has measured, and draws
// nothing. Positions are measured from a zero-size marker at the stage origin, because Remotion
// parks the page off-screen while it prepares.
import { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { probeDom } from './probe-dom.js';

export const Probe = () => {
  const frame = useCurrentFrame();
  const origin = useRef(null);
  useLayoutEffect(() => {
    const handle = delayRender('probe');
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      console.log('MOTION_PROBE ' + JSON.stringify(probeDom(frame, origin.current.getBoundingClientRect())));
      continueRender(handle);
    }));
  });
  return <div ref={origin} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }} />;
};
