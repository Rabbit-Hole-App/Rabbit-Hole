// Canvas notebook bridge (docs/features/canvas-notebook.md). Loaded by the lab
// app of the canvas notebook site. Inert unless framed with a `workspace` id and
// sent `init` by its parent: then this page is that card's Jupyter workspace -
// its own files, its own kernel - and reports the active notebook, the active
// path and the file tree back to the one parent that opened it.
(() => {
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (window.parent === window || !/^[A-Za-z0-9-]{8,64}$/.test(workspace || '')) return;
  const PROTOCOL = 'rh-notebook/1';
  const DRAWER = 210;
  const MAX_ENTRIES = 300;
  let parentOrigin = null;
  let app = null;
  const post = message => window.parent.postMessage({ protocol: PROTOCOL, ...message }, parentOrigin);
  const debounce = (fn, ms) => { let timer = null; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; };
  // Paths come from the parent; keep them relative and inside the workspace.
  const safePath = path => (typeof path === 'string' && path && !path.startsWith('/') && !path.split('/').includes('..') ? path : null);

  // One browser database per card: the files of one notebook card are never in
  // another's. The name is set after config-utils.js writes the page config and
  // before the app bundle (appended by it, loaded async) reads it.
  const config = document.getElementById('jupyter-config-data');
  new MutationObserver((records, observer) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.tagName !== 'SCRIPT' || !/bundle\.js/.test(node.src || '')) continue;
      const data = JSON.parse(config.textContent);
      data.contentsStorageName = `rh-notebook-${workspace}`;
      config.textContent = JSON.stringify(data);
      observer.disconnect();
    }
  }).observe(document.head, { childList: true });

  // The canvas card is the frame: no title bar, menus, side tab strips or
  // status bar. Lumino positions panels inline, hence !important.
  const style = document.createElement('style');
  style.textContent = [
    '#jp-top-panel, #jp-menu-panel, #jp-bottom-panel, .jp-SideBar { display: none !important; }',
    '#jp-main-content-panel { top: 0 !important; height: 100% !important; }',
    '#jp-main-vsplit-panel { left: 0 !important; width: 100% !important; }',
    'body, .jp-NotebookPanel, .jp-WindowedPanel-outer { background: #fff !important; }',
    '.jp-Notebook, .jp-NotebookPanel-notebook, .jp-WindowedPanel-inner { box-shadow: none !important; }',
    // The Files drawer is narrow: icon-only toolbar (captions stay as tooltips).
    '#jp-left-stack, #jp-left-stack .jp-SidePanel, .jp-FileBrowser { min-width: 0 !important; }',
    '.jp-FileBrowser-toolbar .jp-ToolbarButtonComponent-label { display: none !important; }',
  ].join(' ');
  document.head.appendChild(style);

  const started = async () => {
    while (!window.jupyterapp?.restored) await new Promise(resolve => setTimeout(resolve, 100));
    await window.jupyterapp.restored;
    return window.jupyterapp;
  };
  const exists = path => app.serviceManager.contents.get(path, { content: false }).then(() => true, () => false);
  const makeDirs = async path => {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) {
      const dir = parts.slice(0, i).join('/');
      if (!(await exists(dir))) await app.serviceManager.contents.save(dir, { type: 'directory' });
    }
  };
  const tree = async (path = '', out = []) => {
    const listing = await app.serviceManager.contents.get(path, { content: true });
    for (const item of listing.content) {
      if (out.length >= MAX_ENTRIES) break;
      out.push(item.type === 'directory' ? `${item.path}/` : item.path);
      if (item.type === 'directory') await tree(item.path, out);
    }
    return out;
  };
  const isNotebook = widget => !!widget?.content?.model?.cells && !!widget.sessionContext;

  const report = debounce(async () => {
    const widget = app.shell.currentWidget;
    post({ type: 'state', active_path: widget?.context?.path ?? null, active_kind: isNotebook(widget) ? 'notebook' : widget?.context ? 'file' : null, files: await tree() });
  }, 300);

  // Every open document saves itself shortly after an edit, so files persist
  // without Jupyter's two-minute autosave; notebooks also report their document.
  const watched = new WeakSet();
  const follow = () => {
    const widget = app.shell.currentWidget;
    report();
    if (!widget?.context || watched.has(widget)) return;
    watched.add(widget);
    const { context } = widget;
    context.ready.then(() => {
      const changed = debounce(() => {
        if (isNotebook(widget)) post({ type: 'change', path: context.path, ipynb: context.model.toJSON() });
        if (context.model.dirty) context.save().catch(() => {});
      }, 400);
      context.model.contentChanged.connect(changed);
      context.model.sharedModel?.changed?.connect(changed);
      context.pathChanged.connect(report);
    });
  };

  // One click on a file in the drawer opens it in the card (Jupyter wants two);
  // a folder opens the same way. The browser has already selected the row.
  document.addEventListener('click', event => {
    const row = event.target.closest?.('.jp-DirListing-item');
    if (!app || !row || event.detail > 1 || event.shiftKey || event.ctrlKey || event.metaKey || row.querySelector('input.jp-DirListing-editor')) return;
    setTimeout(() => app.commands.execute('filebrowser:open'));
  });

  const drawer = open => {
    if (!open) { app.shell.collapseLeft(); return; }
    app.shell.activateById('filebrowser');
    app.shell.expandLeft();
    // ponytail: private split panel; the drawer keeps its width only until the card is resized
    app.shell._hsplitPanel?.setRelativeSizes([DRAWER, Math.max(1, window.innerWidth - DRAWER), 0]);
  };

  window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.data?.protocol !== PROTOCOL) return;
    if (parentOrigin && event.origin !== parentOrigin) return;
    const { type } = event.data;
    if (type === 'init' && !parentOrigin) {
      parentOrigin = event.origin;
      app = await started();
      const { contents } = app.serviceManager;
      // A new, copied or cleared workspace is seeded from the card: its files,
      // then the saved copy of its active notebook.
      if (!(await contents.get('', { content: true })).content.length) {
        for (const [path, content] of Object.entries(event.data.seed_files || {})) {
          if (!safePath(path)) continue;
          await makeDirs(path);
          await contents.save(path, { type: 'file', format: 'text', content });
        }
      }
      const active = safePath(event.data.active_path) || 'notebook.ipynb';
      const copyPath = safePath(event.data.ipynb_path) || active;
      if (copyPath.endsWith('.ipynb') && event.data.ipynb && !(await exists(copyPath))) {
        await makeDirs(copyPath);
        await contents.save(copyPath, { type: 'notebook', format: 'json', content: event.data.ipynb });
      }
      drawer(false);
      const opening = (await exists(active)) ? active : copyPath;
      if (await exists(opening)) await app.commands.execute('docmanager:open', { path: opening });
      app.shell.currentChanged.connect(follow);
      contents.fileChanged.connect(report);
      follow();
      // No focus taken from the canvas until the learner clicks in.
      document.activeElement?.blur?.();
      post({ type: 'loaded' });
      return;
    }
    if (!app) return;
    const widget = app.shell.currentWidget;
    if (type === 'files') drawer(!!event.data.open);
    if (type === 'run-all' && isNotebook(widget)) app.commands.execute('notebook:run-all-cells');
    if (type === 'restart' && isNotebook(widget)) widget.sessionContext.restartKernel();
  });
})();
