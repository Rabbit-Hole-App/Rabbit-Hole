import {evaluatePose,RunMotion} from '../motion.mjs';
import {RabbitRenderer} from '../renderer.mjs';

const base=new URL('../',import.meta.url),rig=await (await fetch(new URL('rig.json',base))).json();
const renderer=await RabbitRenderer.create(rig,base),motion=new RunMotion(rig);
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const previous=[];
for(const url of ['/pass04.png','/sixteen.png']){const img=new Image();img.src=url;await img.decode();previous.push(img);}
const colors={left:'#197aa0',right:'#c15632'};
function skeleton(pose,origin=[0,0],scale=1){
  ctx.save();ctx.translate(...origin);ctx.scale(scale,scale);ctx.lineWidth=1.5;
  for(const side of ['left','right']){
    const l=pose.legs[side],a=pose.arms[side];ctx.strokeStyle=ctx.fillStyle=colors[side];
    for(const keys of [[l.hip,l.knee,l.ankle,l.toe],[a.shoulder,a.elbow,a.wrist,a.grip]]){
      ctx.beginPath();keys.forEach((p,i)=>i?ctx.lineTo(...p.slice(0,2)):ctx.moveTo(...p.slice(0,2)));ctx.stroke();
      keys.forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();});
    }
  }
  ctx.restore();
}
function ground(y,width){
  ctx.strokeStyle='#b1b6b9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(width-10,y);ctx.stroke();
  for(let x=20;x<width;x+=30){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+8);ctx.stroke();}
}
function label(text,x,y){ctx.fillStyle='#445059';ctx.font='16px Arial';ctx.fillText(text,x,y);}
function observe(x,baseline,range=42){
  const data=ctx.getImageData(Math.floor(x-range),Math.floor(baseline-3),range*2+1,4).data;let last=null;
  for(let i=0;i<data.length;i+=4)if(data[i]<80&&data[i+1]<80&&data[i+2]<80)last=Math.max(last??-Infinity,Math.floor(x-range)+i/4%(range*2+1));
  return last;
}
let lastWorldSeconds=-1;
function draw(phase,mode='compare',worldSeconds=phase/13){
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  const pose=evaluatePose(phase,rig),local=renderer.render(pose);
  if(['single','overlay','mesh','gray','left_leg','right_leg','left_arm','right_arm'].includes(mode)){
    if(mode.endsWith('_leg')||mode.endsWith('_arm'))renderer.render(pose,{only:[mode]});
    if(mode==='gray')renderer.render(pose,{grayscale:true});ctx.drawImage(local,0,0);
    if(mode==='overlay')skeleton(pose);
    if(mode==='mesh'){
      ctx.strokeStyle='rgba(20,130,150,.3)';ctx.lineWidth=.45;
      for(const part of rig.parts){const points=renderer.deformed[part.name];
        for(let i=0;i<part.triangles.length;i+=3){ctx.beginPath();part.triangles.slice(i,i+3).forEach((id,k)=>k?ctx.lineTo(...points[id]):ctx.moveTo(...points[id]));ctx.closePath();ctx.stroke();}}
    }
    return {phase};
  }
  if(mode==='compare'){
    ctx.drawImage(previous[0],Math.floor(phase%8)*512,0,512,512,0,0,512,512);
    ctx.drawImage(previous[1],Math.floor(phase%8*2)*512,0,512,512,512,0,512,512);
    ctx.drawImage(local,1024,0);label('Pass 04 / 8 held frames',24,545);label('Pass 05 / rejected cutout deformation',536,545);label('Continuous connected mesh / candidate 06',1048,545);
    return {phase};
  }
  const scale=.375,distance=worldSeconds*780,worldX=170+distance*scale,rows=[];
  if(worldSeconds<lastWorldSeconds)motion.reset();lastWorldSeconds=worldSeconds;
  const state=motion.sample({position:[distance,0],travelledDistance:distance});
  for(let row=0;row<3;row++){
    const baseline=300+row*270,origin=[worldX-256*scale,baseline-480*scale];ground(baseline,1040);
    const title=['Pass 04 / 8 held frames','Pass 05 / 16 held frames','Continuous mesh / distance-driven support anchors'][row];label(title,24,baseline-220);
    if(row<2){const count=row===0?8:16,index=Math.floor((phase%8)/8*count);ctx.drawImage(previous[row],index*512,0,512,512,...origin,512*scale,512*scale);}
    else ctx.drawImage(renderer.render(state.pose),...origin,512*scale,512*scale);
    const contacts={};
    for(const side of ['left','right'])if(pose.legs[side].support){
      const toe=pose.legs[side].toe,tx=origin[0]+toe[0]*scale;
      contacts[side]={expected_world_x:tx,observed_ink_x:observe(tx,baseline)};
      if(mode==='locks'&&row===2){ctx.strokeStyle=colors[side];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(tx,baseline-25);ctx.lineTo(tx,baseline+15);ctx.stroke();}
    }
    rows.push({id:['pass04','pass05','continuous'][row],contacts,baseline});
    if(mode==='locks'&&row===2)skeleton(state.pose,origin,scale);
  }
  label(`780 source px/s | fixed ground/camera | phase ${phase.toFixed(3)} | display scale .375`,24,35);
  return {phase,world_x:worldX,rows,physics_root:state.physics,anchors:state.contacts};
}
const api={ready:true,renderer,rig,draw,history:[],ticks:0,timings:[],running:true};window.articulated=api;
let start=performance.now();function tick(now){
  if(api.running){const p=(now-start)/1000*13%8,before=performance.now();draw(p);api.timings.push(performance.now()-before);api.history.push(p);api.ticks++;}
  requestAnimationFrame(tick);
}requestAnimationFrame(tick);
