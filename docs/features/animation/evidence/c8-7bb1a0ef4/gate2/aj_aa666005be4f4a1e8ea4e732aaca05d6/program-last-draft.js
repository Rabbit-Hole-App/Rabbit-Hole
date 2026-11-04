const K=0.15,R=0.3,H=4,MAX=60,TOL=1e-6,S=[3,0.5],EVERY=10;
const loss=p=>0.5*p[0]*p[0]+p[1]*p[1];
const out=p=>Math.abs(p[0])>H||Math.abs(p[1])>H;
const done=m=>out(m.p)||loss(m.p)<TOL||m.n>=MAX;
const mk=()=>({p:S,n:0,path:[S]});
function adv(m,lr){if(done(m))return m;const p=[m.p[0]-lr*m.p[0],m.p[1]-lr*2*m.p[1]];return{p,n:m.n+1,path:m.path.concat([p])};}
export function initialState(){return{a:mk(),b:mk(),sel:'markA'};}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step')return e.tick%EVERY?s:{...s,a:adv(s.a,inputs.lrA),b:adv(s.b,inputs.lrB)};
if(e.type==='parameter')return{...s,a:mk(),b:mk()};
if(e.type==='select'&&(e.node==='markA'||e.node==='markB'))return{...s,sel:e.node};
return s;}
function word(m,lr){
if(m.n===0)return'at start';
if(out(m.p))return'left the surface';
if(loss(m.p)<TOL)return'converged';
if(m.n>=MAX)return'stopped at 60';
const fx=1-lr,fy=1-2*lr,f=Math.max(Math.abs(fx),Math.abs(fy));
if(f>1+1e-9)return'running away';
if(Math.abs(f-1)<1e-9)return'bouncing';
if(fx<0||fy<0)return'zigzagging';
return'going down';}
const cl=p=>[Math.max(-H,Math.min(H,p[0])),Math.max(-H,Math.min(H,p[1]))];
const lift=p=>{const c=cl(p);return[c[0],K*loss(c)+0.06,c[1]];};
const place=p=>{const c=cl(p);return[c[0],K*loss(c)+R,c[1]];};
export function evaluate({inputs,state}){
const s=state||initialState(),m=s.sel==='markB'?s.b:s.a;
const pa=place(s.a.p),pb=place(s.b.p);
if(Math.hypot(pa[0]-pb[0],pa[2]-pb[2])<0.5)pb[1]=Math.max(pb[1],pa[1]+2*R);
return{nodes:{markA:{position:pa},markB:{position:pb},trailA:{points:s.a.path.map(lift)},trailB:{points:s.b.path.map(lift)},labA:{text:'rate '+(+inputs.lrA).toFixed(2)},labB:{text:'rate '+(+inputs.lrB).toFixed(2)}},
selection:s.sel,
readouts:{lossA:loss(s.a.p),lossB:loss(s.b.p),statusA:word(s.a,inputs.lrA),statusB:word(s.b,inputs.lrB),stepsA:s.a.n,stepsB:s.b.n,selX:m.p[0],selY:m.p[1]}};}