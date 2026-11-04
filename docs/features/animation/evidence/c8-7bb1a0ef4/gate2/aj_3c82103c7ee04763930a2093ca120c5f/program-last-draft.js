const K=0.15,R=0.15,AS=0.2,MAXS=60,S=[-2.5,1.5];
const loss=(x,y)=>0.5*(x*x+4*y*y);
const ball=()=>({x:S[0],y:S[1],path:[S]});
const fresh=()=>({a:ball(),b:ball(),n:0,on:false});
function word(b,n){if(Math.abs(b.x)>3||Math.abs(b.y)>2)return 'diverged';if(Math.hypot(b.x,b.y)<0.01)return 'converged';if(n>=MAXS)return 'step limit';return null;}
const done=s=>word(s.a,s.n)&&word(s.b,s.n);
function move(b,lr,n){if(word(b,n))return b;const x=b.x-lr*b.x,y=b.y-lr*4*b.y;return {x,y,path:b.path.concat([[x,y]])};}
function advance(s,i){if(done(s))return {...s,on:false};const r={...s,a:move(s.a,i.lrA,s.n),b:move(s.b,i.lrB,s.n),n:s.n+1};if(done(r))r.on=false;return r;}
export function initialState(){return fresh();}
export function reduce({state:s,event:e,inputs}){
if(e.type==='parameter')return fresh();
if(e.type==='step')return !s.on||e.tick%6?s:advance(s,inputs);
if(e.type!=='action')return s;
if(e.action==='run')return done(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return advance({...s,on:false},inputs);
return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),1.9)+0.04,p[1]];
function pos(b){const gx=K*b.x,gz=4*K*b.y;return [b.x,K*loss(b.x,b.y)+R*Math.sqrt(1+gx*gx+gz*gz),b.y];}
function aim(b,show){const dx=b.x,dz=4*b.y,l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,AS*l,1]}:{visible:false};}
export function evaluate({state}){const s=state||fresh(),wa=word(s.a,s.n),wb=word(s.b,s.n),run=s.on?'running':'paused';
return {nodes:{ballA:{position:pos(s.a)},ballB:{position:pos(s.b)},arrowA:aim(s.a,!wa),arrowB:aim(s.b,!wb),trailA:{points:s.a.path.map(lift)},trailB:{points:s.b.path.map(lift)}},
readouts:{lossA:loss(s.a.x,s.a.y),lossB:loss(s.b.x,s.b.y),steps:s.n,statusA:wa||run,statusB:wb||run}};}
