// Assembles a lecture: absolute stroke timeline over the persistent board,
// one audio + caption sequence per beat. The board accumulates across screens;
// a screen marked `clears` starts a fresh board group.
import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { WhiteboardScene } from './WhiteboardScene.jsx';
import { Caption } from './Caption.jsx';

const useFonts = () => {
  const [handle] = useState(() => delayRender('loading Virgil + Inter'));
  useEffect(() => {
    const faces = [
      new FontFace('Virgil', `url('${staticFile('fonts/Virgil.woff2')}') format('woff2')`),
      new FontFace('Inter', `url('${staticFile('fonts/Inter-Regular.woff2')}') format('woff2')`, { weight: '400' }),
      new FontFace('Inter', `url('${staticFile('fonts/Inter-Medium.woff2')}') format('woff2')`, { weight: '500' }),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        loaded.forEach((f) => document.fonts.add(f));
        continueRender(handle);
      })
      .catch((e) => cancelRender(new Error(`font failed to load: ${e.message || e}`)));
  }, [handle]);
};

export const Lecture = ({ script, timing }) => {
  useFonts();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const plan = useMemo(() => {
    const clearing = new Set(script.screens.filter((s) => s.clears).map((s) => s.id));
    let start = 0;
    let group = 0;
    let lastScreen = null;
    const beats = script.beats.map((b, i) => {
      if (b.screen !== lastScreen && clearing.has(b.screen)) group++;
      lastScreen = b.screen;
      const t = timing.beats[i];
      const durF = Math.max(1, Math.round(t.durSec * fps));
      const entry = { ...b, audio: t.audio, start, durF, group };
      start += durF;
      return entry;
    });
    const strokes = beats.flatMap((b, bi) =>
      (b.strokes || []).map((s, si) => ({
        stroke: s,
        group: b.group,
        startF: b.start + Math.round(s.at * fps),
        durF: Math.max(1, Math.round(s.dur * fps)),
        seed: bi * 131 + si * 17 + 3,
      }))
    );
    return { beats, strokes };
  }, [script, timing, fps]);

  const cur = plan.beats.reduce((acc, b) => (frame >= b.start ? b : acc), plan.beats[0]);
  const items = plan.strokes
    .filter((s) => s.group === cur.group && frame >= s.startF)
    .map((s) => ({ stroke: s.stroke, seed: s.seed, p: Math.min(1, (frame - s.startF) / s.durF) }));

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
      <WhiteboardScene items={items} />
      {plan.beats.map((b, i) => (
        <Sequence key={i} from={b.start} durationInFrames={b.durF} layout="none">
          <Caption text={b.caption} durationInFrames={b.durF} />
          {b.audio ? <Audio src={staticFile(`audio/${b.audio}`)} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
