const K=0.4,R=0.18,HX=4,HZ=2.5,MAXS=80,S=[-3,1],TOP=3.6;
const loss=(x,z)=>0.25*x*x+0.75*z*z;
const out=b=>Math.abs(b.x)>HX||Math.abs(b.z)>HZ;
const conv=b=>loss(b.x,b.z)<0.001;
const still=b=>out(b)||conv(b);
const ball=()=>({x:S[0],z:S[1],path:[S]});
const fresh=()=>({a:ball(),b:ball(),n:0,on:false});
const mv=(b,lr)=>{if(still(b))return b;const x=b.x-lr*0.5*b.x,z=b.z-lr*1.5*b.z;return{x,z,path:b.path.concat([[x,z]])};};
const done=s=>s.n>=MAXS||(still(s.a)&&still(s.b));
const adv=(s,i)=>done(s)?{...s,on:false}:{...s,a:mv(s.a,i.lrA),b:mv(s.b,i.lrB),n:s.n+1};
const word=(b,s)=>out(b)?'diverged':conv(b)?'converged':s.n>=MAXS?'stopped at 80 steps':s.on?'running':'paused';
export function initialState(){return fresh();}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on)return s;if(done(s))return{...s,on:false};return e.tick%6?s:adv(s,inputs);}
 if(e.type!=='action')return s;
 if(e.action==='run')return done(s)?s:{...s,on:true};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},inputs);
 if(e.action==='again')return fresh();
 return s;
}
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const cp=p=>[cl(p[0],HX),cl(p[1],HZ)];
const h=(x,z)=>Math.min(K*loss(x,z),TOP);
const lift=p=>{const q=cp(p);return[q[0],h(q[0],q[1])+0.05,q[1]];};
const pos=b=>{const q=cp([b.x,b.z]);return[q[0],h(q[0],q[1])+R,q[1]];};
export function evaluate({state}){
 const s=state||fresh(),A=s.a,B=s.b,pa=pos(A),pb=pos(B);
 if(Math.hypot(pa[0]-pb[0],pa[2]-pb[2])<2*R)pa[1]=pb[1]+2*R;
 return{nodes:{ballA:{position:pa},ballB:{position:pb},trailA:{points:A.path.map(lift)},trailB:{points:B.path.map(lift)}},
 readouts:{lossA:loss(A.x,A.z),lossB:loss(B.x,B.z),statusA:word(A,s),statusB:word(B,s),steps:s.n}};
}