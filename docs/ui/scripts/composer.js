(() => {
    const composer=document.getElementById('rh-composer'),form=document.getElementById('rh-composer-form'),message=document.getElementById('rh-message'),send=document.getElementById('rh-send'),status=document.getElementById('rh-composer-status');
    let streaming=false;
    function updateSend(){send.disabled=!streaming&&!message.value.trim();send.dataset.streaming=String(streaming);send.setAttribute('aria-label',streaming?'Stop':'Send');send.title=streaming?'Stop':'Send';send.querySelector('use').setAttribute('href','../../../icons/source-headers.svg#i-'+(streaming?'Square':'ArrowUp'));}
    function fitMessage(){message.style.height='auto';message.style.height=message.scrollHeight+'px';}
    message.addEventListener('input',()=>{fitMessage();updateSend();});
    let width=message.clientWidth;new ResizeObserver(()=>{if(width!==message.clientWidth){width=message.clientWidth;fitMessage();}}).observe(message);
    form.addEventListener('submit',event=>{event.preventDefault();if(send.disabled)return;streaming=!streaming;updateSend();status.textContent=streaming?'Streaming preview.':'Preview stopped.';});
    const menus=[...composer.querySelectorAll('details')];
    menus.forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)menus.forEach(other=>{if(other!==menu)other.open=false;});}));
    document.addEventListener('click',event=>{if(!event.target.closest('.rh-menu'))menus.forEach(menu=>menu.open=false);});
    composer.addEventListener('keydown',event=>{if(event.key==='Escape')menus.forEach(menu=>{if(menu.open){menu.open=false;menu.querySelector('summary').focus();}});});
    composer.querySelectorAll('[data-rh-demo]').forEach(button=>button.addEventListener('click',()=>{status.textContent=button.dataset.rhDemo;menus.forEach(menu=>menu.open=false);}));
    composer.querySelectorAll('[data-depth]').forEach(button=>button.addEventListener('click',()=>{composer.querySelectorAll('[data-depth]').forEach(b=>b.removeAttribute('aria-current'));button.setAttribute('aria-current','true');document.getElementById('rh-depth').setAttribute('aria-label','Explanation depth: '+button.dataset.depth);status.textContent=button.dataset.depth+' depth selected.';button.closest('details').open=false;}));
    composer.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>{message.value=button.dataset.command+' ';button.closest('details').open=false;fitMessage();updateSend();message.focus();}));
    const toggle=document.getElementById('rh-toggle');toggle.addEventListener('click',()=>{const on=toggle.getAttribute('aria-checked')!=='true';toggle.setAttribute('aria-checked',String(on));toggle.querySelector('[data-toggle-label]').textContent=on?'On':'Off';});
    installResize(composer,composer.querySelector('.resize-handle'));fitMessage();updateSend();
  })();
