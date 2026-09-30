import './pink-cloud.css';

// The loop contains only the original GIF's visible forward/back animation.
// The unchanged source still is shown only in reduced motion.
const image=document.getElementById('cloud-motion'),still=document.getElementById('cloud-still');
const media=matchMedia('(prefers-reduced-motion: reduce)');

function sync(){
  image.hidden=media.matches;still.hidden=!media.matches;
}
image.addEventListener('load',sync);
media.addEventListener('change',sync);
sync();
