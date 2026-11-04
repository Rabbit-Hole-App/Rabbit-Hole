const K=0.06,R=0.16,H=3,MAXS=40,TOL=0.001,SC=0.5,X0=0.6,Z0=2.2;
const loss=(x,z,S)=>0.5*(z*z+S*x*x);
const out=s=>Math.abs(s.x)>H||Math.abs(s.z)>H;
function word(s,S){if(out(s))return'diverged';if(loss(s.x,s.z,S)<TOL)return'converged';if(s.n>=MAXS)return'stopped';return s.on?'running':'paused';}
const over=(s,S)=>{const w=word(s,S);return w!=='running'&&w!=='paused';};
const fresh=kept=>({x:X0,z:Z0,n:0,on:false,path:[[X0,Z0]],kept});
const stepOf=(s,i)=>[-i.learning_rate*i.steepness*s.x,-i.learning_rate*s.z];
function adv(s,i){if(over(s,i.steepness))return{...s,on:false};const[dx,dz]=stepOf(s,i),x=s.x+dx,z=s.z+dz;return{...s,x,z,n:s.n+1,path:s.path.concat([[x,z]])};}
export function initialState(){return fresh([]);}
export function reduce({state:s,event:e,inputs:i}){
if(e.type==='step'){if(!s.on)return s;if(over(s,i.steepness))return{...s,on:false};return e.tick%10?s:adv(s,i);}
if(e.type!=='action')return s;
if(e.action==='run')return over(s,i.steepness)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='newRun')return fresh(s.n>0?s.path:s.kept);
return s;}
const cl=v=>Math.max(-H,Math.min(H,v));
const hgt=(x,z,S)=>(S/4)*K*(z*z+4*x*x);
function aim(dx,dz,live){const v=Math.hypot(dx,dz),h=Math.SQRT1_2;if(!live||v<1e-6)return{visible:false};const a=dx/v,b=dz/v;return{visible:true,position:[a*R,0,b*R],quaternion:[b*h,0,-a*h,h],scale:[1,v*SC,1]};}
export function evaluate({inputs:i,state}){
const s=state||initialState(),S=i.steepness,lr=i.learning_rate,[dx,dz]=stepOf(s,i);
const lift=p=>{const x=cl(p[0]),z=cl(p[1]);return[x,hgt(x,z,S)+0.06,z];};
return{nodes:{bowl:{scale:[1,S/4,1]},ball:{position:[s.x,hgt(s.x,s.z,S)+R,s.z]},stepArrow:aim(dx,dz,!over(s,S)),trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{status:word(s,S),loss:loss(s.x,s.z,S),mult:1-lr*S,threshold:2/S,steps:s.n}};}
