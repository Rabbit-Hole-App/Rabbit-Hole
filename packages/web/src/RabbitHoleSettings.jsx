import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleUser, ExternalLink, Gauge, GraduationCap, Shield, SlidersHorizontal, X } from 'lucide-react';
import { applyTheme, getTheme, setTheme } from './api.js';
import { PRODUCT } from './flags.js';
import { getSpeed, setSpeed, SPEEDS } from './learn-audio.js';
import { resolveSettingsTab, SETTINGS_PANES } from './settings-model.js';
import { modKeyLabel, saveUiPref, uiPrefs } from './ui-prefs.js';
import { UsageSettings } from './UsageGauge.jsx';
import { Avatar, Button, cn, IconBtn, Input, SettingsRow, toast } from './ui.jsx';
import { saveProfile, useProfile, useSessionDisplay, useShownIdentity } from './session-display.js';
import { fieldHandle } from '../../control-plane/src/handle.js';

// Rabbit Hole Settings (owner brief L11, 2026-10-20): only controls that work, in the panes settings-model.js lists. Tutor
// On/Off stays in the chat composer, Progress in its panel, and visibility, sharing and comments in each canvas's Share
// panel. Opening Settings reads the profile, the sign-in method and AI usage; it never calls a model.
// Every preference here is saved on this device (there is no account preferences table yet) and says so.
const PANE_ICONS = { profile: CircleUser, appearance: SlidersHorizontal, learning: GraduationCap, usage: Gauge, privacy: Shield };
const PROVIDER_LABELS = { google: 'Google', github: 'GitHub', email: 'Email link' };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="file"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

const Heading = ({ children }) => <h3 className="mt-9 border-b border-line pb-2 text-base font-medium">{children}</h3>;
const PaneTitle = ({ title, intro }) => <><h2 className="text-2xl font-semibold">{title}</h2>{intro && <p className="pt-2 text-base text-ink-2">{intro}</p>}</>;
const ThisDevice = () => <span data-device-pref className="ml-2 rounded-sm bg-hover px-1.5 py-0.5 text-[11px] font-medium text-ink-2">This device</span>;
const SaveError = ({ text }) => (text ? <p role="alert" data-settings-error className="pb-2 text-xs text-fail">{text}</p> : null);

