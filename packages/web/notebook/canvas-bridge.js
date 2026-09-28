// Canvas notebook bridge (docs/features/canvas-notebook.md). Loaded only by the
// JupyterLite notebooks app. It is inert unless the page is framed by a canvas
// that sends `init`: the board owns the .ipynb document, this page only edits
// and runs it, reporting every change back to the one parent that opened it.
(() => {
  if (window.parent === window) return;
  const PROTOCOL = 'rh-notebook/1';
  let parentOrigin = null;
  let panel = null;
  const post = message => window.parent.postMessage({ protocol: PROTOCOL, ...message }, parentOrigin);

  // The canvas frame carries the title and the Run all / Restart actions, so the
  // app header and menu bar are hidden and the notebook fills the page; the
  // notebook toolbar stays. Lumino positions panels inline, hence !important.
  const style = document.createElement('style');
  style.textContent = [
    '#top-panel-wrapper, #menu-panel-wrapper { display: none !important; }',
    '#main-panel { top: 0 !important; height: 100% !important; }',
    'body, #main-panel, .jp-NotebookPanel, .jp-WindowedPanel-outer { background: #fff !important; }',
    '.jp-Notebook, .jp-NotebookPanel-notebook, .jp-WindowedPanel-inner { box-shadow: none !important; }',
  ].join(' ');
  document.head.appendChild(style);

  const openPanel = async () => {
    for (;;) {
      const widget = window.jupyterapp?.shell?.currentWidget;
      if (widget?.context && widget.sessionContext) {
        await widget.context.ready;
        await widget.sessionContext.ready;
        // Lay the panels out again now the header is gone.
        window.dispatchEvent(new Event('resize'));
        return widget;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const watch = () => {
    let timer = null;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        post({ type: 'change', ipynb: panel.context.model.toJSON() });
        // Memory storage only; saving keeps the document clean so leaving the
        // board never raises an unsaved-changes prompt.
        panel.context.save().catch(() => {});
      }, 400);
    };
    panel.context.model.contentChanged.connect(changed);
    panel.context.model.sharedModel.changed.connect(changed);
  };

  window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.data?.protocol !== PROTOCOL) return;
    if (parentOrigin && event.origin !== parentOrigin) return;
    const { type } = event.data;
    if (type === 'init' && !parentOrigin) {
      parentOrigin = event.origin;
      panel = await openPanel();
      if (event.data.ipynb) panel.context.model.fromJSON(event.data.ipynb);
      await panel.context.save();
      watch();
      post({ type: 'loaded' });
      return;
    }
    if (!panel) return;
    if (type === 'run-all') window.jupyterapp.commands.execute('notebook:run-all-cells');
    if (type === 'restart') panel.sessionContext.restartKernel();
  });
})();
