import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BadgeCheck, Bell, Braces, Check, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Compass, Copy, Download, ExternalLink, Folder, FolderPlus, Globe, House, LayoutGrid, LayoutPanelLeft, Library, Link, LogOut, Mail, MoreHorizontal, Pencil, Pin, PinOff, Plus, Rabbit, RotateCcw, Search, Settings, Share2, Shield, SlidersHorizontal, Smile, Trash2, Users, X } from 'lucide-react';
import { ago, api, getTheme, navigate, sectionOf, setTheme, setWs, wsName, workspaceLabel } from './api.js';
import AwsConnection from './AwsConnection.jsx';
import ByocDevBadge from './ByocDevBadge.jsx';
import { AVAILABILITY, connectionsFor } from './connections.js';
import { isPrivateByoc } from './private-auth.js';
import { titleOf } from './agent/catalog.js';
import { learnPreview, PRODUCT } from './flags.js';
import { pinnedApps, RAIL_W, readPinned, secClosedInit, togglePin } from './home/pinned.js';
import { isLearnResource } from './library-filter.js';
import { pageFor, sectionActive, sectionHref } from './routes.js';
import FeedbackButton from './FeedbackButton.jsx';
import { AppIcon, Avatar, Button, cn, ConfirmDialog, IconBtn, Input, KindIcon, Mark, Menu, MenuItem, Pill, Select, SettingsRow, ShareInput, SlidePanel, toast, Toggle } from './ui.jsx';

