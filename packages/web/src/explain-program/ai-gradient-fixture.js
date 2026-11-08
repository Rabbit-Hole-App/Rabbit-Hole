import { RASTER_CAPABILITY } from './stamps.js';

// Hand-authored teaching example: exact gradient descent on a scalar quadratic.
// Uses the current composable SDK and existing card controls; no model training claim.
export const gradientFixture = {
  id: 'fixture-ai-gradient',
  manifest: {
    title: 'Why a bigger learning rate can overshoot',
    summary: 'Start at w = 3 on L(w) = w²/2. Each update subtracts the learning rate times the gradient w. Compare a slow approach, a fast approach, shrinking overshoots and growing overshoots.',
    description: 'Set the learning rate to 1.2 and move Step to 8. The signs alternate as w crosses zero. The step strip keeps each update readable even when the points cluster on the loss curve.',
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
    sdk.box('weight-value',530,128,250,46,{text:'w: '+w.toPrecision(4),role:'output'}),
    sdk.box('loss-value',530,190,250,46,{text:'Loss: '+value.toPrecision(4),role:'output'}),
    sdk.box('gradient-value',530,252,250,46,{text:'Gradient: '+w.toPrecision(4),role:'output'}),
    sdk.box('change-value',530,314,250,46,{text:'Next change: '+(-rate*w).toPrecision(4),role:'output'}),
    sdk.text('step-strip-label',24,418,'Step · sign of w'),
    ...weights.map((weight, index) => {
      const sign = weight < 0 ? '−' : '+';
      return sdk.box('step-slot-'+index,24+85*index,432,72,36,{
        text:index <= step ? index+' '+sign : String(index),
        role:index === step ? 'learner' : 'neutral',
      });
    }),
  ];
  return {frame:sdk.frame(objects,{width:804,height:488}),quantities:{weight:w,loss:value,gradient:w,change:-rate*w,extent,step}};
}`,
};
