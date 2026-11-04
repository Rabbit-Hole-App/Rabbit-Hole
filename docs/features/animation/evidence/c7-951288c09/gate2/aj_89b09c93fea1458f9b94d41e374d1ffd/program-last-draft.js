const K=0.1,R=0.15,H=3,S=0.35,MAX=40,MIN=0.3;
const L=(x,z)=>0.5*(x*x+4*z*z);
const ST={corner:[2.5,1],steepAxis:[0,1.5],gentleAxis:[2.5,0]};
const out=s=>Math.abs(s.x)>H||Math.abs(s.z)>H;
const word=s=>out(s)?'diverged':L(s.x,s.z)<0.001?'converged':s.step>=MAX?'stopped at 40 steps':s.on?'running':'paused';
const over=s=>{const w=word(s);return w!=='running'&&w!=='paused';};
function adv(s,r){if(over(s))return s;const x=s.x-r*s.x,z=s.z-r*4*s.z;return{...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])};}
const fresh=(inp,kept)=>{const p=ST[inp.start]||ST.corner;return{x:p[0],z:p[1],step:0,on:false,path:[p],kept};};
export function initialState({inputs}){return fresh(inputs,[]);}
export function reduce({state:s,event:e,inputs}){
const r=inputs.learningRate;
if(e.type==='step')return !s.on||over(s)||e.tick%6?s:adv(s,r);
if(e.type==='parameter'&&e.parameter==='start')return fresh({...inputs,start:e.value},s.step>0?s.path:s.kept);
if(e.type!=='action')return s;
if(e.action==='run')return over(s)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},r);
if(e.action==='newRun')return fresh(inputs,s.step>0?s.path:s.kept);
return s;}
const inside=p=>Math.abs(p[0])<=H&&Math.abs(p[1])<=H;
function clip(pa){const n=pa.length;if(n<2||inside(pa[n-1]))return pa;const p=pa[n-2],q=pa[n-1];let t=1;for(const i of[0,1])if(Math.abs(q[i])>H)t=Math.min(t,(Math.sign(q[i])*H-p[i])/(q[i]-p[i]));return pa.slice(0,n-1).concat([[p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]]);}
const lift=p=>[p[0],K*L(p[0],p[1])+0.05,p[1]];
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>MIN?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
const s=state||initialState({inputs}),r=inputs.learningRate,live=!over(s),gx=s.x,gz=4*s.z;
const pts=clip(s.path),e=pts[pts.length-1],bx=e[0],bz=e[1],sx=0.1*bx,sz=0.4*bz,w=word(s);
return{nodes:{
ball:{visible:true,position:[bx,K*L(bx,bz)+R*Math.sqrt(1+sx*sx+sz*sz),bz]},
gradArrow:aim(S*gx,S*gz,live),
stepArrow:aim(-r*gx,-r*gz,live),
trail:{points:pts.map(lift)},
ghost:{points:clip(s.kept).map(lift)},
statusTag:{text:'Status: '+w}},
readouts:{status:w,factorY:Math.abs(1-4*r),factorX:Math.abs(1-r),loss:L(s.x,s.z),steps:s.step}};}
