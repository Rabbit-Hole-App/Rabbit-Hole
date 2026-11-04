const K=0.2,R=0.16,U=3.6,TOP=2.6,TOL=0.01,MAX=100;
const zh=c=>U/Math.sqrt(c);
const L=(x,y,c)=>0.5*(x*x+c*y*y);
const G=(s,c)=>Math.hypot(s.x,c*s.y);
const out=(s,c)=>Math.abs(s.x)>U||Math.abs(s.y)>zh(c);
const word=(s,c)=>out(s,c)?'diverged':G(s,c)<TOL?'converged':s.n>=MAX?'stopped':s.on?'running':'paused';
const over=(s,c)=>{const w=word(s,c);return w!=='running'&&w!=='paused';};
function adv(s,i){const c=i.steepness,e=i.learningRate;if(over(s,c))return {...s,on:false};const x=s.x-e*s.x,y=s.y-e*c*s.y,t={...s,x,y,n:s.n+1,path:s.path.concat([[x,y]])};return over(t,c)?{...t,on:false}:t;}
const fresh=(sx,sy,kept)=>({sx,sy,x:sx,y:sy,n:0,on:false,path:[[sx,sy]],kept});
const keep=s=>s.n>0?s.path:s.kept;
export function initialState(){return fresh(-2.5,1.5,[]);}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step')return !s.on||e.tick%3?s:adv(s,i);
 if(e.type==='action'){
  if(e.action==='run')return over(s,i.steepness)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return adv({...s,on:false},i);
  if(e.action==='newRun')return fresh(s.sx,s.sy,keep(s));
  return s;
 }
 if(e.type==='drag_move'||e.type==='drag_end'){
  const v=Number(e.value);
  if(e.node==='ball')return fresh(Math.max(-3.4,Math.min(3.4,v)),s.sy,keep(s));
  if(e.node==='pin'){const m=0.95*zh(i.steepness);return fresh(s.sx,Math.max(-m,Math.min(m,v)),keep(s));}
 }
 return s;
}
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
 const s=state||initialState(),c=i.steepness,e=i.learningRate;
 const lift=p=>[p[0],Math.min(K*L(p[0],p[1],c),TOP)+0.04,p[1]];
 const l=L(s.x,s.y,c);
 return {nodes:{
  bowl:{scale:[1,1,1/Math.sqrt(c)]},
  ball:{position:[s.x,K*l+R,s.y]},
  stepArrow:aim(-e*s.x,-e*c*s.y,!over(s,c)),
  pin:{position:[s.sx,Math.min(K*L(s.sx,s.sy,c),TOP)+0.5,s.sy]},
  trail:{points:s.path.map(lift)},
  ghost:{points:s.kept.map(lift)}
 },readouts:{loss:l,grad:G(s,c),steps:s.n,status:word(s,c)}};
}
