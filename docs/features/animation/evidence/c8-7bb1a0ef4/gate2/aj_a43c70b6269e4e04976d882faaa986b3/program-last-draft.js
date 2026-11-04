const A=4,C=1,K=0.25,R=0.13,S=3,HX=2,HZ=3,TOP=3.2,MAXS=200,TOL=0.001,ST=[1.6,2.6];
const loss=(x,z)=>0.5*(A*x*x+C*z*z);
const rand=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.5));
const off=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const over=s=>off(s)||loss(s.x,s.z)<TOL||s.step>=MAXS;
const word=s=>off(s)?'diverged':loss(s.x,s.z)<TOL?'converged':s.on&&s.step<MAXS?'running':'paused';
function next(s,inputs){
  const b=inputs.batchSize,sd=b==='full'?0:S/Math.sqrt(Number(b)),k=s.run*1009+s.step*2+1,lr=inputs.learningRate;
  return [-lr*(A*s.x+sd*gauss(k)),-lr*(C*s.z+sd*gauss(k+0.25))];
}
function advance(s,inputs){
  if(over(s))return {...s,on:false};
  const [dx,dz]=next(s,inputs),x=s.x+dx,z=s.z+dz,step=s.step+1;
  const path=step%4===0?s.path.concat([[x,z]]).slice(-50):s.path;
  const n={...s,x,z,step,path};
  return over(n)?{...n,on:false}:n;
}
const fresh=(run,kept)=>({x:ST[0],z:ST[1],step:0,run,on:false,path:[ST],kept});
export function initialState(){return fresh(0,[]);}
export function reduce({state:s,event:e,inputs}){
  if(e.type==='step')return !s.on||e.tick%3?s:advance(s,inputs);
  if(e.type!=='action')return s;
  if(e.action==='play')return over(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return advance({...s,on:false},inputs);
  if(e.action==='keepPath')return fresh(s.run+1,s.step>0?s.path.concat([[s.x,s.z]]).slice(-64):s.kept);
  return s;
}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),TOP)+0.04,p[1]];
function aim(dx,dz,shown){
  const l=Math.hypot(dx,dz),h=Math.SQRT1_2;
  return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};
}
export function evaluate({inputs,state}){
  const s=state||initialState(),L=loss(s.x,s.z),live=!over(s),[dx,dz]=next(s,inputs),lr=inputs.learningRate;
  const gx=K*A*s.x,gz=K*C*s.z;
  return {
    nodes:{
      ball:{position:[s.x,K*L+R*Math.sqrt(1+gx*gx+gz*gz),s.z]},
      stepArrow:aim(dx,dz,live),
      slopeArrow:aim(-lr*A*s.x,-lr*C*s.z,live&&inputs.showTrueGradient),
      trail:{points:s.path.concat([[s.x,s.z]]).map(lift)},
      ghost:{points:s.kept.map(lift)}
    },
    readouts:{loss:L,dist:Math.hypot(s.x,s.z),steps:s.step,status:word(s)}
  };
}
