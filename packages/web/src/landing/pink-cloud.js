import './pink-cloud.css';

// The loop contains only the original GIF's visible forward/back animation.
// The unchanged source still is shown only in reduced motion.
const image=document.getElementById('cloud-motion'),still=document.getElementById('cloud-still');
const cloud=document.getElementById('pink-cloud'),haze=cloud.querySelector('.cloud-haze');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let cloudTop=0,viewportHeight=0,blend=1,queued=false,lastProgress=-1;

// A short, reversible reveal. Scroll owns progress; no timer or extra scroll track.
function render(){
  queued=false;
  const progress=media.matches?1:Math.max(0,Math.min(1,(scrollY+viewportHeight-cloudTop+blend)/(2*blend)));
  if(progress===lastProgress)return;
  lastProgress=progress;
  image.style.opacity=String(progress);
  haze.style.opacity=String(media.matches?0:Math.min(progress*2,(1-progress)*2));
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render);}}
function measure(){
  cloudTop=cloud.getBoundingClientRect().top+scrollY;
  viewportHeight=innerHeight;
  blend=Math.max(1,haze.offsetHeight/2);
  schedule();
}
function sync(){
  image.hidden=media.matches;still.hidden=!media.matches;
  lastProgress=-1;
  measure();
}
image.addEventListener('load',sync);
media.addEventListener('change',sync);
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',measure);
addEventListener('pageshow',measure);
document.fonts.ready.then(measure);
sync();
