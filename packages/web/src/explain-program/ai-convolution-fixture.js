import { RASTER_CAPABILITY } from './stamps.js';

// Hand-authored teaching example. No model weights or real image inference.
export const convolutionFixture = {
  id: 'fixture-ai-convolution',
  manifest: {
    title: 'Move a filter across an image',
    summary: 'Move the highlighted 3 × 3 window. Multiply each selected pixel by the matching kernel entry, then add the products to get one output pixel. This uses CNN cross-correlation: the kernel is not flipped.',
    description: 'A 5 × 5 binary image, a 3 × 3 kernel, its nine products, and a 3 × 3 output grid. The selected output matches the window position.',
    assumptions: ['Synthetic binary image; stride 1, no padding and no bias. Box blur divides the nine-pixel sum by 9.'],
    inputs: [
      {id:'row',type:'number',label:'Window row',default:1,min:1,max:3,step:1},
      {id:'col',type:'number',label:'Window column',default:1,min:1,max:3,step:1},
      {id:'kernel',type:'select',label:'Kernel',default:'vertical',options:[
        {value:'vertical',label:'Vertical edge'},{value:'horizontal',label:'Horizontal edge'},{value:'blur',label:'Box blur'},
      ]},
    ],
    readouts: [], capabilities: [RASTER_CAPABILITY,'number_inputs','select_inputs'],
  },
  source: `
const image = [[0,0,0,1,1],[0,0,0,1,1],[0,0,1,1,1],[0,1,1,1,0],[1,1,1,0,0]];
export function evaluate({inputs}) {
  const row=Math.round(inputs.row)-1, col=Math.round(inputs.col)-1;
  const kernel=inputs.kernel==='vertical'?[[-1,0,1],[-1,0,1],[-1,0,1]]
    :inputs.kernel==='horizontal'?[[-1,-1,-1],[0,0,0],[1,1,1]]:[[1,1,1],[1,1,1],[1,1,1]];
  const divisor=inputs.kernel==='blur'?9:1;
  const output=[], products=[], active=[];
  for(let r=0;r<3;r++) {
    const line=[];
    for(let c=0;c<3;c++) {
      let sum=0;
      for(let kr=0;kr<3;kr++) for(let kc=0;kc<3;kc++) sum+=image[r+kr][c+kc]*kernel[kr][kc];
      line.push(sum/divisor);
    }
    output.push(line);
  }
  for(let r=0;r<3;r++) {
    products.push(kernel[r].map((weight,c)=>image[row+r][col+c]*weight));
    for(let c=0;c<3;c++) active.push([row+r,col+c]);
  }
  const result=output[row][col];
  const objects=[
    sdk.text('input-title',20,35,'Input pixels'),
    sdk.text('kernel-title',320,35,divisor===9?'Kernel; sum ÷ 9':'Kernel'),
    sdk.text('products-title',530,35,'Products'),
    sdk.text('output-title',744,35,'Output'),
    ...sdk.grid('image',{x:20,y:60,w:260,h:260,rows:image,active}),
    ...sdk.grid('kernel',{x:320,y:60,w:174,h:174,rows:kernel}),
    ...sdk.grid('products',{x:530,y:60,w:174,h:174,rows:products}),
    ...sdk.grid('output',{x:744,y:60,w:174,h:174,rows:output.map(line=>line.map(v=>divisor===9?v.toFixed(2):v)),active:[[row,col]]}),
    ...sdk.readout('result',{x:320,y:274,w:384,h:46,label:divisor===9?'Sum / 9':'Sum',value:result,decimals:divisor===9?3:0}),
  ];
  return {frame:sdk.frame(objects,{width:942,height:348}),quantities:{result,sum:result*divisor}};
}`,
};
