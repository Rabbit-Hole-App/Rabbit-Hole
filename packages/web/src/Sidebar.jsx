import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, ChevronDown, ChevronRight, ChevronsLeft, Copy, ExternalLink, Folder, FolderPlus, Link, LogOut, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Settings, Trash2, Users, X } from 'lucide-react';
import { ago, api, getTheme, navigate, sectionOf, setTheme, wsName } from './api.js';
import { Avatar, Button, cn, ConfirmDialog, IconBtn, KindIcon, Menu, MenuItem, Select, ShareInput, SlidePanel, toast } from './ui.jsx';

// Settings (workspace dropdown → Settings): Appearance only for now, Notion-style.
const THEMES = { System: 'system', Light: 'light', Dark: 'dark' };
function SettingsDialog({ onClose }) {
  const [theme, setThemeState] = useState(() => getTheme());
  const label = Object.keys(THEMES).find((k) => THEMES[k] === theme);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div className="mt-[24vh] w-[420px] max-w-[90vw] rounded-md bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <div className="text-sm font-semibold">Settings</div>
          <IconBtn aria-label="Close" onClick={onClose}><X size={14} /></IconBtn>
        </div>
        <div className="grid grid-cols-[160px_1fr] items-center gap-x-4 py-1">
          <div>
            <div className="text-sm font-medium">Appearance</div>
            <div className="text-xs text-ink-2">How the dashboard looks on this device.</div>
          </div>
          <Select
            value={label}
            options={Object.keys(THEMES)}
            onChange={(k) => { setThemeState(THEMES[k]); setTheme(THEMES[k]); }}
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] items-center gap-x-4 py-1">
          <div>
            <div className="text-sm font-medium">Slack</div>
            <div className="text-xs text-ink-2">@small in channels, proposals as buttons.</div>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => window.open('/slack/install', '_blank', 'noopener')}>
              Connect Slack
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Notion-style sidebar: workspace row, search, folders (drag apps in), recent, members.
// Resizable by dragging the right edge (200–400px).
export default function Sidebar({ org, email, apps, folders, width = 260, onResize, onReload, onCollapse }) {
  const [dragging, setDragging] = useState(null);
  const [closed, setClosed] = useState({}); // folder id -> collapsed
  const [newFolder, setNewFolder] = useState(null);
  const [menuFor, setMenuFor] = useState(null); // app name with its ⋯ menu open
  const [confirmDel, setConfirmDel] = useState(null); // app name pending delete
  const [confirmFolder, setConfirmFolder] = useState(null); // { id, name }
  const [folderMenu, setFolderMenu] = useState(null); // folder id with ⋯ open
  const [renamingFolder, setRenamingFolder] = useState(null); // { id, value }
  const [shareFolder, setShareFolder] = useState(null); // folder id for the share panel
  const [fShare, setFShare] = useState(''); // email or #team being typed
  const [pool, setPool] = useState({ people: [], teams: [] }); // autocomplete sources
  const [renamingApp, setRenamingApp] = useState(null); // { from, value }
  const [dropTarget, setDropTarget] = useState(null); // 'folder:<id>' | 'root' | 'private' while dragging over
  const [confirmMove, setConfirmMove] = useState(null); // { name, folderId, visibility, label }

  const loadPool = () => Promise.all([
    api('/api/members').then((d) => d.members).catch(() => []),
    api('/api/teams').then((d) => d.teams).catch(() => []),
  ]).then(([people, teams]) => setPool({ people, teams }));
  const [wsMenu, setWsMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [watchObs, setWatchObs] = useState([]);
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchMenu, setWatchMenu] = useState(null);
  // read = inbox semantics: opening the panel clears the badge; the observation
  // itself stays until it resolves or is dismissed. Per device (localStorage).
  const [readAt, setReadAt] = useState(() => localStorage.getItem('small.watchReadAt') || '');
  const [panelReadAt, setPanelReadAt] = useState(''); // snapshot at open — rows dim against this, not the fresh mark
  const unread = watchObs.filter((o) => o.first_seen > readAt);
  const markRead = () => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    setPanelReadAt(readAt);
    localStorage.setItem('small.watchReadAt', now);
    setReadAt(now);
  };
  const loadWatch = () => api('/api/watch').then((d) => setWatchObs(d.observations || [])).catch(() => {});
  useEffect(() => { loadWatch(); }, []);
  const dismissObs = async (id, days) => {
    setWatchMenu(null);
    try {
      await api(`/api/watch/${id}/dismiss`, { method: 'POST', body: JSON.stringify({ days }) });
      loadWatch();
    } catch (e) { toast(`✗ ${e.message}`); }
  };
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState(null); // { trash: [...], email }
  const path = window.location.pathname;
  const section = new URLSearchParams(window.location.search).get('s');

  const openTrash = () => {
    setTrashOpen(true);
    api('/api/trash').then(setTrash).catch(() => setTrash({ trash: [], email }));
  };
  const restore = async (name) => {
    try {
      await api(`/api/apps/${name}/restore`, { method: 'POST' });
      toast(`Restored ${name}`);
      api('/api/trash').then(setTrash).catch(() => {});
      onReload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    }
  };

  const startResize = (e) => {
    e.preventDefault();
    const move = (ev) => onResize(Math.min(400, Math.max(200, ev.clientX)));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const deleteApp = async (name) => {
    setConfirmDel(null);
    try {
      await api(`/api/apps/${name}`, { method: 'DELETE' });
      toast(`Deleted ${name}`);
      onReload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    }
  };

  // Dropping between sections changes visibility; dropping on a folder files it
  // (folders live in the workspace section, so that also makes it domain-visible).
  // Every drop confirms first — moving can change who has access.
  const drop = (folderId, visibility, label) => {
    if (!dragging) return;
    const name = dragging;
    setDragging(null);
    setDropTarget(null);
    const a = apps.find((x) => x.name === name);
    if (!a) return;
    const sameFolder = (a.folder_id || null) === (folderId || null);
    const sameVis = !visibility || a.visibility === visibility;
    if (sameFolder && sameVis) return; // dropped where it already lives
    setConfirmMove({ name, folderId, visibility, label });
  };

  const applyMove = async () => {
    const { name, folderId, visibility } = confirmMove;
    setConfirmMove(null);
    try {
      await api(`/api/apps/${name}`, { method: 'PATCH', body: JSON.stringify({ folder: folderId, ...(visibility ? { visibility } : {}) }) });
      onReload();
    } catch (e) { toast(`✗ ${e.message}`); }
  };

  const appRow = (a, menu = true) => (
    <div key={`${a.org}/${a.name}`} className="group/r relative">
      {renamingApp?.from === a.name ? (
        <form
          className="py-0.5 pl-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = renamingApp.value.trim().toLowerCase();
            setRenamingApp(null);
            if (!name || name === a.name) return;
            try { await api(`/api/apps/${a.name}/rename`, { method: 'POST', body: JSON.stringify({ name }) }); toast(`Renamed to ${name}`); onReload(); } catch (err) { toast(`✗ ${err.message}`); }
          }}
        >
          <input
            autoFocus
            value={renamingApp.value}
            onChange={(e) => setRenamingApp({ ...renamingApp, value: e.target.value })}
            onBlur={() => setRenamingApp(null)}
            className="h-6 w-full rounded-sm bg-hover px-2 text-sm outline-none"
          />
        </form>
      ) : (
      <div
        draggable={menu}
        onDragStart={menu ? (e) => { setDragging(a.name); e.dataTransfer.setData('text/plain', a.name); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onDragEnd={menu ? () => { setDragging(null); setDropTarget(null); } : undefined}
        onClick={() => navigate(`/apps/${a.name}`)}
        className={cn(
          'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover',
          path === `/apps/${a.name}` && 'bg-active font-medium', // you are here
        )}
      >
        <KindIcon kind={a.kind} schedule={a.schedule} />
        <span className="min-w-0 flex-1 truncate">{a.name}</span>
        {((a.members?.length || 0) > 0 || (a.team_count || 0) > 0) && (
          <Users size={11} className="shrink-0 text-ink-3" title="shared" />
        )}
        {menu ? (
          <IconBtn
            title="More"
            onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === a.name ? null : a.name); }}
            className="-mr-1 opacity-0 group-hover/r:opacity-100"
          >
            <MoreHorizontal size={16} strokeWidth={1.5} />
          </IconBtn>
        ) : (
          // rows without a ⋯ (Recent) reserve its slot so the shared icon lines up across sections
          <span className="-mr-1 h-7 w-7 shrink-0" />
        )}
      </div>
      )}
      {menu && (
        <Menu open={menuFor === a.name} onClose={() => setMenuFor(null)} className="top-7 left-0 max-w-52">
          <MenuItem icon={ExternalLink} onClick={() => { setMenuFor(null); navigate(`/apps/${a.name}`); }}>Open</MenuItem>
          <MenuItem
            icon={Link}
            onClick={() => { setMenuFor(null); navigator.clipboard.writeText(`${window.location.origin}/apps/${a.name}`); toast('Link copied'); }}
          >
            Copy link
          </MenuItem>
          {a.canEdit && (
            <MenuItem icon={Pencil} onClick={() => { setMenuFor(null); setRenamingApp({ from: a.name, value: a.name }); }}>
              Rename
            </MenuItem>
          )}
          <MenuItem
            icon={Copy}
            onClick={async () => {
              setMenuFor(null);
              try {
                const r = await api(`/api/apps/${a.name}/duplicate`, { method: 'POST' });
                toast(`Duplicated as ${r.name}`);
                onReload();
              } catch (e) { toast(`✗ ${e.message}`); }
            }}
          >
            Duplicate
          </MenuItem>
          {a.owner_email === email && (
            <MenuItem icon={Trash2} className="text-danger" onClick={() => { setMenuFor(null); setConfirmDel(a.name); }}>
              Move to Trash
            </MenuItem>
          )}
        </Menu>
      )}
    </div>
  );

  const workspaceApps = apps.filter((a) => sectionOf(a, org, email) === 'apps');
  const privateApps = apps.filter((a) => sectionOf(a, org, email) === 'private');
  const sharedApps = apps.filter((a) => sectionOf(a, org, email) === 'shared');
  const rootApps = workspaceApps.filter((a) => !a.folder_id || !folders.some((f) => f.id === a.folder_id));
  // an app made private while filed keeps folder_id, but lives in Private only — no double listing
  const inFolder = (f) => workspaceApps.filter((a) => a.folder_id === f.id);
  const recent = JSON.parse(localStorage.getItem('small.recent') || '[]')
    .map((n) => apps.find((a) => a.name === n))
    .filter(Boolean)
    .slice(0, 3);

  // live folder object (folders refetch on every change; an id survives, a snapshot wouldn't)
  const sharedFolderObj = shareFolder && folders.find((f) => f.id === shareFolder);
  const shareFolderCall = async (body) => {
    try {
      await api(`/api/folders/${shareFolder}/share`, { method: 'POST', body: JSON.stringify(body) });
      onReload();
    } catch (e) { toast(`✗ ${e.message}`); }
  };

  // sections collapse like folders: v open, > closed, remembered per device
  const [secClosed, setSecClosed] = useState(() => JSON.parse(localStorage.getItem('small.secClosed') || '{}'));
  const toggleSec = (k) => setSecClosed((s) => {
    const next = { ...s, [k]: !s[k] };
    localStorage.setItem('small.secClosed', JSON.stringify(next));
    return next;
  });
  const sectionLabel = (label, s, extra) => {
    const k = s || label.toLowerCase();
    return (
      <div className="flex items-center justify-between pt-3 pr-1 pb-1 pl-0.5">
        <span className="flex min-w-0 items-center">
          <button
            aria-label={secClosed[k] ? `Expand ${label}` : `Collapse ${label}`}
            onClick={() => toggleSec(k)}
            className="cursor-pointer rounded-sm p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
          >
            {secClosed[k] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={() => navigate(s ? `/apps?s=${s}` : '/apps')}
            className={cn(
              'rounded-sm px-1 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink',
              path === '/apps' && (section || null) === (s || null) && 'bg-active font-medium text-ink',
            )}
          >
            {label}
          </button>
        </span>
        {extra}
      </div>
    );
  };

  return (
    <aside
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragging(null); setDropTarget(null); }} // outside a real target = cancel
      style={{ width }}
      className="group/sb relative flex shrink-0 flex-col overflow-y-auto border-r border-line bg-side px-2 py-2 max-md:hidden"
    >
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        className="absolute inset-y-0 -right-0.5 z-10 w-1.5 cursor-col-resize hover:bg-line-strong/70"
      />
      {confirmDel && (
        <ConfirmDialog
          title={`Move ${confirmDel} to Trash?`}
          body="It stops being reachable. Restore it from Trash within 30 days; after that it's gone for good."
          confirmLabel="Move to Trash"
          onConfirm={() => deleteApp(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {confirmMove && (
        <ConfirmDialog
          title={`Move ${confirmMove.name} ${confirmMove.label}?`}
          body={confirmMove.visibility === 'private'
            ? 'It leaves the workspace section — only people (and teams) it is shared with keep access.'
            : `Anyone at ${org.replace(/-/g, '.')} will be able to view it.`}
          confirmLabel="Move"
          onConfirm={applyMove}
          onCancel={() => setConfirmMove(null)}
        />
      )}
      {confirmFolder && (
        <ConfirmDialog
          title={`Delete folder ${confirmFolder.name}?`}
          body="Apps inside move back to the root of the sidebar."
          onConfirm={async () => {
            const id = confirmFolder.id;
            setConfirmFolder(null);
            try { await api(`/api/folders/${id}/delete`, { method: 'POST' }); onReload(); } catch (e) { toast(`✗ ${e.message}`); }
          }}
          onCancel={() => setConfirmFolder(null)}
        />
      )}
      <div className="relative shrink-0">
        <div className="flex h-9 items-center gap-2 px-2">
          <button
            onClick={() => setWsMenu(!wsMenu)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 pr-1 text-left hover:bg-hover"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink text-[11px] font-semibold text-white">{wsName(org)[0]}</span>
            <span className="truncate text-sm font-medium">{wsName(org)}</span>
            <ChevronDown size={12} className="shrink-0 text-ink-3 opacity-0 group-hover/sb:opacity-100" />
          </button>
          <IconBtn title="Close sidebar" onClick={onCollapse} className="opacity-0 group-hover/sb:opacity-100">
            <ChevronsLeft size={15} />
          </IconBtn>
        </div>
        {/* fixed!: the sidebar is a scroll container and clips anything wider than
            itself — pinning to the viewport lets the menu fit the full email */}
        <Menu open={wsMenu} onClose={() => setWsMenu(false)} className="fixed! top-11 left-3 w-auto! min-w-60 max-w-[340px]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {email && <Avatar email={email} />}
            <span className="text-xs whitespace-nowrap text-ink-2">{email}</span>
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Settings} onClick={() => { setWsMenu(false); setShowSettings(true); }}>Settings</MenuItem>
          <MenuItem icon={Plus} onClick={() => { setWsMenu(false); toast('One workspace per email domain for now'); }}>New workspace</MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={LogOut} onClick={() => { window.location.href = '/logout'; }}>Log out</MenuItem>
        </Menu>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}

      <div
        onClick={() => window.dispatchEvent(new CustomEvent('small:search'))}
        className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover"
      >
        <Search size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
        Search
        <span className="ml-auto text-xs text-ink-3">Ctrl K</span>
      </div>

      {/* Watch notifications — badge shows open observations, click opens the list */}
      <div
        onClick={() => { setWatchOpen(true); loadWatch(); markRead(); }}
        className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover"
      >
        <Bell size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
        Notifications
        {unread.length > 0 && (
          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-semibold text-white">
            {unread.length}
          </span>
        )}
      </div>
      {watchOpen && (
        <SlidePanel title="Notifications" width={440} onClose={() => setWatchOpen(false)}>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {watchObs.length === 0 && <div className="pt-2 text-sm text-ink-2">Nothing to report — Watch runs nightly.</div>}
            {watchObs.map((o) => (
              <div
                key={o.id}
                onClick={() => { setWatchOpen(false); navigate(`/apps/${o.slug}`); }}
                className={cn('flex cursor-pointer items-start gap-2 rounded-sm border-b border-line px-1 py-2.5 text-sm hover:bg-hover', o.first_seen > panelReadAt ? '' : 'opacity-70')}
              >
                <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{o.slug}</span>
                  <div className="text-ink-2">{o.text}</div>
                  <div className="pt-0.5 text-xs text-ink-3">{o.check} · {ago(o.last_seen)}</div>
                </div>
                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); setWatchMenu(watchMenu === o.id ? null : o.id); }}
                    className="cursor-pointer rounded-sm px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
                  >
                    Dismiss ▾
                  </button>
                  <Menu open={watchMenu === o.id} onClose={() => setWatchMenu(null)} className="top-6 right-0 w-32">
                    <MenuItem onClick={() => dismissObs(o.id, 30)}>30 days</MenuItem>
                    <MenuItem onClick={() => dismissObs(o.id, null)}>Forever</MenuItem>
                  </Menu>
                </div>
              </div>
            ))}
          </div>
        </SlidePanel>
      )}

      {sectionLabel('Apps', null, (
        <span className="flex items-center gap-0.5">
          <button
            title="New folder"
            onClick={() => setNewFolder('')}
            className="cursor-pointer rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/sb:opacity-100 hover:bg-hover hover:text-ink"
          >
            <FolderPlus size={13} />
          </button>
          <button
            title="New app — copy the deploy command"
            onClick={() => { navigator.clipboard.writeText('small deploy'); toast('Copied — run this in your project'); }}
            className="cursor-pointer rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/sb:opacity-100 hover:bg-hover hover:text-ink"
          >
            <Plus size={13} />
          </button>
        </span>
      ))}
      {newFolder !== null && (
        <form
          className="px-2 py-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (newFolder.trim()) { try { await api('/api/folders', { method: 'POST', body: JSON.stringify({ name: newFolder.trim() }) }); onReload(); } catch {} }
            setNewFolder(null);
          }}
        >
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onBlur={() => setNewFolder(null)}
            placeholder="Folder name"
            className="h-6 w-full rounded-sm bg-hover px-2 text-sm outline-none placeholder:text-ink-2"
          />
        </form>
      )}
      {!secClosed.apps && folders.map((f) => {
        const inside = inFolder(f);
        const isOpen = !closed[f.id];
        return (
          <div
            key={f.id}
            onDragOver={(e) => { e.preventDefault(); if (dragging) setDropTarget(`folder:${f.id}`); }}
            onDragLeave={() => setDropTarget((t) => (t === `folder:${f.id}` ? null : t))}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(f.id, 'domain', `into the folder ${f.name}`); }}
            className={cn('rounded-sm', dropTarget === `folder:${f.id}` && 'bg-active outline-1 outline-line-strong')}
          >
            <div className="group/f relative flex items-center">
              {renamingFolder?.id === f.id ? (
                <form
                  className="flex-1 py-0.5 pl-6"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = renamingFolder.value.trim();
                    setRenamingFolder(null);
                    if (!name || name === f.name) return;
                    try { await api(`/api/folders/${f.id}/rename`, { method: 'POST', body: JSON.stringify({ name }) }); onReload(); } catch (err) { toast(`✗ ${err.message}`); }
                  }}
                >
                  <input
                    autoFocus
                    value={renamingFolder.value}
                    onChange={(e) => setRenamingFolder({ ...renamingFolder, value: e.target.value })}
                    onBlur={() => setRenamingFolder(null)}
                    className="h-6 w-full rounded-sm bg-hover px-2 text-sm outline-none"
                  />
                </form>
              ) : (
                <button
                  onClick={() => setClosed({ ...closed, [f.id]: isOpen })}
                  className={cn('flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', dragging && 'bg-hover/60')}
                >
                  {isOpen ? <ChevronDown size={12} className="shrink-0 text-ink-2" /> : <ChevronRight size={12} className="shrink-0 text-ink-2" />}
                  <Folder size={13} className="shrink-0 text-ink-2" />
                  <span className="truncate">{f.name}</span>
                  {(f.shares || []).length > 0 && <Users size={11} className="shrink-0 text-ink-3" title="shared" />}
                </button>
              )}
              <IconBtn
                title="More"
                onClick={() => setFolderMenu(folderMenu === f.id ? null : f.id)}
                className="-mr-1 opacity-0 group-hover/f:opacity-100"
              >
                <MoreHorizontal size={16} strokeWidth={1.5} />
              </IconBtn>
              <Menu open={folderMenu === f.id} onClose={() => setFolderMenu(null)} className="top-7 left-2 max-w-52">
                <MenuItem icon={Users} onClick={() => { setFolderMenu(null); setShareFolder(f.id); setFShare(''); loadPool(); }}>Share folder</MenuItem>
                <MenuItem icon={Pencil} onClick={() => { setFolderMenu(null); setRenamingFolder({ id: f.id, value: f.name }); }}>Rename</MenuItem>
                <MenuItem icon={Trash2} className="text-danger" onClick={() => { setFolderMenu(null); setConfirmFolder({ id: f.id, name: f.name }); }}>Delete</MenuItem>
              </Menu>
            </div>
            {isOpen && <div className="ml-4">{inside.map((a) => appRow(a))}</div>}
          </div>
        );
      })}
      <div
        className={cn('min-h-4 rounded-sm', dropTarget === 'root' && 'bg-active outline-1 outline-line-strong')}
        onDragOver={(e) => { e.preventDefault(); if (dragging) setDropTarget('root'); }}
        onDragLeave={() => setDropTarget((t) => (t === 'root' ? null : t))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(null, 'domain', 'to Apps'); }}
      >
        {!secClosed.apps && rootApps.map((a) => appRow(a))}
      </div>

      {sharedApps.length > 0 && (
        <>
          {sectionLabel('Shared', 'shared')}
          {!secClosed.shared && sharedApps.map((a) => appRow(a))}
        </>
      )}

      <div
        className={cn('rounded-sm', dropTarget === 'private' && 'bg-active outline-1 outline-line-strong')}
        onDragOver={(e) => { e.preventDefault(); if (dragging) setDropTarget('private'); }}
        onDragLeave={() => setDropTarget((t) => (t === 'private' ? null : t))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(null, 'private', 'to Private'); }}
      >
        {sectionLabel('Private', 'private')}
        {!secClosed.private && privateApps.length === 0 && <div className="px-2 pb-1 text-xs text-ink-3">Drag apps here to make them private.</div>}
        {!secClosed.private && privateApps.map((a) => appRow(a))}
      </div>

      {recent.length > 0 && (
        <>
          <div className="flex items-center pt-3 pb-1 pl-0.5">
            <button
              aria-label={secClosed.recent ? 'Expand Recent' : 'Collapse Recent'}
              onClick={() => toggleSec('recent')}
              className="cursor-pointer rounded-sm p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
            >
              {secClosed.recent ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            <span className="px-1 text-xs text-ink-2">Recent</span>
          </div>
          {!secClosed.recent && recent.map((a) => appRow(a, false))}
        </>
      )}

      <div className="mt-auto shrink-0 pt-3">
        <button
          onClick={() => navigate('/members')}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover',
            path === '/members' && 'bg-active font-medium',
          )}
        >
          <Users size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          Members
        </button>
        <button
          onClick={openTrash}
          className={cn('flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', trashOpen && 'bg-active font-medium')}
        >
          <Trash2 size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          Trash
        </button>
      </div>

      {sharedFolderObj && (
        <SlidePanel title={`Share folder ${sharedFolderObj.name}`} width={400} onClose={() => setShareFolder(null)}>
          <div className="flex min-h-0 flex-1 flex-col px-5">
            <form
              className="pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = fShare.trim().toLowerCase();
                if (v.startsWith('#') && v.length > 1) shareFolderCall({ team: v, role: 'view' });
                else if (v.includes('@')) shareFolderCall({ email: v, role: 'view' });
                else return;
                setFShare('');
              }}
            >
              <ShareInput
                autoFocus
                value={fShare}
                onChange={setFShare}
                onPick={(it) => { shareFolderCall({ ...it, role: 'view' }); setFShare(''); }}
                people={pool.people}
                teams={pool.teams}
                exclude={(sharedFolderObj.shares || []).map((s) => (s.team ? `#${s.team}` : s.email))}
                placeholder="Add people by email, teams by #…"
              />
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(sharedFolderObj.shares || []).length === 0 && (
                <div className="pt-1 text-sm text-ink-2">Not shared — everyone gets access to every app in this folder when you add them.</div>
              )}
              {(sharedFolderObj.shares || []).map((s) => (
                <div key={s.team || s.email} className="group/fs flex h-8 items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover">
                  {s.team
                    ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hover ring-1 ring-white"><Users size={12} className="text-ink-2" /></span>
                    : <Avatar email={s.email} />}
                  <span className="min-w-0 flex-1 truncate">{s.team ? `#${s.team}` : s.email}</span>
                  <select
                    value={s.role}
                    onChange={(e) => shareFolderCall({ email: s.email, team: s.team, role: e.target.value })}
                    className="rounded-sm text-xs text-ink-2 outline-none"
                  >
                    <option value="view">view</option>
                    <option value="edit">edit</option>
                  </select>
                  <button
                    aria-label={`Remove ${s.team ? `#${s.team}` : s.email}`}
                    onClick={() => shareFolderCall({ email: s.email, team: s.team, remove: true })}
                    className="rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/fs:opacity-100 hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-line py-2 text-xs text-ink-3">
              Applies to every app in the folder, now and later.
            </div>
          </div>
        </SlidePanel>
      )}

      {trashOpen && (
        <SlidePanel title="Trash" width={400} onClose={() => setTrashOpen(false)}>
          <div className="flex min-h-0 flex-1 flex-col px-5">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {trash === null && <div className="pt-2 text-sm text-ink-2">loading…</div>}
              {trash?.trash.length === 0 && <div className="pt-2 text-sm text-ink-2">Nothing in the trash.</div>}
              {(trash?.trash || []).map((t) => (
                <div key={t.name} className="group/tr flex h-9 items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover">
                  <KindIcon kind={t.kind} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-ink-3">{ago(t.deleted_at)}</span>
                  {t.owner_email === trash.email && (
                    <Button size="sm" className="opacity-0 group-hover/tr:opacity-100" onClick={() => restore(t.name)}>
                      <RotateCcw size={13} strokeWidth={1.5} /> Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-line py-2 text-xs text-ink-3">
              Items in Trash are deleted forever after 30 days.
            </div>
          </div>
        </SlidePanel>
      )}
    </aside>
  );
}
