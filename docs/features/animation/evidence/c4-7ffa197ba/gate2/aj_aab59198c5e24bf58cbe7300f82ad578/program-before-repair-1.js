const R=0.14,S=0.3,TOL=0.005,MAX=60;
const L=(x,y,k)=>0.5*(x*x+k*y*y);
const hz=k=>2/Math.sqrt(k);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const out=(s,k)=>Math.abs(s.x)>2||Math.abs(s.y)>hz(k);
const word=(s,k)=>out(s,k)?'diverged':L(s.x,s.y,k)<TOL?'converged':s.on&&s.n<MAX?'running':'paused';
const done=(s,k)=>out(s,k)||L(s.x,s.y,k)<TOL||s.n>=MAX;
function adv(s,i){const k=i.steepness,r=i.learningRate;if(done(s,k))return {...s,on:false};const x=s.x-r*s.x,y=s.y-r*k*s.y,t={...s,x,y,n:s.n+1,path:s.path.concat([[x,y]])};return done(t,k)?{...t,on:false}:t;}
const fresh=(sx,sy,kept)=>({sx,sy,x:sx,y:sy,n:0,on:false,path:[[sx,sy]],kept});
export function initialState(){return fresh(1.8,0.5,[]);}
export function reduce({state:s,event:e,inputs:i}){
const k=i.steepness;
if(e.type==='step')return !s.on||e.tick%6?s:adv(s,i);
if(e.type==='action'){
if(e.action==='run')return done(s,k)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='backToStart')return fresh(s.sx,s.sy,s.kept);
if(e.action==='keepPath')return fresh(s.sx,s.sy,s.n>0?s.path:s.kept);
return s;}
if(e.type==='drag_move'||e.type==='drag_end'){
if(e.node==='ball')return fresh(cl(e.value,1.95),s.sy,s.kept);
if(e.node==='yHandle')return fresh(s.sx,cl(e.value,0.95*hz(k)),s.kept);
return s;}
if(e.type==='parameter'&&e.parameter==='steepness'){const sy=cl(s.sy,0.95*hz(e.value));return s.n===0?fresh(s.sx,sy,s.kept):{...s,sy};}
return s;}
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,S*l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
const s=state||initialState(),k=i.steepness,Lv=L(s.x,s.y,k),gx=s.x,gy=k*s.y,gn=Math.hypot(gx,gy);
const lift=p=>[p[0],Math.min(0.5*L(p[0],p[1],k),2.5)+0.05,p[1]];
return {nodes:{
bowl:{scale:[1,1,1/Math.sqrt(k)]},
ball:{position:[s.x,0.5*Lv+R,s.y]},
arrow:aim(-gx,-gy,i.showArrow&&!out(s,k)),
trail:{points:s.path.map(lift)},
ghost:{points:s.kept.map(lift)},
yHandle:{position:[2.4,0.11,s.sy]}},
readouts:{loss:Lv,steps:s.n,gradNorm:gn,status:word(s,k)}};}
