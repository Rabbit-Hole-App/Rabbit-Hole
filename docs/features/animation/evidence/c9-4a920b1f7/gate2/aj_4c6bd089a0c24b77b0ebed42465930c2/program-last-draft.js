const K=0.1,R=0.18,H=3,MAX=40,TOL=0.001,S0=[-2.5,0.8];
const loss=(x,z,s)=>0.5*(x*x+s*z*z);
const out=p=>Math.abs(p.x)>H||Math.abs(p.z)>H;
function word(p,i){if(out(p))return'diverged';const L=loss(p.x,p.z,i.steepness);if(L<TOL)return'converged';if(p.step>=MAX)return L<loss(S0[0],S0[1],i.steepness)?'converging':'diverged';return p.on?'running':'paused';}
const over=(p,i)=>{const w=word(p,i);return w!=='running'&&w!=='paused';};
const fresh=(kept,on)=>({x:S0[0],z:S0[1],step:0,on,path:[S0],kept});
const lift=(q,s)=>[q[0],Math.min(K*loss(q[0],q[1],s),3.3)+0.05,q[1]];
function adv(p,i){if(over(p,i))return p;const x=p.x*(1-i.learningRate),z=p.z*(1-i.learningRate*i.steepness);return{...p,x,z,step:p.step+1,path:p.path.concat([[x,z]])};}
export function initialState(){return fresh([],false);}
export function reduce({state:p,event:e,inputs:i}){
 if(e.type==='step')return !p.on||over(p,i)||e.tick%6?p:adv(p,i);
 if(e.type==='parameter')return e.parameter==='steepness'?fresh([],true):fresh(p.kept,true);
 if(e.type!=='action')return p;
 if(e.action==='run')return over(p,i)?p:{...p,on:true};
 if(e.action==='pause')return{...p,on:false};
 if(e.action==='stepOnce')return adv({...p,on:false},i);
 if(e.action==='keepPath')return fresh(p.step>0?p.path.map(q=>lift(q,i.steepness)):p.kept,true);
 return p;}
function aim(dx,dz,shown){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
 const p=state||initialState(),s=i.steepness,lr=i.learningRate,L=loss(p.x,p.z,s);
 return{nodes:{bowl:{scale:[1,1,Math.sqrt(4/s)]},ball:{position:[p.x,K*L+R,p.z]},stepArrow:aim(-lr*p.x,-lr*s*p.z,!over(p,i)),trail:{points:p.path.map(q=>lift(q,s))},ghost:{points:p.kept}},
 readouts:{status:word(p,i),steps:p.step,loss:L,mult:1-lr*s,limit:2/s}};}
