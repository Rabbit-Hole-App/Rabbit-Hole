# Inline AI editor (Ctrl/Cmd + K)

Owner brief, 2026-10-12. Implement this spec; don't expand it.

## Implementation status

**Shipped c044b86a, 2026-10-13** (production, digrabbithole.com), with learn migration 0018. In production the inline
routes run in rabbit-hole-app (app-worker.js runs dev-worker.js), under that worker's own secrets: TYPESAFE_API_KEY
for JEV routing and the Anthropic keys for notes and edits. Spend is enforced there, so every paid call, routing
included, needs USAGE_PLATFORM_DAY_USD on rabbit-hole-app. Without it, routing comes back unavailable and every
request falls back to the short note (Couldn't choose a format).

Follow-ups after c044b86a (branch fix/inline-prod-routes):
- A release refuses when rabbit-hole-app or rabbit-hole-cp lacks USAGE_PLATFORM_DAY_USD (prod-release.mjs).
- A routing call refused with a 400 is recorded as skipped (bypassed), never jev.
- A short target left out by the context budget gets its own message (select fewer objects), not the long-text one.
- The clipped-target list stays with the frozen target and is never sent (500 stickies stayed under the body limit).
- Still open: Motion is not enabled in production builds; the A2 frame-rate browser check is load-sensitive on a
  busy machine; the local app worker can die under load in dive-check (also on the base without this lane).

Where it lives:
- `web/src/inline-ai-context.js` - the bounded context package (§3), its per-board incremental cache (A1) and the
  stale fingerprints (§11). Content records stay apart from layout, so a move reuses a description.
- `web/src/inline-ai-route.js` - inline routes on the shared registry (A6), the plain-explain bypass, the JEV Choice
  request and its own validator and thresholds (§6). The worker imports the same file.
- `web/src/inline-ai-apply.js` - edits checked in code against the frozen target, the explain, card and edit
  transactions, note placement (§8-§9).
- `web/src/inline-ai-session.js` - one request's life: tokens against late results, idempotent reuse, coalesced
  streaming, per-request metrics (§10-§11, A2, A3).
- `web/src/inline-ai-transport.js` - the SSE reader and the page's transport; cards come from
  `learn-slash.js generateCommand`, the same call `/command` makes, without its insert (§7).
- `web/src/InlineAiEditor.jsx` - the popover and its preview overlay. `AdaptiveCanvas.jsx` holds the hooks
  (Ctrl/Cmd+K, the canvas menu row, the adapter, one-step apply); `LearnPage.jsx` passes `inlineAi` and adds the Edit
  menu row; `Dive.jsx` leaves Ctrl/Cmd+K to the inline editor on an eligible selection.
- `control-plane/src/learn-inline.js` (prompts in `agents/learn-inline.js`) - `/api/learn/inline/route`,
  `/api/learn/inline/generate` (SSE) and `/api/learn/inline/telemetry`; `learn-migrations/0018-inline-ai-telemetry.sql`
  (A5). The migration is applied to local stacks only; shared dev and production wait for the owner's GO.

Checks: unit (`web/src/inline-ai-*.test.mjs`, `control-plane/test/learn-inline*.test.js`); browser with a mocked
transport (`web/e2e/inline-ai-check.mjs`); real provider on a local stack (`web/e2e/inline-ai-real.mjs`, every request
reserved in a spend ledger first); A3 benchmark and report from the telemetry rows (`web/e2e/inline-ai-bench.mjs`,
`web/e2e/inline-ai-report.mjs`).

Defaults taken within the spec:
- Ctrl/Cmd+K on an eligible canvas selection opens the inline editor. Dive's Ctrl+K stands down there; /dive and Start
  Rabbit Hole stay the ways down. Since 2026-10-13 (owner brief, selection-action-bar.md) the chord is the canvas's wherever it has the
  focus, with no eligible selection too (the "Select something" hint, never Search): Search moved to Ctrl/Cmd+Shift+F, and
  `shortcut-owner.js` decides who takes each chord.
- Explain adds explanatory output, so /quiz, /practice and /flashcards are not inline (they stay direct commands);
  /simplify, /example and /deeper are the direct note path inline, never a chat message.
- A paid result (Motion, maths animation, video, 3D) is accepted as its existing card, already confirmed: the job runs
  and keeps its durable record on that card, as the direct command's does. A finished video is not previewed before it
  is on the canvas.
- The explanation note is a native rect shape with editable text and a dashed annotation connector
  (`kind: 'annotation'`); a connector is drawn when the target is one shape or card. An annotation is known by that
  kind on the link, never by its dash. No other reader of a board's links treats them as structure: the Dive tree and
  map read `canvas_dives`, the owned Tutor outline reads cards, the shared-canvas Ask and Tutor read words only; copy,
  delete, save and the style panel only carry them (`inline-ai-annotation.test.mjs` lists every reader).
- Accept checks the preview's own source snapshot (taken when that preview was made) against the source as it is
  now, unsaved words in an open text editor included. A refine that is cancelled or fails keeps the earlier preview
  and its snapshot; a refine that succeeds brings its own. Selection only is locked while a preview shows.
- A refine (§10) revises the preview on screen: the same output, with the earlier candidate and the original request
  sent beside the new words. A / command or the other pill is a new request. The replaced candidate's telemetry row
  is settled as `refined`.
- One request limit, `PROMPT_MAX` (1000) in `inline-ai-route.js`, shared by the editor and the worker: the editor
  shows the count while writing and holds Submit back over it; the worker refuses an over-limit prompt with the
  reason; a refused routing call is that error, never a quiet plain note.
- A handler gets its input resolved first: an explicit command's own words; for a bare command, the selection's
  words as its subject; a routed sentence as written, except a photo search, which searches the selection's words.
  With no subject (a shape with no words) the editor asks for the missing input. Never the bare slash token, never
  the canvas title (Motion's concept is the selection's subject).
- Telemetry: `user_id` is users.id on every board kind (repo- and live-app boards read the signed-in person);
  `route` is jev only when that request asked JEV, direct for an explicit / command, bypassed otherwise.

Known limits: edit previews arrive whole (the provider streams tool input in one piece); notebook cells and card
bodies other than a code sample's code are not edited inline; idempotency is per editor session in the browser, with
no server-side request store (that would need a new table).

Implement a selection-aware inline AI editor for the Rabbit Hole canvas, inspired by Cursor’s Ctrl/Cmd + K interaction.

This is an addition to our existing canvas and Tutor features—not a replacement for the chat, slash-command system, or existing generation pipelines.

Read the current branch and repository instructions first. Earlier inspection found existing canvas persistence, live selected-card descriptions, a shared command registry, artifact handlers, and the JEV client. Recheck those implementations before extending them.

## 1. Intended experience

The user selects a shape, group, text, code, or another supported canvas object, then presses:

- Ctrl + K on Windows/Linux.
- Cmd + K on macOS.

A compact floating editor opens near the selection with two selectable pills:

- **Edit:** change the selected content or objects.
- **Explain:** add explanatory content beside the selection without changing the original.

The editor contains the prompt field, a visible submit button, and clear generation/error states. Keep it lightweight and visually consistent with our canvas.

Examples:

| Mode | Request | Expected behavior |
|---|---|---|
| Edit | “Make this shorter” | Preview a shorter version of the selected text. |
| Edit | “Make these labels larger” | Preview label-size changes on the selected objects only. |
| Edit | “Fix this function” | Preview changes to the selected code; do not execute it. |
| Explain | “Explain this node” | Preview a small native text annotation with a connector when useful. |
| Explain | “Explain how these objects connect” | Explain their relationships using the selected group and relevant context. |
| Explain | “Explain this with Python” | Add an explanation and code example. |
| Explain | “Explain this with a diagram” | Use the existing diagram capability. |
| Explain | “Explain this in a video” | Use the Motion explainer capability when available, preserving its confirmation and availability gates. |

Do not open a new full chat interface for this interaction.

## 2. Selection, focus, and keyboard behavior

Capture the target before moving keyboard focus into the inline editor.

Selection precedence:

1. A selected text/code range.
2. Selected individual objects.
3. A selected group or multiselection.

A text range inside an object must not accidentally become permission to rewrite the entire object or group.

Freeze the target identities for the inline session. Keep a visible target indicator while the editor is open. Clicking another object must not silently redirect an existing prompt or in-flight result to it.

For groups, resolve and retain the actual selected member IDs. Ctrl/Cmd selection inside a group must target the chosen member, not the whole saved group.

Shortcut handling must be scoped:

- Use inline Ctrl/Cmd + K only when the canvas or a canvas-owned editor has an eligible selection.
- Preserve existing global command-palette or other editor behavior outside that scope.
- With no eligible selection, preserve the existing global shortcut. If no existing action applies, show a short “Select something to edit or explain” message.
- Do not silently interpret no selection as the entire canvas.
- Do not intercept shortcuts during IME composition.

Also expose the same entry point through the existing selection/context toolbar so the feature is usable without a keyboard shortcut.

Follow the existing composer convention for Enter versus multiline input, and show the submit shortcut visibly. Escape should dismiss the innermost menu/editor first; it must not simultaneously close the editor and deselect the canvas.

## 3. Context: selected objects plus relevant surroundings

Do not send only the selected label or object. Build a bounded context package at submission time.

Include, in priority order:

1. **Exact target:** selected text/code, object content, IDs, types, relevant properties, and selected ranges.
2. **Connected objects:** incoming/outgoing connections, direction, labels, and relevant connected nodes—even when off-screen.
3. **Group/section context:** containing group, heading, and relevant sibling objects.
4. **Nearby annotations:** labels and notes that help interpret the selection.
5. **Broader context:** canvas title, learning goal, and a short relevant conversation excerpt when available.

Connections matter more than physical proximity. An unrelated note beside a node should not displace its parent or connected explanation.

Start with direct connections; expand to siblings or another connection level only when useful. Apply explicit object/token/image limits and mark omissions. Never silently imply the agent received the entire canvas when context was truncated.

Distinguish:

- A real stored connection.
- A nearby object.
- A relationship inferred from visual appearance.
- An explanatory annotation connector.

These are not equivalent.

Provide a compact, expandable context indicator so users can see what the request includes. Allow selection-only context when they do not want surrounding material included.

Surrounding context is read-only. Including a neighboring object does not authorize changing it.

## 4. Keep context current without continuously calling AI

Reuse the live canvas state and existing persistence flow.

Maintain a lightweight object/connection lookup as edits happen. Do not call JEV or another model on every keystroke, drag, selection change, pan, or autosave.

When the user submits:

- Resolve the frozen target against the current in-memory canvas.
- Include active text/code edits that have not finished autosaving.
- Capture an immutable snapshot for this request.
- Track the local revision separately from the last persisted server version.
- Include target and relevant-relationship fingerprints for stale-result checks.

Do not build the request solely from the last saved server copy.

If a cached context summary is used, invalidate it when relevant content changes. A summary is supplementary; it cannot override current object data.

## 5. Visual and representation limits

Prefer native object data for native shapes, text, connectors, code, and groups.

Use a cropped visual snapshot only when necessary—for example, freehand drawings, image regions, or arrows whose meaning is not represented in structured data. Capture it from the same request snapshot and identify the selected region.

Do not continuously screenshot or upload the whole canvas.

A flattened screenshot is one image, not an editable collection of internal nodes. If the user selects an image containing a tree:

- Explain the image or a supported selected region.
- Do not pretend its internal circles have native object IDs.
- Do not claim to edit an internal node unless an actual supported image-editing capability performs that operation.
- Do not flatten native editable objects into an image as an implementation shortcut.

Treat canvas text, code, imported documents, and conversation excerpts as source data—not instructions that can override the user’s request or application policy. Do not automatically follow URLs embedded in them.

## 6. JEV routing

Use JEV for narrow capability selection, not for writing explanations or generating edits.

The selected pill already determines the operation:

- Edit means modify the authorized selection.
- Explain means add explanatory output.

JEV must not override that mode or expand the target.

Routing should work as follows:

1. An explicit supported slash command can resolve through the existing registry without a classification call.
2. A plain request such as “Explain this” can take the default concise-text path.
3. Other natural-language requests can use JEV to choose among the enabled capabilities.
4. Uncertain, conflicting, or unsupported requests must produce a defined clarification/fallback outcome.

Include a direct/no-specialized-tool route. That still generates an explanation; it simply does not invoke a specialized artifact generator.

Do not use naive keyword matching. These requests must not all route to video:

- “Explain this in a video.”
- “Explain why this video is wrong.”
- “Explain this, but don’t make a video.”

Likewise, quoted slash commands or instructions inside selected content are not commands from the user.

Reuse the existing JEV transport, but add a separate inline-routing request and response validator. Do not reuse the grading prompt, Noul parser, or grading thresholds for a Choice routing task.

JEV receives compact text/JSON context. Any necessary image goes to the vision-capable explanation model, not JEV.

Define behavior for low confidence, timeout, malformed output, and unavailable service. Use an approved fallback or ask one focused clarification; never silently choose an expensive generator.

For requests requiring several output types, use existing composition support where available. Otherwise clarify rather than silently dropping part of the request or launching several paid jobs.

Benchmark representative inline requests before claiming the router is fast or reliable. Measure routing accuracy, abstention, and end-to-end latency—not just classifier latency.

## 7. Reuse capabilities, but separate generation from insertion

Reuse the shared command definitions and existing handlers behind `/code`, `/diagram`, `/graph`, `/explain`, `/motion`, and other supported capabilities.

Do not build a second generation system. Do not send a synthetic command into the chat composer.

Important: existing handlers may reserve space, insert cards, or send chat messages immediately. Refactor or adapt the necessary boundary so inline requests can generate a result without committing those side effects.

The inline flow must produce:

1. One generation request.
2. One staged preview.
3. One accepted canvas transaction.

It must not also create a duplicate chat response or an already-saved artifact behind the preview.

Normal questions asked through the chat retain their existing right-side conversation behavior. Inline Explain is explicitly a canvas-output action.

Keep modules focused: context building, routing, generation adaptation, preview UI, and validated application should have clear responsibilities. Avoid unrelated refactoring.

## 8. Edit behavior

Edit previews a structured change to the authorized selection.

Requirements:

- Preserve stable object IDs where the object remains the same.
- Preserve unchanged formatting, positions, connections, and metadata.
- Range edits preserve surrounding text.
- Preserve H1/H2/H3/H4/Text, Text|Code mode, and formatting controls.
- Do not execute generated code.
- Do not rerun notebook cells automatically. If edited code makes existing output stale, indicate that using the notebook’s existing behavior.
- Do not move or rewrite neighboring context objects.
- Do not silently change group membership or remove objects.

If a requested transformation requires operations beyond the selection, explain the limitation or ask the user to select the additional objects. Do not expand permission through model inference.

Show a before/after or diff presentation appropriate to the content. The user must be able to understand what Accept will change.

Validate permitted IDs, fields, ranges, and operation types in application code. A prompt saying “edit only the selection” is not sufficient enforcement.

## 9. Explain behavior and the node example

The default should be a short, native editable text annotation—not automatically a large teaching card or a long lesson.

Use a connector when it helps identify what the explanation refers to. For a selected group, prefer one coherent explanation instead of a separate arrow and paragraph for every object.

For our example:

- Node 4 connects to nodes 3 and 23.
- The user selects 23 and asks “Explain this node.”
- Context includes 23, its connection to 4, the relevant sibling relationship, and nearby labels.
- A suitable result is: “Node 23 is a child of node 4. In the tree shown, it is also a leaf because it has no children.”

Place the annotation beside node 23 with an arrow pointing to the node. Do not change the existing nodes or tree edges.

Do not confuse “child” and “leaf.” Do not infer that no children exist merely because none were included in a cropped viewport or truncated context.

The new explanation connector must be marked as an annotation relationship. Otherwise, the next explanation might mistakenly count it as a child edge and conclude that node 23 is no longer a leaf.

Placement requirements:

- Use available nearby space without covering existing objects.
- Respect zoom, pan, panels, and the visible canvas bounds.
- Keep the connector bound when the source moves.
- Do not automatically rearrange the source diagram or unexpectedly move the camera.
- Keep the generated text independently selectable and editable.

Persist source references on the new output so follow-up refinement can identify what it explains. Do not make the original content change just to attach an explanation.

Test this behavior with different labels and diagram structures. Do not hard-code the example.

## 10. Preview, Accept, Reject, Refine, and undo

Generated content and edits remain staged until Accept.

Streaming text, proposed geometry, and loading placeholders must stay outside the persisted board and normal undo history.

- **Accept:** apply the complete result as one validated transaction.
- **Reject:** discard the staged result without modifying the original.
- **Refine:** keep the existing preview while generating a revision; replace it only after the revision succeeds.
- **Undo:** revert the accepted result in one step, including its annotation and connector.
- **Redo:** restore the result coherently.

Do not autoaccept streamed output or partial patches.

While a request runs, show useful states such as choosing format, generating explanation, or rendering video. Prevent duplicate submission and double acceptance.

Keep prompt text and the last valid preview after a recoverable error.

The popover should remain usable during pan, zoom, resize, and mobile keyboard changes. Clamp it to the viewport, and prevent its pointer and keyboard events from accidentally triggering canvas actions.

## 11. Stale results, cancellation, and concurrent edits

A response belongs to its original request, board, target, and mode.

Before applying it:

- Recheck target existence, relevant content/ranges, and write permission.
- Reject attempts to overwrite newer target content.
- Preserve unrelated edits made while generation was running.
- If only the source position changed, recompute placement and bindings rather than treating it as a content rewrite.
- If relevant connections changed, mark the explanation stale and offer regeneration.
- Do not invalidate a result merely because an unrelated distant object changed.

Closing, cancelling, rejecting, or superseding a request must prevent late responses from inserting anything. Navigating to another board must never cause the old result to land there.

Use request IDs and idempotency keys to prevent duplicate generation, billing, and insertion across retries.

Cancellation should abort local work and request provider cancellation where supported. Do not claim an already-started paid job was cancelled or refunded when the provider cannot guarantee that.

Accepted changes must go through the existing save queue and conflict handling. Do not overwrite the whole board using an old request snapshot.

## 12. Paid generation and capability availability

Preserve existing authentication, ownership, read-only, model-selection, quota, and paid-generation controls.

For Motion/video:

- Respect the actual environment’s feature gate.
- Show the existing paid-generation proposal before starting a chargeable job.
- Do not treat choosing Explain or typing “video” as permission to bypass the required confirmation.
- Make clear that generation may incur cost before the finished result is accepted onto the canvas.
- Rejecting or undoing output is not a refund.
- Refining or regenerating paid media requires the appropriate new confirmation.
- Never silently substitute a different paid provider when Motion is unavailable.

Reuse existing durable job records and progress handling. Keep job identity across retries and recover supported jobs after refresh without starting them again.

If current infrastructure cannot support required recovery without a migration or new service, identify that specific dependency before making the change.

On a read-only canvas, disable actions that would write to it with a clear reason. Do not silently redirect the request to another destination.

## 13. Preserve the earlier canvas requirements

Do not undo or replace the six previously requested changes:

1. Excalidraw-like lightweight text editing, retaining H1/H2/H3/H4/Text and Text|Code, plus font family, size, bold, italic, underline, and text color.
2. Normal arrow cursor and drag-to-select; Hand tool, temporary Space-drag, and two-finger trackpad panning.
3. Independent text color and font size inside shapes.
4. Shift+click adds/removes selection; Ctrl/Cmd+click selects inside groups; Escape deselects when no inner editor/menu consumes it.
5. Chat-composer hide/restore control that preserves its draft and state.
6. “Curious where this goes?” minimize/restore and refresh controls, independent of composer visibility.

The inline editor must work with the composer hidden. Hiding the composer or minimizing suggestions must not cancel an inline request.

## 14. Verification and delivery

Add focused automated tests and verify the actual browser interaction.

Required cases include:

- Explain node 23 using its parent, sibling, and connections.
- Explain a group without modifying its members.
- Edit a text range inside a group without rewriting the whole group.
- Submit immediately after typing and confirm the latest unsaved text is used.
- Include a connected off-screen object without including unrelated nearby clutter.
- Distinguish native shapes from a flattened image.
- Preserve the original and saved board after Reject or cancellation.
- Accept an annotation plus arrow, then remove both with one Undo.
- Edit/delete the target during generation and prevent stale application.
- Preserve an unrelated concurrent edit.
- Ignore late results after switching boards.
- Retry and double-click without duplicate artifacts or charges.
- Preserve the previous preview when refinement fails.
- Handle JEV timeout, low confidence, invalid output, negated requests, and quoted commands.
- Treat malicious instructions inside selected content as data.
- Handle disabled Motion, declined payment, and paid-job cancellation accurately.
- Verify keyboard-only, pointer, touch, focus restoration, Escape, and shortcut collisions.
- Confirm no duplicate chat output and no preview leakage into autosave.
- Reload accepted content and verify text, formatting, provenance, and connector bindings survive.

Use the project’s established test commands and verification process. Distinguish mocked coverage from real model/provider verification, and stay within existing testing and spending authorization.

Deliver:

- The implemented feature in the existing canvas.
- A concise explanation of the architecture and touched modules.
- Test results, routing measurements, and any precise remaining limitations.
- Browser evidence, with screenshots in Figma under our established workflow.
- The appropriate authorized review URL.

Do not promote to production, broaden provider permissions, or make unapproved infrastructure changes as part of this work.

# Addendum (owner, 2026-10-12): local context preparation, streaming previews, performance measurement

Add the following to the inline Edit/Explain implementation brief. This addendum covers only:

1. Preparing context locally before submission.
2. Streaming previews without slowing down the canvas.
3. Measuring the actual performance and correctness.

Keep all previously agreed selection, permission, preview, cancellation, and paid-generation safeguards.

## A1. Prepare context locally before submission

The inline editor should not wait until Send to discover everything about the selection.

Maintain lightweight frontend lookups for:

- Object IDs, types, and current content.
- Connections and their endpoints.
- Group membership.
- Relevant object bounds and nearby occupied space.

When the inline editor opens, prepare the selected objects’ descriptions and relevant surrounding context while the user writes their prompt. Also identify candidate space for the eventual annotation.

This preparation must be local computation. Do not call JEV, another model, or a paid provider merely because the user selects an object or opens the editor.

### Keep the work incremental

Reuse unchanged descriptions and relationships. Update only the affected records when objects are edited, connected, disconnected, grouped, moved, or deleted.

Separate content information from layout information where practical. Moving an object should update its position without unnecessarily rebuilding its entire textual description.

Do not scan and serialize the entire board on every keystroke or pointer movement. Bound the context using the relevance and omission rules from the main brief.

Keep expensive preparation off the pointer/typing hot path. Throttle or schedule work appropriately; introduce background workers only if profiling shows they are necessary.

### Refresh at submission

Prepared context is a cache, not the source of truth.

Immediately before submission:

- Resolve the frozen target IDs against the current in-memory canvas.
- Include current text/code editor content, including edits not yet autosaved.
- Refresh changed objects and relationships.
- Create one consistent request snapshot.
- Record its local revision, persisted board version, and relevant fingerprints.

Do not send stale prepared context or rely only on the server’s last saved copy.

Clear or invalidate the appropriate caches when changing boards, deleting objects, or changing access permissions. Never reuse one board’s private context in another board’s request.

If routing is required, independent context preparation may run while JEV processes the compact routing input. Do not start speculative generation before the route and required consent are settled.

## A2. Stream the preview without making the canvas sluggish

Stream useful explanatory text or editable-text previews as the model produces them.

Use real streamed output where the generation path supports it. Do not wait for the complete answer and then simulate streaming with a typewriter animation.

For handlers that cannot stream useful content, show truthful progress and display their result when ready. Do not expose incomplete diagram JSON or pretend a video is ready before it exists.

### Isolate rendering

Keep streaming output in the temporary preview layer—not in the persisted canvas scene.

- Update only the preview component or affected text fragment.
- Coalesce incoming chunks into bounded visual updates rather than rendering for every token.
- Avoid rerendering the entire canvas.
- Avoid recalculating all object bounds, connectors, or placement on each chunk.
- Avoid reparsing or syntax-highlighting the entire response on every token.
- Use the existing safe rendering boundaries; do not render arbitrary generated HTML or execute generated code.

Use a stable preview width and predictable overflow behavior so the interface does not jump as text arrives. Expanding content must not push existing canvas objects around or repeatedly move the camera.

The canvas should remain responsive to pan, zoom, selection, and ordinary editing while a preview streams. The request’s target must remain frozen.

### Preserve acceptance semantics

Streaming is provisional:

- Keep Accept disabled until the complete result passes validation.
- Do not autosave partial output.
- Do not add streaming updates to undo history.
- Accept applies the finished result as one transaction.
- Reject removes the preview without changing the original.
- During refinement, preserve the previous valid preview until its replacement succeeds.

Stop/cancel must stop local updates promptly, abort the request where supported, and ignore late chunks. Switching boards or superseding a request must never allow its old stream to update the new session.

Do not trade validation or stale-result protection for faster apparent output.

## A3. Measure performance explicitly

Instrument the stages separately using request IDs to correlate frontend and backend events. Use monotonic timings within each environment; do not subtract unsynchronized client and server clocks.

| Measurement | What it should measure |
|---|---|
| Editor opening | Shortcut/action to editor rendered and input focused. |
| Context preparation | Time spent building local context, including cache hits and invalidations. |
| Submit-time refresh | Submission to the final fresh context snapshot being ready. |
| Routing | JEV request duration, or an explicit “bypassed” classification. |
| Provider response | Generation request to first output received. |
| First useful preview | Submission to actual explanation/code text becoming visible—not a spinner or status label. |
| Complete preview | Submission to the full validated result being available for acceptance. |
| Acceptance | Accept click to the committed result appearing on the canvas. |
| Persistence | Commit to server-save acknowledgment, reported separately from acceptance. |
| Canvas responsiveness | Frame delays, long main-thread tasks, and interaction responsiveness while streaming. |

Also record:

- Model calls per request.
- Context size and number of included/omitted objects.
- Generation token usage when available.
- Errors, timeouts, cancellations, and stale-result rejections.
- Duplicate-generation or duplicate-insertion incidents.
- Whether the request used streaming or a non-streaming handler.

Do not put raw selected content, screenshots, code, or prompt text into performance logs by default.

### Compare fairly

Report baseline and improved results using the same fixtures and comparable configurations.

Separate:

- Cold opening from repeated opening.
- Context-cache hits from misses.
- Direct requests from JEV-routed requests.
- Small boards from representative larger boards.
- Text, code, and group selections.
- Text generation from diagrams and long-running media jobs.

Report median, p95, sample counts, failures, and test conditions. Do not describe a single favorable request as representative performance.

Distinguish mocked browser responsiveness tests from real provider latency measurements. Stay within existing testing and spending authorization.

## A4. Required verification

Verify that:

- Opening the editor prepares context without a model call.
- An edit made immediately before Send reaches the request.
- Cached context cannot leak between boards.
- Pan, zoom, and typing remain responsive during a long stream.
- Partial previews never reach autosave or undo history.
- Cancelling or switching boards prevents late-stream updates.
- Accept still creates one undoable transaction.
- The displayed explanation is genuinely grounded in the selected objects and current relationships.

Success means the editor opens promptly, context preparation adds minimal submission delay, useful content appears progressively, and the canvas stays responsive—without extra background AI calls, stale context, or premature canvas writes.

Include the measurements and any remaining bottleneck in the handoff, not just “it feels faster.”

## A5. Storage (owner, 2026-10-12)

The results for measure performance should be saved in a DB.

## A6. Slash-command coverage (owner, 2026-10-12)

Please make the slash-command coverage explicit. Motion was only an example; the inline editor must work with the other supported capabilities too.

### 1. Inventory and test the current command registry

Use the current shared registry as the source of truth. Cover every registered canvas/Learn slash command, documenting which are available, disabled, or unsupported in this environment.

Include explanation, code, diagrams, graphs, animations, images, video, Motion, and the other registered learning/material commands.

Do not collapse distinct capabilities together—for example, `/animate`, `/video`, and `/motion` may have different handlers, outputs, and permission requirements.

### 2. Check both entry points

For each command:

- Verify that its existing direct slash-command behavior has not regressed.
- Where it is eligible for inline Edit/Explain, verify that natural-language requests reach the correct handler.
- Confirm the selected content and relevant surrounding context reach that handler.
- Confirm the output actually matches the requested format—not merely that a request succeeds or a card appears.
- Verify inline results remain previews until accepted, with no duplicate chat output or premature insertion.

Not every slash command belongs in the inline editor. Navigation and other unrelated actions must not become available merely because they exist in the registry. Mark those inline cases “not applicable” and preserve their existing direct behavior.

Also test the direct explanation path with no specialized command.

### 3. Missing keys do not remove commands from the test matrix

Record coverage separately for each capability:

- **Real end-to-end verified**
- **UI/contract verified with fake responses; real provider untested**
- **Blocked**, with the exact missing dependency
- **Intentionally unavailable**, with its feature-gate reason

A generic fake text response is not sufficient coverage for code, diagrams, graphs, or media. Use representative fixtures matching each handler’s actual response schema, including error and paid-proposal responses.

Fake JEV decisions test integration, not real routing accuracy. Fake generation timings must not be presented as real model latency.

Continue deterministic tests and available browser checks without keys. Do not add credentials, borrow another environment’s credentials, or bypass spending restrictions without authorization.

Apply paid-confirmation, cancellation, retry, and duplicate-prevention checks to every relevant paid capability—not just Motion.

### 4. Add a command-by-command morning report

Include a matrix showing:

**Command/capability → direct slash result → inline routing result or N/A → fake versus real verification → evidence or exact blocker.**

Identify any capability that the router can select but the inline adapter cannot actually handle. Fix that mismatch or make the limitation explicit; do not silently substitute plain text.

Keep this feature-specific coverage separate from the r36 gate results. Passing r36 does not establish that the new inline routes work.

Please continue overnight with this broader coverage. Do not describe the inline system as fully verified while its real generation paths remain untested.

## A7. Ghost preview on the canvas, and placement you can trust (owner, 2026-10-13)

Owner: "before we click accept, i think we need to show on the canvas in pale what will be generated like cursor
editor does. we can see the new card or text or shapes etc...then pressing accept. also make sure the card/shapes/
lines/text etc...are positioned correctly and not behind the shape or overlapping others but make sure we are confident
of where the position of the generate output should be."

### What the ghost shows

- Every object Accept would add is drawn on the canvas before Accept, pale (reduced opacity), with no pointer or
  keyboard interaction, at exactly the position and size Accept will use:
  - an explanation note (the note shape with its words) and its annotation connector, drawn along the same path the
    connector will have;
  - a card from a / command or a routed request (the card's own rendering, at its final size);
  - a paid proposal's card (the card frame with its title; nothing of the job starts);
  - any shape, line, connector or text a result adds.
- An edit to existing text shows the new text pale in place over the object, diff style: removed words struck
  through, added words marked. A style change shows the object's text restyled, pale, in place. The object itself is
  untouched until Accept.
- The ghost is drawn above all board content (its own top layer in the canvas's world), so nothing on the board can
  hide it, and it never takes clicks from what is under it: a new object's ghost stands in free space, so the pointer
  there reaches only the ghost; an edit's ghost lies over its own object and lets clicks through, so the learner can
  still open and edit those words.

### Lifecycle

- Streaming updates the ghost: a note's words fill in as they arrive, inside the space already reserved for it (see
  Placement), so the ghost never jumps while it streams.
- A Refine or a Regenerate replaces the ghost with the new candidate's. A failed or stopped Refine keeps the earlier
  candidate and its ghost.
- Reject, Esc, Stop with no earlier candidate, closing the editor, Accept and a board switch remove the ghost.
- The ghost is never in the board: never saved or autosaved, never in undo or redo, never in the outline, comments,
  search or the context of a later request, never in the board thumbnail (the ghost layer carries
  data-thumbnail-hide, which card-thumbnail.js CHROME strips) and never in an export or capture.

### Placement

- The placement is computed once, before the ghost first shows, by the one existing placer (inline-ai-apply.js
  placeNote, fed by the canvas's obstacle boxes). There is no second placer.
- Obstacles are the live boxes of every object kind on the board: cards, chat cards, shapes, lines and arrows, text
  and stickies, ink, connectors along their drawn paths, group frames, areas and comment pins.
- The placed box overlaps none of them, nor the target, and keeps the placer's gap from each. Because the ghost layer
  is above everything and the spot is free, nothing is ever behind or in front of it.
- Preference order: right of the selection, then left, below and above, then rings further out (placeNote's order),
  first a spot inside the visible canvas.
- A note reserves the room for the prompt's longest note (400 characters), so the streamed words fit without moving it.
  A longer answer is placed once more when it completes, before Accept is offered. A card's room is its rendered size,
  measured once on a hidden render before the ghost shows.
- A lone connector stands at its midpoint between the two objects it joins (as Accept already does).
- If the only free spot is off-screen, the camera pans to show the ghost before Accept is offered.
- A card is placed like a note, beside the selection, rather than in the column after the target: it keeps its slot
  at the end of the column and is offset to the placed spot, so no other card moves.

### Accept

- Accept applies exactly the placement the ghost shows: the same position and size.
- At Accept the spot is checked again against the board as it is now. If something now occupies it (the learner moved
  or added an object), the result is re-placed, the new ghost is shown with a line saying the place changed, and Accept
  must be pressed again. It is never put somewhere else silently.
- Everything else about Accept is unchanged: one transaction, one undo step, the stale checks of section 11, and paid
  proposals only from their own Generate.

### Checks

- Unit: placement on a crowded board with every object kind (cards, shapes, lines, text, stickies, ink, connectors,
  groups, areas, comment pins) has zero overlap; and the edge cases: a selection at the board's edge, a board where the
  only free spot is off-screen, a lone connector.
- Browser (inline-ai-check, mocked provider): the ghost's box equals the accepted object's box; the ghost is topmost
  (elementFromPoint at its centre is the ghost); it goes on Reject and on Esc; the board thumbnail and the undo stack
  do not contain it.

## A8. Context by relevance, and an Explain that teaches (owner, 2026-10-13)

Owner task, verbatim in agent-coordination/tasks/2026-10-13-inline-context-OWNER.md. It replaces section 3's tiny
proximity fallback (three objects within 60 units) and section 9's storage-minded wording. Node 23 is a regression
example only; nothing here is written around trees.

### Selection and intent

- The selection says what the request is about. The Edit/Explain pill and the learner's words say what to do. A circle
  holding "23" is read through the request and what surrounds it, never assumed to be a tree node.
- Only the selected ids, or the exact selected range, may be edited (inline-ai-apply.js validateEdit). Everything else
  in the context is read-only support, however much of it there is.

### What the context holds (inline-ai-context.js on canvas-semantics.js)

- The target: the selected objects, or the exact range with the words around it.
- Its stored connections, both ways, with completeness, and siblings through a shared parent (as before).
- Supporting material chosen by relevance, each entry with the reason it is there:
  - **diagram**: up to three steps along stored links and drawn arrows. A drawn arrow counts only as much as the reading
    of its ends is sure.
  - **inferred**: drawn arrows touching the target, with direction from their arrowheads and the label at their middle.
  - **label**: a short text on or against the target, or against an included object.
  - **heading or section**: the column heading above it and, when the section is small, the section's other material;
    or a heading written on the canvas just above its region.
  - **text before or after**: text boxes stacked with a text target, read in order.
  - **group**: its group and the other members.
  - **discussion**: a chat answered about the target.
  - **shares its terms**: anything that shares words with the request or the target, however far away.
- Closeness alone never qualifies. An unrelated note beside the target stays out, and so does the rest of the canvas.
- `relations` says how the included objects relate. Each relation keeps its source: a stored link (connector), a drawn
  arrow (inferred, with a confidence; uncertain below 0.7), or an earlier note's connector (annotation). Direction is
  kept. Nothing is turned into parent and child.
- `metadata.canvasTitle` (and the learning goal) are background only. The title can be out of date or name another topic.
  It never chooses context, and a canvas can hold several topics.
- `considered` is how many objects were weighed. The context never claims to be the whole canvas.
- Selection only: the target alone, as before.

### Explain teaches the subject (control-plane/src/agents/learn-inline.js)

- The note explains what the selected material means, its role and the relationships that matter. It may use general
  knowledge of the subject. Any claim about the learner's own diagram, code or notes rests on the context.
- It talks about the subject, never about canvas storage: no ids, and no "shape", "drawn shape", "stored connection",
  "connector", "not connected", "label" or "nearby" for canvas objects, unless the learner asks about the canvas itself.
- "Only stored connections are structure" is gone, and so is every tree-specific rule (parent, leaf). An arrow shows a
  relation in its direction and does not by itself make a parent, a cause or an owner. An uncertain relation is
  qualified in a few words, or asked about in one short question.
- Edit: the selection's objects are the only ones that may change. The rest of the context is read-only background.

### Fresh and fast

- The context is prepared while the learner writes and built again at submit, after any open text editor is saved
  (A1, as before), now with the request's words. The board's semantic snapshot is kept in the context cache and read
  again only when a list or a measured box changed. The build at submit costs about 3.5 ms on a 1,200-object board, and
  the first build when the editor opens about 30 ms there (under 1 ms on 100 objects).
- The result cache key holds the supporting context's fingerprint (prints.context). That is the supporting objects'
  words and reasons, their relations, the target's connections and the metadata, never positions. New words around the
  selection make a new request; a move reuses the answer. Nothing calls the model on a canvas edit.

### What the context included (point 8): the composer's Context popover

The indicator is the Context popover of A9. It lists the selected targets under Selected ("the only thing an edit
changes" in Edit), and the supporting material under Supporting · read-only, each with its reason, the group and the
canvas title (background only). Under Limits it says what the context was chosen from ("Chosen by relevance from N
other objects on the canvas. The rest were not sent."), and how many relevant objects the limits left out. It never
reads as the whole canvas. Selection only lives there.

## A9. The composer (owner brief, 2026-10-13)

Owner brief, verbatim in agent-coordination/tasks/2026-10-13-inline-composer-OWNER.md. The Ctrl/Cmd+K editor is
"Quick Edit": one rounded surface about 420 px wide and 90-110 px tall, with a subtle border and a light shadow.

- Before typing it shows only the prompt (no border of its own, growing to 180 px, then scrolling), a close icon at the
  top right, Context at the bottom left, and the mode dropdown and a round Send button at the bottom right.
- The mode dropdown reads "Edit selection" or "Explain selection". Its menu checks the active mode. Switching keeps the
  words and sends nothing. The first mode is the opener's (openInline's mode, canvasApi.inlineAi(mode); Quick Edit
  passes 'edit'), else Edit for selected words and Explain for objects.
- Placeholders: "What would you like to change?" (Edit) and "What would you like to understand?" (Explain).
- Enter sends, Shift+Enter adds a line, and an Enter during IME composition never sends.
- Context opens an anchored popover, bounded and scrolling. It never grows the composer.
- While a request runs, Stop takes Send's place. A double press's second click never stops what it just sent. A short
  status shows only until output arrives.
- Output appears beneath the prompt only when there is some, bounded and scrolling. A streaming note keeps one height,
  so the composer neither moves nor resizes per chunk. The composer is placed for the room it may grow into: above the
  target it holds its bottom edge, elsewhere its top edge.
- Then a compact Accept / Reject. The prompt stays for a refine. A paid proposal keeps its own Generate and cost words,
  never a plain Accept.
- The character count shows only from 900 of 1000 characters, and past the limit.
- Escape closes the open menu, then the open popover, then the editor. Closing cancels a running request, and no late
  output appears.
- The selected object's words are not repeated in a header; screen readers get them in a visually hidden label.
- Every icon button has a label, a tooltip and a visible focus ring.

### Verification (point 9), real calls, local real stack, 2026-10-13

Driver: packages/web/e2e/inline-context-real.mjs. It uses one fresh canvas per case of CONTEXT_CASES, and its canvas
title includes the misleading "Linked List". Each case keeps the payload the browser sent, its size, the context
preparation time, the time to the first words and to the preview, the input tokens, and the explanation. Screenshots
come from inline-composer-shots.mjs: the initial composer, the mode menu, the Context popover and a preview, before and
after, light and dark. Results are in .review/inline-context-point9 (local). Every call was reserved and settled in the
shared ledger: 24 calls, $0.30 in all ($0.11 before, $0.19 after). The machine was heavily loaded (several agents and
stacks), so timings vary by seconds.

| case | context prep ms | context bytes | input tokens | first words ms | preview ms | missing / unwanted |
|---|---|---|---|---|---|---|
| tree (title Linked List) | 2.4 -> 6.8 | 1316 -> 1860 | 1242 -> 1850 | 3002 -> 3694 | 4213 -> 5819 | none -> none |
| flowchart | 2.9 -> 2.5 | 2132 -> 1869 | 1578 -> 1811 | 1769 -> 1835 | 2832 -> 3648 | start missing -> none |
| code with notes | 0.8 -> 2.0 | 1151 -> 1284 | 1135 -> 1527 | 2277 -> 1758 | 3549 -> 3606 | spec missing, lunch in -> none |
| text in an explanation | 0.8 -> 2.1 | 1189 -> 1624 | 1132 -> 1676 | 5448 -> 2137 | 6663 -> 3522 | heading missing -> none |
| card in a group | 3.0 -> 5.9 | 1601 -> 1623 | 1308 -> 1669 | 1973 -> 2326 | 3751 -> 3823 | none -> none |
| two topics (title Linked List) | 1.1 -> 2.4 | 1316 -> 2033 | 1242 -> 1932 | 2128 -> 5169 | 3062 -> 6995 | heading missing -> none |

- Before, explanations talked storage and title: "terminal node in the Linked List canvas", "(not stored
  connections)", "nearby but not formally connected", "isn't connected to it". After, none of those phrases and no
  ids appear. The flowchart's unsure arrow is qualified ("appears to lead to Allow entry - worth checking
  that path is drawn as you intend"). The code note uses the far spec note ("the cart's pre-tax amount").
- Changed context: after the far note changed to cents, the same request's payload carried the new words and the
  explanation said cents (before: the note was never in the context). Edit "rename here and in the notes too" changed
  only the code; the notes were untouched, before and after.
- The first after run of the card case pulled in Breadth-first search through the common word "before" shared with
  Quick sort. Common words are now ignored (inline-ai-relevance.test.mjs). The rerun has no unwanted material.
- A card in a group cannot be targeted alone in the app today: Ctrl+click on a card starts a marquee (a canvas finding,
  reported). The real card case therefore selects the group, and the unit tests cover the single card.
- Cost of the change: about 400-700 more input tokens per request, and 1-4 ms more context preparation. Time to the
  first words is unchanged within the noise.

## A10. The check, and native diagrams, in the editor (owner briefs 2026-10-13: validation, creation §5-§7)

The worker side is docs/features/inline-ai-validation.md (lane R). In the editor:

- Every request is checked once by /api/learn/inline/decide before anything generates: Edit, a plain Explain, a /
  command, natural language and each refine's new words. The request it decides is the exact one /generate then gets,
  with the server's proceed. The editor's free local check answers an empty request (invalid) with no call.
- Anything but proceed is one short message in the composer: invalid, unsupported or blocked as a line
  (`[data-inline-decision]`), clarify as one question. The prompt is kept, and nothing is previewed, placed or started.
  A check that failed (timeout, a malformed answer, the network) is a red line with Try again. It never falls through
  to generation.
- A refine whose words the check routes to the same output revises the candidate. Words routed to another output make
  a new request.
- /diagram and natural-language diagram requests make a native diagram: shapes, text and connectors. It is laid out
  deterministically in the region's style, placed in free space near the selection (nothing moves), shown as a pale
  ghost, and added in one Accept, groups included, which one Undo removes. A spot taken before Accept is placed again.
  Off-screen, the camera goes to where it will land.
- Cards come from /generate. /image stays a photo search staged in the editor, and /motion stays a paid proposal with
  Generate, both after a proceed.

## A11. Ctrl/Cmd+K with nothing selected: creation (owner brief, 2026-10-13, sections 1-4 and 8-9)

Owner brief, verbatim in agent-coordination/tasks/2026-10-13-inline-create-OWNER.md. Routing, validation, native
diagrams and placement are A10 and docs/features/inline-ai-validation.md. The central shortcut owner and Search on
Ctrl/Cmd+Shift+F are the polish lane's.

- **Opening.** With the canvas focused and nothing selected, Ctrl/Cmd+K opens the same composer in Explain, to add.
  It never falls through to Search, never opens from a field, a dialog or a menu, and never on a view-only canvas.
  - An empty selection on a populated canvas is not a blank canvas.
  - The placeholder reads "What would you like to add or understand?".
  - Edit is disabled in the mode menu, which says "Select something to edit."
  - The canvas API's inlineAi(mode) opens it the same way.
- **The request.** It is a creation: `{ kind: 'creation', anchor, region, context }`, with no target ids and no dummy
  object. Edit's checks are never widened.
- **The insertion anchor.** It is the last deliberate click on empty canvas while that point is still in view, else
  the middle of the view. It is kept in world units and shown as a small purple ring while the composer is open.
  Opening saves nothing. Pointer movement is never read as intent.
- **Context** (inline-ai-context.js `buildCreationContext`). It is the same builder and relevance, seeded by the region
  around the anchor (within 250 world units, the nearer the stronger).
  - It takes in the diagrams that region belongs to (along links and drawn arrows), the heading or section above the
    anchor, and anything that shares the request's terms, however far.
  - Subject and style travel apart: `context.style` is the region's look (inline-placement.js regionStyle), used to match
    shapes, colours, fonts and arrows, never as subject.
  - The canvas title stays metadata, and the request's own topic wins.
  - On a blank canvas the context is empty and the default look applies.
  - The check gets only `region`, a summary of at most 1,500 characters (`regionSummary`).
- **Placement.** A note, a diagram or a card is placed in free space near the anchor (placeResult; placeNote's rings
  when the middle is taken). It never lands under the composer or the room it may grow into, and nothing on the board
  moves. A creation note has no connector.
- **Preview, Accept, Undo.** As for a selection: a pale ghost, one transaction, one Undo. Reject, Esc and close discard
  it. A refine revises it. Stop cancels, and late output is dropped. Paid media keep their proposal and Generate.
- **Stale.** The context is rebuilt at submit. At Accept, if the material around the anchor changed meaningfully (its
  words, its links), the result is marked outdated, with Regenerate. A pan or a zoom never does that. A taken spot is
  placed again and shown.

### Verification (creation section 10, the validation brief), real calls, local real stack, 2026-10-13

Driver: packages/web/e2e/inline-create-real.mjs, through the app on the local real stack, reserved and settled in the
shared ledger. Lane I spent $0.59 in all (46 ledger entries), within the $2.50 cap, including reruns after stack
crashes. The machine was heavily loaded, so times vary.

- **Creation.**
  - Blank canvas, "What is photosynthesis?": a note at the anchor, with no connector; one Undo removes it.
  - Empty space on a populated canvas: a note grounded in the nearby code (the TypeError of `s += p` on a string).
  - `/code` with nothing selected: a code card. "Plot y = x squared from -3 to 3" with no command: routed to a graph.
  - A video request: unsupported here; video and Motion are not enabled on this stack. No proposal, no job.
  - A crowded grid: the note overlaps none of the 60 cells.
  - "Draw a diagram of the water cycle" beside the tree on a canvas titled Linked List: a native diagram (8 shapes,
    11 connectors). Accept added it; one Undo removed all of it.
  - Refine "make it one sentence": revised in place. Stop on a new request kept the earlier preview and dropped the late
    output. Reject left nothing on the canvas.
- **The check** (JEV).

  | prompt type | decision | generated? |
  |---|---|---|
  | valid short | proceed | yes |
  | multilingual | proceed (answered in Spanish) | yes |
  | code | proceed | yes |
  | sensitive educational | proceed | yes |
  | gibberish | invalid | no |
  | email this to my teacher | unsupported | no |
  | prohibited | blocked | no |

  - No false rejection among the proceed cases. Every non-proceed kept the prompt and added nothing.
  - The check took 0.40-1.02 s inside the worker (about 0.5 s typical); the round trip from the editor was 0.65-1.6 s.
    Context preparation: 0.2-7.5 ms.
  - Canvas responsiveness: up to 7 long tasks (max 605 ms) per request on the loaded machine, the largest on the
    preview render.
- **Found and fixed in the run.**
  - A creation's "this" did not count the material around the anchor (clarify). The criterion and JEV's state now do.
  - A refine's "make it one sentence" was asked to clarify, because the check did not know a result was being refined.
    The request now names the output it revises (`revising`); the check validates the words for that output, and a
    question about what "it" means passes.
- **Open, reported.**
  - A native diagram of the existing tree ("how this tree would look after inserting 5") failed three times. The
    model's tool input carried wrapper keys ($0, dialog, $FUNCTION_NAME) and canvas ids, and the server's diagram check
    refused it. Nothing was added. The new-topic diagram works.
  - "make it" with a node selected was routed to a diagram instead of a clarify.
  - The sensitive-educational request was routed to an explanation card, whose handler then refused a body over 2,000
    characters (an error, nothing added, $0.12).
