// One scene's board: the lecture's Rough.js strokes with their pathLength reveal and pen sprite (src/lecture/WhiteboardScene.jsx), driven by
// the scene's stroke schedule (timeline.js). The frame is relative to the scene's Sequence, so the board starts empty.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { WhiteboardScene } from '../lecture/WhiteboardScene.jsx';
import { itemsAt } from './timeline.js';

export const Scene = ({ strokes }) => <WhiteboardScene items={itemsAt(strokes, useCurrentFrame())} />;
