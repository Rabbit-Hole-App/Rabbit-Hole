// The captions strip at the bottom of the board: the narration line being spoken, Inter on a soft white gradient (the lecture's Caption look,
// without its per-beat fade, which needs at least 16 frames per line).
import React from 'react';
import { Sequence } from 'remotion';

const strip = {
  position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.94) 35%)',
};

export const Captions = ({ cues }) => cues.map(c => (
  <Sequence key={c.from} from={c.from} durationInFrames={c.durationInFrames} layout="none">
    <div style={strip}>
      <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 34, color: '#37352F' }}>{c.text}</div>
    </div>
  </Sequence>
));
