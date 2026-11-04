const K=0.35,R=0.13,HX=3,HZ=1.5,SC=3,MAXS=200;
const ST={left:[-2.7,0.4],right:[2.7,-0.4],steep:[-0.8,1.3]};
const loss=(x,z)=>0.5*(x*x+5*z*z);
const rand=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.37));
const grad=(s,inp,seed)=>{const n=inp.noise,k=s.k*2+seed*101;return [s.x+n*gauss(k),5*s.z+n*gauss(k+1)];};
const word=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ?'diverged':loss(s.x,s.z)<0.001?'converged':s.step>=MAXS?'finished':s.on?'running':'paused';
const over=s=>{const w=word(s);return w!=='running'&&w!=='paused';};
function advance(s,inp,seed){if(over(s))return s;const [gx,gz]=grad(s,inp,seed),r=inp.learningRate,x=s.x-r*gx,z=s.z-r*gz;return {...s,x,z,step:s.step+1,k:s.k+1,path:s.path.concat([[x,z]])};}
const fresh=(st,kept,k)=>{const p=ST[st]||ST.left;return {x:p[0],z:p[1],step:0,on:false,k,kept,path:[p]};};
export function initialState({inputs}){return fresh(inputs.start,[],0);}
export function reduce({state:s,event:e,inputs,seed}){
 if(e.type==='step')return !s.on||over(s)||e.tick%2?s:advance(s,inputs,seed);
 if(e.type==='parameter')return e.parameter==='start'&&s.step===0?fresh(e.value,s.kept,s.k):s;
 if(e.type!=='action')return s;
 const a=e.action;
 if(a==='run')return over(s)?s:{...s,on:true};
 if(a==='pause')return {...s,on:false};
 if(a==='stepOnce')return advance({...s,on:false},inputs,seed);
 if(a==='keepPath')return fresh(inputs.start,s.step>0?s.kept.concat([s.path]).slice(-3):s.kept,s.k);
 if(a==='clearKept')return {...s,kept:[]};
 return s;
}
const cl=(v,h)=>Math.max(-h,Math.min(h,v));
const lift=p=>{const x=cl(p[0],HX),z=cl(p[1],HZ);return [x,K*loss(x,z)+0.04,z];};
export function evaluate({inputs,state,seed}){
 const s=state||initialState({inputs}),L=loss(s.x,s.z),[gx,gz]=grad(s,inputs,seed),r=inputs.learningRate;
 const dx=-r*gx,dz=-r*gz,v=Math.hypot(dx,dz),h=Math.SQRT1_2,live=!over(s)&&v>1e-9;
 const nodes={ballNode:{position:[s.x,K*L+R,s.z]},stepArrow:live?{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[1,v*SC,1]}:{visible:false},trail:{points:s.path.map(lift)}};
 const n=s.kept.length;
 for(let i=0;i<3;i++){const p=s.kept[n-3+i];nodes['ghost'+i]=p?{visible:true,points:p.map(lift)}:{visible:false};}
 return {nodes,readouts:{loss:L,status:word(s),steps:s.step,slope:Math.hypot(gx,gz)}};
}
