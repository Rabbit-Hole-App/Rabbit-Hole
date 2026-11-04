const K=0.75,R=0.16,H=2,MAXS=200;
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(2*Math.PI*rnd(n+0.37));
const zmax=s=>H/Math.sqrt(s);
const clamp=(v,a)=>Math.max(-a,Math.min(a,v));
const loss=(x,z,s)=>0.5*(x*x+s*z*z);
const out=(st,s)=>Math.abs(st.x)>H||Math.abs(st.z)>zmax(s);
const done=(st,i)=>out(st,i.stretch)||st.step>=MAXS;
function grad(st,i,seed){const k=seed*7.1+st.run*1013+st.step*2+1;return[st.x+i.noise*gauss(k),i.stretch*st.z+i.noise*gauss(k+0.5)];}
function word(st,i){if(out(st,i.stretch))return'diverged';if(st.step>=MAXS)return loss(st.x,st.z,i.stretch)<0.1?'converged':'stopped';return st.on?'running':'paused';}
function adv(st,i,seed){if(done(st,i))return st;const g=grad(st,i,seed),x=st.x-i.learningRate*g[0],z=st.z-i.learningRate*g[1],step=st.step+1;return{...st,x,z,step,path:step%4?st.path:st.path.concat([[x,z]]).slice(-50)};}
const begin=(st,x,z,kept)=>({...st,x,z,sx:x,sz:z,step:0,on:false,run:st.run+1,path:[[x,z]],kept});
export function initialState({inputs}){const z=clamp(0.75,0.9*zmax(inputs.stretch));return{x:-1.6,z,sx:-1.6,sz:z,step:0,on:false,run:0,path:[[-1.6,z]],kept:[]};}
export function reduce({state:st,event:e,inputs:i,seed}){
 if(e.type==='step'){if(!st.on||done(st,i)||e.tick%3)return st;const n=adv(st,i,seed);return done(n,i)?{...n,on:false}:n;}
 if(e.type==='action'){
  if(e.action==='run')return done(st,i)?st:{...st,on:true};
  if(e.action==='pause')return{...st,on:false};
  if(e.action==='stepOnce')return adv({...st,on:false},i,seed);
  if(e.action==='keepHere')return out(st,i.stretch)?begin(st,st.sx,st.sz,st.path):begin(st,st.x,st.z,st.path);
  if(e.action==='newRun')return begin(st,st.sx,st.sz,st.path);
  return st;}
 if(e.type==='parameter'&&e.parameter==='stretch')return begin(st,st.sx,clamp(st.sz,0.9*zmax(e.value)),st.kept);
 if(e.type&&e.type.indexOf('drag')===0&&e.node==='ball'){const zm=0.9*zmax(i.stretch),z=Math.abs(st.z)<zm?st.z:clamp(st.sz,zm);return begin(st,clamp(e.value,1.95),z,st.kept);}
 return st;}
function aim(dx,dz,f,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l*f,1]}:{visible:false};}
export function evaluate({inputs:i,state,seed}){
 const st=state||initialState({inputs:i}),s=i.stretch,L=loss(st.x,st.z,s),live=!done(st,i),g=grad(st,i,seed);
 const lift=p=>[p[0],Math.min(K*loss(p[0],p[1],s),3)+0.05,p[1]];
 const pts=out(st,s)?st.path:st.path.concat([[st.x,st.z]]);
 return{nodes:{
  bowl:{scale:[1,1.5,1/Math.sqrt(s)]},
  ball:{position:[st.x,K*L+R,st.z]},
  slopeArrow:aim(st.x,s*st.z,0.2,live),
  stepArrow:aim(-i.learningRate*g[0],-i.learningRate*g[1],2,live),
  trail:{points:pts.map(lift)},
  ghost:{points:st.kept.map(lift)}},
  readouts:{loss:L,dist:Math.hypot(st.x,st.z),steps:st.step,status:word(st,i)}};}
