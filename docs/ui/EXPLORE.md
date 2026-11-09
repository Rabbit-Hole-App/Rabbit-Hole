# Explore

[Empty Explore](clean/47-explore-empty.html) · [Explore with canvases](clean/48-explore-canvases.html)

This reference follows Explore on main at `cf5f811cdaf013e7b9f0ae12ed27fe4793f94ee0`. The screen reuses the approved browse palette, sidebar, Library controls, and canvas summary shell. Both previews can switch between Canvases and Creators.

## Layout and behavior

| State | Controls and content |
| --- | --- |
| Empty Canvases | Keep Search canvases, Filters, and Card size. Hide Sort when the result count is zero. Leave the unfiltered results area blank. The sidebar keeps the viewer’s Recent entries. |
| Canvases with results | Place Search, Filters, Sort, and Card size on one row with horizontal overflow when needed. Put Browse canvases above the regular canvas cards and below the weekly list when it has entries. |
| Search or filtered results | The input applies to the active tab. Show Clear search when a query yields no keyword matches. Sort follows the number of results. |
| Creators | Use Search creators, Top creators this week when available, then Browse creators above the count and profile rows with lifetime stars and forks. |

- The magnifier sits to the left of the input border, matching the Library reference. Filters offers Projects and Canvas. Sort offers Newest, Recently updated, and Most forked. Sort and Card size affect the regular cards. The preview uses the same four sizes and local size preference as Home and Library.
- The default tab is Canvases. Arrow keys and Home or End change the selected tab. App integration retains `/explore?tab=creators`, its search debounce, and the existing project and type URL filters.
- Public canvas cards use the shared summary, a Public pill, Star, Start Rabbit Hole, Fork count, and the hover or focus Open action. Hide the Star count at zero. Map the owner and sign-in branches to the existing public card actions. Use the same card shell for filtered project results.
- Keep the active query, public visibility, canonical links, server ordering, and action routing in the app's existing components. The preview uses local fixtures for review.

## Search previews

| Preview | Starting state |
| --- | --- |
| [Canvas search](clean/49-explore-canvas-search.html) | The Explore field is focused with `softmax` entered. The matching public canvas is below the toolbar. |
| [Creator search](clean/50-explore-creator-search.html) | Creators is selected with `ana` entered. Open **View profile** and return to the same search. Clear the field to see Top creators this week and try **Show more creators** below the first eight. |
| [Sidebar Search](clean/51-explore-library-search.html) | The Library search modal opens over Explore. The input has focus and the Library rows show recent items first. |

Clicking the Explore input focuses it in place. A nonblank query hides the weekly section immediately. After a 250 ms pause, the app searches published canvases and projects or creators, depending on the active tab. Clearing the query brings the weekly section back if it has entries. [Explore in Home.jsx](../../packages/web/src/Home.jsx)

The approved preview adds a Clear search action below the no-match message. It resets the query, cancels pending keyword and recommendation work, restores browsing, and returns focus to the input. It preserves the active tab and filters. Browse headings label nonempty canvas and creator lists while browsing.

For an eligible signed-in search of at least four words, Recommended shows a loading line and can return picks above keyword results after a separate 700 ms debounce. Type `show me how softmax works` on Canvases or `find creators who explain science` on Creators to see sample picks. The previews use fixed responses and independent keyword results. A canvas type or project filter hides Recommended on Canvases. [Explore find](../../packages/web/src/home/explore-find.js) · [Recommended in PublicCards.jsx](../../packages/web/src/home/PublicCards.jsx)

Sidebar Search uses the account Library. The reviewed modal shell contains the app's input placeholder and grouped result rows. Type `confusion matrix` to see a sample Runbooks match. See the [sidebar search contract](SIDEBAR.md#search) for keyboard behavior and scope.

## Weekly rankings

Place the ranking between the toolbar and the regular results. Each row has its rank, thumbnail or avatar, canvas title or creator name, handle, weekly star and fork figures, and Open or View profile on hover or keyboard focus. Keep the action visible on touch. The fixture mirrors the app’s five sample rows, including a canvas with forks and zero weekly stars. The ranking figures represent activity this week. Canvas card actions use the lifetime counts.

Use the API’s order and render up to five entries. The section is independent of regular results, sort, filters, and card size. A nonblank search hides it and clearing the search restores it. An empty or failed weekly response leaves the section out entirely. Preserve the app’s in-flight skeleton. [Weekly Top contract](../features/explore-weekly-top.md)

## Creator cards

Keep **View profile** visible on each regular Creator card, including search and Recommended. The compact weekly row reveals its action on hover or keyboard focus and shows it on touch.

Show eight regular creator rows in the first batch. **Show more creators** appends additional rows and moves keyboard focus to the first new profile link. The control disappears when the list is complete. A new search starts at the first batch. The [backend handoff](CREATOR-DISCOVERY-BACKEND.md#paginate-explore-creators) specifies the cursor API.

Below the weekly ranking, show the creator's lifetime stars received and forks after their public project and canvas counts. These totals cover all their currently published canvases and stay the same when searching. The weekly Creator row counts distinct supporters within the week. See [CREATOR-PROFILE.md](CREATOR-PROFILE.md#counts) for the data contract and API gaps.

## Component mapping

| Element | Preview reference | App mapping |
| --- | --- | --- |
| Sidebar and Recent | [SIDEBAR.md](SIDEBAR.md) | [Sidebar.jsx](../../packages/web/src/Sidebar.jsx) |
| Explore header, tabs, and empty state | [explore.html](templates/explore.html) | [Home.jsx](../../packages/web/src/Home.jsx) |
| Search, Filters, Sort, and Card size | [LIBRARY.md](LIBRARY.md) and [CANVAS-CARD.md](CANVAS-CARD.md) | [Home.jsx](../../packages/web/src/Home.jsx), [LibraryViews.jsx](../../packages/web/src/LibraryViews.jsx), and [CardSize.jsx](../../packages/web/src/home/CardSize.jsx) |
| Public summaries and creator rows | [public-canvas-card.html](templates/public-canvas-card.html) and [explore.html](templates/explore.html) | [LearningCard.jsx](../../packages/web/src/home/LearningCard.jsx) and [PublicCards.jsx](../../packages/web/src/home/PublicCards.jsx) |
| Weekly row layout and rules | [explore.css](styles/explore.css) and [explore.js](scripts/explore.js) | [WeeklyTop.jsx](../../packages/web/src/home/WeeklyTop.jsx) and [weekly-top-fixture.js](../../packages/web/src/home/weekly-top-fixture.js) |

Open, Start, and Fork use local review actions in the previews. Real navigation, account state, recommendation requests, rankings, and persistence use the existing app paths. Structural and fixture interaction checks cover the five exports. Browser layout and runtime verification are pending.
