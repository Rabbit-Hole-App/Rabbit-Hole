const K=0.15,R=0.2,H=2.5,S=2,N=200,TOP=2.4;
const L=(x,z)=>0.5*(x*x+4*z*z);
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s)};
const g=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(2*Math.PI*rnd(n+0.37));
const out=s=>Math.abs(s.x)>H||Math.abs(s.z)>H;
const done=s=>out(s)||s.step>=N;
const word=s=>out(s)?'diverged':s.step>=N?(L(s.x,s.z)<0.5?'converged':'stopped'):s.on?'running':'paused';
const cl=v=>Math.max(-H,Math.min(H,v));
function noise(s,inp){const sd=2/Math.sqrt(inp.batchSize),k=s.step*2+1;return [sd*g(k),sd*g(k+0.5)]}
function adv(s,inp){if(done(s))return s;const [nx,nz]=noise(s,inp),lr=inp.learningRate,x=s.x-lr*(s.x+nx),z=s.z-lr*(4*s.z+nz);return {...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])}}
const fresh=(sx,sz)=>({x:sx,z:sz,sx,sz,step:0,on:false,path:[[sx,sz]]});
export function initialState(){return fresh(-2.2,1.2)}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on||done(s)||e.tick%3)return s;const n=adv(s,inputs);return done(n)?{...n,on:false}:n}
 if(e.type==='action'){
  if(e.action==='run')return done(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return adv({...s,on:false},inputs);
  if(e.action==='clearTrails')return fresh(s.sx,s.sz);
  return s}
 if((e.type==='drag_move'||e.type==='drag_end')&&e.node==='ball'){if(s.step>0||s.on)return s;return fresh(Math.max(-2.4,Math.min(2.4,Number(e.value))),s.sz)}
 return s}
const lift=p=>{const x=cl(p[0]),z=cl(p[1]);return [x,Math.min(K*L(x,z),TOP)+0.04,z]};
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false}}
export function evaluate({inputs,state}){
 const s=state||initialState(),lr=inputs.learningRate,[nx,nz]=noise(s,inputs),live=!done(s),gx=s.x,gz=4*s.z,bx=cl(s.x),bz=cl(s.z),hx=bx,hz=4*bz;
 let full=[];
 if(inputs.showFullBatch){let x=s.sx,z=s.sz;full=[[x,z]];for(let i=0;i<s.step;i++){x-=lr*x;z-=lr*4*z;full.push([x,z]);if(Math.abs(x)>H||Math.abs(z)>H)break}}
 return {nodes:{
  ball:{position:[bx,Math.min(K*L(bx,bz),TOP)+R*Math.sqrt(1+K*K*(hx*hx+hz*hz)),bz]},
  stepArrow:aim(-lr*(gx+nx)*S,-lr*(gz+nz)*S,live),
  slopeArrow:aim(-lr*gx*S,-lr*gz*S,live),
  trail:{points:s.path.map(lift)},
  fullTrail:{visible:inputs.showFullBatch,points:full.map(lift)}},
  readouts:{loss:L(s.x,s.z),status:word(s),steps:s.step,noise:Math.hypot(nx,nz)}}}
