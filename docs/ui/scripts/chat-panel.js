(() => {
 const panel=document.querySelector('.rh-chat-panel');if(!panel)return;
 const transcript=panel.querySelector('#chat-transcript'),form=panel.querySelector('#rh-composer-form'),input=panel.querySelector('#rh-message'),send=panel.querySelector('#rh-send'),dialog=panel.querySelector('#chat-card-preview');
 const initial=transcript.innerHTML;
 function actions(message){if(message.querySelector('.chat-proposal'))return;const box=document.createElement('div');box.className='chat-proposal';box.innerHTML='<div class="sample-row"><button type="button" class="button primary" data-chat-approve>Accept</button><button type="button" class="button secondary" data-chat-edit>Edit card</button><button type="button" class="button secondary" aria-label="Go to card" data-go-card><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="../../../icons/standards.svg#i-ArrowUpRight"/></svg>Go to card</button></div>';message.append(box);}
 form.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();const value=input.value.trim();if(!value)return;const user=document.createElement('div');user.className='chat-user';user.textContent=value;transcript.append(user);const answer=document.createElement('article');answer.className='chat-assistant';answer.tabIndex=0;const p=document.createElement('p');p.textContent='A decision tree chooses a question that makes the resulting groups more consistent. This card can show how the split works.';answer.append(p);actions(answer);transcript.append(answer);input.value='';input.style.height='auto';send.disabled=true;transcript.scrollTop=transcript.scrollHeight;},true);
 panel.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-new-chat')){transcript.innerHTML=initial;input.value='';send.disabled=true;input.focus();}
  if(b.hasAttribute('data-add-card'))actions(b.closest('.chat-assistant'));
  if(b.hasAttribute('data-go-card'))dialog.showModal();
  if(b.hasAttribute('data-chat-feedback')){const on=b.getAttribute('aria-pressed')!=='true';b.closest('.message-feedback').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b&&on)));}
  if(b.hasAttribute('data-copy-response')){const text=b.closest('.chat-assistant').querySelector('p').textContent;try{await navigator.clipboard.writeText(text);b.title='Copied';b.setAttribute('aria-label','Copied');setTimeout(()=>{b.title='Copy response';b.setAttribute('aria-label','Copy response');},1200);}catch{const range=document.createRange();range.selectNodeContents(b.closest('.chat-assistant').querySelector('p'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}}
  if(b.hasAttribute('data-retry-response')){b.closest('.chat-assistant').querySelector('p').textContent='Hi! What would you like to explore on this canvas?';}
 });
})();
