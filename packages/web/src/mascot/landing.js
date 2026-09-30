import {MascotController,clamp} from './controller.js';
import {MascotRenderer} from './renderer.js';
import './landing.css';
import '../landing/pink-cloud.js';

const host=document.getElementById('warren'),canvas=document.getElementById('rabbit');
const surface=host.querySelector('.rabbit-surface'),sticky=host.querySelector('.rabbit-sticky'),status=host.querySelector('[role="status"]');
const pauseButton=host.querySelector('[data-pause]'),motionNote=host.querySelector('[data-motion-note]');
const actionButtons=[...host.querySelectorAll('[data-action]')],portalButtons=[...host.querySelectorAll('[data-portal]')];
const controller=new MascotController(),media=matchMedia('(prefers-reduced-motion: reduce)');
const descriptions={idle_breathe:'Taking a breath',idle_look_left:'Looking left',idle_look_right:'Looking right',idle_watch_check:'Checking the time',crouch:'Crouching',approach_portal:'Approaching the opening',turn_to_portal:'Turning toward the page',portal_crouch:'Ready to dive',portal_enter:'Going into the page',portal_hidden:'Behind the page',portal_exit:'Coming out of the page',recover_from_portal:'Finding his feet',turn_from_portal:'Looking around',depart_portal:'Continuing on'};
let renderer,ready=false,visible=false,paused=false,reduced=media.matches,previous=performance.now(),raf,start=0,range=1500;
function layout(){
  const bounds=surface.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);
  start=host.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(sticky).top);
  range=Math.max(1,host.offsetHeight-sticky.offsetHeight);
  host.dataset.scrollStart=start.toFixed(1);host.dataset.scrollRange=range.toFixed(1);
}
function sync(sample){
  for(const button of actionButtons){button.disabled=!ready||controller.busy;button.setAttribute('aria-pressed',String(button.dataset.action===controller.state));}
  for(const button of host.querySelectorAll('[data-pause],[data-reset],[data-portal],[data-travel]'))button.disabled=!ready;
  pauseButton.textContent=paused?'Resume':'Pause';pauseButton.setAttribute('aria-label',paused?'Resume mascot':'Pause mascot');
  motionNote.hidden=!reduced;
  const text=!ready?'Waking the rabbit…':paused?'Taking a pause':`${descriptions[controller.state]} · ${sample?.direction<0?'B → A':'A → B'}`;
  if(status.textContent!==text)status.textContent=text;
  for(const button of portalButtons){const p=controller.portals[button.dataset.portal];button.style.left=`${p.x*100}%`;button.style.top=`${p.y*100}%`;}
  host.style.setProperty('--journey',String(controller.progress));
}
function scrollToProgress(p){window.scrollTo({top:start+p*range,behavior:reduced?'instant':'smooth'});}
for(const button of actionButtons)button.addEventListener('click',()=>{if(controller.action(button.dataset.action))paused=false;sync();});
for(const button of host.querySelectorAll('[data-travel]'))button.addEventListener('click',()=>{paused=false;scrollToProgress(button.dataset.travel==='A'?1:0);});
pauseButton.addEventListener('click',()=>{paused=!paused;sync();});
host.querySelector('[data-reset]').addEventListener('click',()=>{paused=false;controller.reset();scrollToProgress(0);sync();});
function move(id,x,y){
  const margin=Math.max(.17,85/surface.clientWidth);
  if(controller.movePortal(id,clamp(x,margin,1-margin),y))sync();
}
for(const button of portalButtons){
  const id=button.dataset.portal;
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();button.focus({preventScroll:true});
    const rect=surface.getBoundingClientRect(),p=controller.portals[id];
    const offset={x:event.clientX-rect.left-p.x*rect.width,y:event.clientY-rect.top-p.y*rect.height};
    button.setPointerCapture(event.pointerId);
    const drag=e=>move(id,(e.clientX-rect.left-offset.x)/rect.width,(e.clientY-rect.top-offset.y)/rect.height);
    const finish=()=>{button.removeEventListener('pointermove',drag);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',finish);button.removeEventListener('lostpointercapture',finish);};
    button.addEventListener('pointermove',drag);button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',finish);button.addEventListener('lostpointercapture',finish);
  });
  button.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-.015,0],ArrowRight:[.015,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[event.key];
    if(!delta)return;event.preventDefault();const p=controller.portals[id],step=event.shiftKey?3:1;move(id,p.x+delta[0]*step,p.y+delta[1]*step);
  });
}
media.addEventListener('change',()=>{reduced=media.matches;sync();});
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});observer.observe(surface);
const resize=new ResizeObserver(layout);resize.observe(surface);resize.observe(sticky);
document.fonts.ready.then(layout);addEventListener('resize',layout);layout();sync();
MascotRenderer.create().then(result=>{
  renderer=result;ready=true;host.dataset.ready='true';sync();
  function frame(now){
    if(!paused)controller.setProgress((scrollY-start)/range);
    const sample=controller.tick((now-previous)/1000,{paused:paused||!visible||document.hidden,reduced});previous=now;
    if(visible&&!document.hidden){
      renderer.render(canvas,sample,{still:reduced||paused||controller.busy});
      Object.assign(canvas.dataset,{state:sample.state,depth:sample.depth.toFixed(4),progress:controller.progress.toFixed(4),direction:String(sample.direction),
        hidden:String(sample.hidden),portal:sample.portal||'',position:JSON.stringify(sample.position),history:JSON.stringify(sample.history)});
      sync(sample);
    }
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
}).catch(error=>{status.textContent=error.message;status.setAttribute('role','alert');});
window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(raf);observer.disconnect();resize.disconnect();removeEventListener('resize',layout);renderer?.dispose();}},{once:true});
