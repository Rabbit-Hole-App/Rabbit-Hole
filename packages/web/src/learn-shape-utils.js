import { ThreeDShapeUtil } from './ThreeDShape.jsx';
import { LearnVideoShapeUtil } from './LearnVideoShape.jsx';
import { InteractiveGraphShapeUtil } from './InteractiveGraphShape.jsx';

// The lesson and personal notes must understand the same serialized shape types.
export const learnShapeUtils = [LearnVideoShapeUtil, InteractiveGraphShapeUtil, ThreeDShapeUtil];
