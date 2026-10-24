// Example answers of GET /api/learn/boards/published/weekly-top (docs/features/explore-weekly-top.md): the committed contract the
// Explore UI codes and tests against. Shapes only; the people and canvases are invented. Keep in step with the contract doc
// (the control-plane test test/weekly-top.test.js asserts the server's keys equal these).
const WEEK = {
  ranking_version: 'weekly-top-v1',
  timezone: 'America/Los_Angeles',
  week_start: '2026-10-19T07:00:00.000Z',
  week_end: '2026-10-26T07:00:00.000Z',
  week_start_local: '2026-10-19',
  week_end_local: '2026-10-26',
  calculated_at: '2026-10-23T18:04:11.532Z',
  freshness: { max_age_seconds: 60, pool_calculated_at: '2026-10-23T18:03:40.102Z' },
  star_history_since: '2026-10-19T09:30:12.004Z',
};
const canvas = (rank, token, title, handle, name, stars, forks) => ({
  rank, title, url: `/e/${token}`, thumbnail_url: `/api/learn/boards/published/${token}/thumbnail`,
  creator: { handle, name, url: `/@${handle}` }, weekly_star_count: stars, weekly_fork_count: forks,
});
const creator = (rank, handle, name, avatar, stars, forks) => ({
  rank, handle, name, url: `/@${handle}`, avatar_url: avatar ? `/api/learn/creators/${handle}/avatar?v=2026-10-01` : null,
  weekly_star_supporter_count: stars, weekly_fork_supporter_count: forks,
});

export const CANVAS_EMPTY_MESSAGE = 'No canvases have earned stars or forks yet this week.';
export const CREATOR_EMPTY_MESSAGE = 'No creators have earned stars or forks yet this week.';

// Five entries each, with a tie on stars broken by forks (ranks 2 and 3), a fork-only canvas last, and a creator without a name or picture.
export const weeklyTopFixture = {
  ...WEEK,
  canvases: {
    entries: [
      canvas(1, 'tok-ice-floats', 'Why ice floats', 'ana', 'Ana Lee', 9, 3),
      canvas(2, 'tok-softmax', 'Softmax from scratch', 'ben', 'Ben Ortiz', 6, 4),
      canvas(3, 'tok-attention', 'Attention, drawn out', 'ana', 'Ana Lee', 6, 1),
      canvas(4, 'tok-fourier', 'A first look at Fourier series', 'cara', null, 2, 2),
      canvas(5, 'tok-forks-only', 'Photosynthesis in five cards', 'dev', 'Dev Patel', 0, 1),
    ],
    empty_message: null,
  },
  creators: {
    entries: [
      creator(1, 'ana', 'Ana Lee', true, 13, 4),
      creator(2, 'ben', 'Ben Ortiz', true, 6, 4),
      creator(3, 'cara', null, false, 2, 2),
      creator(4, 'dev', 'Dev Patel', true, 0, 1),
      creator(5, 'eli', 'Eli Fox', false, 0, 1),
    ],
    empty_message: null,
  },
};

// Fewer than five: one canvas and two creators.
export const weeklyTopPartialFixture = {
  ...WEEK,
  canvases: { entries: [canvas(1, 'tok-ice-floats', 'Why ice floats', 'ana', 'Ana Lee', 1, 0)], empty_message: null },
  creators: { entries: [creator(1, 'ana', 'Ana Lee', true, 1, 0), creator(2, 'ben', 'Ben Ortiz', false, 0, 1)], empty_message: null },
};

// Nothing qualified yet (early Monday): empty lists and the neutral messages, no fake rows.
export const weeklyTopEmptyFixture = {
  ...WEEK,
  star_history_since: null,
  canvases: { entries: [], empty_message: CANVAS_EMPTY_MESSAGE },
  creators: { entries: [], empty_message: CREATOR_EMPTY_MESSAGE },
};

// What the endpoint answers on failure (HTTP 500 or 503); the UI hides the section.
export const weeklyTopErrorFixture = { error: 'Weekly Top 5 could not be read.', code: 'weekly_top_failed' };
