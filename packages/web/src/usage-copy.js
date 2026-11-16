// packages/web/src/usage-copy.js
// The words of the usage limits (usage-limits-spec.md, owner 2026-11-15): one table for the menu bar gauge, its popover and Settings > Usage. The word "credit" is not on screen:
// AI answers spend AI units (1 AI unit = US$0.01), machines spend Compute units (1 Compute unit = US$0.01 of compute). The server wire keeps its field names.
export const USAGE_COPY = Object.freeze({
  menu: 'Usage limit',
  settingsTitle: 'Usage',
  addUnits: 'Add units',
  viewUsage: 'View usage',
  ai: { title: 'AI usage', unit: 'AI unit', units: 'AI units', counts: 'Every AI answer, explanation and plan.', every: 'AI units every month' },
  compute: {
    title: 'Compute usage', unit: 'Compute unit', units: 'Compute units', counts: 'Every minute a machine runs your rehearsal or your Run card session.',
    every: 'Compute units every month', notMetered: "Compute usage isn't metered on this server yet.", unavailable: 'Compute usage is unavailable right now.',
    byMachine: 'This month by machine', byMachineEmpty: 'No machine has run for you this month.', rehearsal: 'rehearsal', session: 'session',
    minutesLeft: minutes => `About ${minutes} minutes of compute left this month.`,
  },
  renewal: 'At the start of each calendar month in UTC, shown in your time. Unused units do not carry over.',
});
