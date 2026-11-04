const R=0.15,H=2,C=0.5,TOL=1e-4,MAXS=200,SC=0.35,X0=1.6,Y0=0.5;
const lossOf=(x,y,k)=>0.5*(x*x+k*y*y);
const hw=k=>H/Math.sqrt(k);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const off=(s,k)=>Math.abs(s.x)>H||Math.abs(s.y)>hw(k);
function word(s,k){if(off(s,k))return'diverged';if(lossOf(s.x,s.y,k)<TOL)return'converged';if(s.n>=MAXS)return'step limit';return s.on?'running':'paused';}
const over=(s,k)=>{const w=word(s,k);return w!=='running'&&w!=='paused';};
function adv(s,i){const k=i.curvature,r=i.learningRate;if(over(s,k))return{...s,on:false};const x=s.x-r*s.x,y=s.y-r*k*s.y;return{...s,x,y,n:s.n+1,path:s.path.concat([[x,y]]).slice(-202)};}
const fresh=(x,y,kept)=>({x,y,sx:x,sy:y,n:0,on:false,path:[[x,y]],kept});
export function initialState(){return fresh(X0,Y0,[]);}
export function reduce({state:s,event:e,inputs:i}){
const k=i.curvature;
if(e.type==='step'){if(!s.on||e.tick%3)return s;const t=adv(s,i);return over(t,k)?{...t,on:false}:t;}
if(e.type==='action'){
if(e.action==='run')return over(s,k)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='newRun')return fresh(s.sx,s.sy,s.n>0?s.path:s.kept);
return s;}
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){
const y=cl(Number(e.value),0.98*hw(k)),x=e.type==='drag_start'?(Math.abs(s.x)<=H?s.x:X0):s.sx;
return fresh(x,y,e.type==='drag_start'&&s.n>0?s.path:s.kept);}
return s;}
export function evaluate({inputs:i,state}){
const s=state||initialState(),k=i.curvature,L=lossOf(s.x,s.y,k),gl=Math.hypot(s.x,k*s.y),w=hw(k);
const dX=-k*s.y,dZ=-s.x,len=gl*SC,h=Math.SQRT1_2;
const show=i.showGradient&&!off(s,k)&&len>0.03;
const arrow=show?{visible:true,quaternion:[dZ/gl*h,0,-dX/gl*h,h],scale:[1,len,1]}:{visible:false};
const lift=p=>[cl(p[1],w),Math.min(C*lossOf(p[0],p[1],k),H)+0.04,cl(p[0],H)];
return{nodes:{bowl:{scale:[1/Math.sqrt(k),1,1]},ball:{position:[s.y,C*L+R,s.x]},arrow,arrowTag:{visible:show},trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{loss:L,steps:s.n,grad:gl,status:word(s,k)}};}
