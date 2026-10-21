// Rabbit Hole Settings (owner brief L11, 2026-10-20): the panes, in nav order, and where an older tab name lands.
// Only panes with working controls are listed. Notifications and Connections stay out until something backs them
// (C:/s/spec/ui-changes/L11-report.md lists the backend work); Developer, Identity and Workspace > General are gone.
export const SETTINGS_PANES = [
  { id: 'profile', title: 'Profile' },
  { id: 'appearance', title: 'Appearance & input' },
  { id: 'learning', title: 'Learning & voice' },
  { id: 'usage', title: 'AI usage' },
  { id: 'privacy', title: 'Privacy & security' },
];
export const DEFAULT_PANE = 'profile';

// Old tab names (bookmarks, ?settings=, the bar's open_settings) whose content moved: theme lives in Appearance & input,
// Identity's email in Profile, Security's sign-in and logout in Privacy & security.
const MOVED = { preferences: 'appearance', theme: 'appearance', identity: 'profile', security: 'privacy' };

// -> { pane, removed }: the pane to open, and whether the name asked for a section Settings no longer has
// (Developer, Connections, General, Notifications, Mail & Calendar ...), which opens Profile instead of an empty pane.
export function resolveSettingsTab(tab) {
  if (tab == null || tab === '') return { pane: DEFAULT_PANE, removed: false };
  if (SETTINGS_PANES.some(p => p.id === tab)) return { pane: tab, removed: false };
  if (MOVED[tab]) return { pane: MOVED[tab], removed: false };
  return { pane: DEFAULT_PANE, removed: true };
}

export const paneTitle = id => SETTINGS_PANES.find(p => p.id === id)?.title || null;
