// Failure-only evidence for CI pointer failures: preserve the exact clicks and assertions.
// No delays, retries or forced events. Do not record page text, cookies or request bodies.
export async function installPointerDiagnostics(context) {
  await context.addInitScript(() => {
    const trace = [];
    window.__checkPointerTrace = trace;
    const rect = el => { const r = el?.getBoundingClientRect(); return r ? { x:r.x, y:r.y, width:r.width, height:r.height } : null; };
    const describe = el => el ? { tag:el.tagName, role:el.getAttribute?.('role'),
      label:el.getAttribute?.('aria-label'), inMenu:!!el.closest?.('[data-menu-button-open]'),
      graphNode:el.closest?.('[data-graph-node]')?.getAttribute('data-graph-node') ?? null } : null;
    const state = () => ({ viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY},
      menu:rect(document.querySelector('[data-menu-button-open]')),
      graph:rect(document.querySelector('[aria-label="Repository dependency graph"]')) });
    const record = entry => { trace.push({at:performance.now(), ...entry}); if(trace.length>160) trace.shift(); };
    const add = Document.prototype.addEventListener, remove = Document.prototype.removeEventListener;
    let nextId = 0;
    const listeners = new WeakMap();
    // Track document capture pointerdown handlers, including the menu's deferred listener.
    // Wrapping retains identity for removeEventListener and normal EventListener invocation.
    Document.prototype.addEventListener = function(type, listener, options) {
      if(type !== 'pointerdown' || !(options===true || options?.capture) || !listener) return add.call(this,type,listener,options);
      let item = listeners.get(listener);
      if(!item) {
        const id = ++nextId;
        item = {id, wrapped:function(event) {
          record({kind:'listener-invoke',id, target:describe(event.target)});
          return typeof listener==='function' ? listener.call(this,event) : listener.handleEvent(event);
        }};
        listeners.set(listener,item);
      }
      record({kind:'listener-add',id:item.id,containsCheck:String(listener).includes('contains')});
      return add.call(this,type,item.wrapped,options);
    };
    Document.prototype.removeEventListener = function(type, listener, options) {
      if(type === 'pointerdown' && (options===true || options?.capture) && listener) {
        const item = listeners.get(listener);
        if(item) { record({kind:'listener-remove',id:item.id}); return remove.call(this,type,item.wrapped,options); }
      }
      return remove.call(this,type,listener,options);
    };
    for(const kind of ['pointerdown','pointerup','pointercancel','lostpointercapture','click']) {
      add.call(document,kind,event=>record({kind,x:event.clientX,y:event.clientY,button:event.button,
        pointerId:event.pointerId,targetHasCapture:event.target?.hasPointerCapture?.(event.pointerId) ?? false,defaultPrevented:event.defaultPrevented,target:describe(event.target),
        hit:describe(document.elementFromPoint(event.clientX,event.clientY)),...state()}),true);
    }
  });
}

export async function reportPointerFailure(page, path, label, expected = {}) {
  // A diagnostic failure must never replace the original assertion failure.
  try {
    const evidence = await page.evaluate(expected => {
      const x = expected.x ?? (expected.measuredGraph?.left + expected.relativePoint?.x);
      const y = expected.y ?? (expected.measuredGraph?.top + expected.relativePoint?.y);
      const hit = document.elementFromPoint(x,y);
      const rect = el => { const r=el?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height} : null; };
      return {trace:window.__checkPointerTrace || [], failure:{hasFocus:document.hasFocus(),
        hit:{tag:hit?.tagName,role:hit?.getAttribute('role'),label:hit?.getAttribute('aria-label')},
        menu:rect(document.querySelector('[data-menu-button-open]')),
        graph:rect(document.querySelector('[aria-label="Repository dependency graph"]')),
        selectedNodes:document.querySelectorAll('[data-graph-node][data-selected]').length}};
    }, expected);
    console.error('POINTER_FAILURE', JSON.stringify({label,expected,...evidence}));
  } catch(error) { console.error('POINTER_DIAGNOSTIC_UNAVAILABLE', error.message); }
  try { await page.screenshot({path,fullPage:true}); console.error('POINTER_FAILURE_SCREENSHOT',path); }
  catch(error) { console.error('POINTER_SCREENSHOT_UNAVAILABLE',error.message); }
}
