const K=0.2,R=0.1,HX=1,HZ=2.4,X0=0.4,Z0=2,MAXS=200,AS=0.1,TOL=0.02;
const g=z=>0.125*(z*z-1)**2+0.1*z;
const f=(x,z)=>4*x*x+g(z);
const grad=(x,z)=>[8*x,0.5*z*(z*z-1)+0.1];
const out=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const ended=s=>out(s)||s.done||s.step>=MAXS;
const word=s=>out(s)?'diverged':s.done?'converged':s.on?'running':'paused';
const fresh=(x,z,kept)=>({x,z,vx:0,vz:0,step:0,on:false,done:false,path:[[x,z]],kept});
function advance(s,i){
 if(ended(s))return {...s,on:false};
 const [gx,gz]=grad(s.x,s.z),m=i.momentum,r=i.learningRate;
 const vx=m*s.vx-r*gx,vz=m*s.vz-r*gz,x=s.x+vx,z=s.z+vz;
 const [hx,hz]=grad(x,z);
 const n={...s,x,z,vx,vz,step:s.step+1,done:Math.hypot(hx,hz)<TOL&&Math.hypot(vx,vz)<0.01,path:s.path.concat([[x,z]])};
 if(ended(n))n.on=false;
 return n;
}
export function initialState(){return fresh(X0,Z0,[]);}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step')return !s.on||e.tick%3?s:advance(s,inputs);
 if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end')return fresh(X0,Math.max(-2.3,Math.min(2.3,e.value)),s.kept);
 if(e.type!=='action')return s;
 if(e.action==='run')return ended(s)?s:{...s,on:true};
 if(e.action==='pause')return {...s,on:false};
 if(e.action==='stepOnce')return advance({...s,on:false},inputs);
 if(e.action==='keepPath')return fresh(s.path[0][0],s.path[0][1],s.step>0?s.path:s.kept);
 return s;
}
const rim=(v,h)=>Math.max(-h,Math.min(h,v));
const lift=p=>{const x=rim(p[0],HX),z=rim(p[1],HZ);return [x,K*f(x,z)+0.03,z];};
export function evaluate({inputs,state}){
 const s=state||initialState(),L=f(s.x,s.z),[gx,gz]=grad(s.x,s.z),v=Math.hypot(gx,gz),h=Math.SQRT1_2;
 const show=inputs.showArrow&&!out(s)&&v>1e-6;
 return {
  nodes:{
   ball:{position:[s.x,K*L+R,s.z]},
   arrow:show?{visible:true,quaternion:[-gz/v*h,0,gx/v*h,h],scale:[1,v*AS,1]}:{visible:false},
   trail:{points:s.path.map(lift)},
   ghost:{points:s.kept.map(lift)}
  },
  readouts:{loss:L,slope:v,steps:s.step,status:word(s)}
 };
}
