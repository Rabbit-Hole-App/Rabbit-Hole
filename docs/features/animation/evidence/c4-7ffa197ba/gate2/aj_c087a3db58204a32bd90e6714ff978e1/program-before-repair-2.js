const K=0.125,R=0.2,A=2,MAXS=200,START=[2.4,1.6];
const L=(x,z,s)=>0.5*(x*x+s*z*z);
const rand=n=>{const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v)};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.5));
const zmax=s=>6/Math.sqrt(s);
const off=(p,i)=>Math.abs(p.x)>3||Math.abs(p.z)>zmax(i.stretch);
const over=(s,i)=>off(s,i)||s.step>=MAXS;
const word=(s,i)=>off(s,i)?'diverged':s.step>=MAXS?(L(s.x,s.z,i.stretch)<0.1?'converged':'finished'):s.on?'running':'paused';
function steps(s,i){const k=s.run*7919+s.step*2+1,lr=i.learningRate,gx=s.x,gz=i.stretch*s.z;return{d:[-lr*gx,-lr*gz],n:[-lr*(gx+i.noise*gauss(k)),-lr*(gz+i.noise*gauss(k+0.25))]};}
function advance(s,i){if(over(s,i))return{...s,on:false};const n=steps(s,i).n,x=s.x+n[0],z=s.z+n[1],step=s.step+1;const path=s.path.concat([[x,z]]).slice(-201);return{...s,x,z,step,path};}
const fresh=(sx,sz,run,kept)=>({x:sx,z:sz,sx,sz,step:0,run,on:false,path:[[sx,sz]],kept});
export function initialState(){return fresh(START[0],START[1],0,[]);}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step')return !s.on||e.tick%2?s:advance(s,i);
 if((e.type==='drag_move'||e.type==='drag_end')&&e.node==='ball'){const x=Math.max(-2.9,Math.min(2.9,e.value));return fresh(x,s.sz,s.run+1,s.kept);}
 if(e.type!=='action')return s;
 const a=e.action;
 if(a==='run')return over(s,i)?s:{...s,on:true};
 if(a==='pause')return{...s,on:false};
 if(a==='stepOnce')return advance({...s,on:false},i);
 if(a==='clearTrail')return{...s,path:[[s.x,s.z]]};
 if(a==='newRun')return fresh(s.sx,s.sz,s.run+1,s.step>0?s.path:s.kept);
 return s;
}
function aim(v,shown){const l=Math.hypot(v[0],v[1]),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,quaternion:[v[1]/l*h,0,-v[0]/l*h,h],scale:[1,A*l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
 const s=state||initialState(),st=i.stretch,Lv=L(s.x,s.z,st),live=!over(s,i),r=steps(s,i),hx=K*s.x,hz=K*st*s.z;
 const lift=p=>[p[0],K*Math.min(L(p[0],p[1],st),22.5)+0.04,p[1]];
 return{nodes:{bowl:{scale:[1,K/32,2/Math.sqrt(st)]},ball:{position:[s.x,K*Lv+R*Math.sqrt(1+hx*hx+hz*hz),s.z]},stepArrow:aim(r.n,live),slopeArrow:aim(r.d,live),trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},readouts:{loss:Lv,status:word(s,i),steps:s.step}};
}
