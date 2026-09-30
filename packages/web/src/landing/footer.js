import './footer.css';

const media=matchMedia('(prefers-reduced-motion: reduce)');
const items=[...document.querySelectorAll('#faq details')];
const transitions=new Map();

// Native disclosures remain usable without JS. Enhancement adds reversible
// height transitions and lets the previously open answer finish closing.
function expand(item,open,animate=true){
  const start=item.getBoundingClientRect().height;
  transitions.get(item)?.cancel();
  transitions.delete(item);
  item.dataset.expanded=String(open);
  const summary=item.querySelector('summary');
  summary.setAttribute('aria-expanded',String(open));
  item.querySelector('.faq-answer').inert=!open;
  if(!animate||media.matches){item.open=open;return;}
  item.open=true;
  const style=getComputedStyle(item);
  const border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
  const end=open?item.getBoundingClientRect().height:summary.getBoundingClientRect().height+border;
  const transition=item.animate([{height:`${start}px`},{height:`${end}px`}],{
    duration:200,easing:'cubic-bezier(.23,1,.32,1)',
  });
  transitions.set(item,transition);
  transition.onfinish=()=>{
    if(transitions.get(item)!==transition)return;
    item.open=open;
    transitions.delete(item);
  };
}
for(const item of items){
  item.removeAttribute('name');
  expand(item,item.open,false);
  item.querySelector('summary').addEventListener('click',event=>{
    event.preventDefault();
    const open=item.dataset.expanded!=='true';
    const animate=event.detail!==0;
    if(open)for(const other of items){
      if(other!==item&&other.dataset.expanded==='true')expand(other,false,animate);
    }
    expand(item,open,animate);
  });
}
function finishDisclosures(){
  for(const item of [...transitions.keys()])expand(item,item.dataset.expanded==='true',false);
}
addEventListener('resize',finishDisclosures);

const scene=document.getElementById('footer-scene');
const canvas=document.getElementById('footer-tunnel');
const ctx=canvas.getContext('2d');
const TAU=Math.PI*2,RINGS=16,SEGMENTS=96;
let width=0,height=0,dpr=1,angle=.48,depthPhase=0,lastTime=null,frameId=null;
let inView=false;

// The mouth and longitudinal ribs keep their shape. Cross-sections travel down
// that surface toward the narrow end, so the opening has continuous depth flow.
const directions=Array.from({length:SEGMENTS},(_,j)=>[Math.cos(j/SEGMENTS*TAU),Math.sin(j/SEGMENTS*TAU)]);
function ringAt(t){
  const radius=.14+.92*Math.pow(1-t,1.35),twist=t*.32;
  const c=Math.cos(twist),s=Math.sin(twist),center=.14*Math.sin(t*Math.PI);
  return directions.map(([x,y])=>[radius*(x*c-y*s)+center,radius*(x*s+y*c),.95-2*t]);
}
const ribs=Array.from({length:RINGS+1},(_,i)=>ringAt(i/RINGS));
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
function draw(){
  if(!ctx||!width||!height)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  // Fit the widest projected silhouette across a complete turn, on phones too.
  const scale=Math.min(width*.30,height*.31);
  const cy=Math.cos(angle),sy=Math.sin(angle);
  const cx=Math.cos(-.3),sx=Math.sin(-.3),cz=Math.cos(-.22),sz=Math.sin(-.22);
  const project=([x,y,z])=>{
    const yawX=x*cy+z*sy,yawZ=-x*sy+z*cy;
    const tiltY=y*cx-yawZ*sx,tiltZ=y*sx+yawZ*cx;
    const perspective=4.6/(4.6-tiltZ);
    return [width*.5+(yawX*cz-tiltY*sz)*scale*perspective,
      height*.48+(yawX*sz+tiltY*cz)*scale*perspective,tiltZ];
  };
  const projected=ribs.map(ring=>ring.map(project));
  const line=(points,alpha,closed=false)=>{
    ctx.beginPath();
    for(let i=0;i<points.length;i++){
      const [x,y]=points[i];
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    if(closed)ctx.closePath();
    ctx.strokeStyle=`rgba(239,242,240,${alpha})`;
    ctx.lineWidth=.85;
    ctx.stroke();
  };
  for(let j=0;j<SEGMENTS;j+=8)line(projected.map(ring=>ring[j]),.16);
  // Keep the opening visible while each travelling ring recycles out of view.
  line(projected[0],.46,true);
  for(let i=0;i<RINGS;i++){
    const t=(i/RINGS+depthPhase)%1;
    const ring=ringAt(t).map(project);
    const depth=ring.reduce((sum,p)=>sum+p[2],0)/SEGMENTS;
    const fade=smooth(t/.07)*smooth((1-t)/.13);
    line(ring,(.42+Math.max(-1,Math.min(1,depth))*.16)*fade,true);
  }
}
function frame(now){
  if(lastTime!==null){
    const delta=Math.min(now-lastTime,100);
    angle=(angle+delta*TAU/76000)%TAU;
    depthPhase=(depthPhase+delta/8000)%1;
  }
  lastTime=now;
  draw();
  frameId=requestAnimationFrame(frame);
}
function sync(){
  const playing=!media.matches&&inView&&!document.hidden;
  scene.dataset.playing=String(playing);
  if(playing&&frameId===null){lastTime=null;frameId=requestAnimationFrame(frame);}
  else if(!playing&&frameId!==null){cancelAnimationFrame(frameId);frameId=null;lastTime=null;}
}
media.addEventListener('change',()=>{finishDisclosures();sync();});
document.addEventListener('visibilitychange',sync);
if(ctx){
  new ResizeObserver(([entry])=>{
    width=entry.contentRect.width;height=entry.contentRect.height;
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    draw();
  }).observe(scene);
  new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync();},{threshold:.05}).observe(scene);
}
sync();
