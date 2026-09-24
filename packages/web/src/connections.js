// Settings → Connections catalog (T02 §11). Availability is product state and stays apart
// from account status, which appears only where code can read it. Plain data, no agent
// imports: Settings, the Start dialog and the bar's router all read it.
export const CONNECTIONS = [
  { id: 'github', name: 'GitHub', availability: 'available', adds: 'Understand a repository through its code, map, and Learn canvases.', account: 'No account needed for public repositories. Private repositories: Planned.' },
  { id: 'slack', name: 'Slack', availability: 'available', adds: '@small in channels, /small commands, proposals as buttons.' },
  { id: 'aws', name: 'AWS', availability: 'preview', adds: 'Run CPU jobs in your own AWS account.' },
  { id: 'google-slides', name: 'Google Slides', availability: 'planned', adds: 'Bring presentation material into a Learn canvas.' },
  { id: 'google-drive', name: 'Google Drive / Docs', availability: 'planned', adds: 'Use selected documents as learning sources.', aliases: ['google docs', 'drive', 'docs'] },
  { id: 'notion', name: 'Notion', availability: 'planned', adds: 'Use selected pages as sources for your learning project.' },
];
export const AVAILABILITY = { available: 'Available', preview: 'Dev preview', planned: 'Planned' };

// AWS exists only in builds that enable it (Sidebar.jsx:133).
export const connectionsFor = ({ aws = false } = {}) => CONNECTIONS.filter((c) => c.id !== 'aws' || aws);

// 'Google Slides', 'google-slides' or 'notion' -> its row: the bar's rule 5, connect <provider>.
export function findConnection(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  return CONNECTIONS.find((c) => c.id === t.replace(/ +/g, '-') || c.name.toLowerCase() === t || c.aliases?.includes(t)) || null;
}

// The line the bar shows after open_settings (T02 §11): where Settings opened, and never a
// connection that did not happen.
const TABS = { preferences: 'Preferences', connections: 'Connections' };
export function openedNotice(tab, focus) {
  const where = TABS[tab] ? `Opened Settings → ${TABS[tab]}.` : 'Opened Settings.';
  const c = findConnection(focus);
  return c?.availability === 'planned' ? `${where} ${c.name} is planned; nothing was connected.` : where;
}