// A row of toggle buttons (aria-pressed): Tab reaches each, Enter or Space picks it.
function Choice({ label, value, options, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-0.5 rounded-lg border border-line p-0.5">
      {options.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={id === value} onClick={() => onChange(id)}
          className={cn('h-7 cursor-pointer rounded-md px-2.5 text-sm', FOCUS_RING, id === value ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 cursor-pointer rounded-full', FOCUS_RING, on ? 'bg-accent' : 'bg-line-strong')}>
      <span className={cn('absolute top-0.5 left-0.5 block h-4 w-4 rounded-full bg-surface shadow-sm', on && 'translate-x-4')} />
    </button>
  );
}

export default function RabbitHoleSettings({ email, initialTab, onClose }) {
  const [start] = useState(() => resolveSettingsTab(initialTab));
  const [tab, setTab] = useState(start.pane);
  const [removed, setRemoved] = useState(start.removed); // an old link asked for a section Settings no longer has
  const session = useSessionDisplay();
  const profile = useProfile();
  const shown = useShownIdentity(email);
  const box = useRef(null);
  useEffect(() => {
    // Focus moves in on open and goes back on close: to what opened Settings when it is still on the page, else the account
    // menu button (the account menu's Settings item is gone by now).
    const opener = document.activeElement;
    box.current?.querySelector('[aria-current="page"]')?.focus();
    // Capture phase: while Settings is the top layer, Esc closes it and nothing under it. A dialog opened inside takes Esc first.
    const esc = (e) => {
      if (e.key !== 'Escape' || box.current?.querySelector('[role="dialog"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('keydown', esc, true);
      const back = opener && opener !== document.body && opener.isConnected ? opener : document.querySelector('[data-account-menu]');
      back?.focus?.();
    };
  }, []);
  // Tab and Shift+Tab stay inside the dialog (aria-modal).
  const trap = (e) => {
    if (e.key !== 'Tab') return;
    const all = [...box.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!all.length) return;
    const [first, last] = [all[0], all[all.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const pick = (id) => { setTab(id); setRemoved(false); };
  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Settings" data-rh-settings onKeyDown={trap} onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[calc(100vh-100px)] max-h-[720px] w-[calc(100vw-100px)] max-w-[1150px] overflow-hidden rounded-2xl bg-white text-ink shadow-pop max-md:h-[calc(100dvh-32px)] max-md:w-[calc(100vw-32px)] max-md:flex-col">
        <nav aria-label="Settings sections" className="w-[260px] shrink-0 overflow-y-auto border-r border-line bg-side px-3 py-4 max-md:w-full max-md:border-r-0 max-md:border-b max-md:py-2">
          <div className="px-2 pb-1 text-xs font-medium text-ink-3 max-md:hidden">Settings</div>
          <div className="flex flex-col gap-0.5 max-md:flex-row max-md:flex-wrap">
            {SETTINGS_PANES.map(({ id, title }) => {
              const Icon = PANE_ICONS[id];
              return (
                <button key={id} type="button" data-settings-nav={id} aria-current={tab === id ? 'page' : undefined} onClick={() => pick(id)}
                  className={cn('flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm', FOCUS_RING, tab === id ? 'bg-hover font-medium' : 'text-ink-2 hover:bg-hover')}>
                  <Icon size={15} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                  {title}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <IconBtn aria-label="Close" title="Close" onClick={onClose} className={cn('absolute top-3 right-3', FOCUS_RING)}><X size={14} /></IconBtn>
          <div data-settings-pane={tab} className="mx-auto max-w-[920px] px-12 py-10 max-md:px-4 max-md:py-6">
            {removed && <p role="status" data-settings-moved className="mb-6 rounded-md bg-hover px-3 py-2 text-sm text-ink-2">That section is no longer in Settings, so it opened on Profile.</p>}
            {tab === 'profile' && <ProfilePane session={session} shown={shown} profile={profile} />}
            {tab === 'appearance' && <AppearancePane />}
            {tab === 'learning' && <LearningPane />}
            {tab === 'usage' && <UsageSettings Heading={Heading} />}
            {tab === 'privacy' && <PrivacyPane session={session} />}
          </div>
        </div>
      </div>
    </div>
  );
  // Portaled: inside the aside it can't show while the sidebar is collapsed or below md (Shell.jsx).
  return createPortal(node, document.body);
}

// Appearance & input: the theme, interface text size, reduced decorative motion and the chat send key, all on this device.
function AppearancePane() {
  const [theme, setThemeState] = useState(getTheme);
  const [prefs, setPrefs] = useState(uiPrefs);
  const [errors, setErrors] = useState({});
  const attempt = (key, run) => {
    try { run(); setErrors((e) => ({ ...e, [key]: null })); } catch (error) { setErrors((e) => ({ ...e, [key]: error.message })); }
  };
  const pref = (name) => (value) => attempt(name, () => { setPrefs((p) => ({ ...p, [name]: value })); saveUiPref(name, value); });
  const mod = modKeyLabel();
  return (
    <>
      <PaneTitle title="Appearance & input" intro={`How ${PRODUCT} looks and responds to your keyboard on this device`} />
      <Heading>Appearance</Heading>
      <SettingsRow title={<>Theme<ThisDevice /></>} desc="System follows your device's light or dark setting">
        <Choice label="Theme" value={theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]}
          onChange={(t) => attempt('theme', () => {
            setThemeState(t);
            try { setTheme(t); } catch { applyTheme(t); throw new Error('Not saved: this browser is not allowing Rabbit Hole to store settings. It applies until you reload.'); }
          })} />
      </SettingsRow>
      <SaveError text={errors.theme} />
      <SettingsRow title={<>Interface text size<ThisDevice /></>} desc="Menus, panels and chat. Canvas content keeps the size it was made at.">
        <Choice label="Interface text size" value={prefs.textSize} options={[['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']]} onChange={pref('textSize')} />
      </SettingsRow>
      <SaveError text={errors.textSize} />
      <SettingsRow title={<>Reduce decorative motion<ThisDevice /></>} desc="Stops interface animations and transitions. Lesson animations keep playing with their own controls.">
        <Switch label="Reduce decorative motion" on={prefs.reduceMotion} onChange={pref('reduceMotion')} />
      </SettingsRow>
      <SaveError text={errors.reduceMotion} />
      <Heading>Input</Heading>
      <SettingsRow title={<>Send chat messages with<ThisDevice /></>}
        desc={prefs.chatSend === 'mod' ? `${mod}+Enter sends; Enter adds a new line. Applies to chat and comment boxes; notebooks and code editors keep their own keys.`
          : `Enter sends; Shift+Enter adds a new line. Applies to chat and comment boxes; notebooks and code editors keep their own keys.`}>
        <Choice label="Send chat messages with" value={prefs.chatSend} options={[['enter', 'Enter'], ['mod', `${mod}+Enter`]]} onChange={pref('chatSend')} />
      </SettingsRow>
      <SaveError text={errors.chatSend} />
    </>
  );
}

// Learning & voice: only what a learning or voice path reads today. Narration speed is learn-audio.js's shared speed, which
// whiteboard narration and lesson pacing start at; the audio's own controls still change it while it plays. Explanation
// language, narration voice and captions have no consuming path yet (L11-report.md), so they are not offered.
function LearningPane() {
  const [speed, setSpeedState] = useState(getSpeed);
  const [error, setError] = useState(null);
  return (
    <>
      <PaneTitle title="Learning & voice" intro="Defaults for lessons and narration. A lesson's own controls can still change them while it plays." />
      <Heading>Narration</Heading>
      <SettingsRow title={<>Playback speed<ThisDevice /></>} desc="Read-aloud narration and lesson pacing start at this speed">
        <Choice label="Playback speed" value={String(speed)} options={SPEEDS.map((s) => [String(s), `${s}×`])}
          onChange={(value) => {
            setSpeedState(Number(value));
            try { setSpeed(Number(value)); setError(null); } catch { setError('Not saved: this browser is not allowing Rabbit Hole to store settings. It applies until you reload.'); }
          }} />
      </SettingsRow>
      <SaveError text={error} />
    </>
  );
}

// Privacy & security: the real sign-in method (GET /auth/session) and logout, which ends every session of the account
// (auth.js bumps users.session_epoch). Session lists, account deletion and remembered learning information have no backend
// yet (L11-report.md); no button pretends otherwise.
function PrivacyPane({ session }) {
  const provider = PROVIDER_LABELS[session?.provider];
  return (
    <>
      <PaneTitle title="Privacy & security" intro="How you sign in, and signing out" />
      <Heading>Sign-in</Heading>
      {provider && <SettingsRow title="Signed in with" desc={session.provider === 'email' ? 'A one-time link or code sent to your email. No password is stored.' : `Your ${provider} account. ${PRODUCT} stores no password.`}>
        <span data-signin-provider className="text-sm text-ink-2">{provider}</span>
      </SettingsRow>}
      <SettingsRow title="Log out" desc={`Ends your ${PRODUCT} sessions on every device, including this one`}>
        <Button variant="secondary" size="sm" onClick={() => { window.location.href = '/logout'; }}>Log out</Button>
      </SettingsRow>
      <p className="pt-6 text-xs text-ink-3">Canvas visibility, sharing and comments are set in each canvas&apos;s Share panel.</p>
    </>
  );
}

// Profile (user, 2026-09-30): the name and picture Rabbit Hole shows for the person, saved to /api/profile
// (session-display.js saveProfile); sign-in details come from GET /auth/session only. A PNG, JPG or WebP picture is
// cropped and redrawn as the small square PNG the server accepts (profile.js validateProfile).
const AVATAR_SIDE = 256;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
async function squarePng(file) {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(AVATAR_SIDE, side);
  canvas.getContext('2d').drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
function ProfilePane({ session, shown, profile }) {
  const [name, setName] = useState(null); // null until edited: shows the saved name
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({}); // { picture | name: message } from the last failed save
  const picker = useRef(null);
  const value = name ?? profile?.name ?? '';
  const save = async (where, patch, done) => {
    setBusy(true);
    try { await saveProfile(patch); toast(done); setName(null); setError({}); } catch (e) { setError({ [where]: `Not saved: ${e.message}` }); }
    setBusy(false);
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return setError({ picture: 'Choose a PNG, JPG or WebP image.' });
    let avatar;
    try { avatar = await squarePng(file); } catch { return setError({ picture: "That image couldn't be read. Choose another PNG, JPG or WebP image." }); }
    await save('picture', { avatar }, 'Picture updated');
  };
  const provider = PROVIDER_LABELS[session?.provider];
  return (
    <>
      <PaneTitle title="Profile" intro={`How you appear in ${PRODUCT}`} />
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Avatar email={shown.email || shown.label || '?'} src={profile?.avatar} className="h-16 w-16 text-xl" />
        <div className="flex flex-wrap gap-2">
          <input ref={picker} type="file" accept={AVATAR_TYPES.join(',')} className="hidden" onChange={upload} data-avatar-input />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => picker.current?.click()}>{profile?.avatar ? 'Change picture' : 'Upload picture'}</Button>
          {profile?.avatar && <Button variant="ghost" size="sm" disabled={busy} onClick={() => save('picture', { avatar: null }, 'Picture removed')}>Remove</Button>}
        </div>
      </div>
      <p className="pt-2 text-xs text-ink-3">PNG, JPG or WebP. It is cropped to a square.</p>
      <SaveError text={error.picture} />
      <Heading>Account</Heading>
      <SettingsRow title="Name" desc="Shown in the sidebar and across the app">
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save('name', { name: value }, 'Name saved'); }}>
          <Input value={value} maxLength={60} placeholder={session?.display?.name || 'Your name'} onChange={(e) => setName(e.target.value)} className="w-56 max-md:w-40" aria-label="Name" />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || name === null || value === (profile?.name ?? '')}>Save</Button>
        </form>
      </SettingsRow>
      <SaveError text={error.name} />
      <HandleRow profile={profile} />
      <DescriptionRow profile={profile} />
      {profile?.handle && <SettingsRow title="Public profile" desc={`Your picture, name, description and published canvases at /@${profile.handle}`}>
        <a data-public-profile href={`/@${profile.handle}`} className={cn('inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 text-[13px] font-medium text-ink hover:bg-hover', FOCUS_RING)}>
          View public profile<ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </SettingsRow>}
      <SettingsRow title="Email" desc={session?.provider === 'email' ? 'Where sign-in links go' : provider ? `From your ${provider} account` : null}>
        <span className="text-sm text-ink-2">{shown.email || 'Not shared'}</span>
      </SettingsRow>
      {provider && <SettingsRow title="Signed in with"><span className="text-sm text-ink-2">{provider}</span></SettingsRow>}
    </>
  );
}

// Profile > Handle (docs/features/user-handles.md): the public @handle, changeable. The server checks the rules and that
// nobody else has it; every canvas shows the new one at once, because canvases refer to the person.
function HandleRow({ profile }) {
  const [draft, setDraft] = useState(null); // null until edited: shows the saved handle
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const value = draft ?? profile?.handle ?? '';
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await saveProfile({ handle: value }); toast('Handle saved'); setDraft(null); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <SettingsRow title="Handle" desc="Your public name on canvases you share or publish">
      <form className="flex flex-col items-end gap-1" onSubmit={save}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-3">@</span>
          <Input value={value} maxLength={31} spellCheck={false} autoCapitalize="none" onChange={(e) => { setDraft(fieldHandle(e.target.value)); setError(''); }} className="w-48 max-md:w-32" aria-label="Handle" />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || draft === null || value === (profile?.handle ?? '')}>Save</Button>
        </div>
        {error && <p data-handle-error role="alert" className="text-xs text-fail">{error}</p>}
      </form>
    </SettingsRow>
  );
}

// Profile > Description (docs/features/creator-profile.md, owner 2026-10-08): a short line shown under your name on /@handle
// and on your creator card. Plain text: the server keeps it on one line, at most profile.js DESCRIPTION_MAX characters, and an
// empty one clears it; it is shown as text, never HTML or a link.
const DESCRIPTION_MAX = 160;
function DescriptionRow({ profile }) {
  const [draft, setDraft] = useState(null); // null until edited: shows the saved description
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = draft ?? profile?.description ?? '';
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { const saved = await saveProfile({ description: value }); toast(saved.description ? 'Description saved' : 'Description removed'); setDraft(null); } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(false);
  };
  return (
    <SettingsRow title="Description" desc="Shown on your profile and your creator card">
      <form className="flex flex-col items-end gap-1" onSubmit={save}>
        <textarea data-profile-description-input value={value} maxLength={DESCRIPTION_MAX} rows={3} placeholder="What you explore and explain" aria-label="Description"
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[72px] w-72 resize-none rounded-sm [field-sizing:content] border border-transparent bg-code px-2 py-1.5 text-sm outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-ink-3 focus:border-line-strong focus:bg-white focus:ring-2 focus:ring-accent/20 max-md:w-52" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">{value.length}/{DESCRIPTION_MAX}</span>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || draft === null || value === (profile?.description ?? '')}>Save</Button>
        </div>
        {error && <p role="alert" data-settings-error className="text-xs text-fail">{error}</p>}
      </form>
    </SettingsRow>
  );
}
