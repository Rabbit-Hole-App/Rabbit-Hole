import './observatory.css';
import './overview.js';

const scene=document.getElementById('observatory');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let inView=false;

// Keep the full artwork visible; only the separate mist and stars move.
function sync(){
  scene.dataset.playing=String(!media.matches&&inView&&!document.hidden);
}
media.addEventListener('change',sync);
document.addEventListener('visibilitychange',sync);
new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync();},{threshold:.05}).observe(scene);
sync();
