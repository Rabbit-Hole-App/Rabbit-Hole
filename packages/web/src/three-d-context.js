export function threeDContext(shape) {
  if (shape?.type !== 'three-d-viewer') return null;
  return { objectId: shape.meta.objectId, type: 'interactive_3d', concept: shape.meta.concept,
    description: shape.meta.description, modelUrl: shape.props.modelUrl, camera: shape.props.camera,
    animation: shape.props.animation, animationTime: shape.props.animationTime, autoRotate: shape.props.autoRotate,
    ...(shape.meta.sourceSceneSpec ? { purpose: shape.meta.purpose, sourceSceneSpec: shape.meta.sourceSceneSpec, outputType: shape.meta.outputType } : {}), selectedObject: null };
}
export const getThreeDContext = (editor, shapeId) => threeDContext(editor.getShape(shapeId));
