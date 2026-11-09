# Creator discovery backend handoff

Claude can use this contract with the [Explore reference](EXPLORE.md) and [creator profile reference](CREATOR-PROFILE.md). The HTML fixtures exercise the UI with local data. The items below are the pending app integration.

## Engagement totals

| Response | Add | Keep |
| --- | --- | --- |
| `GET /api/learn/creators` and creator recommendations from `creatorsByHandle` | `received_star_count` and `fork_count` on each creator row | Existing public project and canvas counts and canonical profile URL |
| `GET /api/learn/creators/:handle` | `received_star_count` | Existing aggregate `fork_count`, `explainer_count`, and `starred_count` for the Stars tab |

- Compute the new totals on the server from the full set of each creator's eligible `PUBLISHED` canvases. Use the canonical `STAR_COUNT` and `FORK_COUNT` definitions. Aggregate before applying the profile's search, sort, or page limit. The same creator's public profile, discovery row, and Recommended row should agree.
- Exclude private, unlisted, archived, nested, and trashed source canvases through the existing publication rule. Unpublishing a canvas removes its engagement from these aggregates. Use the existing count semantics for active stars and direct forks. A supporter who starred two eligible canvases contributes two received stars.
- Keep `starred_count` for public canvases the creator starred. The weekly ranking still counts distinct supporters in that week. Public counts are available to signed-out viewers. Missing fields during a rollout should be omitted from the UI until the server sends them. The design omits a zero engagement count.
- The existing publication, star, and fork relations contain the required data. The contract calls for additive response fields and aggregation queries. Evaluate the query cost against the existing indexes before deciding whether anything needs to be persisted.

[Creator routes and row serializer](../../packages/control-plane/src/creators.js) · [Public set](../../packages/control-plane/src/learn-boards.js) · [Star count](../../packages/control-plane/src/canvas-stars.js) · [Fork count](../../packages/control-plane/src/canvases.js)

## Paginate Explore creators

`GET /api/learn/creators?q=…` currently returns up to eight rows and the total number of matches. Keep eight as the first page size. Add an optional opaque `cursor` query parameter and an additive `next_cursor` response field. A null cursor means the final page. Keep `total` as the count for the whole query.

- Preserve the existing order and exact-handle search priority. Include a stable tie-breaker in the cursor so creators with the same publication timestamp paginate without repeats or omissions. Validate the cursor against the normalized query and reject invalid or mismatched cursors with a 400.
- Append the next page to the current result list. Use the cursor to decide when to show **Show more creators**. Keep loaded rows in place during a pending request or retry. Reset the cursor and rows when the query changes. Ignore a response for a previous query and deduplicate by handle when appending.
- Continue to scope search to creators with at least one eligible publication. The weekly list and AI recommendations stay independent of creator pagination.

[Existing creator search and discovery query](../../packages/control-plane/src/creators.js) · [Explore](../../packages/web/src/Home.jsx)

## Use the existing error and navigation contracts

- The profile API already distinguishes an unknown handle with a 404. Use **Creator not found** for that response and offer **Browse creators** on a direct visit. A network failure or server error shows **Couldn’t load profile** with **Retry**. A successful profile with no publications keeps its identity and Stars tab. No endpoint change is needed for this distinction.
- Profile search uses the existing `q` parameter. **Clear search** resets it and returns focus to the input. Keep profile totals stable and handle a failed search separately from zero matches.
- For **Back to Explore**, retain the source tab, query, loaded creator pages, scroll position, and opener focus. For **Back to canvas**, preserve the actual internal shared-canvas route and its state. Use a verified in-app origin and fall back to `/explore?tab=creators` for a direct link. The route restoration is client work.
- Preserve the signed-out public profile and keep Settings and Analytics available only to the owner. Check both layouts at narrow widths and verify the real actions in the app.

[Profile view](../../packages/web/src/CreatorProfile.jsx) · [Shared canvas creator link](../../packages/web/src/SharedBoardPage.jsx)

## Acceptance checks

- One creator's totals agree across discovery, search, Recommended, and the profile, including when a search shows a subset of canvases.
- Unpublish one board and verify its contribution disappears. Verify that starred canvases and weekly supporters retain their separate meanings.
- Browse or search for more than eight creators. Verify appended order, the final page, a cursor from another query, and a page error followed by retry.
- Check direct visits, valid empty profiles, missing handles, retryable failures, and both return paths with a keyboard and on a narrow screen.
