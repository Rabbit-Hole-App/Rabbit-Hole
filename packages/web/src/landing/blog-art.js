import './blog-art.css';

const journey=document.getElementById('blog-journey');
const artwork=document.getElementById('blog-art');
const canvas=document.getElementById('blog-paper');
const ctx=canvas.getContext('2d');
const media=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
const color=(a,b,t)=>`rgb(${mix(a,b,t).map(Math.round).join(',')})`;
const random=seed=>{const value=Math.sin(seed*127.1+311.7)*43758.5453;return value-Math.floor(value);};
const paper=[250,242,249],shade=[176,142,183],pink=[243,220,232];
const rows=10,columns=6,sheetCount=42;
let width=0,height=0,start=0,span=1,queued=false;

const tile=document.createElement('canvas');tile.width=4;tile.height=4;
const tileCtx=tile.getContext('2d');
tileCtx.fillStyle='rgba(72,41,83,.34)';
tileCtx.fillRect(0,0,1,1);tileCtx.fillRect(2,2,1,1);
const grain=ctx?.createPattern(tile,'repeat');

// Each page keeps its own flight path. There is no clock, recycling or random
// per-frame state: reversing the scroll returns every sheet to the same pose.
const sheets=Array.from({length:sheetCount},(_,id)=>({
  id,
  birth:id<5 ? [-.35,-.43,-.14,-.6,-.3][id] : (id-5)/(sheetCount-5)*.84,
  depth:id%5===0 ? 3+random(id+1)*4 : id%3===0 ? 26+random(id+2)*24 : 9+random(id+3)*12,
  spread:id<5 ? [-.2,.45,-.35,-.55,.1][id] : (random(id+4)-.5)*1.15,
  seed:random(id+5)*Math.PI*2,
  speed:.7+random(id+6)*.36,
  offset:random(id+7)*.22,
  size:.82+random(id+8)*.35,
}));

function pose(sheet,progress){
  const age=progress-sheet.birth;
  if(age<=0)return null;
  const reveal=smooth(age/.14);
  const depth=Math.max(1.5,sheet.depth-age*5.5);
  const perspective=7/(7+depth);
  const y=-.12+sheet.offset+age*(sheet.speed+perspective*.35);
  const x=.47+Math.sin(y*5.2-.85)*.17+sheet.spread*(.27+perspective*.44)
    +Math.sin(age*3.2+sheet.seed)*.06;
  return {
    x:x*width,y:y*height,depth,
    size:Math.min(width*.59,height*.54)*sheet.size*perspective*reveal,
    pitch:-.12+Math.sin(age*4+sheet.seed)*.74,
    yaw:.2+Math.sin(age*3.1+sheet.seed*.7)*1.12,
    roll:(random(sheet.id+9)-.5)*1.3+Math.sin(age*3.6+sheet.seed)*.58,
    curl:Math.sin(age*4.2+sheet.seed)*.22,
    twist:Math.cos(age*3+sheet.seed)*.18,
  };
}

function point(u,v,p){
  const x=(v-.5)*.74,y=u-.5;
  // Soft bows, asymmetric corner lift and torsion keep each sheet recognizably
  // rectangular while allowing it to flutter. Never join neighbouring pages.
  const z=Math.sin(u*Math.PI)*p.curl+(v-.5)*(u-.5)*p.twist
    +Math.pow(u,5)*Math.pow(v,4)*.12;
  const cy=Math.cos(p.yaw),sy=Math.sin(p.yaw),cp=Math.cos(p.pitch),sp=Math.sin(p.pitch);
  const rx=x*cy+z*sy,rz=z*cy-x*sy,ry=y*cp-rz*sp;
  const depth=y*sp+rz*cp,cr=Math.cos(p.roll),sr=Math.sin(p.roll);
  return [p.x+(rx*cr-ry*sr)*p.size,p.y+(rx*sr+ry*cr)*p.size,p.depth-depth*.7];
}

