const K=0.3,R=0.14,HU=3,HV=1.5,MAXS=40,SC=0.5;
const ST={corner:[2.5,0.6],steepWall:[0,0.6],gentleEnd:[2.5,0]};
const loss=(u,v)=>0.5*(u*u+4*v*v);
const low=s=>loss(s.u,s.v)<1e-3;
const done=s=>s.out||s.n>=MAXS||low(s);
const word=s=>s.out?'diverged':low(s)?'converged':s.on&&s.n<MAXS?'running':'paused';
const fresh=(st,kept)=>{const p=ST[st]||ST.corner;return{u:p[0],v:p[1],n:0,on:false,out:false,last:0,path:[p],kept};};
function adv(s,r){if(done(s))return s;const u=s.u-r*s.u,v=s.v-4*r*s.v,o=Math.abs(u)>HU||Math.abs(v)>HV;return{...s,u,v,n:s.n+1,out:o,last:Math.hypot(u-s.u,v-s.v),path:s.path.concat([[u,v]])};}
export function initialState({inputs}){return fresh(inputs.start,[]);}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on||e.tick%6)return s;const t=adv(s,inputs.learningRate);return done(t)?{...t,on:false}:t;}
 if(e.type==='parameter'&&e.parameter==='start')return fresh(e.value,s.n>0?s.path:s.kept);
 if(e.type!=='action')return s;
 if(e.action==='run')return done(s)?s:{...s,on:true};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='step')return adv({...s,on:false},inputs.learningRate);
 if(e.action==='newRun')return fresh(inputs.start,s.n>0?s.path:s.kept);
 return s;}
const cl=(a,h)=>Math.max(-h,Math.min(h,a));
const lift=p=>{const u=cl(p[0],HU),v=cl(p[1],HV);return[v,K*loss(u,v)+0.05,u];};
export function evaluate({inputs,state}){
 const s=state||initialState({inputs}),r=inputs.learningRate,u=cl(s.u,HU),v=cl(s.v,HV);
 const gx=K*4*v,gz=K*u,dx=-4*r*s.v,dz=-r*s.u,m=Math.hypot(dx,dz),h=Math.SQRT1_2;
 const arrow=!done(s)&&m>1e-9?{visible:true,quaternion:[dz/m*h,0,-dx/m*h,h],scale:[1,m*SC,1]}:{visible:false};
 const ro={status:word(s),steps:s.n,loss:loss(s.u,s.v),mult:1-4*r};
 if(s.n>0)ro.lastStep=s.last;
 return{nodes:{ball:{position:[v,K*loss(u,v)+R*Math.sqrt(1+gx*gx+gz*gz),u]},stepArrow:arrow,trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},readouts:ro};}
