const K=0.4,R=0.13,HX=3,HZ=1.5,TOP=4,TOL=0.01,MAX=60,S=[-2.6,0.5];
const loss=(x,z)=>0.5*(x*x+4*z*z);
const out=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const over=s=>out(s)||loss(s.x,s.z)<TOL||s.step>=MAX;
const word=s=>out(s)?'diverged':loss(s.x,s.z)<TOL?'converged':s.on&&s.step<MAX?'running':'paused';
const next=(s,lr)=>[-lr*s.x,-lr*4*s.z];
function advance(s,inputs){
  if(over(s))return s;
  const [dx,dz]=next(s,inputs.learningRate),x=s.x+dx,z=s.z+dz;
  return {...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])};
}
const fresh=kept=>({x:S[0],z:S[1],step:0,on:false,path:[S],kept});
export function initialState(){return fresh([]);}
export function reduce({state:s,event:e,inputs}){
  if(e.type==='step'){if(!s.on||over(s)||e.tick%6)return s;const n=advance(s,inputs);return over(n)?{...n,on:false}:n;}
  if(e.type==='parameter')return e.parameter==='learningRate'?fresh(s.step>0?s.path:s.kept):s;
  if(e.type!=='action')return s;
  if(e.action==='run')return over(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return advance({...s,on:false},inputs);
  if(e.action==='newRun')return fresh(s.step>0?s.path:s.kept);
  return s;
}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),TOP)+0.05,p[1]];
function aim(dx,dz,shown){
  const l=Math.hypot(dx,dz),h=Math.SQRT1_2;
  return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};
}
export function evaluate({inputs,state}){
  const s=state||initialState(),lr=inputs.learningRate,L=loss(s.x,s.z),[dx,dz]=next(s,lr);
  return {
    nodes:{
      ball:{position:[s.x,K*L+R,s.z]},
      stepArrow:aim(dx,dz,inputs.showStepArrow&&!over(s)),
      trail:{points:s.path.map(lift)},
      ghost:{points:s.kept.map(lift)}
    },
    readouts:{multAcross:Math.abs(1-4*lr),multAlong:Math.abs(1-lr),loss:L,steps:s.step,status:word(s)}
  };
}
