// The whole video: one board per scene (cleared at the scene's start), each beat's MP3 at its start frame, captions at the bottom.
// Content mounts only once the pinned fonts are in (Motion's loader), so no frame is painted in a fallback face.
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { useMotionFonts } from '../motion/fonts.jsx';
import { Captions } from './Captions.jsx';
import { Scene } from './Scene.jsx';
import { schedule } from './timeline.js';

export const WhiteboardVideo = ({ manifest }) => {
  const ready = useMotionFonts();
  const plan = useMemo(() => schedule(manifest), [manifest]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
      {ready ? (
        <>
          {plan.scenes.map(s => (
            <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames}>
              <Scene strokes={s.strokes} />
            </Sequence>
          ))}
          {plan.audio.map(a => (
            <Sequence key={a.src} from={a.from} durationInFrames={a.durationInFrames} layout="none">
              <Audio src={staticFile(a.src)} />
            </Sequence>
          ))}
          <Captions cues={plan.cues} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
