const C=0.25,R=0.15,B=3,MAXS=60,TOL=0.001;
const lossOf=(s,k)=>0.5*(s.x*s.x+k*s.y*s.y);
const word=(s,k)=>Math.abs(s.x)>B||Math.abs(s.y)>B?'diverged':lossOf(s,k)<TOL?'converged':s.on?'running':'paused';
const over=(s,k)=>{const w=word(s,k);return w==='diverged'||w==='converged'||s.n>=MAXS;};
const fresh=(sx,sy,kept)=>({x:sx,y:sy,sx,sy,n:0,on:false,path:[[sx,sy]],kept});
function adv(s,i){const k=i.steepnessY,lr=i.learningRate;if(over(s,k))return {...s,on:false};const x=s.x-lr*s.x,y=s.y-lr*k*s.y,n=s.n+1;return {...s,x,y,n,on:s.on&&n<MAXS,path:s.path.concat([[x,y]]).slice(-64)};}
export function initialState(){return fresh(2.5,1.5,[]);}
export function reduce({state:s,event:e,inputs:i}){
const k=i.steepnessY;
if(e.type==='step'){if(!s.on||e.tick%6)return s;return over(s,k)?{...s,on:false}:adv(s,i);}
if(e.type==='action'){
if(e.action==='run')return over(s,k)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='newRun')return fresh(s.sx,s.sy,s.n>0?s.path:s.kept);
return s;}
if(e.type==='drag_move'||e.type==='drag_end'){const v=Math.max(-B,Math.min(B,e.value)),h=e.node==='yHandle';return fresh(h?s.sx:v,h?v:s.sy,s.n>0?s.path:s.kept);}
return s;}
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
const s=state||initialState(),k=i.steepnessY,lr=i.learningRate,L=lossOf(s,k),live=!over(s,k);
const small=k<=2.001,pos=[s.x,C*L+R,s.y],a=aim(-lr*s.x,-lr*k*s.y,live&&i.showStepArrow);
const lift=p=>[p[0],Math.min(C*0.5*(p[0]*p[0]+k*p[1]*p[1]),3)+0.04,p[1]];
return {nodes:{
bowl2:{visible:small,scale:[1,1,Math.sqrt(2/k)]},
bowl5:{visible:!small,scale:[1,1,Math.sqrt(5/k)]},
ball2:{visible:small,position:pos},ball5:{visible:!small,position:pos},
arrow2:a,arrow5:a,
yHandle:{position:[3.6,0.15,s.sy]},
trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{loss:L,status:word(s,k),steps:s.n}};}
