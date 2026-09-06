import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Bell, Braces, Check, ChevronDown, ChevronRight, ChevronsLeft, CircleArrowUp, Copy, Download, ExternalLink, Folder, FolderPlus, Globe, LayoutGrid, LayoutPanelLeft, Link, LogOut, Mail, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Settings, Share2, Shield, SlidersHorizontal, Smile, Trash2, Users, X } from 'lucide-react';
import { ago, api, getTheme, navigate, sectionOf, setTheme, setWs, wsName } from './api.js';
import { AppIcon, Avatar, Button, cn, ConfirmDialog, IconBtn, Input, KindIcon, Mark, Menu, MenuItem, Select, ShareInput, SlidePanel, toast, Toggle } from './ui.jsx';

// Settings (workspace dropdown → Settings): Notion-style two-pane modal -
// left nav (Account / Workspace sections), right content per tab.
const THEMES = { System: 'system', Light: 'light', Dark: 'dark' };
function SettingsRow({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-8 py-3">
      <div>
        <div className="text-sm">{title}</div>
        {desc && <div className="pt-0.5 text-xs text-ink-2">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
// ponytail: nav copied verbatim from the Notion reference (user: "copy the same we
// will remove later") - most items render an empty pane until we prune/wire them.
function SettingsDialog({ email, onMarkRead, onClose }) {
  const [tab, setTab] = useState('preferences');
  const [theme, setThemeState] = useState(() => getTheme());
  const [enterNewline, setEnterNewline] = useState(false); // visual only
  const [textDir, setTextDir] = useState(false); // visual only
  const label = Object.keys(THEMES).find((k) => THEMES[k] === theme);
  const NavBtn = ({ id, icon: Icon, children }) => (
    <div
      onClick={() => setTab(id)}
      className={cn('flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm', tab === id ? 'bg-hover font-medium' : 'hover:bg-hover text-ink-2')}
    >
      <Icon size={15} strokeWidth={1.5} className="shrink-0" />
      {children}
    </div>
  );
  const NavLabel = ({ children }) => <div className="px-2 pt-4 pb-1 text-xs font-medium text-ink-3">{children}</div>;
  const Heading = ({ children }) => <div className="mt-9 border-b border-line pb-2 text-base font-medium">{children}</div>;
  const TITLES = { mail: 'Mail & Calendar', import: 'Import', mcp: 'Small MCP', pages: 'Public pages', emoji: 'Emoji' };
  // data behind the wired panes, loaded when their tab opens
  const [wsInfo, setWsInfo] = useState(null);
  const [teams, setTeams] = useState(null);
  const [people, setPeople] = useState(null);
  const [invite, setInvite] = useState('');
  const [wsRename, setWsRename] = useState(null); // null until the owner edits the name field
  const [askModel, setAskModel] = useState(() => localStorage.getItem('small.askModel') || 'auto');
  useEffect(() => {
    if ((tab === 'general' || tab === 'people') && !wsInfo) api('/api/workspaces').then(setWsInfo).catch(() => {});
    if (tab === 'teamspaces' && teams === null) api('/api/teams').then((d) => setTeams(d.teams || [])).catch(() => setTeams([]));
    if (tab === 'people' && people === null) api('/api/members').then((d) => setPeople(d.members || [])).catch(() => setPeople([]));
  }, [tab]);
  const activeWs = wsInfo?.workspaces?.find((w) => w.slug === wsInfo.active);
  const MODEL_LABELS = { auto: 'Auto', 'opus-5': 'Opus 5', 'sonnet-5': 'Sonnet 5', 'haiku-4.5': 'Haiku 4.5' };
  const copy = (t) => { navigator.clipboard.writeText(t); toast('Copied'); };
  const CodeCopy = ({ text }) => (
    <span className="flex items-center gap-1">
      <code className="rounded-sm bg-code px-1.5 py-0.5 text-xs">{text}</code>
      <IconBtn aria-label="Copy" onClick={() => copy(text)}><Copy size={13} strokeWidth={1.5} /></IconBtn>
    </span>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div className="flex h-[calc(100vh-100px)] max-h-[720px] w-[calc(100vw-100px)] max-w-[1150px] overflow-hidden rounded-2xl bg-white text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="w-[260px] shrink-0 overflow-y-auto border-r border-line bg-side py-4 px-3">
          <div className="px-2 pb-1 text-xs font-medium text-ink-3">Account</div>
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5">
            {email && <Avatar email={email} />}
            <span className="truncate text-sm" title={email}>{email}</span>
          </div>
          <NavBtn id="preferences" icon={SlidersHorizontal}>Preferences</NavBtn>
          <NavBtn id="notifications" icon={Bell}>Notifications</NavBtn>
          <NavBtn id="mail" icon={Mail}>Mail & Calendar</NavBtn>
          <NavLabel>Workspace</NavLabel>
          <NavBtn id="general" icon={Settings}>General</NavBtn>
          <NavBtn id="people" icon={Users}>People</NavBtn>
          <NavBtn id="import" icon={Download}>Import</NavBtn>
          <NavLabel>Features</NavLabel>
          <NavBtn id="ai" icon={Mark}>Small AI</NavBtn>
          <NavBtn id="connections" icon={LayoutGrid}>Connections</NavBtn>
          <NavBtn id="mcp" icon={Share2}>Small MCP</NavBtn>
          <NavBtn id="pages" icon={Globe}>Public pages</NavBtn>
          <NavBtn id="emoji" icon={Smile}>Emoji</NavBtn>
          <NavBtn id="developer" icon={Braces}>Developer</NavBtn>
          <NavLabel>Admin</NavLabel>
          <NavBtn id="teamspaces" icon={LayoutPanelLeft}>Teamspaces</NavBtn>
          <NavBtn id="security" icon={Shield}>Security</NavBtn>
          <NavBtn id="identity" icon={BadgeCheck}>Identity</NavBtn>
          <NavLabel>Access & billing</NavLabel>
          <div onClick={() => setTab('billing')} className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-accent hover:bg-hover">
            <CircleArrowUp size={15} strokeWidth={1.5} className="shrink-0" />
            Upgrade plan
          </div>
        </div>
        <div className="relative flex-1 overflow-y-auto">
          <IconBtn aria-label="Close" onClick={onClose} className="absolute top-3 right-3"><X size={14} /></IconBtn>
          <div className="mx-auto max-w-[920px] px-12 py-10">
          {tab === 'preferences' && (
            <>
              <div className="text-2xl font-semibold">Preferences</div>
              <div className="pt-2 text-base text-ink-2">Choose how you want small to look and behave</div>
              <Heading>Appearance</Heading>
              <SettingsRow title="Theme" desc="Choose a theme for small on this device">
                <Select
                  value={label}
                  options={Object.keys(THEMES)}
                  onChange={(k) => { setThemeState(THEMES[k]); setTheme(THEMES[k]); }}
                />
              </SettingsRow>
              <SettingsRow
                title={<span>High contrast <span className="ml-1 rounded-sm bg-hover px-1.5 py-0.5 text-[11px] text-ink-2">Beta</span></span>}
                desc="Increase contrast for improved visibility"
              >
                <Select value="Use system setting" options={['Use system setting', 'On', 'Off']} onChange={() => {}} />
              </SettingsRow>
              <Heading>Input options</Heading>
              <SettingsRow title="Use Enter to add a new line" desc="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send.">
                <Toggle on={enterNewline} onChange={setEnterNewline} />
              </SettingsRow>
              <Heading>Language & time</Heading>
              <SettingsRow title="Language" desc="Choose the language you want to use small in">
                <Select value="English (US)" options={['English (US)']} onChange={() => {}} />
              </SettingsRow>
              <SettingsRow title="Number format" desc="Choose how numbers and currencies are formatted. Default uses your language setting.">
                <Select value="Default" options={['Default']} onChange={() => {}} />
              </SettingsRow>
              <SettingsRow title="Always show text direction controls" desc="Show the option to change text direction (left to right or right to left) in the editor, regardless of what language you're using">
                <Toggle on={textDir} onChange={setTextDir} />
              </SettingsRow>
            </>
          )}
          {tab === 'notifications' && (
            <>
              <div className="text-2xl font-semibold">Notifications</div>
              <div className="pt-2 text-base text-ink-2">What Watch found, and where you hear about it</div>
              <Heading>Watch</Heading>
              <SettingsRow title="Sidebar bell" desc="New observations from the nightly pass light the bell.">
                <Button variant="secondary" size="sm" onClick={onMarkRead}>Mark all as read</Button>
              </SettingsRow>
              <SettingsRow title="Weekly email" desc="A summary lands every Monday 08:00 UTC." />
            </>
          )}
          {tab === 'connections' && (
            <>
              <div className="text-2xl font-semibold">Connections</div>
              <div className="pt-2 text-base text-ink-2">Bring small into the tools your team already uses</div>
              <Heading>Slack</Heading>
              <SettingsRow title="Slack" desc="@small in channels, /small commands, proposals as buttons.">
                <Button variant="soft" size="sm" onClick={() => window.open('/slack/install', '_blank', 'noopener')}>
                  Connect Slack
                </Button>
              </SettingsRow>
            </>
          )}
          {tab === 'general' && (
            <>
              <div className="text-2xl font-semibold">General</div>
              <div className="pt-2 text-base text-ink-2">The workspace you are in right now</div>
              <Heading>Workspace</Heading>
              <SettingsRow
                title="Name"
                desc={activeWs?.kind === 'custom' && activeWs?.role === 'owner'
                  ? 'Shown in the sidebar and breadcrumbs. Edit and save.'
                  : activeWs?.kind === 'custom'
                    ? 'Shown in the sidebar and breadcrumbs. Only the owner can rename it.'
                    : 'Named after your email domain'}
              >
                {activeWs?.kind === 'custom' && activeWs?.role === 'owner' ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const d = await api('/api/workspaces/rename', { method: 'POST', body: JSON.stringify({ name: wsRename }) });
                        toast(`Renamed to ${d.name}`);
                        setWsInfo(null); // refetch on next open
                        window.location.reload(); // sidebar + breadcrumbs pick the new name up
                      } catch (er) { toast(`✗ ${er.message}`); }
                    }}
                  >
                    <Input
                      value={wsRename ?? (activeWs.name || '')}
                      onChange={(e) => setWsRename(e.target.value)}
                      className="w-56"
                      aria-label="Workspace name"
                    />
                    <Button variant="secondary" size="sm" type="submit" disabled={!(wsRename ?? '').trim() || wsRename === activeWs.name}>Save</Button>
                  </form>
                ) : (
                  <span className="text-sm text-ink-2">{activeWs ? (activeWs.name || wsName(activeWs.slug)) : '…'}</span>
                )}
              </SettingsRow>
              <SettingsRow title="Slug" desc="Its id in app URLs">
                <code className="rounded-sm bg-code px-1.5 py-0.5 text-xs">{wsInfo?.active || '…'}</code>
              </SettingsRow>
              <SettingsRow title="Type" desc="Domain workspaces include everyone with your email domain; custom ones are invite only">
                <span className="text-sm text-ink-2">{activeWs?.kind === 'custom' ? 'custom' : 'email domain'}</span>
              </SettingsRow>
              {activeWs?.kind === 'custom' && activeWs?.role === 'owner' && (
                <>
                  <Heading>People</Heading>
                  <SettingsRow title="Add someone" desc="They see this workspace next time they open the workspace menu">
                    <form
                      className="flex items-center gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api('/api/workspaces/members', { method: 'POST', body: JSON.stringify({ email: invite }) });
                          toast(`Added ${invite}`);
                          setInvite('');
                        } catch (er) { toast(`✗ ${er.message}`); }
                      }}
                    >
                      <Input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="teammate@company.com" className="w-56" aria-label="Invite email" />
                      <Button variant="secondary" size="sm" type="submit" disabled={!invite.includes('@')}>Add</Button>
                    </form>
                  </SettingsRow>
                </>
              )}
            </>
          )}
          {tab === 'people' && (
            <>
              <div className="text-2xl font-semibold">People</div>
              <div className="pt-2 text-base text-ink-2">Everyone in this workspace</div>
              <Heading>Members</Heading>
              {people === null && <div className="pt-3 text-sm text-ink-2">Loading…</div>}
              {(people || []).slice(0, 10).map((m) => {
                const em = String(m.email || m);
                return <div key={em} className="flex h-9 items-center gap-2 text-sm"><Avatar email={em} />{em}</div>;
              })}
              {people?.length === 0 && <div className="pt-3 text-sm text-ink-2">Nobody else yet.</div>}
              <div className="pt-4">
                <Button variant="secondary" size="sm" onClick={() => { onClose(); navigate('/members'); }}>Open Members</Button>
              </div>
            </>
          )}
          {tab === 'ai' && (
            <>
              <div className="text-2xl font-semibold">Small AI</div>
              <div className="pt-2 text-base text-ink-2">The agent behind chat, search, diagnosis and Watch</div>
              <Heading>Model provider</Heading>
              <AiModelSettings />
              <Heading>Chat</Heading>
              <SettingsRow title="Default model" desc="New chats start on this model; you can still switch per message">
                <Select
                  value={MODEL_LABELS[askModel]}
                  options={Object.values(MODEL_LABELS)}
                  onChange={(l) => {
                    const k = Object.keys(MODEL_LABELS).find((x) => MODEL_LABELS[x] === l);
                    setAskModel(k);
                    localStorage.setItem('small.askModel', k);
                  }}
                />
              </SettingsRow>
              <Heading>Always on</Heading>
              <SettingsRow title="App descriptions" desc="Written from the code on first deploy; click one on an app page to edit it" />
              <SettingsRow title="Run diagnosis" desc="Every failed run gets a one-line diagnosis under its status" />
              <SettingsRow title="Watch" desc="A nightly pass files observations to the bell, weekly email and Slack" />
            </>
          )}
          {tab === 'developer' && (
            <>
              <div className="text-2xl font-semibold">Developer</div>
              <div className="pt-2 text-base text-ink-2">Deploy from your terminal</div>
              <Heading>New app</Heading>
              <SettingsRow title="1. Install the CLI" desc="Node 18+"><CodeCopy text="npm i -g small-deploy" /></SettingsRow>
              <SettingsRow title="2. Sign in" desc="A one-time code to your email"><CodeCopy text="small login" /></SettingsRow>
              <SettingsRow title="3. Ship" desc="From your project directory. It appears here the moment it deploys."><CodeCopy text="small deploy" /></SettingsRow>
              <Heading>Everyday commands</Heading>
              <SettingsRow title="Start a job" desc="Prompts for its inputs"><CodeCopy text="small run <app>" /></SettingsRow>
              <SettingsRow title="Recent runs" desc="Status, duration, who started them"><CodeCopy text="small runs <app>" /></SettingsRow>
              <SettingsRow title="Logs" desc="Tail what an app printed"><CodeCopy text="small logs <app>" /></SettingsRow>
              <SettingsRow title="Share" desc="Give a teammate access"><CodeCopy text="small share <email>" /></SettingsRow>
              <SettingsRow title="Schedule" desc="Pause or resume a cron"><CodeCopy text="small schedule pause <app>" /></SettingsRow>
              <SettingsRow title="Everything you own" desc="Apps and their URLs"><CodeCopy text="small list" /></SettingsRow>
              <SettingsRow title="Watch" desc="What the nightly pass found"><CodeCopy text="small watch" /></SettingsRow>
              <SettingsRow title="Start a new project" desc="Scaffolds small.toml and a runbook"><CodeCopy text="small init" /></SettingsRow>
              <Heading>API</Heading>
              <SettingsRow title="Base URL" desc="The same-origin API this dashboard uses"><CodeCopy text={`${window.location.origin}/api`} /></SettingsRow>
            </>
          )}
          {tab === 'teamspaces' && (
            <>
              <div className="text-2xl font-semibold">Teamspaces</div>
              <div className="pt-2 text-base text-ink-2">Groups you can share apps with, like #finance</div>
              <Heading>Teams</Heading>
              {teams === null && <div className="pt-3 text-sm text-ink-2">Loading…</div>}
              {(teams || []).map((t) => (
                <div key={t.name} className="flex h-9 items-center gap-2 text-sm">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hover text-xs text-ink-2">#</span>
                  {t.name}
                  <span className="text-xs text-ink-3">{t.members ? `${t.members.length} people` : ''}</span>
                </div>
              ))}
              {teams?.length === 0 && <div className="pt-3 text-sm text-ink-2">No teams yet. Create them on the Members page.</div>}
              <div className="pt-4">
                <Button variant="secondary" size="sm" onClick={() => { onClose(); navigate('/members'); }}>Open Members</Button>
              </div>
            </>
          )}
          {tab === 'security' && (
            <>
              <div className="text-2xl font-semibold">Security</div>
              <div className="pt-2 text-base text-ink-2">Sign-in and sessions</div>
              <Heading>Sign-in</Heading>
              <SettingsRow title="Method" desc="A magic link or one-time code to your work email. No passwords stored." />
              <SettingsRow title="This device" desc="Sign out here">
                <Button variant="secondary" size="sm" onClick={() => { window.location.href = '/logout'; }}>Log out</Button>
              </SettingsRow>
            </>
          )}
          {tab === 'identity' && (
            <>
              <div className="text-2xl font-semibold">Identity</div>
              <div className="pt-2 text-base text-ink-2">Who you are here</div>
              <Heading>Account</Heading>
              <SettingsRow title="Email" desc="Your sign-in identity"><span className="text-sm text-ink-2">{email}</span></SettingsRow>
              <SettingsRow title="Home workspace" desc="Everyone with this email domain shares it">
                <code className="rounded-sm bg-code px-1.5 py-0.5 text-xs">{email ? email.split('@')[1] : ''}</code>
              </SettingsRow>
            </>
          )}
          {tab === 'billing' && (
            <>
              <div className="text-2xl font-semibold">Upgrade plan</div>
              <div className="pt-2 text-base text-ink-2">Billing</div>
              <Heading>Plan</Heading>
              <SettingsRow title="Beta" desc="small deploy is free while in beta. No card needed." />
            </>
          )}
          {TITLES[tab] && (
            <>
              <div className="text-2xl font-semibold">{TITLES[tab]}</div>
              <div className="pt-2 text-base text-ink-2">Nothing here yet</div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings > Account > AI model: every agent (chat, review, runbook, watch)
// answers with either the platform's Anthropic key or the org's own AWS
// Bedrock - their role, their region, their bill. Applies to the whole org.
function AiModelSettings() {
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/org/ai').then(setAi).catch(() => setAi({ provider: 'anthropic' })); }, []);
  if (!ai) return <div className="pt-2 text-sm text-ink-2">loading…</div>;
  const set = (k, v) => setAi((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/org/ai', { method: 'POST', body: JSON.stringify(ai) });
      toast('AI settings saved - applies to chat, review, runbook and watch');
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const bedrock = ai.provider === 'bedrock';
  return (
    <div className="flex flex-col gap-3 pt-2">
      <SettingsRow title="Provider" desc="Who runs the models behind chat, review, runbook and watch">
        <Select
          value={bedrock ? 'Your AWS Bedrock' : 'small (Anthropic)'}
          options={['small (Anthropic)', 'Your AWS Bedrock']}
          onChange={(v) => set('provider', v.includes('Bedrock') ? 'bedrock' : 'anthropic')}
        />
      </SettingsRow>
      {bedrock ? (
        <>
          <SettingsRow title="Role ARN" desc="IAM role with bedrock:InvokeModel - trust policy names small's principal, ExternalId is your workspace slug">
            <Input value={ai.bedrock_role_arn || ''} onChange={(e) => set('bedrock_role_arn', e.target.value)} placeholder="arn:aws:iam::123456789012:role/small-bedrock" className="w-80 font-mono text-xs" />
          </SettingsRow>
          <SettingsRow title="Region" desc="Where your Bedrock access lives">
            <Input value={ai.bedrock_region || ''} onChange={(e) => set('bedrock_region', e.target.value)} placeholder="us-east-1" className="w-40" />
          </SettingsRow>
          <SettingsRow title="Model id" desc="A Bedrock Anthropic model your account has access to">
            <Input value={ai.model || ''} onChange={(e) => set('model', e.target.value)} placeholder="us.anthropic.claude-sonnet-4-5-20250929-v1:0" className="w-96 font-mono text-xs" />
          </SettingsRow>
        </>
      ) : (
        <SettingsRow title="Model" desc="Leave empty for the platform default (chat's picker still overrides per message)">
          <Input value={ai.model || ''} onChange={(e) => set('model', e.target.value)} placeholder="platform default" className="w-72 font-mono text-xs" />
        </SettingsRow>
      )}
      <div>
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? 'Verifying…' : 'Save'}</Button>
        {bedrock && <span className="pl-3 text-xs text-ink-2">Save assumes the role once to verify the trust policy.</span>}
      </div>
    </div>
  );
}

// Notion-style sidebar: workspace row, search, folders (drag apps in), recent, members.
// Resizable by dragging the right edge (200–400px).
export default function Sidebar({ org, orgName, email, apps, folders, width = 260, onResize, onReload, onCollapse }) {
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
  const [wsList, setWsList] = useState(null); // workspaces the user belongs to, loaded when the menu opens
  const [newWs, setNewWs] = useState(null); // string while the create dialog is up
  const [newApp, setNewApp] = useState(false); // the how-to-ship dialog
  useEffect(() => {
    if (wsMenu && !wsList) {
      api('/api/workspaces')
        .then((d) => { const l = d.workspaces || []; l.activeSlug = d.active; setWsList(l); })
        .catch(() => setWsList([]));
    }
  }, [wsMenu]);
  const createWs = async () => {
    const name = (newWs || '').trim();
    if (!name) return;
    try {
      const d = await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
      setWs(d.slug);
      window.location.assign('/apps'); // land in the fresh workspace
    } catch (e) { toast(`✗ ${e.message}`); }
  };
  const [newMenu, setNewMenu] = useState(false); // bottom + button popup
  const [searchOpen, setSearchOpen] = useState(false); // mirrors the ⌘K modal for the icon's active state
  useEffect(() => {
    const on = (e) => setSearchOpen(!!e.detail?.open);
    window.addEventListener('small:search-state', on);
    return () => window.removeEventListener('small:search-state', on);
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [watchObs, setWatchObs] = useState([]);
  const [watchRuns, setWatchRuns] = useState([]); // my settled runs, last 3 days
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchMenu, setWatchMenu] = useState(null);
  // read = inbox semantics: opening the panel clears the badge; the observation
  // itself stays until it resolves or is dismissed. Per device (localStorage).
  const [readAt, setReadAt] = useState(() => localStorage.getItem('small.watchReadAt') || '');
  const [panelReadAt, setPanelReadAt] = useState(''); // snapshot at open - rows dim against this, not the fresh mark
  const unread = [...watchObs.filter((o) => o.first_seen > readAt), ...watchRuns.filter((r) => r.finished_at > readAt)];
  const markRead = () => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    setPanelReadAt(readAt);
    localStorage.setItem('small.watchReadAt', now);
    setReadAt(now);
  };
  const loadWatch = () => api('/api/watch').then((d) => { setWatchObs(d.observations || []); setWatchRuns(d.runs || []); }).catch(() => {});
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
  // Every drop confirms first - moving can change who has access.
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
            className={cn('-mr-1 opacity-0 group-hover/r:opacity-100', menuFor === a.name && 'bg-active text-ink opacity-100')}
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
        <Menu open={menuFor === a.name} onClose={() => setMenuFor(null)} className="top-8 right-0 w-52">
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
  // an app made private while filed keeps folder_id, but lives in Private only - no double listing
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
      className="group/sb relative flex shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-side px-2 py-2 max-md:hidden"
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
            ? 'It leaves the workspace section - only people (and teams) it is shared with keep access.'
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
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink text-[11px] font-semibold text-white">{(orgName || wsName(org))[0].toUpperCase()}</span>
            <span className="truncate text-sm font-medium">{orgName || wsName(org)}</span>
            <ChevronDown size={12} className="shrink-0 text-ink-3 opacity-0 group-hover/sb:opacity-100" />
          </button>
          <IconBtn title="Close sidebar" onClick={onCollapse} className="opacity-0 group-hover/sb:opacity-100">
            <ChevronsLeft size={15} />
          </IconBtn>
        </div>
        {/* fixed!: the sidebar is a scroll container and clips anything wider than
            itself - pinning to the viewport lets the menu fit the full email */}
        <Menu open={wsMenu} onClose={() => setWsMenu(false)} className="fixed! top-11 left-3 w-auto! min-w-60 max-w-[340px]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {email && <Avatar email={email} />}
            <span className="text-xs whitespace-nowrap text-ink-2">{email}</span>
          </div>
          <div className="my-1 border-t border-line" />
          {/* every workspace the user belongs to; the active one gets the check */}
          {(wsList || []).map((w) => {
            const label = w.name || wsName(w.slug);
            const active = w.slug === (wsList?.activeSlug ?? org);
            return (
              <MenuItem
                key={w.slug}
                onClick={() => {
                  setWsMenu(false);
                  setWs(w.kind === 'domain' ? '' : w.slug);
                  window.location.assign('/apps'); // clean reload, every fetch re-scopes
                }}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink text-[11px] font-semibold text-white">{label[0].toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {active && <Check size={14} strokeWidth={2} className="shrink-0 text-ink" />}
                </span>
              </MenuItem>
            );
          })}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Settings} onClick={() => { setWsMenu(false); setShowSettings(true); }}>Settings</MenuItem>
          <MenuItem className="text-accent hover:text-accent" onClick={() => { setWsMenu(false); setNewWs(''); }}>
            <span className="flex items-center gap-2 text-accent"><Plus size={16} strokeWidth={1.5} /> New workspace</span>
          </MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={LogOut} onClick={() => { window.location.href = '/logout'; }}>Log out</MenuItem>
        </Menu>
      </div>
      {showSettings && <SettingsDialog email={email} onMarkRead={markRead} onClose={() => setShowSettings(false)} />}
      {newApp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={() => setNewApp(false)}>
          <div className="mt-[22vh] w-[420px] max-w-[90vw] rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="pb-1 text-sm font-semibold">New app</div>
            <div className="pb-3 text-xs text-ink-2">Apps ship from your terminal. Three commands and it appears here.</div>
            {[['1. Install the CLI', 'npm i -g small-deploy'], ['2. Sign in', 'small login'], ['3. Ship from your project directory', 'small deploy']].map(([label, cmd]) => (
              <div key={cmd} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-sm text-ink-2">{label}</span>
                <span className="flex items-center gap-1">
                  <code className="rounded-sm bg-code px-1.5 py-0.5 text-xs">{cmd}</code>
                  <IconBtn aria-label={`Copy ${cmd}`} onClick={() => { navigator.clipboard.writeText(cmd); toast('Copied'); }}><Copy size={13} strokeWidth={1.5} /></IconBtn>
                </span>
              </div>
            ))}
            <div className="flex justify-end pt-3">
              <Button variant="secondary" size="sm" onClick={() => setNewApp(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
      {newWs !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={() => setNewWs(null)}>
          <div className="mt-[26vh] w-96 max-w-[90vw] rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="pb-1 text-sm font-semibold">New workspace</div>
            <div className="pb-3 text-xs text-ink-2">A separate space with its own apps. You choose who joins it.</div>
            <form onSubmit={(e) => { e.preventDefault(); createWs(); }}>
              <Input autoFocus value={newWs} onChange={(e) => setNewWs(e.target.value)} placeholder="Workspace name" aria-label="Workspace name" />
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="secondary" type="button" onClick={() => setNewWs(null)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={!(newWs || '').trim()}>Create</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* icons only - search + notifications share one line, tooltips carry the labels */}
      <div className="flex items-center gap-1 px-0.5">
        <button
          title="Search (Ctrl + K)"
          aria-label="Search"
          onClick={() => { setWatchOpen(false); window.dispatchEvent(new CustomEvent('small:search')); }}
          className={cn('flex h-7 cursor-pointer items-center rounded-full px-1.5 text-sm', searchOpen ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}
        >
          <Search size={16} strokeWidth={1.5} className="shrink-0" />
          <span className={cn('overflow-hidden whitespace-nowrap transition-[max-width] duration-200 ease-out', searchOpen ? 'max-w-[64px] pl-1.5' : 'max-w-0')}>Search</span>
        </button>
        <div className="relative">
          <button
            title="Notifications"
            aria-label="Notifications"
            onClick={() => { window.dispatchEvent(new CustomEvent('small:search-close')); setWatchOpen(true); loadWatch(); markRead(); }}
            className={cn('flex h-7 cursor-pointer items-center rounded-full px-1.5 text-sm', watchOpen ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}
          >
            <Bell size={16} strokeWidth={1.5} className="shrink-0" />
            <span className={cn('overflow-hidden whitespace-nowrap transition-[max-width] duration-200 ease-out', watchOpen ? 'max-w-[110px] pl-1.5' : 'max-w-0')}>Notifications</span>
          </button>
          {unread.length > 0 && (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-semibold text-white">
              {unread.length}
            </span>
          )}
        </div>
      </div>
      {watchOpen && (
        <>
          {/* Notion-style inbox: a floating rounded box beside the sidebar, not a full-height panel */}
          <div className="fixed inset-0 z-40" onMouseDown={() => setWatchOpen(false)} />
          <div style={{ left: width + 12 }} className="fixed top-10 z-50 flex max-h-[75vh] w-[440px] flex-col overflow-hidden rounded-lg bg-white text-ink shadow-pop">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-1">
              <span className="text-sm font-semibold">Notifications</span>
              <IconBtn aria-label="Close" onClick={() => setWatchOpen(false)}><X size={14} /></IconBtn>
            </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {/* read rows are gone - only what arrived since the last open shows, and Clear empties it now */}
            {(watchObs.some((o) => o.first_seen > panelReadAt) || watchRuns.some((r) => r.finished_at > panelReadAt)) && (
              <div className="flex justify-end pt-1 pb-1">
                <button
                  onClick={() => setPanelReadAt(new Date().toISOString().slice(0, 19).replace('T', ' '))}
                  className="cursor-pointer rounded-sm px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
                >
                  Clear notifications
                </button>
              </div>
            )}
            {!watchObs.some((o) => o.first_seen > panelReadAt) && !watchRuns.some((r) => r.finished_at > panelReadAt) && (
              <div className="pt-2 text-sm text-ink-2">You're all caught up.</div>
            )}
            {watchRuns.filter((r) => r.finished_at > panelReadAt).map((r) => (
              <div
                key={r.run_id}
                onClick={() => { setWatchOpen(false); navigate(`/apps/${r.app}/runs/${r.run_id}`); }}
                className="flex cursor-pointer items-start gap-2 rounded-sm border-b border-line px-1 py-2.5 text-sm hover:bg-hover"
              >
                <span className={cn('mt-0.5 shrink-0 text-[13px]', r.status === 'finished' ? 'text-success' : 'text-danger')}>
                  {r.status === 'finished' ? '✓' : '✗'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.app}</span>
                  <div className="text-ink-2">run {r.status}{r.status !== 'finished' && r.exit_code != null ? ` (exit ${r.exit_code})` : ''}</div>
                  <div className="pt-0.5 text-xs text-ink-3">{r.run_id} · {ago(r.finished_at)}</div>
                </div>
              </div>
            ))}
            {watchObs.filter((o) => o.first_seen > panelReadAt).map((o) => (
              <div
                key={o.id}
                onClick={() => { setWatchOpen(false); navigate(`/apps/${o.slug}`); }}
                className="flex cursor-pointer items-start gap-2 rounded-sm border-b border-line px-1 py-2.5 text-sm hover:bg-hover"
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
          </div>
        </>
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
                className={cn('-mr-1 opacity-0 group-hover/f:opacity-100', folderMenu === f.id && 'bg-active text-ink opacity-100')}
              >
                <MoreHorizontal size={16} strokeWidth={1.5} />
              </IconBtn>
              <Menu open={folderMenu === f.id} onClose={() => setFolderMenu(null)} className="top-8 right-0 w-52">
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
        <div className="mt-3 mb-3 flex items-center gap-2">
          <button
            onClick={() => navigate('/chat')}
            className={cn('flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line px-4 text-sm shadow-sm hover:bg-hover', path === '/chat' ? 'bg-active' : 'bg-white')}
          >
            <img src="/icon-32.png" alt="" className="h-4 w-4 shrink-0" />
            New chat
            <span className="ml-auto shrink-0 text-xs text-ink-3">Ctrl + O</span>
          </button>
          <div className="relative shrink-0">
            <button
              aria-label="New"
              onClick={() => setNewMenu((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:bg-hover hover:text-ink"
            >
              <Plus size={16} strokeWidth={1.5} />
            </button>
            <Menu open={newMenu} onClose={() => setNewMenu(false)} className="bottom-11 right-0 w-40">
              <MenuItem icon={AppIcon} onClick={() => { setNewMenu(false); navigate('/chat'); }}>Chat</MenuItem>
              <MenuItem icon={FolderPlus} onClick={() => { setNewMenu(false); setNewFolder(''); }}>Folder</MenuItem>
              <MenuItem icon={Plus} onClick={() => { setNewMenu(false); setNewApp(true); }}>App</MenuItem>
            </Menu>
          </div>
        </div>
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
                <div className="pt-1 text-sm text-ink-2">Not shared - everyone gets access to every app in this folder when you add them.</div>
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
                    <Button variant="secondary" size="sm" className="opacity-0 group-hover/tr:opacity-100" onClick={() => restore(t.name)}>
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
