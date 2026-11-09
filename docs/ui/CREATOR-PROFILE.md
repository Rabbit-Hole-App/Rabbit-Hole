# Creator profile

| Preview | Starting state |
| --- | --- |
| [Explore → creator profile](clean/50-explore-creator-search.html) | Select **View profile** and go back to the same search. Clear the query to try **Show more creators**. |
| [With published canvases](clean/52-creator-profile.html) | Ana's published canvases and Stars. Search for a missing title to try **Clear search**. |
| [Without published canvases](clean/53-creator-profile-empty.html) | The public identity stays visible. The separate Stars collection can still have entries. |
| [Profile load failure](clean/54-creator-profile-error.html) | **Retry** shows the loading skeleton and restores the sample profile. |
| [Creator not found](clean/55-creator-profile-not-found.html) | **Browse creators** leads to discovery. |
| [Own profile](clean/56-creator-profile-owner.html) | Shows the owner badge, Edit profile, and Analytics layout. |
| [Signed-out profile](clean/57-creator-profile-signed-out.html) | Shows the compact Rabbit Hole brand header in the public shell. |

Each HTML file contains both the Explore and profile views. The profile uses the same header and tabs across the layout variants. In the linked Explore preview, open a creator other than Ana and select Stars to see its empty state. The owner buttons reference the app's existing Settings and Analytics actions.

## Profile entry point

Keep **View profile** visible on regular Creator cards under **Browse creators**, in creator search results and in Recommended. It is the primary action on those cards and needs to be discoverable without a pointer. The weekly rows can reveal the action on hover and keyboard focus, with touch visibility. The creator name and handle also link to the profile from the weekly list. See [EXPLORE.md](EXPLORE.md#creator-cards).

## Return navigation

Keep the return link above the profile header and recovery states. It stays visible with the sidebar collapsed.

| Entry | Return action |
| --- | --- |
| Explore creator rows, weekly ranking, or a creator link inside Explore | **Back to Explore** restores the tab, search, loaded rows, scroll position, and keyboard focus. |
| Direct profile link | **Browse creators** opens Explore on Creators. The app fallback is `/explore?tab=creators`. |
| Open public canvas | **Back to canvas** returns to that canvas. Map this context in the existing shared-canvas route during app integration. |

The preview implements the first two rows within one HTML file. See the [app handoff](CREATOR-DISCOVERY-BACKEND.md#use-the-existing-error-and-navigation-contracts) for routing and safe origin handling.

## Counts

| Where | What the figures mean |
| --- | --- |
| Profile identity, below the description | Published learning boards, lifetime stars received, and lifetime forks across the creator's currently public boards. In the fixture, the two boards have 24 and 18 stars and 8 and 7 forks. The profile shows 42 stars received and 15 forks. |
| Regular Creator cards below the weekly list | The same lifetime engagement figures, after the public project and canvas counts. Search and Recommended use the same row. |
| Top creators this week | The number of distinct people who starred or forked that creator's eligible canvases this week. Keep the existing ranking figures. |
| Stars tab | The number of currently public canvases the profile owner has starred. The collection can have entries when the creator has no published canvases. |
| Public canvas card | The individual canvas's stars and forks. |

Aggregate canonical `STAR_COUNT` and `FORK_COUNT` over the creator's full `PUBLISHED` set, before filtering, sorting or limiting the displayed cards. Two stars from the same person on two different canvases count as two received stars. When a canvas leaves the public set, its counts leave the aggregate. A zero engagement total is omitted in the preview. A profile with no publications shows “0 public learning boards” and keeps its Stars tab.

The [backend handoff](CREATOR-DISCOVERY-BACKEND.md#engagement-totals) specifies the missing aggregate fields for the profile and creator rows. The HTML uses its unfiltered fixture data for totals.

## Layout and behavior

- Use the shared initials or uploaded-avatar treatment at 128 px on desktop and 96 px on narrow screens. Keep the name, handle, Copy profile link, optional description, and totals next to the avatar. Allow the copy button to wrap under the handle.
- Use the shared Canvases and Stars tabs. Keep search beside Sort for published canvases and move the field below on narrow screens. The search icon sits beside the input. Show Sort when the creator has at least two published boards and search when they have at least one. Search matches this creator's public canvas titles and public project names. Use a 250 ms debounce, Escape to clear, and the existing Projects and Canvases headings for matches. A search with no matches shows **Clear search**, which returns focus to the field.
- Use the shared public canvas summary, including its Star, Start Rabbit Hole, Fork, Open and Copy link actions. The profile uses one row per board, with the card's existing narrow-width layout. Keep Newest and Most forked in the shared icon menu.
- Keep the header and tab positions consistent in the empty view. Place the empty icon and message on the page surface, under Public Learning Boards. Stars has its own empty state. Use separate recovery views for an unavailable handle and a retryable load failure.

## Component mapping

| Element | Library reference | App source |
| --- | --- | --- |
| Signed-in shell and active Explore | [SIDEBAR.md](SIDEBAR.md) | [Shell.jsx](../../packages/web/src/Shell.jsx) |
| Profile identity, tabs and collections | [creator-profile-view.html](templates/creator-profile-view.html), [creator-profile.css](styles/creator-profile.css) and [creator-profile.js](scripts/creator-profile.js) | [CreatorProfile.jsx](../../packages/web/src/CreatorProfile.jsx) and [CreatorAvatar / CopyProfileLink](../../packages/web/src/home/PublicCards.jsx) |
| Tab styles, search field, icon menu and empty surface | [EXPLORE.md](EXPLORE.md) and [LIBRARY.md](LIBRARY.md) | [CreatorProfile.jsx](../../packages/web/src/CreatorProfile.jsx) and [SortMenu in LearningCard.jsx](../../packages/web/src/home/LearningCard.jsx) |
| Published and starred canvas summaries | [CANVAS-CARD.md](CANVAS-CARD.md), [public-canvas-card.html](templates/public-canvas-card.html) and [public-browse.js](scripts/public-browse.js), shared with Explore | [PublicCards.jsx](../../packages/web/src/home/PublicCards.jsx) and [LearningCard.jsx](../../packages/web/src/home/LearningCard.jsx) |
| Public profile, creator lists and counters | [Creator profile feature](../features/creator-profile.md) | [creators.js](../../packages/control-plane/src/creators.js) |

App mappings were checked against main at `cf5f811cdaf013e7b9f0ae12ed27fe4793f94ee0`. The fixtures support local search, sort, tabs and Star toggles. Copy profile link copies the fixture address when clipboard access is available. Open, Start, Fork, Edit profile and Analytics use local review actions. The structural and fixture checks cover the linked return flow, pagination, recovery, keyboard tabs, search, Star updates and role-specific layouts. Browser layout and runtime verification are pending.