// Settings (workspace dropdown → Settings): Notion-style two-pane modal -
// left nav (Account / Workspace sections), right content per tab.
const THEMES = { System: 'system', Light: 'light', Dark: 'dark' };
// T02 §11, dev build only (D2): no-op controls and placeholder panes say Planned. Each helper
// returns its input unchanged when learnPreview is off, so the live markup stays exactly as today.
const planned = (className = 'ml-2') => learnPreview && <Pill className={className}>Planned</Pill>;
const soonTitle = (text) => (learnPreview ? <span>{text}{planned()}</span> : text);
const dim = (control) => (learnPreview ? <span className="opacity-50">{control}</span> : control);
const AVAILABILITY_COLOR = { available: 'green', preview: 'yellow', planned: 'grey' };
// ponytail: nav copied verbatim from the Notion reference (user: "copy the same we
// will remove later") - most items render an empty pane until we prune/wire them.
function SettingsDialog({ email, org, apps, onReload, onMarkRead, onClose, initialTab, focus: initialFocus, pendingGrant, onAccessChanged }) {
  const [tab, setTab] = useState(initialTab || 'preferences');
  const [focus, setFocus] = useState(initialFocus || null); // the row open_settings asked for, e.g. google-slides
  const box = useRef(null);
  useEffect(() => {
    if (!learnPreview) return;
    // Capture phase: while Settings is the top layer, Esc closes it and nothing under it (Start
    // dialog, bar sheet). A dialog opened inside Settings (Disconnect AWS?) takes Esc first.
    const esc = (e) => {
      if (e.key !== 'Escape' || box.current?.querySelector('[role="dialog"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);
  useEffect(() => {
    if (focus) box.current?.querySelector(`[data-settings-focus="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus, tab]);
  const [theme, setThemeState] = useState(() => getTheme());
  const [enterNewline, setEnterNewline] = useState(false); // visual only
  const [textDir, setTextDir] = useState(false); // visual only
  const label = Object.keys(THEMES).find((k) => THEMES[k] === theme);
  const NavBtn = ({ id, icon: Icon, children }) => (
    <div
      onClick={() => { setTab(id); setFocus(null); }}
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
  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div ref={box} {...(learnPreview && { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' })} className={cn('flex h-[calc(100vh-100px)] max-h-[720px] w-[calc(100vw-100px)] max-w-[1150px] overflow-hidden rounded-2xl bg-white text-ink shadow-pop', learnPreview && 'max-md:h-[calc(100dvh-32px)] max-md:w-[calc(100vw-32px)] max-md:flex-col')} onMouseDown={(e) => e.stopPropagation()}>
        <div className={cn('w-[260px] shrink-0 overflow-y-auto border-r border-line bg-side py-4 px-3', learnPreview && 'max-md:max-h-40 max-md:w-full max-md:border-r-0 max-md:border-b')}>
          <div className="px-2 pb-1 text-xs font-medium text-ink-3">Account</div>
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5">
            {email && <Avatar email={email} />}
            <span className="truncate text-sm" title={email}>{email}</span>
          </div>
          <NavBtn id="preferences" icon={SlidersHorizontal}>Preferences</NavBtn>
          <NavBtn id="notifications" icon={Bell}>Notifications</NavBtn>
          <NavBtn id="mail" icon={Mail}>Mail & Calendar{planned('ml-auto')}</NavBtn>
          <NavLabel>Workspace</NavLabel>
          <NavBtn id="general" icon={Settings}>General</NavBtn>
          <NavBtn id="people" icon={Users}>People</NavBtn>
          <NavBtn id="import" icon={Download}>Import{planned('ml-auto')}</NavBtn>
          <NavLabel>Features</NavLabel>
          <NavBtn id="ai" icon={Mark}>Small AI</NavBtn>
          <NavBtn id="connections" icon={LayoutGrid}>Connections{pendingGrant && <span role="status" aria-label="AWS access needs attention" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-warn" />}</NavBtn>
          <NavBtn id="mcp" icon={Share2}>Small MCP{planned('ml-auto')}</NavBtn>
          <NavBtn id="pages" icon={Globe}>Public pages{planned('ml-auto')}</NavBtn>
          <NavBtn id="emoji" icon={Smile}>Emoji{planned('ml-auto')}</NavBtn>
          <NavBtn id="developer" icon={Braces}>Developer</NavBtn>
          <NavLabel>Admin</NavLabel>
          <NavBtn id="teamspaces" icon={LayoutPanelLeft}>Teamspaces</NavBtn>
          <NavBtn id="security" icon={Shield}>Security</NavBtn>
          <NavBtn id="identity" icon={BadgeCheck}>Identity</NavBtn>
        </div>
        <div className="relative flex-1 overflow-y-auto">
          <IconBtn aria-label="Close" onClick={onClose} className="absolute top-3 right-3"><X size={14} /></IconBtn>
          <div className={cn('mx-auto max-w-[920px] px-12 py-10', learnPreview && 'max-md:px-4 max-md:py-6')}>
          {tab === 'preferences' && (
            <>
              <div className="text-2xl font-semibold">Preferences</div>
              <div className="pt-2 text-base text-ink-2">{`Choose how you want ${PRODUCT} to look and behave`}</div>
              <Heading>Appearance</Heading>
              <SettingsRow title="Theme" desc={`Choose a theme for ${PRODUCT} on this device`}>
                <Select
                  value={label}
                  options={Object.keys(THEMES)}
                  onChange={(k) => { setThemeState(THEMES[k]); setTheme(THEMES[k]); }}
                />
              </SettingsRow>
              <SettingsRow
                title={learnPreview ? soonTitle('High contrast') : <span>High contrast <span className="ml-1 rounded-sm bg-hover px-1.5 py-0.5 text-[11px] text-ink-2">Beta</span></span>}
                desc="Increase contrast for improved visibility"
              >
                {dim(<Select disabled={learnPreview} value="Use system setting" options={['Use system setting', 'On', 'Off']} onChange={() => {}} />)}
              </SettingsRow>
              <Heading>Input options</Heading>
              <SettingsRow title={soonTitle('Use Enter to add a new line')} desc="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send.">
                {dim(<Toggle disabled={learnPreview} on={enterNewline} onChange={setEnterNewline} />)}
              </SettingsRow>
              <Heading>Language & time</Heading>
              <SettingsRow title={soonTitle('Language')} desc={`Choose the language you want to use ${PRODUCT} in`}>
                {dim(<Select disabled={learnPreview} value="English (US)" options={['English (US)']} onChange={() => {}} />)}
              </SettingsRow>
              <SettingsRow title={soonTitle('Number format')} desc="Choose how numbers and currencies are formatted. Default uses your language setting.">
                {dim(<Select disabled={learnPreview} value="Default" options={['Default']} onChange={() => {}} />)}
              </SettingsRow>
              <SettingsRow title={soonTitle('Always show text direction controls')} desc="Show the option to change text direction (left to right or right to left) in the editor, regardless of what language you're using">
                {dim(<Toggle disabled={learnPreview} on={textDir} onChange={setTextDir} />)}
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
          {tab === 'connections' && !learnPreview && (
            <>
              <div className="text-2xl font-semibold">Connections</div>
              <div className="pt-2 text-base text-ink-2">Bring small into the tools your team already uses</div>
              {(isPrivateByoc || import.meta.env.VITE_BYOC_DEV === 'true') && <>
                <Heading>AWS</Heading>
                <AwsConnection workspace={org} apps={apps} onChanged={onReload} onAccessChanged={onAccessChanged} />
              </>}
              <Heading>Slack</Heading>
              <SettingsRow title="Slack" desc="@small in channels, /small commands, proposals as buttons.">
                <Button variant="soft" size="sm" onClick={() => window.open('/slack/install', '_blank', 'noopener')}>
                  Connect Slack
                </Button>
              </SettingsRow>
            </>
          )}
          {tab === 'connections' && learnPreview && (
            <>
              <div className="text-2xl font-semibold">Connections</div>
              <div className="pt-2 text-base text-ink-2">{`What each connection adds to learning in ${PRODUCT}, and whether it is available yet`}</div>
              <Heading>Providers</Heading>
              {connectionsFor({ aws: isPrivateByoc || import.meta.env.VITE_BYOC_DEV === 'true' }).map((c) => (
                <div key={c.id} data-settings-focus={c.id} aria-current={focus === c.id || undefined} className={cn('-mx-2 rounded-md px-2', focus === c.id && 'bg-hover ring-2 ring-accent/35')}>
                  <SettingsRow
                    title={<span className="flex items-center gap-2">{c.name}<Pill color={AVAILABILITY_COLOR[c.availability]}>{AVAILABILITY[c.availability]}</Pill></span>}
                    desc={[c.adds, c.account].filter(Boolean).join(' ')}
                  >
                    {c.id === 'github' && <Button variant="soft" size="sm" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } })); }}>Start from a repository</Button>}
                    {c.id === 'slack' && <Button variant="soft" size="sm" onClick={() => window.open('/slack/install', '_blank', 'noopener')}>Connect Slack</Button>}
                  </SettingsRow>
                  {c.id === 'aws' && <AwsConnection workspace={org} apps={apps} onChanged={onReload} onAccessChanged={onAccessChanged} />}
                </div>
              ))}
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
                  <span className="text-sm text-ink-2">{activeWs ? workspaceLabel(activeWs.name, activeWs.slug) : '…'}</span>
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
              {isPrivateByoc && <p className="py-3 text-sm text-ink-2">Use the CLI package supplied with this private installation. CPU jobs deploy and run in your AWS account.</p>}
              <SettingsRow title="1. Install the CLI" desc="Node 18+"><CodeCopy text={isPrivateByoc ? 'npm i -g ./small-deploy.tgz' : 'npm i -g small-deploy'} /></SettingsRow>
              <SettingsRow title="2. Sign in" desc={isPrivateByoc ? 'Cognito opens in your browser' : 'A one-time code to your email'}><CodeCopy text={isPrivateByoc ? `small login --api ${window.location.origin}` : 'small login'} /></SettingsRow>
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
              <SettingsRow title="Method" desc={isPrivateByoc ? 'Amazon Cognito, managed by your workspace administrator.' : 'A magic link or one-time code to your work email. No passwords stored.'} />
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
              <SettingsRow title="Home workspace" desc={isPrivateByoc ? 'Access is granted by your workspace administrator.' : 'Everyone with this email domain shares it'}>
                <code className="rounded-sm bg-code px-1.5 py-0.5 text-xs">{isPrivateByoc ? org : email ? email.split('@')[1] : ''}</code>
              </SettingsRow>
            </>
          )}
          {TITLES[tab] && (
            <>
              <div className="text-2xl font-semibold">{TITLES[tab]}</div>
              <div className="pt-2 text-base text-ink-2">{learnPreview ? 'Planned — not available yet.' : 'Nothing here yet'}</div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
  // Portaled in dev: inside the aside it can't show while the sidebar is collapsed
  // (Shell.jsx:75 transform) or below md (Shell.jsx:72 max-md:hidden).
  return learnPreview ? createPortal(node, document.body) : node;
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
  const local = ai.provider === 'openai';
  // every provider below except Claude/Bedrock is the same OpenAI-compatible
  // plumbing with a preset base url - adding one is adding a row here
  const PRESETS = [
    { label: 'OpenAI', base: 'https://api.openai.com/v1', modelPh: 'gpt-5' },
    { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modelPh: 'gemini-2.5-flash' },
    { label: 'Groq', base: 'https://api.groq.com/openai/v1', modelPh: 'llama-3.3-70b-versatile' },
    { label: 'Mistral', base: 'https://api.mistral.ai/v1', modelPh: 'mistral-large-latest' },
    { label: 'DeepSeek', base: 'https://api.deepseek.com/v1', modelPh: 'deepseek-chat' },
    { label: 'xAI Grok', base: 'https://api.x.ai/v1', modelPh: 'grok-4' },
    { label: 'Local', base: null, modelPh: 'llama3.1' },
    { label: 'Custom endpoint', base: null, modelPh: '' },
  ];
  const preset = local ? (PRESETS.find((p) => p.base && p.base === ai.openai_base_url) || PRESETS.find((p) => p.label === (ai.openai_base_url ? 'Custom endpoint' : 'Local'))) : null;
  const providerLabel = bedrock ? 'AWS Bedrock' : local ? preset.label : 'Claude';
  return (
    <div className="flex flex-col gap-3 pt-2">
      <SettingsRow title="Provider" desc="Who runs the models behind chat, review, runbook and watch">
        <Select
          value={providerLabel}
          options={['Claude', 'AWS Bedrock', ...PRESETS.map((p) => p.label)]}
          onChange={(v) => {
            if (v === 'Claude') return set('provider', 'anthropic');
            if (v === 'AWS Bedrock') return set('provider', 'bedrock');
            const p = PRESETS.find((x) => x.label === v);
            setAi((s) => ({ ...s, provider: 'openai', openai_base_url: p.base || '', model: '' }));
          }}
        />
      </SettingsRow>
      {local && (
        <>
          {!preset.base && (
            <SettingsRow title="Endpoint" desc={preset.label === 'Local'
              ? 'A machine on your desk: run cloudflared tunnel --url http://localhost:11434 and paste the printed URL plus /v1'
              : 'Any OpenAI-compatible URL, including /v1'}>
              <Input value={ai.openai_base_url || ''} onChange={(e) => set('openai_base_url', e.target.value)} placeholder="https://your-tunnel.trycloudflare.com/v1" className="w-96 font-mono text-xs" />
            </SettingsRow>
          )}
          <SettingsRow title="API key" desc={preset.base ? `Your ${preset.label} API key` : "Only if the endpoint wants one - most local runtimes don't"}>
            <Input value={ai.openai_api_key || ''} onChange={(e) => set('openai_api_key', e.target.value)} placeholder={preset.base ? 'sk-…' : 'optional'} className="w-72 font-mono text-xs" />
          </SettingsRow>
          <SettingsRow title="Model" desc="The model name the endpoint serves">
            <Input value={ai.model || ''} onChange={(e) => set('model', e.target.value)} placeholder={preset.modelPh || 'model name'} className="w-72 font-mono text-xs" />
          </SettingsRow>
        </>
      )}
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
      ) : local ? null : (
        <SettingsRow title="Model" desc="Leave empty for the platform default (chat's picker still overrides per message)">
          <Input value={ai.model || ''} onChange={(e) => set('model', e.target.value)} placeholder="platform default" className="w-72 font-mono text-xs" />
        </SettingsRow>
      )}
      <div>
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? 'Verifying…' : 'Save'}</Button>
        {bedrock && <span className="pl-3 text-xs text-ink-2">Save assumes the role once to verify the trust policy.</span>}
        {local && <span className="pl-3 text-xs text-ink-2">Save sends one tiny completion to verify the endpoint.</span>}
      </div>
    </div>
  );
}

// Rabbit Hole dev: the main destinations, in the expanded nav and in the collapsed icon rail.
const NAV = [['Home', '/apps', 'home', House], ['Library', '/library', 'library', Library], ['Explore', '/explore', 'explore', Compass]];
const RAIL_BTN = 'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink';
// Report a bug or suggest a feature, below Trash (user, 2026-09-29): Learn's FeedbackButton, app-less. The sidebar
// clips its overflow, so the button is fixed over a footer slot and its panel opens beside the strip, unclipped.
// The footer is sticky, so the slot stays at the bottom however long the sidebar gets.
function FeedbackSlot({ left }) {
  return <><div className="h-9 shrink-0" aria-hidden="true" /><div className="fixed bottom-2 z-40" style={{ left }}><FeedbackButton placement="right" /></div></>;
}
// Rabbit Hole dev: the product mark. The chrome names the product, never a letter from the email domain.
const ProductMark = () => <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink text-white"><Rabbit size={13} strokeWidth={1.75} /></span>;

// Notion-style sidebar: workspace row, search, folders (drag apps in), recent, members.
// Resizable by dragging the right edge (200–400px). Rabbit Hole dev: `rail` is the collapsed
// icon rail (Shell.jsx), and the Apps tree, Shared, Private and New chat are gone.
export default function Sidebar({ org, orgName, email, apps, folders, awsError, width = 260, rail = false, onResize, onReload, onCollapse, onExpand }) {
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
  const [fConfirm, setFConfirm] = useState(null); // { email | team, role } awaiting the share confirm
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
      if (learnPreview) window.location.assign(`/apps?ws=${encodeURIComponent(d.slug)}`); // applied by the page that loads (routes.js takeWs)
      else { setWs(d.slug); window.location.assign('/apps'); } // land in the fresh workspace
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
  useEffect(() => {
    if (!learnPreview) return;
    // T02 §11: the Agent Bar and the Start dialog open Settings on a tab, optionally on one row.
    const on = (e) => setShowSettings({ tab: e.detail?.tab, focus: e.detail?.focus });
    window.addEventListener('small:settings', on);
    return () => window.removeEventListener('small:settings', on);
  }, []);
  const [grantNotice, setGrantNotice] = useState(null);
  const pendingGrant = grantNotice?.org === org ? grantNotice.pending : null;
  const onAccessChanged = (pending) => setGrantNotice({ org, pending });
  useEffect(() => {
    if (!isPrivateByoc && import.meta.env.VITE_BYOC_DEV !== 'true') return;
    let cancelled = false, loading = false;
    const load = async () => {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const { connection } = await api('/api/byoc/connection');
        if (cancelled) return;
        const state = connection?.state === 'connected' && connection.can_deploy
          ? await api('/api/byoc/access') : null;
        if (!cancelled) setGrantNotice({ org, pending: state?.pending || null });
      } catch { /* Keep the last known request until the next successful refresh. */ }
      finally { loading = false; }
    };
    load();
    const timer = setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [org]);
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
  const query = window.location.search;
  const here = learnPreview ? pageFor(path, query, true).page : null; // which nav item you are on
  // One location state: a resource page is marked by its own row (Pinned), not by Library as well.
  const current = here;
  // Before the catalog arrives the workspace is unknown: a named one must not flash Personal first.
  const wsLabel = learnPreview && !email ? '…' : workspaceLabel(orgName, org);
  // Pinned (T02 §2): device-local and flat. togglePin announces every change, whoever made
  // it (this menu or the Agent Bar's pin command), so re-read on that event.
  const [, setPinTick] = useState(0);
  useEffect(() => {
    if (!learnPreview) return;
    const on = () => setPinTick((n) => n + 1);
    window.addEventListener('small:pinned', on);
    return () => window.removeEventListener('small:pinned', on);
  }, []);
  const pins = learnPreview && email ? readPinned(localStorage, org, email) : [];
  const pinned = pinnedApps(pins, apps);

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
        draggable={menu && a.hosting !== 'aws' && !isLearnResource(a)}
        onDragStart={menu && a.hosting !== 'aws' && !isLearnResource(a) ? (e) => { setDragging(a.name); e.dataTransfer.setData('text/plain', a.name); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onDragEnd={menu ? () => { setDragging(null); setDropTarget(null); } : undefined}
        onClick={() => navigate(`/apps/${a.name}`)}
        aria-current={path === `/apps/${a.name}` ? 'page' : undefined}
        className={cn(
          'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover',
          path === `/apps/${a.name}` && 'bg-active font-medium', // you are here
        )}
      >
        <KindIcon kind={a.kind} schedule={a.schedule} />
        <span className="min-w-0 flex-1 truncate">{titleOf(a)}</span>
        {a.hosting === 'aws' && <span className="text-[10px] text-ink-3">AWS</span>}
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
          {learnPreview && email && (
            <MenuItem icon={pins.includes(a.name) ? PinOff : Pin} onClick={() => { setMenuFor(null); togglePin(localStorage, org, email, a.name); }}>
              {pins.includes(a.name) ? 'Unpin' : 'Pin'}
            </MenuItem>
          )}
          <MenuItem disabled={isLearnResource(a)} title={a.kind === 'repository' ? 'Available to everyone in this workspace' : a.kind === 'canvas' ? "Sharing projects and canvases isn't available yet." : undefined} icon={Share2} onClick={() => { setMenuFor(null); navigate(`/apps/${a.name}?share=1`); }}>Share</MenuItem>
          <MenuItem
            icon={Link}
            onClick={() => { setMenuFor(null); navigator.clipboard.writeText(`${window.location.origin}/apps/${a.name}`); toast('Link copied'); }}
          >
            Copy link
          </MenuItem>
          {a.canEdit && !isLearnResource(a) && !learnPreview && ( // D7: rename writes the live D1
            <MenuItem icon={Pencil} onClick={() => { setMenuFor(null); setRenamingApp({ from: a.name, value: a.name }); }}>
              Rename
            </MenuItem>
          )}
          {a.hosting !== 'aws' && !isLearnResource(a) && <MenuItem
            icon={Copy}
            disabled={learnPreview} // D7: duplicate and trash write the live D1
            className={learnPreview ? 'opacity-50' : undefined}
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
          </MenuItem>}
          {a.hosting !== 'aws' && !isLearnResource(a) && a.owner_email === email && (
            <MenuItem icon={Trash2} disabled={learnPreview} className={cn('text-danger', learnPreview && 'opacity-50')} onClick={() => { setMenuFor(null); setConfirmDel(a.name); }}>
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
      return true;
    } catch (e) { toast(`✗ ${e.message}`); }
  };

  // sections collapse like folders: v open, > closed, remembered per device
  const [secClosed, setSecClosed] = useState(() => secClosedInit(localStorage.getItem('small.secClosed'), learnPreview));
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
            onClick={() => navigate(sectionHref(s, learnPreview))}
            className={cn(
              'rounded-sm px-1 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink',
              sectionActive(path, query, s, learnPreview) && 'bg-active font-medium text-ink',
            )}
          >
            {label}
          </button>
        </span>
        {extra}
      </div>
    );
  };

  const badge = (unread.length > 0 || pendingGrant) && (
    <span role="status" aria-label="Pending notifications" className="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-semibold text-white">
      {unread.length + (pendingGrant ? 1 : 0)}
    </span>
  );

  return (
    <aside
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragging(null); setDropTarget(null); }} // outside a real target = cancel
      style={{ width: rail ? RAIL_W : width }}
      className={cn('group/sb relative flex shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-side px-2 py-2', !learnPreview && 'max-md:hidden')}
    >
      {!rail && (
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        className="absolute inset-y-0 -right-0.5 z-10 w-1.5 cursor-col-resize hover:bg-line-strong/70"
      />
      )}
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
        {rail ? (
          <div className="flex flex-col items-center gap-1">
            <button title={`${PRODUCT} · ${wsLabel}`} aria-label={`${PRODUCT} · ${wsLabel}`} onClick={() => setWsMenu(!wsMenu)} className={cn(RAIL_BTN, wsMenu && 'bg-active')}>
              <ProductMark />
              <span className="sr-only">{wsLabel}</span>
            </button>
            <button title="Open sidebar" aria-label="Open sidebar" onClick={onExpand} className={RAIL_BTN}>
              <ChevronsRight size={16} strokeWidth={1.5} />
            </button>
            <button title="Search (Ctrl + K)" aria-label="Search" onClick={() => { setWatchOpen(false); window.dispatchEvent(new CustomEvent('small:search')); }} className={cn(RAIL_BTN, searchOpen && 'bg-active text-ink')}>
              <Search size={16} strokeWidth={1.5} />
            </button>
            <div className="relative">
              <button title="Notifications" aria-label="Notifications" onClick={() => { window.dispatchEvent(new CustomEvent('small:search-close')); setWatchOpen(true); loadWatch(); markRead(); }} className={cn(RAIL_BTN, watchOpen && 'bg-active text-ink')}>
                <Bell size={16} strokeWidth={1.5} />
              </button>
              {badge}
            </div>
          </div>
        ) : learnPreview ? (
          <>
            <div className="flex h-9 items-center gap-2 px-2">
              <ProductMark />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{PRODUCT}</span>
              <ByocDevBadge />
              <IconBtn title="Close sidebar" onClick={onCollapse} className="opacity-0 group-hover/sb:opacity-100 max-md:opacity-100">
                <ChevronsLeft size={15} />
              </IconBtn>
            </div>
            {/* the workspace is context, not identity: its own switcher under the brand */}
            <button onClick={() => setWsMenu(!wsMenu)} title="Switch workspace" className={cn('ml-1 flex h-6 max-w-[calc(100%-8px)] cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', wsMenu && 'bg-active text-ink')}>
              <span className="truncate">{wsLabel}</span>
              <ChevronDown size={12} className="shrink-0" />
            </button>
          </>
        ) : (
        <div className="flex h-9 items-center gap-2 px-2">
          <button
            onClick={() => setWsMenu(!wsMenu)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 pr-1 text-left hover:bg-hover"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink text-[11px] font-semibold text-white">{(orgName || wsName(org))[0].toUpperCase()}</span>
            <span className="truncate text-sm font-medium">{orgName || wsName(org)}</span>
            <ByocDevBadge />
            <ChevronDown size={12} className="shrink-0 text-ink-3 opacity-0 group-hover/sb:opacity-100" />
          </button>
          <IconBtn title="Close sidebar" onClick={onCollapse} className={cn('opacity-0 group-hover/sb:opacity-100', learnPreview && 'max-md:opacity-100')}>
            <ChevronsLeft size={15} />
          </IconBtn>
        </div>
        )}
        {/* fixed!: the sidebar is a scroll container and clips anything wider than
            itself - pinning to the viewport lets the menu fit the full email */}
        <Menu open={wsMenu} onClose={() => setWsMenu(false)} className={rail ? 'fixed! top-2 left-14 w-auto! min-w-60 max-w-[340px]' : learnPreview ? 'fixed! top-[70px] left-3 w-auto! min-w-60 max-w-[340px]' : 'fixed! top-11 left-3 w-auto! min-w-60 max-w-[340px]'}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            {email && <Avatar email={email} />}
            <span className="text-xs whitespace-nowrap text-ink-2">{email}</span>
          </div>
          <div className="my-1 border-t border-line" />
          {/* every workspace the user belongs to; the active one gets the check */}
          {(wsList || []).map((w) => {
            const label = workspaceLabel(w.name, w.slug);
            const active = w.slug === (wsList?.activeSlug ?? org);
            return (
              <MenuItem
                key={w.slug}
                onClick={() => {
                  setWsMenu(false);
                  const slug = w.kind === 'domain' ? '' : w.slug;
                  // Preview: applied by the page that loads, so Stay at the Agent Bar's draft warning keeps this workspace.
                  if (learnPreview) window.location.assign(`/apps?ws=${encodeURIComponent(slug)}`);
                  else { setWs(slug); window.location.assign('/apps'); } // clean reload, every fetch re-scopes
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
      {showSettings && <SettingsDialog email={email} org={org} apps={apps} onReload={onReload} onMarkRead={markRead} onClose={() => setShowSettings(false)} initialTab={typeof showSettings === 'string' ? showSettings : showSettings?.tab} focus={showSettings?.focus} pendingGrant={pendingGrant} onAccessChanged={onAccessChanged} />}
      {newApp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={() => setNewApp(false)}>
          <div className="mt-[22vh] w-[420px] max-w-[90vw] rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="pb-1 text-sm font-semibold">New app</div>
            <div className="pb-3 text-xs text-ink-2">{isPrivateByoc
              ? 'Use the CLI package supplied with this installation to deploy CPU jobs into your AWS account.'
              : 'Apps ship from your terminal. Three commands and it appears here.'}</div>
            {[['1. Install the CLI', isPrivateByoc ? 'npm i -g ./small-deploy.tgz' : 'npm i -g small-deploy'],
              ['2. Sign in', isPrivateByoc ? `small login --api ${window.location.origin}` : 'small login'],
              ['3. Ship from your project directory', 'small deploy']].map(([label, cmd]) => (
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

      {watchOpen && (
        <>
          {/* Notion-style inbox: a floating rounded box beside the sidebar, not a full-height panel */}
          <div className="fixed inset-0 z-40" onMouseDown={() => setWatchOpen(false)} />
          <div style={{ left: (rail ? RAIL_W : width) + 12 }} className={cn('fixed top-10 z-50 flex max-h-[75vh] w-[440px] flex-col overflow-hidden rounded-lg bg-white text-ink shadow-pop', learnPreview && 'max-md:right-3 max-md:left-3! max-md:w-auto')}>
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-1">
              <span className="text-sm font-semibold">Notifications</span>
              <IconBtn aria-label="Close" onClick={() => setWatchOpen(false)}><X size={14} /></IconBtn>
            </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {pendingGrant && <button
              onClick={() => { setWatchOpen(false); setShowSettings('connections'); }}
              className="flex w-full cursor-pointer items-start gap-2 rounded-sm border-b border-line px-1 py-2.5 text-left text-sm hover:bg-hover"
            >
              <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warn" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{pendingGrant.app_name}</span>
                <span className="block text-ink-2">{pendingGrant.status === 'stale' ? 'AWS access request needs refreshing' : ['applying', 'updating'].includes(pendingGrant.status) ? 'AWS access approval in progress' : 'AWS access needs your approval'}</span>
                <span className="block pt-0.5 text-xs text-ink-3">Review in Settings → Connections</span>
              </span>
            </button>}
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
            {!pendingGrant && !watchObs.some((o) => o.first_seen > panelReadAt) && !watchRuns.some((r) => r.finished_at > panelReadAt) && (
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

      {rail ? (
        <>
          <nav aria-label="Main" className="flex flex-col items-center gap-1 pt-2">
            {NAV.map(([label, to, page, Icon]) => (
              <button key={page} title={label} aria-label={label} aria-current={current === page ? 'page' : undefined} onClick={() => navigate(to)} className={cn(RAIL_BTN, current === page && 'bg-active text-ink')}>
                <Icon size={16} strokeWidth={1.5} />
              </button>
            ))}
          </nav>
          <div className="sticky bottom-0 mt-auto flex shrink-0 flex-col items-center gap-1 border-t border-line bg-side pt-2">
            <button title="Members" aria-label="Members" aria-current={path === '/members' ? 'page' : undefined} onClick={() => navigate('/members')} className={cn(RAIL_BTN, path === '/members' && 'bg-active text-ink')}>
              <Users size={16} strokeWidth={1.5} />
            </button>
            <button title="Trash" aria-label="Trash" onClick={openTrash} className={cn(RAIL_BTN, trashOpen && 'bg-active text-ink')}>
              <Trash2 size={16} strokeWidth={1.5} />
            </button>
            <FeedbackSlot left={10} />
          </div>
        </>
      ) : (
      <>
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
          {badge}
        </div>
      </div>
      {learnPreview && (
        <nav aria-label="Main" className="pt-2">
          {NAV.map(([label, to, page, Icon]) => (
            <button
              key={page}
              aria-current={current === page ? 'page' : undefined}
              onClick={() => navigate(to)}
              className={cn('flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', current === page && 'bg-active font-medium')}
            >
              <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
              {label}
              {page === 'explore' && <span className="ml-auto text-xs text-ink-3">preview</span>}
            </button>
          ))}
        </nav>
      )}
      {pinned.length > 0 && (
        <section aria-label="Pinned">
          <div className="px-2 pt-3 pb-1 text-xs text-ink-2">Pinned</div>
          {pinned.map((a) => appRow(a))}
        </section>
      )}
      {/* ponytail: the preview has no Apps tree, Shared or Private (Library Filters -> Apps and Mine,
          and the app Share popover, replace them), so folder create, rename and delete have no preview
          UI. Folder management moves to the Library's ... actions later; the folder API and data stay. */}
      {!learnPreview && (
      <>
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
        {awsError && <p role="alert" className="px-2 py-1 text-xs text-danger">{awsError}</p>}
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
      </>
      )}

      {!learnPreview && recent.length > 0 && (
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

      <div className={cn('mt-auto shrink-0 pt-3', learnPreview && 'sticky bottom-0 border-t border-line bg-side')}>
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
        {learnPreview && <FeedbackSlot left={12} />}
        {!learnPreview && (
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
        )}
      </div>
      </>
      )}

      {sharedFolderObj && (
        <SlidePanel title={`Share folder ${sharedFolderObj.name}`} width={400} onClose={() => setShareFolder(null)}>
          <div className="flex min-h-0 flex-1 flex-col px-5">
            <form
              className="pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = fShare.trim().toLowerCase();
                if (v.startsWith('#') && v.length > 1) setFConfirm({ team: v, role: 'view' });
                else if (v.includes('@')) setFConfirm({ email: v, role: 'view' });
              }}
            >
              <ShareInput
                autoFocus
                value={fShare}
                onChange={setFShare}
                onPick={(it) => setFConfirm({ ...it, role: 'view' })}
                people={pool.people}
                teams={pool.teams}
                exclude={(sharedFolderObj.shares || []).map((s) => (s.team ? `#${s.team}` : s.email))}
                placeholder="Add people by email, teams by #…"
              />
            </form>
            <div className="pb-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/apps?f=${encodeURIComponent(sharedFolderObj.name)}`); toast('Link copied'); }}
              >
                <Link size={13} strokeWidth={1.5} /> Copy link
              </Button>
            </div>
            {fConfirm && (
              <ConfirmDialog
                title={`Share folder ${sharedFolderObj.name}?`}
                body={`${fConfirm.team ? (fConfirm.team.startsWith('#') ? fConfirm.team : `#${fConfirm.team}`) : fConfirm.email} gets ${fConfirm.role} access to every app in ${sharedFolderObj.name}, now and later.`}
                confirmLabel="Share"
                confirmVariant="primary"
                onConfirm={() => { const b = fConfirm; setFConfirm(null); setFShare(''); shareFolderCall(b).then((ok) => ok && toast('Shared')); }}
                onCancel={() => setFConfirm(null)}
              />
            )}
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
