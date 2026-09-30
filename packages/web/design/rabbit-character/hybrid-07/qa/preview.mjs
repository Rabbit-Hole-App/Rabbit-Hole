import {evaluatePose,RunMotion} from '../../articulated-06/motion.mjs';
import {RabbitRenderer} from '../../articulated-06/renderer.mjs';
import {deformPart,sectionOutline,correctiveWeights} from '../skinning.mjs';

const base=new URL('../',import.meta.url),oldBase=new URL('../../articulated-06/',import.meta.url);
const [rig,oldRig]=await Promise.all([base,oldBase].map(async url=>(await fetch(new URL('rig.json',url))).json()));
const renderer=await RabbitRenderer.create(rig,base,{deform:deformPart});
const old=await RabbitRenderer.create(oldRig,oldBase),motion=new RunMotion(rig),oldMotion=new RunMotion(oldRig);
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const colors={left:'#168198',right:'#bd4c35'},sections={thigh:'#c68d40',shin:'#43988e',foot:'#7460b7'};
function label(text,x,y,size=16){ctx.fillStyle='#39434b';ctx.font=`${size}px Arial`;ctx.fillText(text,x,y);}
function skeleton(pose,side){
  const l=pose.legs[side];ctx.strokeStyle=ctx.fillStyle=colors[side];ctx.lineWidth=1.7;
  const chain=[l.hip,l.knee,l.ankle,l.toe];ctx.beginPath();chain.forEach((p,i)=>i?ctx.lineTo(...p.slice(0,2)):ctx.moveTo(...p.slice(0,2)));ctx.stroke();
  chain.forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],2.6,0,Math.PI*2);ctx.fill();});
}
function outline(pose,side){
  const part=rig.parts.find(p=>p.name===side+'_foot'),points=sectionOutline(part,pose);
  ctx.strokeStyle='#9348a8';ctx.lineWidth=1.5;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
}
function weights(pose,side){
  for(const part of rig.parts.filter(p=>p.side===side)){
    const points=deformPart(part,pose,rig);ctx.strokeStyle=part.kind==='joint-skin'?'#cf536d':sections[part.section];
    ctx.fillStyle=ctx.strokeStyle+'30';ctx.lineWidth=.5;
    for(let i=0;i<part.triangles.length;i+=3){ctx.beginPath();part.triangles.slice(i,i+3).forEach((id,k)=>k?ctx.lineTo(...points[id]):ctx.moveTo(...points[id]));ctx.closePath();ctx.fill();ctx.stroke();}
  }
}
function ground(y,width){
  ctx.strokeStyle='#bac0c3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(width-10,y);ctx.stroke();
  for(let x=20;x<width;x+=30){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+8);ctx.stroke();}
}
function observe(x,baseline){
  const range=42,data=ctx.getImageData(Math.floor(x-range),Math.floor(baseline-3),range*2+1,4).data;let last=null;
  for(let i=0;i<data.length;i+=4)if(data[i]<80&&data[i+1]<80&&data[i+2]<80)last=Math.max(last??-Infinity,Math.floor(x-range)+i/4%(range*2+1));
  return last;
}
let previousTime=-1;
function draw(phase,mode='compare',seconds=phase/13){
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  const pose=evaluatePose(phase,rig);
  if(mode==='compare'){
    ctx.drawImage(old.render(pose),0,0);ctx.drawImage(renderer.render(pose),512,0);
    label('Candidate 06 / deforming leg mesh',22,540);label('Candidate 07 / shape-preserving sections',534,540);return {phase};
  }
  if(['single','overlay','gray'].includes(mode)){
    ctx.drawImage(renderer.render(pose,{grayscale:mode==='gray'}),0,0);
    if(mode==='overlay')for(const side of ['left','right'])skeleton(pose,side);return {phase};
  }
  if(mode.startsWith('leg-')){
    const [_,side,view]=mode.split('-'),names=rig.parts.filter(p=>p.side===side).map(p=>p.name);
    ctx.drawImage(renderer.render(pose,{only:names}),0,0);
    if(view==='skeleton')skeleton(pose,side);
    if(view==='weights')weights(pose,side);
    if(view==='outline')outline(pose,side);
    return {phase,side,corrections:correctiveWeights(pose.legs[side],rig),joints:pose.legs[side]};
  }
  const scale=.375,distance=seconds*780,worldX=170+distance*scale,rows=[];
  if(seconds<previousTime){motion.reset();oldMotion.reset();}previousTime=seconds;
  const state=motion.sample({position:[distance,0],travelledDistance:distance});
  const oldState=oldMotion.sample({position:[distance,0],travelledDistance:distance});
  for(let row=0;row<2;row++){
    const baseline=280+row*280,origin=[worldX-256*scale,baseline-480*scale];ground(baseline,1040);
    label(row===0?'Candidate 06':'Candidate 07 / independent moving physics root',24,baseline-214);
    ctx.drawImage((row===0?old:renderer).render(row===0?oldState.pose:state.pose),...origin,512*scale,512*scale);
    const contacts={};
    for(const side of ['left','right'])if(state.pose.legs[side].support){
      const toe=state.pose.legs[side].toe,tx=origin[0]+toe[0]*scale;
      contacts[side]={expected_world_x:tx,observed_ink_x:observe(tx,baseline)};
    }
    if(mode==='locks'&&row===1){
      ctx.save();ctx.translate(...origin);ctx.scale(scale,scale);
      for(const side of ['left','right']){skeleton(state.pose,side);if(state.contacts[side]){
        const toe=state.pose.legs[side].toe;ctx.strokeStyle=colors[side];ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(toe[0],460);ctx.lineTo(toe[0],500);ctx.stroke();}}
      ctx.restore();
    }
    rows.push({id:row===0?'candidate06':'candidate07',contacts,baseline});
  }
  label(`780 source px/s | fixed ground | phase ${phase.toFixed(3)} | scale .375`,24,32);
  return {phase,world_x:worldX,rows,anchors:state.contacts,physics:state.physics};
}
const api={ready:true,draw,rig,renderer,old,history:[],ticks:0,timings:[],running:true};window.hybrid=api;
const start=performance.now();function tick(now){if(api.running){const phase=(now-start)/1000*13%8,before=performance.now();draw(phase);api.history.push(phase);api.timings.push(performance.now()-before);api.ticks++;}requestAnimationFrame(tick);}requestAnimationFrame(tick);
