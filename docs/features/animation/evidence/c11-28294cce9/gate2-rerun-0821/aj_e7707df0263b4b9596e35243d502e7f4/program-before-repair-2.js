const K=0.125,R=0.3,E=4,MAXS=40,TOL=0.01;
const loss=(x,y)=>0.5*x*x+y*y;
const mk=()=>({x:3,y:0.5,st:'',path:[[3,0.5]]});
const fresh=()=>({a:mk(),b:mk(),n:0,on:false});
function move(m,r){if(m.st)return m;const x=m.x-r*m.x,y=m.y-r*2*m.y;if(Math.abs(x)>E||Math.abs(y)>E)return {...m,st:'diverged'};const n={...m,x,y,path:m.path.concat([[x,y]])};if(loss(x,y)<TOL)n.st='converged';return n;}
const done=s=>s.n>=MAXS||(s.a.st&&s.b.st);
function advance(s,i){if(done(s))return {...s,on:false};const t={...s,a:move(s.a,i.rateA),b:move(s.b,i.rateB),n:s.n+1};if(done(t))t.on=false;return t;}
export function initialState(){return fresh();}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step')return !s.on||e.tick%6?s:advance(s,inputs);
if(e.type!=='action')return s;
if(e.action==='run')return done(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return advance({...s,on:false},inputs);
if(e.action==='fromStart')return fresh();
return s;}
const lift=p=>[p[1],K*loss(p[0],p[1])+0.05,p[0]];
const word=(m,s)=>m.st||(s.on?'running':'paused');
export function evaluate({state}){const s=state||fresh(),a=s.a,b=s.b;
const near=Math.hypot(a.x-b.x,a.y-b.y)<2*R;
return {nodes:{ballA:{position:[a.y,K*loss(a.x,a.y)+R+(near?2*R:0),a.x]},ballB:{position:[b.y,K*loss(b.x,b.y)+R,b.x]},trailA:{points:a.path.map(lift)},trailB:{points:b.path.map(lift)}},
readouts:{steps:s.n,lossA:loss(a.x,a.y),statusA:word(a,s),lossB:loss(b.x,b.y),statusB:word(b,s)}};}
