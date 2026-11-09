export const ILLUSTRATION_KINDS = Object.freeze(['tensor', 'token-links', 'block-stack']);
export const usesTensorItems = diagram => diagram.kind === 'transformation'
  && diagram.variant !== 'visual'
  && [diagram.before, diagram.after].some(state => state.items?.some(item => typeof item !== 'string'));
export const usesNodeTensors = diagram => ['flow', 'relationship'].includes(diagram.kind)
  && diagram.nodes.some(node => node.tensor);
export const usesParallelPaths = diagram => diagram.kind === 'flow' && Array.isArray(diagram.highlightPath?.[0]);
export const usesIllustrations = diagram => ILLUSTRATION_KINDS.includes(diagram.kind)
  || usesTensorItems(diagram) || usesNodeTensors(diagram) || usesParallelPaths(diagram)
  || (diagram.kind === 'comparison' && diagram.variant === 'panels'
    && diagram.panels?.some(panel => usesIllustrations(panel.diagram)));
