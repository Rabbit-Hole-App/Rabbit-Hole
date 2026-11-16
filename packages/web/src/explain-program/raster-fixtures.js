import { RASTER_CAPABILITY } from './stamps.js';

const choice = (id,label,options) => ({id,label,type:'select',default:options[0][0],options:options.map(([value,label])=>({value,label}))});
const synthetic = `
const rows=24, cols=24;
function classAt(x,y) {
  const d=(x-8)*(x-8)+(y-11)*(y-11);
  return d>=9 && d<=36 ? 1 : x>=17 && x<=21 && y>=7 && y<=16 ? 2 : 0;
}
function sourcePixels() {
  const out=[];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const label=classAt(x,y), v=label===1?220:label===2?150:32;
    out.push(v,v,v,255);
  }
  return out;
}
`;
const manifest = (title,summary,inputs) => ({title,summary,description:summary,inputs,readouts:[],capabilities:[RASTER_CAPABILITY,'select_inputs'],assumptions:['Synthetic 24 × 24 image and known shape labels; no model inference or learner photograph.']});

export const maskFixture = {
  id:'fixture-raster-mask',
  manifest:manifest('A mask follows pixels, not a box',
    'Choose the ring or rectangle. The colored mask covers only that shape; the ring’s center remains transparent.',
    [choice('region','Mask',[['ring','Ring'],['rectangle','Rectangle'],['none','None']])]),
  source:synthetic+`
export function evaluate({inputs}) {
  const pixels=sourcePixels(), values=[];
  const selected=inputs.region==='ring'?1:inputs.region==='rectangle'?2:-1;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) values.push(classAt(x,y)===selected?1:0);
  return {frame:sdk.frame([
    sdk.text('source-title',24,24,'Source pixels'),
    sdk.text('mask-title',312,24,'Selected mask'),
    sdk.raster('source',{x:24,y:44,w:240,h:240,rows,cols,pixels}),
    sdk.raster('underlay',{x:312,y:44,w:240,h:240,rows,cols,pixels}),
    sdk.mask('mask',{x:312,y:44,w:240,h:240,rows,cols,values,color:'#E5AA46',opacity:0.7}),
  ],{width:576,height:308}),quantities:{}};
}`,
};

export const pixelTransformFixture = {
  id:'fixture-raster-transform',
  manifest:manifest('Change the pixels with a filter',
    'Compare the source with a 3 × 3 box blur or a Laplacian edge filter. The controls recompute the displayed pixels.',
    [choice('filter','Filter',[['original','Original'],['blur','Box blur'],['edges','Edges']])]),
  source:synthetic+`
export function evaluate({inputs}) {
  const pixels=sourcePixels(), filtered=[];
  const at=(x,y)=>pixels[(sdk.clamp(y,0,rows-1)*cols+sdk.clamp(x,0,cols-1))*4];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    let value=at(x,y);
    if(inputs.filter==='blur') {
      let sum=0;for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) sum+=at(x+dx,y+dy);
      value=Math.round(sum/9);
    } else if(inputs.filter==='edges') value=Math.min(255,Math.abs(4*value-at(x-1,y)-at(x+1,y)-at(x,y-1)-at(x,y+1)));
    filtered.push(value,value,value,255);
  }
  return {frame:sdk.frame([
    sdk.text('source-title',24,24,'Source pixels'),
    sdk.text('filter-title',312,24,inputs.filter==='blur'?'Box blur':inputs.filter==='edges'?'Edges':'Original'),
    sdk.raster('source',{x:24,y:44,w:240,h:240,rows,cols,pixels}),
    sdk.raster('filtered',{x:312,y:44,w:240,h:240,rows,cols,pixels:filtered}),
  ],{width:576,height:308}),quantities:{}};
}`,
};

export const RASTER_FIXTURES = [maskFixture,pixelTransformFixture];
