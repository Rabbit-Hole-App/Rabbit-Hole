// Descriptions are supplied by the host; insert plain text, never HTML.
document.querySelectorAll('[data-description-text]').forEach(host=>{
 const text=host.dataset.descriptionText.trim();
 if(!text)return;
 const paragraph=document.createElement('p');paragraph.className='canvas-note';paragraph.textContent=text;
 host.querySelector('.canvas-heading').after(paragraph);
});

(() => {
let starred=false;
function render(){document.querySelectorAll('[data-canvas-star]').forEach(button=>{button.setAttribute('aria-pressed',String(starred));button.setAttribute('aria-label',(starred?'Starred, 1 star':'Star'));button.querySelector('[data-star-label]').textContent=starred?'Starred':'Star';const count=button.querySelector('[data-star-count]');count.hidden=!starred;count.textContent=starred?'1':'';});}
document.querySelectorAll('[data-canvas-star]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();starred=!starred;render();document.getElementById('card-status').textContent=starred?'Canvas starred':'Canvas removed from Stars';}));
function open(){document.getElementById('card-status').textContent='Continue to Untitled canvas';}
document.querySelectorAll('[data-open-canvas]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();open();}));
document.querySelectorAll('.canvas-summary').forEach(card=>card.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target===card){event.preventDefault();open();}}));
document.querySelectorAll('.owner-badge').forEach(button=>{button.addEventListener('keydown',event=>{if(event.key==='Escape'){button.dataset.tooltipDismissed='';button.blur();}});button.addEventListener('pointerenter',()=>delete button.dataset.tooltipDismissed);button.addEventListener('focus',()=>delete button.dataset.tooltipDismissed);});
})();
