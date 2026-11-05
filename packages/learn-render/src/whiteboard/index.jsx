// The /whiteboard composition (roadmap v1 section 6.2): one video per gated manifest, passed as input props by whiteboard/render.mjs.
// Bundled per job with publicDir = that job's own public dir (its audio and the pinned fonts), so no job can play another's audio.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FPS } from './timeline.js';
import { WhiteboardVideo } from './WhiteboardVideo.jsx';

const Root = () => (
  <Composition
    id="whiteboard"
    component={WhiteboardVideo}
    durationInFrames={10 * FPS}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ manifest: null }}
    calculateMetadata={({ props }) => ({ durationInFrames: props.manifest?.timing.totalFrames ?? 10 * FPS })}
  />
);

registerRoot(Root);
