export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const ACTIONS=['idle_breathe','idle_look_left','idle_look_right','idle_watch_check','crouch'];
export const PORTAL_STATES=['approach_portal','turn_to_portal','portal_crouch','portal_enter','portal_hidden','portal_exit','recover_from_portal','turn_from_portal','depart_portal'];
const durations={idle_look_left:2.8,idle_look_right:2.3,idle_watch_check:3.2,crouch:1.4};
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const segment=(q,a,b)=>clamp((q-a)/(b-a));
const resting=p=>({x:clamp(p.x+(p.x>.5?-.13:.13),.15,.85),y:clamp(p.y+.045,.18,.85)});

// One spatial timeline, read in either direction. At any progress the page
// position, depth and clipping are identical going up or down. Only facing and
// semantic entry/exit roles change. No elapsed-time trip or location-specific GIF.
export function portalPose(progress,direction,portals){
  const q=direction>0?progress:1-progress,from=direction>0?'A':'B',to=from==='A'?'B':'A';
  const entry=portals[from],exit=portals[to];
  let state='idle_breathe',phase=0,position=resting(q<.5?entry:exit),depth=0,crouch=0,yaw=0,portal=null;
  if(q>=.08&&q<.18){state='approach_portal';phase=segment(q,.08,.18);position=mix(resting(entry),entry,smooth(phase));yaw=Math.sin(phase*Math.PI)*.8;}
  else if(q>=.18&&q<.25){state='turn_to_portal';phase=segment(q,.18,.25);position=entry;yaw=smooth(phase)*4;}
  else if(q>=.25&&q<.30){state='portal_crouch';phase=segment(q,.25,.30);position=entry;crouch=smooth(phase);yaw=4;}
  else if(q>=.30&&q<.45){state='portal_enter';phase=segment(q,.30,.45);position=entry;depth=smooth(phase);crouch=1;yaw=4;portal=from;}
  else if(q>=.45&&q<.55){state='portal_hidden';phase=segment(q,.45,.55);position=phase<.5?entry:exit;depth=1;}
  else if(q>=.55&&q<.70){state='portal_exit';phase=segment(q,.55,.70);position=exit;depth=1-smooth(phase);crouch=1;portal=to;}
  else if(q>=.70&&q<.75){state='recover_from_portal';phase=segment(q,.70,.75);position=exit;crouch=1-smooth(phase);}
  else if(q>=.75&&q<.82){state='turn_from_portal';phase=segment(q,.75,.82);position=exit;yaw=Math.sin(phase*Math.PI)*.8;}
  else if(q>=.82&&q<.92){state='depart_portal';phase=segment(q,.82,.92);position=mix(exit,resting(exit),smooth(phase));yaw=Math.sin(phase*Math.PI)*.8;}
  // Decide the exact two transfer boundaries in canonical progress space too;
  // complementary floating-point values must never expose a one-frame rabbit.
  const hidden=progress>=.45&&progress<=.55;
  if(hidden){state='portal_hidden';depth=1;crouch=0;yaw=0;portal=null;}
  return {state,phase,position:{x:position.x,y:position.y},depth,crouch,yaw,portal,hidden,trip:{from,to},progress,direction};
}

export class MascotController{
  constructor(){
    this.portals={A:{id:'A',x:.34,y:.27,normal:[0,0,1],surface:'page'},B:{id:'B',x:.66,y:.73,normal:[0,0,1],surface:'page'}};
    this.reset();
  }
  reset(){this.progress=0;this.direction=1;this.time=0;this.elapsed=0;this.gestureAction=null;this.yaw=0;this.state='idle_breathe';this.history=['idle_breathe'];}
  get busy(){return this.progress>.08&&this.progress<.92;}
  setProgress(value){
    if(!Number.isFinite(value))return;
    const next=clamp(value),delta=next-this.progress;
    if(Math.abs(delta)>.0001){this.direction=Math.sign(delta);this.gestureAction=null;this.elapsed=0;}
    this.progress=next;
  }
  action(name){if(this.busy||!ACTIONS.includes(name))return false;this.gestureAction=name==='idle_breathe'?null:name;this.elapsed=0;return true;}
  movePortal(id,x,y){
    if(!this.portals[id]||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const p={...this.portals[id],x:clamp(x,.17,.83),y:clamp(y,.22,.78)},other=this.portals[id==='A'?'B':'A'];
    // Keep enough room for the entire rabbit and for distinct page openings.
    if(Math.hypot((p.x-other.x)/.23,(p.y-other.y)/.36)<1)return false;
    this.portals={...this.portals,[id]:p};return true;
  }
  tick(dt,{paused=false,reduced=false}={}){
    if(!paused){
      dt=clamp(dt,0,.05);this.time+=dt;this.elapsed+=dt;
      if(this.gestureAction&&this.elapsed>=durations[this.gestureAction])this.gestureAction=null;
      const target=portalPose(this.progress,this.direction,this.portals).yaw;
      // Mid-crossing reversal turns through authored views without moving the
      // character to another portal or restarting the scroll timeline.
      this.yaw+=clamp(target-this.yaw,-dt*14,dt*14);
    }
    return this.snapshot({reduced});
  }
  snapshot({reduced=false}={}){
    // Reduced motion retains the same destination semantics with static poses.
    const progress=reduced?(this.progress<.5?0:1):this.progress;
    const pose=portalPose(progress,this.direction,this.portals);
    const state=this.gestureAction&&!this.busy?this.gestureAction:pose.state;
    const phase=this.gestureAction?clamp(this.elapsed/durations[state]):pose.phase;
    const gesture=this.gestureAction?smooth(phase/.28)*(1-smooth((phase-.68)/.32)):0;
    if(state!==this.state){this.state=state;this.history.push(state);if(this.history.length>60)this.history.shift();}
    return {...pose,state,phase,gesture,crouch:state==='crouch'?gesture:pose.crouch,yaw:reduced?0:this.yaw,time:this.time,
      portals:this.portals,heading:{x:this.direction,y:0},distance:0,history:[...this.history]};
  }
}
