const R=0.16,E=3,K=0.06,AS=0.75,MAX=60,X0=2.5,Y0=1;
const loss=(x,y,s)=>0.5*(x*x+s*y*y);
const over=st=>st.out||st.done||st.n>=MAX;
const word=st=>st.out?'diverged':st.done?'converged':st.n>=MAX?'stopped':st.on?'running':'paused';
function adv(st,i){if(over(st))return st;const r=i.learningRate,s=i.steepness,x=st.x*(1-r),y=st.y*(1-r*s);return{...st,x,y,n:st.n+1,out:Math.abs(x)>E||Math.abs(y)>E,done:loss(x,y,s)<0.001,path:st.path.concat([[x,y]])};}
const fresh=kept=>({x:X0,y:Y0,n:0,on:false,out:false,done:false,path:[[X0,Y0]],kept});
export function initialState(){return fresh([]);}
export function reduce({state:st,event:e,inputs}){
if(e.type==='step')return !st.on||over(st)||e.tick%6?st:adv(st,inputs);
if(e.type==='parameter'||(e.type==='action'&&e.action==='newRun'))return fresh(st.n>0?st.path:st.kept);
if(e.type!=='action')return st;
if(e.action==='run')return over(st)?st:{...st,on:true};
if(e.action==='pause')return{...st,on:false};
if(e.action==='stepOnce')return adv({...st,on:false},inputs);
return st;}
const cl=v=>Math.max(-E,Math.min(E,v));
const h=(x,y,s)=>K*s*(0.25*x*x+y*y);
const lift=(p,s)=>{const x=cl(p[0]),y=cl(p[1]);return[y,h(x,y,s)+0.05,x];};
export function evaluate({inputs,state}){
const st=state||initialState(),s=inputs.steepness,r=inputs.learningRate,x=cl(st.x),y=cl(st.y);
const a=-r*s*st.y,c=-r*st.x,v=Math.hypot(a,c),q=Math.SQRT1_2;
const arrow=!over(st)&&v>1e-9?{visible:true,quaternion:[c/v*q,0,-a/v*q,q],scale:[1,v*AS,1]}:{visible:false};
return{nodes:{bowl:{scale:[1,s/4,1]},ball:{position:[y,h(x,y,s)+R,x]},stepArrow:arrow,trail:{points:st.path.map(p=>lift(p,s))},ghost:{points:st.kept.map(p=>lift(p,s))}},
readouts:{loss:loss(st.x,st.y,s),threshold:2/s,status:word(st),steps:st.n}};}
