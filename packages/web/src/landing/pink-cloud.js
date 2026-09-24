import './pink-cloud.css';

// Reuse the exact GIF and an unchanged decoded frame for pause/reduced motion.
// drawImage(animatedGif) returns the first (blank) frame in Chrome.
const image=document.getElementById('cloud-motion'),still=document.getElementById('cloud-still');
const button=document.getElementById('cloud-pause'),media=matchMedia('(prefers-reduced-motion: reduce)');
let paused=media.matches;
function sync(){
  image.hidden=paused;still.hidden=!paused;
  button.textContent=paused?'Play clouds':'Pause clouds';button.setAttribute('aria-label',button.textContent);
}
image.addEventListener('load',sync);
button.addEventListener('click',()=>{paused=!paused;sync();});
media.addEventListener('change',()=>{paused=media.matches;sync();});
sync();
