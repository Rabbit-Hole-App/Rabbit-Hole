// W1.0 measurement entry (roadmap): the lecture composition driven by a synthetic script of the requested length (synth.js). Temporary
// (ponytail: W1.0 only): the whiteboard composition of W1.4 replaces it. The script arrives as input props, so one bundle serves every duration.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import script from '../../lectures/nms/script.json';
import timing from '../../lectures/nms/timing.json';
import { Lecture } from '../lecture/Lecture.jsx';
import { FPS, synthLecture } from './synth.js';

const Root = () => (
  <Composition
    id="capacity"
    component={Lecture}
    durationInFrames={10 * FPS}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={synthLecture(10, { script, timing })}
    calculateMetadata={({ props }) => ({ durationInFrames: props.frames })}
  />
);

registerRoot(Root);
