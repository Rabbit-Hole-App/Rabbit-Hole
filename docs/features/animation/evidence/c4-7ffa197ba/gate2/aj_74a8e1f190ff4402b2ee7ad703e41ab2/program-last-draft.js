const K=0.4,R=0.15,HX=3,HU=3,TOP=3.6,START=[-2.6,0.8],MAXS=40;
const L=(x,z,s)=>0.5*(x*x+s*z*z);
const hz=s=>HU/Math.sqrt(s);
function word(st,i){const s=i.steepness;if(Math.abs(st.x)>HX||Math.abs(st.z)>hz(s))return'diverged';if(L(st.x,st.z,s)<0.001)return'converged';if(st.n>=MAXS)return'stopped';return st.on?'running':'paused';}
const over=(st,i)=>{const w=word(st,i);return w!=='running'&&w!=='paused';};
const next=(st,i)=>[-i.learningRate*st.x,-i.learningRate*i.steepness*st.z];
function adv(st,i){if(over(st,i))return st;const[dx,dz]=next(st,i),x=st.x+dx,z=st.z+dz;return{...st,x,z,n:st.n+1,path:st.path.concat([[x,z]])};}
const fresh=kept=>({x:START[0],z:START[1],n:0,on:false,path:[START],kept});
export function initialState(){return fresh([]);}
export function reduce({state:st,event:e,inputs:i}){
if(e.type==='step')return !st.on||over(st,i)||e.tick%6?st:adv(st,i);
if(e.type==='parameter')return e.parameter==='learningRate'?fresh(st.n>0?st.path:st.kept):fresh([]);
if(e.type!=='action')return st;
if(e.action==='run')return over(st,i)?st:{...st,on:true};
if(e.action==='pause')return{...st,on:false};
if(e.action==='stepOnce')return adv({...st,on:false},i);
if(e.action==='restartDescent')return fresh([]);
return st;}
function aim(dx,dz,shown){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
const st=state||initialState(),s=i.steepness,Lv=L(st.x,st.z,s),live=!over(st,i),[dx,dz]=next(st,i);
const lift=p=>[p[0],Math.min(K*L(p[0],p[1],s),TOP)+0.05,p[1]];
return{nodes:{bowl:{scale:[1,1.6,1/Math.sqrt(s)]},ball:{position:[st.x,K*Lv+R,st.z]},stepArrow:aim(dx,dz,live),trail:{points:st.path.map(lift)},ghost:{points:st.kept.map(lift)}},
readouts:{status:word(st,i),factor:1-i.learningRate*s,tip:2/s,loss:Lv,steps:st.n}};}