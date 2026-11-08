(() => {
 document.body.classList.toggle('ui-current-flow',!!document.querySelector('.stage,.canvas,.review,.panel,.demo-canvas'));
 const focusIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M14 9h3v3m0-3-6 6"/></svg>';
 function resize(card){
  let handle=card.querySelector(':scope > .resize-handle') || card.querySelector('.resize-handle');
  if(!handle){handle=document.createElement('button');handle.type='button';handle.className='resize-handle';handle.setAttribute('aria-label','Resize card');handle.title='Resize card';card.append(handle);}
  if(!handle.dataset.sharedGrip){handle.dataset.sharedGrip='true';handle.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 12 12 3M8 12 12 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';}
  installResize(card,handle);
 }
 function upgradeSelect(select){
  if(select.dataset.uiReplaced)return;select.dataset.uiReplaced='true';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const inCard=!!select.closest('.card,.teaching-card,.review,.parameters');const wrapper=document.createElement(inCard?'div':'details');wrapper.className=inCard?'ui-choices':'popover ui-select';wrapper.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent?.trim()||'Choose an option');
  let options=wrapper,current;
  if(!inCard){const summary=document.createElement('summary');summary.className='button secondary';current=document.createElement('span');current.textContent=select.selectedOptions[0]?.textContent;summary.append(current);summary.insertAdjacentHTML('beforeend','<span aria-hidden="true">⌄</span>');options=document.createElement('div');options.className='menu';wrapper.append(summary,options);}
  for(const option of select.options){const button=document.createElement('button');button.type='button';button.className=inCard?'':'menu-item';button.textContent=option.textContent;button.disabled=option.disabled;button.setAttribute('aria-pressed',String(option.selected));button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(current){current.textContent=option.textContent;wrapper.open=false;}});options.append(button);}select.after(wrapper);
 }
 function refresh(){
  document.querySelectorAll('select').forEach(upgradeSelect);
  document.querySelectorAll('.rh-composer:not([data-embedded]),.rh-chat-panel').forEach(resize);
  document.querySelectorAll('.teaching-card:not(.rh-composer),article.card,article.review').forEach(card=>{
   if(!card.classList.contains('rh-current-card')){
    card.classList.add('rh-current-card');card.dataset.minWidth='440';card.dataset.maxWidth='960';card.dataset.minHeight='320';card.dataset.maxHeight='760';
    // Existing headers and listeners remain mounted; only cards missing a header receive one.
    if(!card.querySelector('.card-head,.card-header,.review-head')){const title=card.querySelector('h1,h2,h3,h4,.filename');const h=document.createElement('header');h.className='card-header';const pill=document.createElement('span');pill.className='card-pill';pill.textContent=card.matches('.markdown-card,#source')?'Markdown':'Explanation';h.append(pill);if(title){title.classList.add('card-title');h.append(title);}card.prepend(h);}
   }
   const kitTitle=card.querySelector(':scope > h3');const kitHeader=card.querySelector(':scope > .card-header');if(kitTitle&&kitHeader){kitTitle.classList.add('card-title');kitHeader.append(kitTitle);}
   if(!card.querySelector('.reading,.markdown-reading,.document,.slot-body,.card-body,.ui-card-content')&&card.children.length>1){const content=document.createElement('div');content.className='ui-card-content';for(const child of [...card.children])if(!child.matches('.card-head,.card-header,.review-head,.resize-handle,.ui-resize'))content.append(child);card.append(content);}
   const header=card.querySelector('.card-head,.card-header,.review-head');const directTitle=[...card.children].find(n=>/^H[1-4]$/.test(n.tagName));if(header&&directTitle){directTitle.classList.add('card-title');header.append(directTitle);}
   if(card.id==='slot'){const nextTitle=card.querySelector('.slot-body h3');if(nextTitle&&header){let title=header.querySelector('.card-title');if(!title){title=document.createElement('h3');title.className='card-title';header.append(title);}title.textContent=nextTitle.textContent;nextTitle.remove();}}
   card.querySelectorAll('details').forEach(details=>{details.open=true;const summary=details.querySelector('summary');if(summary)summary.hidden=true;});
   card.querySelectorAll('.kind,.badge,.card-pill').forEach(pill=>{if(pill.textContent.trim()==='Interactive')pill.classList.add('ui-interactive');});resize(card);
   card.querySelectorAll('button[data-reveal]').forEach(b=>{b.hidden=true;const target=document.getElementById(b.getAttribute('aria-controls'));if(target)target.hidden=false;});
   card.querySelectorAll('.card-visual>svg,.scene>svg').forEach(svg=>{const width=svg.viewBox?.baseVal?.width;if(width)svg.style.setProperty('--visual-min-width',Math.max(520,width)+'px');});
  });
  document.querySelectorAll('button').forEach(button=>{
   const label=(button.getAttribute('aria-label')||button.title||button.textContent).trim();
   if(button.querySelector('use[href$="Star"]'))button.classList.add('ui-star');
   if(/Still unclear|Thumbs down/i.test(label)||button.querySelector('use[href$="ThumbsDown"]'))button.classList.add('ui-down');
   if(button.textContent.trim()==='Generate'&&button.closest('.review'))button.textContent='Accept';
   if(button.textContent.trim()==='Edit'&&button.closest('.review'))button.textContent='Edit card';
   if(button.textContent.trim()==='Draw again')button.classList.add('ui-draw');
   if((/^(Go to card|View card)/i.test(label))&&!button.dataset.uiFocus){button.dataset.uiFocus='true';const svg=button.querySelector('svg');if(svg)svg.outerHTML=focusIcon;else if(button.textContent.trim()==='↗')button.innerHTML=focusIcon;}
  });
 }
 // Populate the formerly code-only contracts with concrete current-card content.
 const template=document.getElementById('generated-card-shell');
 if(template&&!document.querySelector('[data-generated-card]:not(template *)')){
  const frag=template.content.cloneNode(true);const kind=frag.querySelector('[data-slot=kind]'),title=frag.querySelector('[data-slot=title]'),answer=frag.querySelector('[data-slot=answer]');if(kind)kind.textContent='Explanation';if(title)title.textContent='Follow one decision path';if(answer)answer.innerHTML='<p>A tree asks one question at a time. Follow the answer until you reach a prediction.</p>';document.querySelector('.catalog-preview')?.append(frag);
 }
 const reviewTemplate=document.getElementById('generation-review-shell');
 if(reviewTemplate&&document.querySelectorAll('article.review').length===0){const frag=reviewTemplate.content.cloneNode(true);frag.querySelector('[data-slot=command-label]')?.replaceChildren(document.createTextNode('Interactive'));frag.querySelector('[data-slot=title]')?.replaceChildren(document.createTextNode('Explore a decision tree'));const summary=frag.querySelector('[data-slot=summary]');if(summary){summary.hidden=false;summary.textContent='Change one parameter and see how the decision changes.';}document.querySelector('.catalog-preview')?.append(frag);}
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-menu-value')){const menu=button.closest('details');menu.querySelector('[data-current]').textContent=button.dataset.menuValue;menu.querySelectorAll('[data-menu-value]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));menu.open=false;menu.querySelector('summary').focus();}
  if(button.dataset.approve){const parent=button.closest('.proposal-stack,.specimen');const output=parent.querySelector('.approval-result');if(output)output.remove();button.closest('.acceptance-pill').hidden=true;}
  if(button.hasAttribute('data-chat-approve')){const box=button.closest('.chat-proposal');box.querySelectorAll('[data-chat-approve],[data-chat-edit],.chat-result').forEach(n=>n.remove());}
  if(button.hasAttribute('data-chat-edit')){const box=button.closest('.chat-proposal');if(!box.querySelector('textarea')){const input=document.createElement('textarea');input.setAttribute('aria-label','Edit card instructions');input.placeholder='Describe your changes…';input.style.cssText='width:100%;padding:10px;border:1px solid #dedfd8;border-radius:8px;font:15px/1.5 sans-serif';box.append(input);input.focus();}}
  if(button.hasAttribute('data-reply-focus'))button.closest('.comment-thread').querySelector('textarea').focus();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(event.target===document.body||event.target.closest('.proposal-stack .teaching-card'))){const accept=document.querySelector('.acceptance-pill:not([hidden]) [data-approve=accept]');if(accept){event.preventDefault();accept.click();}}if(event.key==='Escape')document.querySelectorAll('details.ui-select[open]').forEach(d=>{d.open=false;d.querySelector('summary').focus();});});
 document.querySelectorAll('[data-followup-form]').forEach(form=>{const input=form.querySelector('input'),send=form.querySelector('button[type=submit]');send.disabled=!input.value.trim();input.addEventListener('input',()=>send.disabled=!input.value.trim());});
 document.querySelectorAll('[data-followup-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const input=form.querySelector('input');if(!input.value.trim())return;const message=document.createElement('p');message.className='followup-message';message.textContent=input.value.trim();form.before(message);input.value='';form.querySelector('button[type=submit]').disabled=true;}));
 document.querySelectorAll('.reply-form').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const input=form.querySelector('textarea');if(!input.value.trim())return;const reply=document.createElement('article');reply.className='comment';const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent='Y';const body=document.createElement('div');const name=document.createElement('strong');name.textContent='You';const time=document.createElement('time');time.textContent=' · Just now';const text=document.createElement('p');text.textContent=input.value.trim();body.append(name,time,text);reply.append(avatar,body);form.closest('.comment-thread').querySelector('.replies').append(reply);input.value='';form.closest('.comment-thread').querySelector('.reply-status').textContent='Reply posted in this preview.';}));
 refresh();let scheduled=false;new MutationObserver(records=>{if(scheduled||!records.some(r=>r.addedNodes.length))return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}).observe(document.body,{childList:true,subtree:true});
})();
