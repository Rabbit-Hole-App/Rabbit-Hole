import './features-art.css';

const journey=document.getElementById('features-journey');
const artwork=document.getElementById('features-art');
const canvas=document.getElementById('features-stairs');
const depth=document.getElementById('features-depth-color');
const ctx=canvas.getContext('2d');
const media=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const pale=[217,232,201],deep=[106,148,121],ink=[22,63,51];
const radius=3.7,stepCount=10,rise=.25,stairWidth=1.48;
const flightDrop=stepCount*rise,run=(radius*2-stairWidth)/stepCount;
const corners=[[-radius,-radius],[radius,-radius],[radius,radius],[-radius,radius]];
const faces=[],steps=[];
let width=0,height=0,start=0,span=1,queued=false;

function face(points,tone,step){
  const u=points[1].map((v,i)=>v-points[0][i]),v=points[2].map((v,i)=>v-points[0][i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  faces.push({points,tone,normal,step});
}
function tread(x,z,dx,dz,y,length,landing=false){
  const nx=-dz*stairWidth/2,nz=dx*stairWidth/2;
  const a=[x+nx,y,z+nz],b=[x-nx,y,z-nz];
  const c=[x+dx*length-nx,y,z+dz*length-nz],d=[x+dx*length+nx,y,z+dz*length+nz];
  const lower=point=>[point[0],point[1]+(landing ? .22 : rise),point[2]];
  const step={x,z,y,dx,dz,order:steps.length};steps.push(step);
  face([a,b,c,d],landing ? .06 : .025,step);
  face([d,c,lower(c),lower(d)],.22,step);
  face([a,d,lower(d),lower(a)],.09,step);
  face([c,b,lower(b),lower(c)],.12,step);
}

// Continuous square flights fold around an open shaft. They are real geometry,
// never raster frames. Additional levels let the camera descend through them.
for(let flight=-4;flight<32;flight++){
  const side=((flight%4)+4)%4;
  const [x,z]=corners[side],[endX,endZ]=corners[(side+1)%4];
  const dx=Math.sign(endX-x),dz=Math.sign(endZ-z),y=flight*flightDrop;
  tread(x-dx*stairWidth/2,z-dz*stairWidth/2,dx,dz,y,stairWidth,true);
  for(let step=0;step<stepCount;step++){
    const distance=stairWidth/2+step*run;
    tread(x+dx*distance,z+dz*distance,dx,dz,y+(step+1)*rise,run);
  }
}

// A fixed screen-space ink pattern keeps the dither quiet while geometry moves.
const tile=document.createElement('canvas');tile.width=4;tile.height=4;
const tileCtx=tile.getContext('2d');
tileCtx.fillStyle='rgba(22,63,51,.38)';
tileCtx.fillRect(0,0,1,1);tileCtx.fillRect(2,2,1,1);
const grain=ctx?.createPattern(tile,'repeat');

function draw(progress){
  if(!ctx||!width||!height)return;
  ctx.clearRect(0,0,width,height);
  const background=mix(pale,deep,progress);
  const cameraY=3.2+progress*20;
  // Grow each tread from the preceding edge. Ordered construction includes
  // landings, so a new step never floats ahead of an unfinished connection.
  const buildDepth=media.matches ? Infinity : 12+progress*20;
  const buildCursor=(buildDepth-steps[0].y)/flightDrop*(stepCount+1);
  const yaw=-.66+progress*.62,pitch=.84;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const focal=17,scale=Math.min(width*.079,height*.078);
  const eye=[focal*sy*cp,cameraY-focal*sp,focal*cy*cp];
  const project=([x,y,z])=>{
    const rx=x*cy-z*sy,rz=x*sy+z*cy,dy=y-cameraY;
    const cameraDepth=rz*cp-dy*sp;
    if(cameraDepth>focal-1.5)return null;
    const perspective=focal/(focal-cameraDepth);
    return [width*.5+rx*scale*perspective,
      height*.24+(dy*cp+rz*sp)*scale*perspective,cameraDepth];
  };
  const visible=[];
  for(const surface of faces){
    const step=surface.step;
    const growth=clamp(buildCursor-step.order);
    if(!growth)continue;
    const localY=surface.points[0][1]-cameraY;
    if(localY<-4.5||localY>29)continue;
    if(surface.normal.reduce((sum,n,i)=>sum+n*(eye[i]-surface.points[0][i]),0)<=0)continue;
    const projected=surface.points.map(([x,y,z])=>{
      const remaining=((x-step.x)*step.dx+(z-step.z)*step.dz)*(1-growth);
      return project([x-step.dx*remaining,y,z-step.dz*remaining]);
    });
    if(projected.some(p=>!p))continue;
    if(projected.every(p=>p[0]<-2)||projected.every(p=>p[0]>width+2)||
      projected.every(p=>p[1]<-2)||projected.every(p=>p[1]>height+2))continue;
    const distance=projected.reduce((sum,p)=>sum+p[2],0)/4;
    visible.push({...surface,projected,distance,localY});
  }
  visible.sort((a,b)=>a.distance-b.distance);
  for(const surface of visible){
    const visibility=clamp((29-surface.localY)/19)*clamp((surface.localY+4.5)/1.5);
    if(visibility<=0)continue;
    const shade=mix(background,ink,surface.tone*visibility);
    ctx.beginPath();
    surface.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle=`rgb(${shade.join(',')})`;ctx.fill();
    ctx.fillStyle=grain;ctx.globalAlpha=visibility*.8;ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle=`rgba(22,63,51,${visibility*.88})`;
    ctx.lineWidth=.85;ctx.stroke();
  }
  canvas.dataset.faces=String(visible.length);
  canvas.dataset.cameraY=cameraY.toFixed(3);
  canvas.dataset.buildDepth=Number.isFinite(buildDepth) ? buildDepth.toFixed(3) : 'complete';
  canvas.dataset.builtSteps=String(steps.filter(step=>step.order+1<=buildCursor).length);
}

function render(){
  queued=false;
  const progress=media.matches ? .32 : clamp((scrollY-start)/span);
  journey.dataset.progress=progress.toFixed(3);
  depth.style.opacity=String(progress);
  draw(progress);
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render);}}
function measure(){
  start=Math.max(0,journey.getBoundingClientRect().top+scrollY-88);
  span=Math.max(1,journey.offsetHeight-artwork.offsetHeight);
  const bounds=canvas.getBoundingClientRect();
  const pixel=Math.max(bounds.width<600?1.4:1.8,bounds.width/960);
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
