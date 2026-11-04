const K=0.25,R=0.15,E=3,MAX=60,X0=0.6,Z0=2.2;
const L=(s,x,z)=>0.5*(s*x*x+z*z);
const out=(st,p)=>Math.abs(st.x)*Math.sqrt(p.steepness)>E||Math.abs(st.z)>E;
const word=(st,p)=>out(st,p)?'diverged':L(p.steepness,st.x,st.z)<0.001?'converged':st.n>=MAX?'step limit':st.on?'running':'paused';
const over=(st,p)=>{const w=word(st,p);return w!=='running'&&w!=='paused';};
const stepOf=(st,p)=>[-p.learning_rate*p.steepness*st.x,-p.learning_rate*st.z];
function adv(st,p){if(over(st,p))return st;const[dx,dz]=stepOf(st,p),x=st.x+dx,z=st.z+dz;return{...st,x,z,n:st.n+1,path:st.path.concat([[x,z]])};}
const fresh=kept=>({x:X0,z:Z0,n:0,on:false,path:[[X0,Z0]],kept});
export function initialState(){return fresh([]);}
export function reduce({state:st,event:e,inputs:p}){
if(e.type==='step'){if(!st.on)return st;if(over(st,p))return{...st,on:false};return e.tick%6?st:adv(st,p);}
if(e.type==='parameter'){if(e.parameter==='learning_rate')return fresh(st.n>0?st.path:st.kept);if(e.parameter==='steepness')return fresh([]);return st;}
if(e.type!=='action')return st;
if(e.action==='run')return over(st,p)?st:{...st,on:true};
if(e.action==='pause')return{...st,on:false};
if(e.action==='stepOnce')return adv({...st,on:false},p);
if(e.action==='newRun')return fresh(st.n>0?st.path:st.kept);
return st;}
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:p,state}){
const st=state||initialState(),s=p.steepness,q=Math.sqrt(s),bx=E/q*1.05;
const cl=a=>[Math.max(-bx,Math.min(bx,a[0])),Math.max(-3.15,Math.min(3.15,a[1]))];
const lift=a=>{const c=cl(a);return[c[0],Math.min(K*L(s,c[0],c[1]),2.3)+0.05,c[1]];};
const b=cl([st.x,st.z]),[dx,dz]=stepOf(st,p);
return{nodes:{bowl:{scale:[1/q,1,1]},ball:{position:[b[0],K*L(s,b[0],b[1])+R,b[1]]},stepArrow:aim(dx,dz,p.show_step_arrow&&!over(st,p)),trail:{points:st.path.map(lift)},ghost:{points:st.kept.map(lift)},steepTag:{position:[E/q+0.05,1.2,0]}},
readouts:{status:word(st,p),factor:1-p.learning_rate*s,critical:2/s,loss:L(s,st.x,st.z),steps:st.n}};}
