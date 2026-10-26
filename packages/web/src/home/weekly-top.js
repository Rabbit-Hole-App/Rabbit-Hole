// Weekly Top 5 in Explore (docs/features/explore-weekly-top.md, owner brief 2026-10-23): the pure side - the request, the
// rows each tab shows, the week label and the analytics events with their once-per-tab rule. No React here, so it is tested.
import { reportClientEvent } from '../client-telemetry.js';
export const WEEKLY_TOP_URL = '/api/learn/boards/published/weekly-top';
// The Explore tab ids (card-sort.js EXPLORE_TABS) and the contract's list names. The Canvases tab keeps the internal id `explainers`.
const LISTS = { explainers: 'canvases', creators: 'creators' };
export const analyticsTab = (tab) => LISTS[tab] || null;

// Hidden while the search field holds anything but whitespace, restored when it is cleared (brief 4.5): the typed text, not the debounced term.
export const weeklyVisible = (typed) => !String(typed ?? '').trim();

// The tab's entries and its neutral message, or null when the answer has no usable list for the tab (the section then stays out).
export function weeklyList(data, tab) {
  const list = data?.[LISTS[tab]];
  if (!list || !Array.isArray(list.entries)) return null;
  return { entries: list.entries.slice(0, 5), message: list.empty_message || 'Nothing has earned stars or forks yet this week.' };
}

// "Oct 19 to Oct 25" from the contract's Los Angeles dates (week_end_local is exclusive); the browser never recomputes the boundaries.
const day = (iso) => new Date(`${iso}T12:00:00Z`);
const MONTH_DAY = { month: 'short', day: 'numeric', timeZone: 'UTC' };
export function weekLabel(data) {
  if (!/^\d{4}-\d\d-\d\d$/.test(data?.week_start_local || '') || !/^\d{4}-\d\d-\d\d$/.test(data?.week_end_local || '')) return null;
  const last = new Date(day(data.week_end_local).getTime() - 86400000);
  return `${day(data.week_start_local).toLocaleDateString('en-US', MONTH_DAY)} to ${last.toLocaleDateString('en-US', MONTH_DAY)}`;
}

// Star history only starts when it was first recorded (brief 8.9): when that falls inside the shown week, say so; else null.
export function starsSinceLabel(data) {
  const since = data?.star_history_since;
  if (!since || !(since > data.week_start && since < data.week_end)) return null;
  return `Stars are counted from ${new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: data.timezone || 'America/Los_Angeles' })}.`;
}

// Reads the endpoint's answer: { data } or { failure: { status, code } } (a non-200, an unreadable body, or a body with neither list).
export async function readWeekly(response) {
  const body = await response.json().catch(() => null);
  if (response.ok && body && body.canvases && body.creators) return { data: body };
  return { failure: { status: response.status, code: body?.code || 'unreadable' } };
}

// Events leave twice: as the DOM event the browser check observes, and through the client telemetry channel (client-telemetry.js
// reportClientEvent -> POST /api/telemetry/client), which keeps nothing where no telemetry is bound. Neither can break the page.
// ponytail: signed-out visitors are counted without an account, and an identical repeat inside 10 minutes is one stored row (the route's dedup).
export function sendWeeklyEvent(name, fields) {
  try { window.dispatchEvent(new CustomEvent('weekly-top:event', { detail: { name, ...fields } })); } catch { /* telemetry never breaks the page */ }
  try { reportClientEvent(name, fields); } catch { /* nor does the sink */ }
}

// weekly_top.viewed: once per tab, per week, per page load (a rerender, a search that hides and restores the section, a refetch never repeats it).
export function viewedOnce() {
  const seen = new Set();
  return (tab, data) => {
    const key = `${analyticsTab(tab)}|${data?.week_start_local}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

export const viewedFields = (tab, data, list, ms) => ({ tab: analyticsTab(tab), week_start_local: data.week_start_local, ranking_version: data.ranking_version, entry_count: list.entries.length, duration_ms: ms });
export const openedFields = (tab, data, rank, target) => ({ tab: analyticsTab(tab), rank, target, week_start_local: data.week_start_local, ranking_version: data.ranking_version });