function draw(progress){
  if(!ctx||!width||!height)return;
  ctx.clearRect(0,0,width,height);
  const surfaces=[],positions=[];
  for(const sheet of sheets){
    const p=pose(sheet,progress);
    if(!p||p.size<.5)continue;
    const grid=Array.from({length:rows+1},(_,row)=>
      Array.from({length:columns+1},(_,column)=>point(row/rows,column/columns,p)));
    const points=grid.flat();
    if(points.every(q=>q[0]<0)||points.every(q=>q[0]>width)
      ||points.every(q=>q[1]<0)||points.every(q=>q[1]>height))continue;
    positions.push({id:sheet.id,x:p.x,y:p.y,size:p.size,depth:p.depth});
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const corners=[grid[row][column],grid[row+1][column],grid[row+1][column+1],grid[row][column+1]];
      const lighting=.14+Math.abs(Math.sin(p.pitch+p.curl*(row/rows-.5)*3))*.25+column/columns*.045;
      surfaces.push({corners,row,column,lighting,depth:p.depth,id:sheet.id,
        z:corners.reduce((sum,q)=>sum+q[2],0)/4});
    }
  }
  // Resolve overlap per sheet, then its curved surface, so two near pages
  // never appear to slice through one another when their depths converge.
  surfaces.sort((a,b)=>b.depth-a.depth||a.id-b.id||b.z-a.z);
  for(const face of surfaces){
    const distance=clamp((face.depth-12)/42);
    ctx.beginPath();face.corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    ctx.fillStyle=color(mix(paper,shade,face.lighting),pink,distance*.55);ctx.fill();
    ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.5;ctx.stroke();
    ctx.fillStyle=grain;ctx.globalAlpha=(.25+face.lighting)*(1-distance*.65);ctx.fill();ctx.globalAlpha=1;
    const edge=(a,b,alpha,lineWidth)=>{
      ctx.beginPath();ctx.moveTo(...face.corners[a].slice(0,2));ctx.lineTo(...face.corners[b].slice(0,2));
      ctx.strokeStyle=`rgba(72,41,83,${alpha*(1-distance*.6)})`;ctx.lineWidth=lineWidth;ctx.stroke();
    };
    if(face.column===0)edge(0,1,.76,.8);
    if(face.column===columns-1)edge(2,3,.76,.8);
    if(face.row===0)edge(3,0,.76,.8);
    if(face.row===rows-1)edge(1,2,.76,.8);
    // Sparse, faint contours describe the sheet surface, without printed copy.
    if(face.column===2||face.column===4)edge(0,1,.1,.45);
    if(face.row===rows-2&&face.column>=1&&face.column<=4)edge(0,3,.1,.45);
  }
  canvas.dataset.sheetCount=String(sheets.filter(sheet=>progress>sheet.birth).length);
  canvas.dataset.visibleSheets=String(positions.length);
  canvas.dataset.pose=positions.map(p=>[p.id,p.x,p.y,p.size,p.depth].map(n=>n.toFixed(3)).join(':')).join(',');
  canvas.dataset.positions=JSON.stringify(positions);
  canvas.dataset.faces=String(surfaces.length);
}

function render(){
  queued=false;
  const progress=media.matches ? .55 : clamp((scrollY-start)/span);
  journey.dataset.progress=progress.toFixed(3);
  draw(progress);
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render);}}
function measure(){
  start=Math.max(0,journey.getBoundingClientRect().top+scrollY-88);
  span=Math.max(1,journey.offsetHeight-artwork.offsetHeight);
  const bounds=canvas.getBoundingClientRect(),pixel=Math.max(bounds.width<600?1.25:1.65,bounds.width/1000);
  width=Math.round(bounds.width/pixel);height=Math.round(bounds.height/pixel);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  schedule();
}
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',measure);
media.addEventListener('change',measure);
new ResizeObserver(measure).observe(artwork);
document.fonts.ready.then(measure);
measure();
