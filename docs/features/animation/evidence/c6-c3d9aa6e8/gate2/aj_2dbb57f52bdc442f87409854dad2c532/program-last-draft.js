const K=0.25,R=0.13,HX=3,HZ=1.5,S0=[-2.6,0.9],SD=1.5;
const loss=(x,z)=>0.5*(x*x+5*z*z);
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gs=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(6.2832*rnd(n+0.37));
const out=s=>Math.abs(s.x)>HX||Math.abs(s.z)>HZ;
const done=(s,i)=>out(s)||s.k>=i.maxSteps;
const fresh=(run,kept)=>({x:S0[0],z:S0[1],k:0,run,path:[S0],kept});
const cl=(v,h)=>Math.max(-h,Math.min(h,v));
export function initialState(){return fresh(0,[]);}
function adv(s,i,seed){
 if(done(s,i))return s;
 const n=seed*7919+s.run*4001+s.k*2+1,sd=SD*i.noise,a=i.learningRate;
 const x=s.x-a*(s.x+sd*gs(n)),z=s.z-a*(5*s.z+sd*gs(n+0.5)),k=s.k+1;
 return {...s,x,z,k,path:s.path.concat([[x,z]])};
}
export function reduce({state:s,event:e,inputs:i,seed}){
 if(e.type==='step')return e.tick%3?s:adv(s,i,seed);
 if(e.type!=='action')return s;
 if(e.action==='keepPath')return fresh(s.run+1,s.k>0?s.kept.concat([{p:s.path,l:loss(s.x,s.z)}]).slice(-3):s.kept);
 if(e.action==='clearKept')return {...s,kept:[]};
 return s;
}
const lift=p=>{const x=cl(p[0],HX),z=cl(p[1],HZ);return [x,K*loss(x,z)+0.04,z];};
function word(s,i,L){if(out(s))return 'diverged';if(s.k>=i.maxSteps)return L<0.05?'converged':'finished';return s.k?'running':'ready';}
export function evaluate({inputs:i,state,seed}){
 const s=state||initialState(),L=loss(s.x,s.z),x=cl(s.x,HX),z=cl(s.z,HZ);
 const nodes={ball:{position:[x,K*loss(x,z)+R,z]},trail:{points:s.path.map(lift)}};
 const readouts={loss:L,steps:s.k,status:word(s,i,L)};
 for(let j=0;j<3;j++){const g=s.kept[j];nodes['g'+j]=g?{visible:true,points:g.p.map(lift)}:{visible:false};if(g)readouts['kept'+(j+1)]=g.l;}
 return {nodes,readouts};
}
