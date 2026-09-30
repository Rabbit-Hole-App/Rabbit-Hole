import {RabbitRenderer} from '../../design/rabbit-character/articulated-06/renderer.mjs';
import {deformLiving,livingPose} from './living-pose.js';
import {smooth,clamp} from './controller.js';
import {paperMatte} from './paper-matte.js';

const loadImage=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
const viewsByYaw=['front','front_right','right','back_right','back','back_left','left','front_left'];
export class MascotRenderer{
  static async create(){
    const base=new URL('/mascot/',window.location.origin),response=await fetch(new URL('rig.json',base));
    if(!response.ok)throw Error('The rabbit artwork could not be loaded.');
    const rig=await response.json(),skin=await RabbitRenderer.create(rig,base,{deform:deformLiving});
    const views=Object.fromEntries(await Promise.all(viewsByYaw.map(async name=>[name,paperMatte(await loadImage(new URL(`view-${name}.png`,base)))])));
    return new MascotRenderer(rig,skin,views);
  }
  constructor(rig,skin,views){this.rig=rig;this.skin=skin;this.views=views;}
  dispose(){this.skin.dispose();}
  character(ctx,sample,box,{still=false}={}){
    let yaw=sample.yaw;
    if(sample.state==='idle_look_left')yaw=-sample.gesture*2;
    if(sample.state==='idle_look_right')yaw=sample.gesture*2;
    const view=viewsByYaw[(Math.round(yaw)%8+8)%8];
    const breath=still?0:(1-Math.cos(sample.time*Math.PI*2/3.6))*.5;
    const height=box.h*(1+breath*.007),width=box.w*(1+breath*.002);
    if(sample.state==='idle_watch_check'||sample.state==='crouch'){
      ctx.drawImage(this.skin.render(livingPose(sample,this.rig,{still})),box.x-width/2,box.y+box.h-height,width,height);
    }else{
      // All directions are separately authored. No horizontal flip can move the
      // pocket watch from the anatomical right paw to the other hand.
      ctx.drawImage(this.views[view],box.x-width/2,box.y+box.h-height,width,height);
    }
    return view;
  }
  render(canvas,sample,{still=false}={}){
    const ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=canvas.width/w;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const size=clamp(w*.24,170,250),rx=size*.26,ry=size*.31;
    const path=(p,inset=0)=>{ctx.beginPath();ctx.ellipse(p.x*w,p.y*h,rx-inset,ry-inset,0,0,Math.PI*2);};
    const portals=Object.values(sample.portals);
    for(const p of portals){
      ctx.save();ctx.shadowColor='#1c161838';ctx.shadowBlur=12;ctx.shadowOffsetY=2;
      path(p);ctx.fillStyle='#1b1618';ctx.fill();ctx.restore();
      const dark=ctx.createRadialGradient(p.x*w,p.y*h,2,p.x*w,p.y*h,ry);
      dark.addColorStop(0,'#020203');dark.addColorStop(.75,'#0b090b');dark.addColorStop(1,'#454047');
      path(p,3);ctx.fillStyle=dark;ctx.fill();
      // Recessed inner contour and a narrow paper edge make an upright cut in
      // the screen plane. The ellipse is taller than wide, never floor-foreshortened.
      ctx.save();path(p,4);ctx.clip();ctx.strokeStyle='#ffffff13';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(p.x*w+6,p.y*h+3,rx-12,ry-12,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    const crossing=sample.portal&&!sample.hidden,d=sample.depth;
    const projectedSize=size*(1-d*.25),height=projectedSize*(1-sample.crouch*.12-d*.10);
    // The 2D world anchor stays at the portal center; z projects about that center.
    // No lateral translation, floor sinking, opacity animation or root teleport.
    const box={x:sample.position.x*w,y:sample.position.y*h+(sample.crouch-1)*size*.06-height/2,w:projectedSize,h:height};
    const cut=box.y+height*(1-smooth(d));
    if(crossing){
      const p=sample.portals[sample.portal];
      ctx.save();path(p,4);ctx.clip();
      ctx.beginPath();ctx.rect(0,cut,w,h-cut);ctx.clip();
      // Full-opacity paper darkens inside the recessed opening. Most depth is
      // communicated by the rim and front/behind plane split, not by this shading.
      ctx.filter=`brightness(${1-smooth((d-.2)/.8)*.99})`;
      this.character(ctx,sample,box,{still});ctx.restore();
    }
    for(const p of portals){
      ctx.strokeStyle='#8b858b';ctx.lineWidth=5;path(p);ctx.stroke();
      ctx.strokeStyle='#ebe8ec';ctx.lineWidth=2;path(p,-2);ctx.stroke();
      ctx.strokeStyle='#241f25';ctx.lineWidth=1;path(p,3);ctx.stroke();
    }
    if(!sample.hidden){
      ctx.save();
      if(crossing){ctx.beginPath();ctx.rect(0,0,w,cut);ctx.clip();}
      const view=this.character(ctx,sample,box,{still});ctx.restore();canvas.dataset.view=view;
    }
    canvas.dataset.portalShape='screen-facing';canvas.dataset.occlusion=crossing?'rim-and-plane':'none';
  }
}
