const K=0.25,R=0.13,HX=3,HZ=2.2,MAX=60,S=[-2.6,0.2];
const loss=(x,z)=>0.5*(x*x+4*z*z);
const out=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const over=s=>out(s)||s.step>=MAX;
const word=s=>out(s)?'diverged':s.step>=MAX?'stopped at 60':s.on?'running':'paused';
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
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const lift=p=>{const x=cl(p[0],HX),z=cl(p[1],HZ);return [x,K*loss(x,z)+0.05,z];};
function aim(dx,dz,shown){
  const l=Math.hypot(dx,dz),h=Math.SQRT1_2;
  return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};
}
export function evaluate({inputs,state}){
  const s=state||initialState(),lr=inputs.learningRate,L=loss(s.x,s.z),[dx,dz]=next(s,lr),bx=cl(s.x,HX),bz=cl(s.z,HZ);
  return {
    nodes:{
      ball:{position:[bx,K*loss(bx,bz)+R,bz]},
      stepArrow:aim(dx,dz,inputs.showStepArrow&&!over(s)),
      statusTag:{visible:out(s)},
      trail:{points:s.path.map(lift)},
      ghost:{points:s.kept.map(lift)}
    },
    readouts:{status:word(s),multAcross:Math.abs(1-4*lr),multAlong:Math.abs(1-lr),loss:L,steps:s.step}
  };
}