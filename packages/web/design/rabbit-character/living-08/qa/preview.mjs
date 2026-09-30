import {MascotController} from '/src/mascot/controller.js';
import {MascotRenderer} from '/src/mascot/renderer.js';
const renderer=await MascotRenderer.create(),canvas=document.querySelector('canvas');
function draw(action,seconds){
  const controller=new MascotController();
  if(action==='portal')controller.travel('A');else controller.action(action);
  for(let t=0;t<seconds;t+=1/120)controller.tick(Math.min(1/120,seconds-t),{ambient:false});
  const sample=controller.snapshot();renderer.render(canvas,sample);return sample;
}
window.living={ready:true,draw};draw('idle_breathe',0);
