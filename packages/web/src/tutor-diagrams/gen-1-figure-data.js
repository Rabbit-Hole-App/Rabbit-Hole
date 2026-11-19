// Use rounded gravity and chosen inputs for these worked figures.
export const gravity = 10;

const signMass = 6;
const signWeight = signMass * gravity;
const signTension = signWeight;
export const hangingSign = {
  mass: signMass,
  netVertical: signTension - signWeight,
  vectors: [
    { direction: 'up', label: 'Cable tension', magnitude: signTension },
    { direction: 'down', label: 'Weight', magnitude: signWeight },
  ],
};

const crateMass = 8;
const push = 60;
const frictionCoefficient = 0.25;
const crateWeight = crateMass * gravity;
const normal = crateWeight;
const friction = normal * frictionCoefficient;
const netHorizontal = push - friction;
export const slidingCrate = {
  mass: crateMass,
  frictionCoefficient,
  netHorizontal,
  acceleration: netHorizontal / crateMass,
  vectors: [
    { direction: 'right', label: 'Push', magnitude: push },
    { direction: 'left', label: 'Sliding friction', magnitude: friction },
    { direction: 'up', label: 'Floor support', magnitude: normal },
    { direction: 'down', label: 'Weight', magnitude: crateWeight },
  ],
};

const outsidePane = { anchor: 'top-layer', label: 'Outside glass', thickness: 4 };
const airGap = { anchor: 'core', label: 'Sealed air gap', thickness: 12 };
const insidePane = { anchor: 'bottom-layer', label: 'Inside glass', thickness: 4 };
const layers = [outsidePane, airGap, insidePane];
const totalThickness = layers.reduce((total, layer) => total + layer.thickness, 0);
export const doubleGlazing = {
  layers,
  totalThickness,
  interfaceDepth: outsidePane.thickness,
  gapPercent: 100 * airGap.thickness / totalThickness,
};
