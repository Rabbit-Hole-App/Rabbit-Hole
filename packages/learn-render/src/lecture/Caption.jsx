// Bottom caption strip: Inter, ink on a soft white gradient, fades per beat.
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const Caption = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.94) 35%)',
        opacity,
      }}
    >
      <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 34, color: '#37352F' }}>{text}</div>
    </div>
  );
};
