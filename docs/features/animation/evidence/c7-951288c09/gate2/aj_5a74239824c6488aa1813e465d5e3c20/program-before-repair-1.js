const A=4,C=1,K=0.25,R=0.13,HX=1.5,HZ=3,TOP=2.25,S=0.15,SIG=2,MAXS=200,EDGE=1.75;
const loss=(x,z)=>0.5*(A*x*x+C*z*z);
const rand=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.37));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const off=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const word=s=>off(s)?'diverged':loss(s.x,s.z)<1e-3?'converged':s.step>=MAXS?'finished':s.on?'running':'paused';
const over=s=>{const w=word(s);return w!=='running'&&w!=='paused';};
function grads(s,inputs,seed){const g=[A*s.x,C*s.z],b=inputs.batchSize,sd=b==='full'?0:SIG/Math.sqrt(Number(b)),k=(seed||0)*7.31+s.run*1009+s.step*2+1;return [g,[g[0]+sd*gauss(k),g[1]+sd*gauss(k+0.5)]];}
function advance(s,inputs,seed){if(over(s))return s;const n=grads(s,inputs,seed)[1],lr=inputs.learningRate,x=s.x-lr*n[0],z=s.z-lr*n[1],step=s.step+1;return {...s,x,z,step,path:step%4===0?s.path.concat([[x,z]]).slice(-51):s.path};}
const fresh=(sx,sz,run,kept)=>({sx,sz,x:sx,z:sz,step:0,run,on:false,path:[[sx,sz]],kept});
export function initialState(){return fresh(1,2.4,0,[]);}
export function reduce({state:s,event:e,inputs,seed}){
 if(e.type==='step'){if(!s.on)return s;if(over(s))return {...s,on:false};return e.tick%3?s:advance(s,inputs,seed);}
 if(e.type==='action'){
  if(e.action==='play')return over(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return advance({...s,on:false},inputs,seed);
  if(e.action==='keepTrail')return fresh(s.sx,s.sz,s.run+1,s.step>0?s.path.concat([[s.x,s.z]]):s.kept);
  return s;}
 if((e.type==='drag_move'||e.type==='drag_end')&&!s.on){
  if(e.node==='startPin')return fresh(s.sx,clamp(e.value,-2.8,2.8),s.run,s.kept);
  if(e.node==='startTip')return fresh(clamp(e.value+EDGE,-1.4,1.4),s.sz,s.run,s.kept);}
 return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),TOP)+0.04,p[1]];
function aim(dx,dz,shown){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,position:[dx/l*R,0,dz/l*R],quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state,seed}){
 const s=state||initialState(),L=loss(s.x,s.z),live=!over(s),[g,n]=grads(s,inputs,seed),gx=K*A*s.x,gz=K*C*s.z;
 const pts=s.step%4?s.path.concat([[s.x,s.z]]):s.path,py=K*loss(HX,s.sz);
 return {nodes:{
  ball:{position:[s.x,K*L+R*Math.sqrt(1+gx*gx+gz*gz),s.z]},
  trueArrow:aim(-S*g[0],-S*g[1],live&&inputs.showTrueGradient),
  noisyArrow:aim(-S*n[0],-S*n[1],live),
  trail:{points:pts.map(lift)},ghost:{points:s.kept.map(lift)},
  startPin:{position:[EDGE,py,s.sz]},
  startTip:{position:[s.sx-EDGE,K*loss(s.sx,s.sz)-py+0.15,0]}},
  readouts:{loss:L,steps:s.step,trueGrad:Math.hypot(g[0],g[1]),noisyGrad:Math.hypot(n[0],n[1]),status:word(s)}};}
