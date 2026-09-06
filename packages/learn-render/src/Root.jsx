import React from 'react';
import { Composition } from 'remotion';
import script from '../lectures/nms/script.json';
import timing from '../lectures/nms/timing.json';
import { Lecture } from './lecture/Lecture.jsx';

const FPS = 30;

export const Root = () => (
  <Composition
    id="nms"
    component={Lecture}
    durationInFrames={Math.max(1, Math.round(timing.totalSec * FPS))}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ script, timing }}
  />
);
