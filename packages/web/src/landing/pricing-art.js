import './pricing-art.css';

const scene=document.getElementById('pricing-art');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let inView=false;

function sync(){
  scene.dataset.playing=String(scene.dataset.ready==='true'&&inView&&!media.matches&&!document.hidden);
}
media.addEventListener('change',sync);
document.addEventListener('visibilitychange',sync);
new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync();}).observe(scene);
sync();

// Decode both layers before replacing the complete static illustration.
// Moving the sky behind an opaque mountain layer keeps the landscape fixed.
const sky=new Image(),mountains=new Image();
sky.className='pricing-sky';mountains.className='pricing-mountains';
for(const image of [sky,mountains]){image.alt='';image.decoding='async';image.width=1774;image.height=887;}
sky.src='/landing/pricing-sky-v1.png';
mountains.src='/landing/pricing-mountains-v1.png';
Promise.all([sky.decode(),mountains.decode()]).then(()=>{
  const weather=document.createElement('div');weather.className='pricing-weather';
  const birds=document.createElement('div');birds.className='pricing-birds';
  birds.innerHTML=Array.from({length:3},()=>`<div class="pricing-bird-flight"><svg class="pricing-bird" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 3Q5 1 9 7Q13 1 17 3"/></svg></div>`).join('');
  weather.append(sky,birds,mountains);scene.append(weather);
  scene.dataset.ready='true';sync();
}).catch(()=>{
  // The complete image remains visible if an enhancement cannot load.
  scene.dataset.ready='false';sync();
});
