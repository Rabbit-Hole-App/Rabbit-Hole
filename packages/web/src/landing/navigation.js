const menu=document.getElementById('menu'),sheet=document.getElementById('sheet');
function setMenu(open){
  sheet.classList.toggle('open',open);sheet.inert=!open;
  menu.setAttribute('aria-expanded',String(open));
}
setMenu(false);
menu.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
sheet.addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false);});
addEventListener('keydown',event=>{if(event.key==='Escape'){setMenu(false);menu.focus();}});
addEventListener('pointerdown',event=>{if(!sheet.contains(event.target)&&!menu.contains(event.target))setMenu(false);});
matchMedia('(min-width:701px)').addEventListener('change',()=>setMenu(false));
