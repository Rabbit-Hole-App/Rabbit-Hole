const K=0.5,R=0.15,MAX=200,SC=4,S0=[0.6,1.7];
const rand=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.5));
const loss=(x,z,a)=>0.5*(a*x*x+z*z);
const hw=a=>2/Math.sqrt(a);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const off=(s,i)=>!isFinite(s.x)||!isFinite(s.z)||Math.abs(s.x)>hw(i.stretch)||Math.abs(s.z)>2;
const done=(s,i)=>off(s,i)||s.step>=MAX||(i.noise===0&&loss(s.x,s.z,i.stretch)<1e-3);
const word=(s,i)=>off(s,i)?'diverged':done(s,i)?(loss(s.x,s.z,i.stretch)<0.05?'converged':'paused'):s.on?'running':'paused';
function next(s,i){const k=s.run*1013+s.step*2+1,lr=i.learningRate;return[-lr*(i.stretch*s.x+i.noise*gauss(k)),-lr*(s.z+i.noise*gauss(k+0.25))];}
function adv(s,i){if(done(s,i))return{...s,on:false};const[dx,dz]=next(s,i),x=s.x+dx,z=s.z+dz;return{...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])};}
const fresh=run=>({x:S0[0],z:S0[1],step:0,run,on:false,path:[S0]});
export function initialState(){return fresh(0);}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step')return !s.on||e.tick%3?s:adv(s,i);
 if(e.type!=='action')return s;
 if(e.action==='run')return done(s,i)?s:{...s,on:true};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},i);
 if(e.action==='newRun')return fresh(s.run+1);
 return s;}
export function evaluate({inputs:i,state}){
 const s=state||initialState(),a=i.stretch,h=hw(a),L=loss(s.x,s.z,a),live=!done(s,i);
 const lift=p=>{const x=cl(isFinite(p[0])?p[0]:0,h),z=cl(isFinite(p[1])?p[1]:0,2);return[x,K*loss(x,z,a)+0.04,z];};
 const b=lift([s.x,s.z]);
 let arr={visible:false};
 if(live){const[dx,dz]=next(s,i),v=Math.hypot(dx,dz),q=Math.SQRT1_2;if(v>1e-9)arr={visible:true,quaternion:[dz/v*q,0,-dx/v*q,q],scale:[1,v*SC,1]};}
 return{nodes:{bowl:{scale:[1/Math.sqrt(a),1,1]},ball:{position:[b[0],b[1]-0.04+R,b[2]]},stepArrow:arr,trail:{points:s.path.map(lift)}},
 readouts:{loss:L,steps:s.step,status:word(s,i)}};}
