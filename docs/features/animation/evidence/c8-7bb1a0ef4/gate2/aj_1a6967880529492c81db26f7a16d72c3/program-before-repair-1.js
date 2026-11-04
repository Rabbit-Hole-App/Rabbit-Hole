const V=0.25,R=0.15,XH=3,U=4.8,MAX=100,F=1.5;
const loss=(x,y,k)=>0.5*(x*x+k*y*y);
const zh=k=>U/Math.sqrt(k);
const cl=(v,a)=>Math.max(-a,Math.min(a,v));
function word(s,k){if(Math.abs(s.x)>XH||Math.abs(s.y)>zh(k))return'diverged';if(loss(s.x,s.y,k)<0.001)return'converged';if(s.n>=MAX)return'step limit';return s.on?'running':'paused';}
const done=(s,k)=>{const w=word(s,k);return w!=='running'&&w!=='paused';};
function adv(s,i){const k=i.steepness,r=i.learningRate;if(done(s,k))return{...s,on:false};const x=s.x-r*s.x,y=s.y-r*k*s.y;return{...s,x,y,n:s.n+1,path:s.path.concat([[x,y]])};}
const fresh=(x,y,kept)=>({x,y,n:0,on:false,path:[[x,y]],kept});
export function initialState(){return fresh(2.5,1.5,[]);}
export function reduce({state:s,event:e,inputs:i}){
const k=i.steepness;
if(e.type==='step'){if(!s.on||e.tick%6)return s;const t=adv(s,i);return done(t,k)?{...t,on:false}:t;}
if(e.type==='drag_start')return fresh(s.x,cl(s.y,zh(k)*0.95),s.n>0?s.path:s.kept);
if(e.type==='drag_move'||e.type==='drag_end')return fresh(cl(e.value,XH),cl(s.y,zh(k)*0.95),s.kept);
if(e.type!=='action')return s;
if(e.action==='run')return done(s,k)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='newRun')return fresh(s.path[0][0],s.path[0][1],s.n>0?s.path:s.kept);
return s;}
export function evaluate({inputs:i,state}){
const s=state||initialState(),k=i.steepness,r=i.learningRate,L=loss(s.x,s.y,k);
const lift=p=>[p[0],V*Math.min(loss(p[0],p[1],k),16)+0.05,p[1]];
const dx=-r*s.x,dz=-r*k*s.y,l=Math.hypot(dx,dz)*F,h=Math.SQRT1_2;
const show=i.showArrow&&!done(s,k)&&l>1e-6;
return{nodes:{
surf:{scale:[1,V,1/Math.sqrt(k)]},
ball:{position:[s.x,V*L+R,s.y]},
arrow:show?{visible:true,quaternion:[dz*F/l*h,0,-dx*F/l*h,h],scale:[1,l,1]}:{visible:false},
trail:{points:s.path.map(lift)},
ghost:{points:s.kept.map(lift)}},
readouts:{loss:L,steps:s.n,grad:Math.hypot(s.x,k*s.y),status:word(s,k)}};}
