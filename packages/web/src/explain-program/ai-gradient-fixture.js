import { RASTER_CAPABILITY } from './stamps.js';

// Hand-authored teaching example: exact gradient descent on a scalar quadratic.
// Uses the current composable SDK and existing card controls; no model training claim.
export const gradientFixture = {
  id: 'fixture-ai-gradient',
  manifest: {
    title: 'Why a bigger learning rate can overshoot',
    summary: 'Start at w = 3 on L(w) = w²/2. Each update subtracts the learning rate times the gradient w. Compare a slow approach, a fast approach, shrinking overshoots and growing overshoots. Move Step to follow the updates; all plotted steps stay visible.',
    description: 'A quadratic loss curve with a connected sequence of gradient-descent positions and the current position highlighted. Readouts show the step, parameter, loss and gradient.',
    assumptions: ['One scalar parameter with exact gradient dL/dw = w.', 'This is an illustrative quadratic, not a trained model.', 'At most eight updates from w = 3; the plot bounds include the complete trajectory for the chosen rate.'],
    capabilities: [RASTER_CAPABILITY, 'number_inputs', 'select_inputs'],
    inputs: [
      { id: 'rate', label: 'Learning rate', type: 'select', default: '0.2', options: [
        { value: '0.2', label: '0.2 · Slow approach' },
        { value: '0.8', label: '0.8 · Fast approach' },
        { value: '1.2', label: '1.2 · Shrinking overshoots' },
        { value: '2.1', label: '2.1 · Growing overshoots' },
      ] },
      { id: 'step', label: 'Step', type: 'number', default: 0, min: 0, max: 8, step: 1 },
    ],
    readouts: [],
  },
  source: `
export function evaluate({ inputs }) {
  const rate=Number(inputs.rate), step=Math.round(inputs.step);
  const weights=[3];
  for(let i=0;i<8;i++) weights.push(weights[i]-rate*weights[i]);
  const extent=Math.ceil(Math.max(3,...weights.map(Math.abs))*1.15);
  const loss=w=>0.5*w*w;
  const path=weights.slice(0,step+1).map(w=>[w,loss(w)]);
  const w=weights[step], value=loss(w);
  const series=[{id:'loss',points:sdk.sample(loss,-extent,extent,80),role:'prediction'}];
  if(path.length>1) series.push({id:'updates',points:path,role:'output'});
  series.push({id:'positions',points:path,kind:'scatter',role:'observed'});
  const objects=[
    sdk.math('loss-formula',24,28,'L(w)=\\\\frac{1}{2}w^2'),
    sdk.math('update-formula',530,28,'w_{t+1}=w_t-\\\\eta w_t'),
    ...sdk.plot('descent',{x:16,y:48,w:492,h:342,xDomain:[-extent,extent],yDomain:[0,loss(extent)],
      xLabel:'Parameter w',yLabel:'Loss L(w)',series,marker:{x:w,y:value,role:'learner'}}),
    ...sdk.readout('step-value',{x:530,y:66,w:250,h:46,label:'Step',value:step,decimals:0}),
    ...sdk.readout('weight-value',{x:530,y:128,w:250,h:46,label:'w',value:w,decimals:4}),
    ...sdk.readout('loss-value',{x:530,y:190,w:250,h:46,label:'Loss',value,decimals:4}),
    ...sdk.readout('gradient-value',{x:530,y:252,w:250,h:46,label:'Gradient',value:w,decimals:4}),
    ...sdk.readout('change-value',{x:530,y:314,w:250,h:46,label:'Next change',value:-rate*w,decimals:4}),
  ];
  return {frame:sdk.frame(objects,{width:804,height:410}),quantities:{weight:w,loss:value,gradient:w,change:-rate*w,extent,step}};
}`,
};
