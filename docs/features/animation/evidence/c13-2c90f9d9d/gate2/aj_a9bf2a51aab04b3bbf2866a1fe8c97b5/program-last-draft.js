const L=(x,y)=>0.5*(x*x+4*y*y);
const cl=v=>Math.max(-4,Math.min(4,v));
const pt=(x,y)=>{const cx=cl(x),cy=cl(y);return [cx,0.1*L(cx,cy),cy];};
function fresh(){const p=pt(-3,1.5);return {x:-3,y:1.5,s:"moving",pts:[[p[0],p[1]+0.05,p[2]]]};}
function adv(b,r){if(b.s!=="moving")return b;const x=b.x-r*b.x,y=b.y-r*4*b.y;let s="moving";if(Math.abs(x)>4||Math.abs(y)>4)s="diverged";else if(L(x,y)<0.001)s="converged";const p=pt(x,y);return {x,y,s,pts:b.pts.concat([[p[0],p[1]+0.05,p[2]]])};}
const over=st=>st.n>=60||(st.a.s!=="moving"&&st.b.s!=="moving");
function stepAll(st,inputs){if(over(st))return {...st,run:false};const ns={...st,a:adv(st.a,inputs.lrA),b:adv(st.b,inputs.lrB),n:st.n+1};if(over(ns))ns.run=false;return ns;}
export function initialState(){return {a:fresh(),b:fresh(),n:0,run:false,t:0};}
export function reduce({state,event,inputs}){const st=state;if(event.type==="parameter")return initialState();if(event.type==="action"){const a=event.action;if(a==="run"){if(over(st))return {...initialState(),run:true};return {...st,run:true};}if(a==="pause")return {...st,run:false};if(a==="stepOnce")return stepAll({...st,run:false},inputs);if(a==="newRuns")return initialState();return st;}if(event.type==="step"){if(!st.run)return st;const t=st.t+1;const ns={...st,t};return t%6===0?stepAll(ns,inputs):ns;}return st;}
export function evaluate({state}){const st=state||initialState();const pa=pt(st.a.x,st.a.y),pb=pt(st.b.x,st.b.y);let oa=0,ob=0;if(Math.hypot(pa[0]-pb[0],pa[2]-pb[2])<0.25){oa=-0.2;ob=0.2;}const status=st.run?"running":(over(st)?"finished":(st.n>0?"paused":"ready"));return {nodes:{ballA:{position:[pa[0]+oa,pa[1]+0.18,pa[2]]},ballB:{position:[pb[0]+ob,pb[1]+0.18,pb[2]]},trailA:{points:st.a.pts},trailB:{points:st.b.pts}},readouts:{lossA:L(st.a.x,st.a.y),lossB:L(st.b.x,st.b.y),steps:st.n,status,stateA:st.a.s,stateB:st.b.s}};}
