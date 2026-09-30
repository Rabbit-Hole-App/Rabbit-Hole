# Rabbit Hole — Home, Projects, Library, and Existing Settings
## Product direction, UX specification, and checkable coding-agent work packages

**Version:** 2.0  
**Prepared:** 2026-09-23  
**Brand:** Rabbit Hole  
**Value proposition:** Knowledge is infinite.  
**Primary action:** Start a rabbit hole  
**Mascot:** Rabbit Hole's approved White Rabbit-inspired character  
**Deliverable type:** A design and implementation brief for another coding agent. This document does not claim that the proposed features already exist.  
**Immediate scope:** Rethink the authenticated Home and Project experience, with supporting Library, creation, search, sharing, and reuse/update of the existing Settings and Connections UI. Design future source-connector flows without implementing their backends. Preserve the existing Learn canvas, visualization engines, accounts, workspaces, and working settings.
**Handoff:** This is the complete first brief for the receiving coding agent. It includes all prior product requirements; no earlier document or chat message is required. Start at T00 and do not assume any design has already been approved.
**Scope of this revision:** The user supplied Settings and workspace-menu screenshots and requested reuse/modification of those existing surfaces, plus future Google Slides, Notion, and related source connections. These are UI requirements, not claims that those connector services currently work.

> Rabbit Hole is an adaptive environment for understanding and building with knowledge. A user can begin with a repository, a paper, slides, a question, or a blank canvas; create something useful while learning; follow a question deeper; and share or extend the resulting work with attribution.

> Do not turn this brief into a backend-platform build. First design and approve the experience. Connect real features where supported; demonstrate future features only in an explicitly labeled prototype.

---

## 0. Evidence, authority, and scope

### How to use this document

This v2 file supersedes v1.1 and is self-contained. Core product vision and Home/Project/Library requirements remain intact. New Settings and Connections requirements are concentrated in **Sections 4.1–4.2**, then carried through creation, Sources, scope, stack, mockups, tasks, acceptance journeys, and the kickoff message. T00–T12 remain the implementation work-package IDs.

The receiving agent starts by reading and proposing, not by building every future capability in this document. “Design now” and “backend later” are deliberate boundaries.

### What comes from the user

The user wants public/private repository connections, a Graphify-backed map for each connected repository, a Learn canvas associated with each repository, standalone canvases, shared apps and canvases, credited forks, search, adaptive learning progress, and eventually profiles, reviews, collaboration, and agent-session/decision history. Target uses include technical learning, student notes, teacher-created materials, creator portfolios, enterprise onboarding, and invited company understanding for investors.

The user also confirms that an account/workspace menu and a Settings interface already exist. Reuse and improve them; do not create a second Settings system. Plan Google Slides and Notion as future learning-source connections, with related document sources accommodated by the same UI.

These are **product requirements and vision**, not evidence of completed backend services.

### What the supplied screenshots actually show

**Current Home/Apps screen:** a workspace label reading “Gmail,” a large Apps table mixing repositories, servers, and jobs, deployment/run metadata, a nested sidebar, repeated recent entries, and an AWS-preview error in the sidebar.

**Current repository screen:** `karpathy/nanoGPT`, Graph/Learn navigation, another Files/Graph switch, branch/index status, a node-link graph on a light surface inside a dark shell, symbol search, and a right-hand Graph Agent conversation.

**Current account/workspace menu:** an account identity, a list of workspaces with a selected marker, Settings, New workspace, and Log out. “Gmail” is shown as a selected workspace label; it is not evidence that the app should be branded Gmail or that a Gmail data connection exists.

**Current Settings screenshot:** an existing modal/sidebar shell with Account entries (Preferences, Notifications, Mail & Calendar), Workspace entries (General, People, Import), Features entries (Small AI, Connections, Small MCP, Public pages, Emoji, Developer), and Admin entries (Teamspaces, Security, Identity). The Preferences view shows theme, high contrast, Enter/newline behavior, language, number format, and text-direction options. Some first-party copy still says “small.”

**Connections already has a navigation entry.** The screenshot does not show its contents, provider implementation, authentication, or permissions. T00 must inspect that code before deciding which parts to reuse or extend.

These observations justify a navigation and information-hierarchy redesign and targeted Settings reuse. They do not establish how those screens are implemented, whether every displayed action works, or whether every user can access the same administration controls.

**Important existing Learn constraint from the user:** Learn uses a bottom chat composer, with an existing **Ask in chat** action above cards. Learning controls belong below their visual inside the card, separated from it. Do not add card-level “Ask about this” buttons or recreate a right-hand tutor panel in Learn.

The Graph screenshot really does contain a right-hand chat panel. Do not confuse that with the Learn interface. Section 10 describes a proposed unification and a migration fallback.

### External research used, and its limits

- Glen's YC profile describes retaining agent-session and organizational context and retrieving the work behind code. This informs the **context and provenance concept**, not a requirement to copy Glen's product or a claim that Rabbit Hole has its integration. [S1]
- The public Graphify project describes code/document graph extraction and distinguishes extracted from inferred connections. Confirm the exact Graphify package, version, output schema, and license used in this repository; the user's message did not pin them. [S2]
- Technical references support the optional design tools, accessibility, testing, and worktree guidance. They do not certify Rabbit Hole's implementation. [S3–S9]

### Decision status

The user's brand, bottom-composer constraint, sharing/attribution needs, reuse of existing Settings/workspaces, future source-connector design, and UI-first scope are requirements. The navigation, entity names, screen composition, and rollout proposed below are **recommendations for approval**.

Do not silently replace a newer agreed product contract. Record concrete conflicts during T00, resolve them during design review, then implement the approved direction.

---

## 1. Product purpose: design for learning, not infrastructure administration

### The one-sentence explanation

**Rabbit Hole helps people turn questions and source material into visual understanding, practical work, and learning paths they can keep extending.**

### The product loop

```text
Start with a goal or source
          ↓
Get oriented: what is this, and why does it matter?
          ↓
Understand a useful concept
          ↓
Apply it: experiment, annotate, implement, or explain
          ↓
Ask a more specific question / uncover a missing prerequisite
          ↓
Adapt the next step to the goal and available evidence
          ↓
Keep, share, or fork the resulting canvas and artifacts
```

For an ML engineer, “apply” may mean modifying a model or comparing an experiment. For a student, it may mean constructing an explanation with evidence. For a teacher, it may mean building a learning canvas students can explore. Do not force every user into code execution.

### The distinction to communicate

Do not build the UI around a fixed catalog of videos, or claim that competitors categorically lack adaptive features. Show Rabbit Hole's own behavior:

- The learner chooses a goal and depth, rather than only enrolling in a course.
- Sources, explanations, visual experiments, and implementation are connected.
- A question can open another branch without destroying the original path.
- A learning artifact can be shared, forked, and expanded with provenance.
- The platform remembers the user's work and evidence, not just a watch counter.

**Infinite knowledge does not mean an infinite task.** A user still needs a finite next step and a satisfying outcome: “Understand the training loop,” “Annotate these slides,” or “Implement the mask.” Do not show “32% of all knowledge complete.”

### What Home must help someone do

1. Resume meaningful work without reconstructing context.
2. Start from a repository, source, question, or blank canvas.
3. Find their own and permitted shared work.
4. Discover an appropriate public learning artifact when requested.

### What a Project page must help someone do

1. Understand the project's purpose and current source version.
2. Open the right Learn canvas or resume a specific learning step.
3. Navigate implementation and supporting evidence without starting in a graph hairball.
4. Inspect relevant development decisions and outputs when available and authorized.
5. Share the right resource without accidentally sharing everything behind it.

---

## 2. Audiences: one core model, different entry goals

Do not create seven separate applications or a seven-persona dashboard. Use common resources, explicit goals, depth, and permission-aware views.

| User | Job to be done | Useful first action | Evidence of success |
|---|---|---|---|
| ML engineer / data scientist | Understand a new model or unfamiliar repo | Connect repository → choose a learning goal | Can navigate the relevant code and perform a meaningful change/experiment |
| University student | Turn slides and notes into understanding | Upload material or open a blank canvas | Can explain/apply the topic and return to sources |
| Teacher | Assemble materials and share a learning experience | Create canvas → add sources → preview as learner | Students can open the intended version and follow the material |
| Content creator | Publish an understandable technical artifact | Create/remix canvas → publish selected content | Public reader understands it; source and creator credits survive |
| New enterprise engineer | Learn the team's system and reasons behind it | Open assigned project/canvas | Can trace a workflow and find the code/decision needed for a task |
| Team member | Preserve the context of building | Inspect connected sessions and decisions | A teammate can see the evidence behind a change |
| Invited investor/reviewer | Understand an authorized slice of a company | Open curated company/project briefing | Can inspect claims and permitted evidence; no implied investment recommendation |

**Initial design priority:** individual technical learners and reusable learning canvases. Teacher, enterprise, and investor scenarios must fit the model, but their dashboards, administration, and automation are not all implementation requirements for this UI pass.

---

## 3. Resolve the vocabulary before styling screens

### Recommended resource model

| Term | Meaning | Important boundary |
|---|---|---|
| **Workspace** | Personal or organization ownership/access context | A permission boundary, not a decorative folder |
| **Project** | A topic/codebase/company learning hub connecting sources, canvases, and outputs | A project is not necessarily executable |
| **Rabbit hole** | The product metaphor for a learning journey/project | Use in CTA and copy; use clear resource labels in navigation |
| **Repository source** | A connected Git repository at an identified branch/revision | Source ownership and Rabbit Hole project ownership are different |
| **Connection** | An authorized external account/service usable within an explicit personal or workspace scope | Connecting an account does not import all of its content or publish anything |
| **Source attachment** | A deliberately selected repository, deck, document, page, or file attached to a Project or Learn canvas | Has its own provenance, version, access, and import status; it is not the external account itself |
| **Learn canvas** | An editable/viewable learning artifact with notes, sources, visuals, and optional exercises | Can exist without any repository or project |
| **App** | A runnable application or demo associated with a project/source | Do not call every note, repo, or canvas an app |
| **Collection** | Optional grouping of saved projects, canvases, and apps | Membership does not grant access or transfer ownership |
| **Published version** | A deliberately shared version of a project/canvas/app presentation | Not the creator's live private draft or personal learning record |
| **Learning record** | An individual's progress, attempts, resume positions, and evidence | Separate from shared content and from raw session history |

### Entity relationships

```text
Workspace
  ├── Projects
  │     ├── Repository / other sources
  │     ├── Learn canvases
  │     ├── Map + indexed source revision
  │     ├── Decisions / sessions when connected
  │     └── Apps / outputs when available
  │
  ├── Standalone Learn canvases
  └── Collections of references to the above

User learning record → references a resource + version + concept/task
Published fork       → references parent version + original lineage
```

A repo-backed project should obtain a default Learn canvas, as requested. It may later have several canvases: an overview, an onboarding path, a research deep dive, and a personal experiment. Do not hardcode a one-repo/one-canvas relationship into presentation components.

Standalone canvases are first-class. They need a title, ownership, saving, sources, sharing status, and a stable address without a dummy repository. Attaching one to a project later must not destroy its ID or credits. References in Collections must not copy the whole canvas.

For this UI design, a canvas may have no primary project or one primary project; it can be saved/referenced elsewhere without duplicating it. A more complex many-project attachment model is not required now.

A company-oriented Project may eventually connect several repositories and non-code sources. Keep source references plural in view-model design, but implement only the connections already supported. A curated company briefing is not automatic access to every repository or every employee session.

### Should we have folders and apps?

**Keep Apps as a resource type, not as the Home page's organizing principle.** Put executable artifacts under a project's Build view and under an Apps filter in Library.

**Use Collections for organization.** A person can create “This semester,” “Models to study,” or “Team onboarding” and save references into it. Start with shallow collections rather than a nested filesystem. Existing folders must be preserved or mapped deliberately; do not delete user organization in a redesign.

Notes inside a canvas should be searchable blocks. Do not force a new top-level Notes system merely to make them searchable. Preserve standalone notes if the existing product already has them.

---

## 4. Navigation: small, clear, and learning-centered

### Recommended authenticated shell

```text
Rabbit Hole                     Search…  [shortcut]           Workspace / Profile

Home
Library
Explore                         Main content changes by route

Pinned
  selected projects/canvases

Collections
  optional user organization

Existing workspace/account menu → Settings / help       [Start a rabbit hole]
```

- **Home:** resume, start, and a few relevant next steps.
- **Library:** user's permitted projects/canvases/apps, with filters and collection management.
- **Explore:** public/shared discovery. Gate real recommendations on real services; use an explicit prototype when unsupported.
- **Progress:** a Home section and optional secondary view, not a fourth mandatory top-level destination at launch.
- **Profile:** account/avatar menu initially; public portfolio is a later opt-in surface.
- **Workspace switching:** reuse the existing switcher and underlying account/workspace state. Personal and organization context must not blur.
- **Settings:** open the existing Settings shell from the account/workspace menu. Deep-link or focus its existing Connections section when the user needs to manage source accounts. Do not add a competing Settings app or a mandatory new top-level Connections destination.

Keep the sidebar compact. Do not list every repository, server, job, canvas, and recent item simultaneously. Pinned items are a small selection; Library holds the complete inventory.

### Existing Apps and infrastructure compatibility

The screenshots mix learning resources with operational servers/jobs. Move operational metadata to Library list details or Build/advanced views, not the default learning Home. Preserve their routes and functionality. Do not delete deployments, rename database types blindly, or hide a real runtime failure needed by someone operating an app.

The AWS-preview error should appear in the relevant connection/build context with a recovery action. It should not dominate learning navigation when the user is studying an unrelated repo.

“Gmail” in the current screenshot may be a workspace name. Establish Rabbit Hole as the product identity separately; **do not overwrite tenant display names in storage** to accomplish rebranding.

### 4.1 Existing Settings: reuse first, modify deliberately

**This is an existing product surface, not a new feature to build from scratch.** Keep its open/close behavior, navigation, persistence, account/workspace targeting, and working settings. Restyling, clearer grouping, and targeted new content are allowed after approval. Replacing the whole settings architecture is not the task.

T00 must map the visible items to their actual components, routes, storage, permission rules, and service actions. A screenshot of a toggle is not proof of its persistence scope. Preserve current behavior unless the approved design explicitly changes it.

| Existing area | Treatment in this redesign |
|---|---|
| Workspace/account menu | Keep account identity, workspace list, selected-workspace indicator, Settings, New workspace, and Log out accessible. Modernize presentation without changing tenant identity. |
| Preferences | Reuse theme/high-contrast/input/language/formatting controls and their persistence. Update first-party product copy to Rabbit Hole where appropriate. |
| Notifications and Mail & Calendar | Preserve existing functionality and location unless a deliberate navigation change is approved. Mail/calendar access is not automatically permission to read Drive, Slides, or Notion. |
| Workspace General / People / Import | Preserve role-gated management and the existing upload/import flow. Offer source attachment from the learning context too. |
| Connections | Extend this existing destination into the canonical place to manage learning-source accounts. Reuse any existing provider catalog and connection components. |
| Small AI / Small MCP / Developer | Propose clear Rabbit Hole-facing labels for first-party features, but do not change protocol names, configuration keys, API contracts, or technical capabilities to achieve rebranding. Source-reading connectors and agent tool integrations remain different concepts. |
| Public pages / Emoji / Admin sections | Preserve working features and permission boundaries. Reorganize only as approved; do not delete them because the primary redesign focuses on learning. |

“Rabbit Hole” is the product name; a workspace can still be named “Gmail,” a university course, or a company team. Do not rename user-created workspaces or reset saved preferences as part of branding work. Use synthetic people and tenant names in shared Figma mockups rather than copying the account email from the screenshot.

The proposed high-level grouping is **Account**, **Workspace**, and the existing integration/advanced areas, but the approved design may retain the current grouping if that is clearer. Account-level preferences, per-device preferences, personal connection credentials, and workspace-admin policies must not appear to be interchangeable settings.

**Settings entry and return behavior:** open Settings from the existing switcher; show which account/workspace is being managed; close back to the original route with unsent drafts and canvas selection preserved. When a source-attachment flow opens Connections, return to that same Project/canvas and pending source task. Do not dump the learner onto Home or silently change workspace.

Do not make students wade through developer settings to attach lecture slides. General learners should find **Connections** directly; advanced MCP/developer controls may stay in their existing secondary area. Do not invent new admin or security features to populate a menu.

### 4.2 Connections: manage accounts in Settings, attach content where learning happens

Use **Connections** as the learner-facing destination name and “connector” as the implementation concept. There are two jobs, and the UI must not merge them:

```text
Settings → Connections
    Manage connected accounts, access scope, reconnect, and disconnect

Start a rabbit hole / Project Sources / Canvas Add source
    Choose specific content from an available connection
    → confirm destination and privacy
    → attach/import into the intended learning context
```

A connection is reusable; source attachment is deliberate. Clicking Connect must not automatically import every document, populate every project, or grant every workspace member access. “Connected” means the account authorization exists; it does not mean a deck has been imported, parsed, indexed, or added to a graph.

#### Provider catalogue: required design cases, not a claim of API availability

| Provider/content entry | Intended learning use | Scope now |
|---|---|---|
| GitHub / current repository provider | Select public or permitted private repositories | Reuse the already implemented repository flow after auditing its actual connection model. |
| Google Slides | Select a presentation for a lesson, notes, or a shared canvas | Design a future source-picker/import journey; backend/OAuth/extraction is deferred unless demonstrably implemented already. |
| Google Drive / Google Docs | Select supported documents or files as learning sources | Design companion source entries where useful. Do not promise support for all formats. |
| Notion | Select permitted pages or source material for a project/canvas | Design future source selection and status states; no new Notion backend in this pass. |
| Local uploads and pasted sources | Add already supported PDFs, slides, images, or URLs without a connected account | Keep the current input path. An upload is not an OAuth connection and must not require one. |
| Existing Mail & Calendar / MCP / other providers | Preserve current connected workflows | Audit and reuse; do not expand their scopes or remove them during this redesign. |

Google Slides and Google Docs may be presented as content types under a Google connection if the future backend supports that. Do not force duplicate account authorizations simply because the content tiles have different labels. Conversely, do not infer Slides/Drive permission from an existing Google login or mail/calendar connection. The future integration owner must decide actual providers, permissions, and consent flows from verified provider capabilities; this brief does not prescribe API scopes.

Provider cards/rows should explain **what the connection adds to learning**, not merely display logos:

- Google Slides: “Bring presentation material into a Learn canvas.”
- Notion: “Use selected pages as sources for your learning project.”
- GitHub: “Understand a repository through its code, map, and Learn canvases.”

These are proposed use descriptions, not assertions that complete extraction, continuous sync, or live inference already works.

#### Three independent kinds of status

| Status layer | Example values | What it must not imply |
|---|---|---|
| Product availability | Available, Planned, Disabled by workspace policy | Planned is not an authorization failure; a visible future provider is not implemented. |
| Account connection | Not connected, Connecting, Connected, Reconnect required, Error | Connected is not the same as source import complete. |
| Individual source | Selected, Importing, Ready, Partially imported, Update available, Unavailable, Failed | One failing source does not necessarily invalidate every source on the same account. |

Reuse actual API enums through a thin UI adapter; these labels are not a demand for a new backend schema.

For a connected account, show its provider, permitted display identity, **Personal** or **Workspace** scope, authorized capabilities in understandable language when known, and the management actions the current viewer is allowed to use. A workspace-managed connection can show “Managed by your workspace” rather than a misleading Connect button. A personal account connection never becomes workspace-wide merely because the user changes the shell's active workspace.

Only show “Last synced” when a sync process actually exists and supplies a timestamp. A one-time import should say “Imported” and identify its snapshot, not pretend to be continuously synchronized.

**Future-only provider:** in the connected product, omit it or clearly mark it Planned according to the approved design. Do not offer an active Connect button that ends in simulated success. In the isolated Figma/preview environment, the full flow can be clickable with a persistent “Prototype — no real account is connected” notice. Do not build a waitlist, token collector, or fake OAuth screen to make the tile feel functional.

#### Example Google Slides journey for the mockup

1. A teacher starts a blank canvas or chooses **Start a rabbit hole → Add sources**.
2. They choose **From a connection → Google Slides**.
3. If needed, the UI explains that a connection is required. Existing supported providers use their real flow; a future-only provider remains an explicitly labeled prototype.
4. Choose the connected account or permitted workspace connection, then select a deck. Selection must be explicit; do not automatically pick a recent private presentation.
5. Confirm the destination workspace and the new or current canvas. Show the selected title, source link, author/owner metadata if available, and intended import mode.
6. Preview supported material. State limitations for speaker notes, embedded media, diagrams, equations, or slide animations; do not claim those were read unless the importer actually produced them.
7. Attach/import through an available backend or demonstrate the fixture transition in the prototype. Preserve the current canvas and draft if authorization is cancelled or import fails.
8. Show a source card with provider, deck/version reference, import state, and original link. User-written notes stay distinguishable from imported slide material.

The same shell can express a Notion page journey. Source-specific selectors and extraction capabilities can live behind provider adapters; do not add `if title == "ML lecture"` or repository-name branches in shared UI.

#### Permissions, sharing, and removal

- Design initial learning-source connections as read-only unless an existing approved capability requires writing. Do not add new writeback or publish permissions in this UI pass.
- Connecting an account, attaching a source, granting workspace access, and publishing a canvas are four separate actions. A teacher sharing a canvas must receive a clear recipient preview if its backing source is private.
- Source access revocation must have a UI state for the canvas, search results, and related map content. Backend enforcement, retention, and deletion semantics need an explicit contract; frontend hiding is not security.
- **Remove source from this canvas** and **Disconnect account** are different actions. Before disconnect, describe affected resources when that information is available. Do not silently delete the learner's own notes, fork credits, or attempts.
- Do not promise that disconnect immediately erases imported content, or that previously imported content remains shareable forever. Reflect the actual retention/access policy; unresolved future behavior is labeled, not invented.
- Credentials, OAuth tokens, secrets, and raw private source data do not belong in prototype fixtures, browser localStorage, share previews, screenshots, logs, or Figma files.

#### MVP boundary

**Now:** reuse the Settings shell, improve discoverability and copy, build approved Connections presentation over existing adapters, and design the future Google Slides/Notion attachment flows in Figma or a labeled preview.

**Later:** new OAuth/provider backends, content APIs, permission refresh, extraction, background sync, webhooks, writeback, source indexing, and policy enforcement. None are automatically authorized by approval of this UI brief.

The source imported later should normalize into Rabbit Hole's existing source-card model. Do not make a provider-specific learning canvas or a second document editor.

---

## 5. Home: three intentional states

This is the **signed-in Home**, not the public marketing landing page. Do not spend the whole first viewport repeating marketing copy for returning users.

### 5.1 First visit / empty library

A compact welcome:

> **Knowledge is infinite.**  
> What would you like to understand or build?

Primary button: **Start a rabbit hole**.

Offer four explicit starting methods in the creation flow: repository, sources (upload or an available connection), question/topic, blank canvas. A small set of prepared examples may sit below, clearly marked as examples.

A blank canvas is a valid destination, not an error state. Its empty prompt should offer “Add a source,” “Write a note,” and “Ask a question,” without forcing AI generation.

### 5.2 Returning learner

The most important card is **Continue**:

```text
Continue: nanoGPT — Understanding attention
Last explored: why masking changes the output
Next step: compare two queries
[Continue learning]    [Open project]
```

This is fixture copy for the mockup, not a claim about an actual user's history.

Below it, use a compact recent-work grid/list and a restrained “Suggested next” section. A suggestion must say why it appears when that reason is available. Without a recommendation engine, show recent/pinned items rather than pretend personalization.

Do not show fake mastery percentages, meaningless streaks, or a large passive activity feed. Useful context is the unresolved question, work product, source revision, and next action.

### 5.3 Team/classroom context

Home can prioritize assigned or shared learning paths **only when such data exists**. A team member should see a project relevant to their task, not the organization's entire session archive.

In prototype mode, demonstrate one assignment and one shared canvas. In connected mode, omit unsupported assignment functionality rather than simulate that a teacher actually assigned work.

### Home content priorities

1. Continue current work.
2. Start a new rabbit hole.
3. Find recent/pinned resources.
4. Discover a relevant public/shared artifact when requested.

The page should remain useful with zero recommendations and zero public content.

---

## 6. “Start a rabbit hole”: one entry, four clear paths

Use one reusable creation dialog/sheet or route. It should not be four unrelated creation systems.

### Path A — Connect a repository

1. Paste a public repository URL or choose an authorized private repository.
2. Show source owner/name and whether the connection is public or restricted.
3. Confirm destination workspace and project privacy; default new private-source work to private.
4. Optionally choose a goal: understand the overview, make a change, prepare an explanation, or define another goal.
5. Create/open the project and its default Learn canvas.
6. Show graph preparation status separately from canvas availability.

Graph generation is asynchronous in the UX. Required states: not started, queued, indexing, partial, ready, stale, failed, access revoked. Do not show a fake percentage unless the backend provides meaningful progress.

The learner should be able to use available sources or a blank canvas while indexing proceeds. “Map not ready” must not mean “the whole project is unusable.”

### Path B — Add sources: upload files or choose from a connection

Preview the selected files, state what is supported, and let the user name a canvas. Keep source pages and extracted notes distinct. Upload failure, unsupported file, partial extraction, and retry need designed states.

Do not promise that every slide animation, equation, speaker note, or source format is parsed if the existing importer does not support it. This redesign reuses that importer; it does not replace it.

Offer **Upload files** and **From a connection** as source-acquisition methods within this path. The latter uses the same connection catalog and source picker as Project Sources and Canvas Add source. An unimplemented Google Slides/Notion option is an honest planned entry or prototype, not an active live import. Cancelling connection or selection returns here with the destination and draft preserved. Refer to Section 4.2 for the complete account-versus-source distinction.

### Path C — Start with a question or topic

Ask for the user's goal in plain language. Offer a small optional depth choice:

- **Overview:** main ideas and vocabulary.
- **Guided:** mechanisms, examples, and relevant prerequisites.
- **Deep dive:** mathematics, implementation, and evidence.

Depth is a user intention, not an intelligence rating. It must be changeable later. A difficulty/prerequisite label is separate.

If generation is not supported by the connected build, a prototype can demonstrate the journey using fixtures; the live UI must not claim it generated a personalized canvas.

### Path D — Blank canvas

Open the existing Learn editor directly. No repository, graph, quiz, or generated curriculum required. Support notes, visual organization, source cards, and the existing bottom composer.

### Creation behavior

Submission should visibly produce an object or a clear pending/error state. Prevent accidental duplicates from double submission. Preserve entered data after recoverable errors. Search must never silently create a repo connection or execute an import.

---

## 7. Library, search, and public discovery

### 7.1 Library

A reusable resource card/list item shows:

- title and resource type;
- source/creator attribution;
- private/workspace/public status as appropriate;
- depth and prerequisites when declared;
- last edited or last visited, with the meaning labeled;
- personal resume action when known;
- available actions from actual permissions/capabilities.

Use a compact grid by default for visual canvases and a useful list option for large collections. Do not force thumbnails on every resource. Unknown/no-preview is an honest state.

Filters: **All / Projects / Canvases / Apps**, with ownership/scope filters such as **Mine / Shared with me / Workspace**. Public discovery belongs in Explore; do not mix public recommendations into a user's private inventory without labeling scope.

### 7.2 One search entry, explicit scope

Search should find projects, apps, canvases, and notes within canvases. Later it can also search code symbols, papers, and permissioned decisions/sessions.

The interface must distinguish:

- **Search resources:** find something already present.
- **Ask:** converse about the selected project/canvas through its composer.
- **Start a rabbit hole:** create a new learning object.

They may share visual conventions, not ambiguous submission behavior.

Search example:

> `nanoGPT, overview only`

Possible filter interpretation:

```text
Topic: nanoGPT   Depth: Overview   Type: Canvas   Scope: Public
```

In the first UI implementation, explicit filters and basic text search are enough. Natural-language interpretation is a future adapter capability, not a reason to build a recommendation model now.

Results need a short explanation of their fit, such as “Overview; assumes basic Python; community-created.” If that is an AI estimate, label it as an estimate. The creator's declared audience and a model's inferred audience must remain distinct.

A result inside a canvas should open that exact canvas/block with context highlighted, not just its parent project. Back navigation must preserve query, scope, filters, and position.

Permission filtering must be server-enforced in real retrieval; client-side hiding is not protection. Do not leak private titles, snippets, graph degrees, thumbnails, or even private result counts. The UI prototype can test presentation states, not prove backend authorization.

### 7.3 Explore

Explore is for intentional discovery, not an endless feed on Home. Let users filter by subject, depth, prerequisites, artifact type, creator, and source freshness when supported.

Show a canvas's preview, expected outcome, source basis, depth, attribution, and version. Do not use a five-star score as the only quality signal.

**For this milestone:** design Explore and its result cards; implement only supported search/data paths. Put AI ranking and marketplace-scale discovery in the future-feature prototype, with sample data clearly identified.

---

## 8. Project page: a learning hub, not a graph as the welcome screen

### 8.1 Project header

```text
nanoGPT
Understand and experiment with a small Transformer language model.
Source: karpathy/nanoGPT · indexed revision … · status …

[Continue learning / Open canvas]   [Share]   [More]

Overview    Learn    Map    More
                           ├ Sources
                           ├ Decisions & sessions   when available
                           └ Build / Apps            when available
```

Labels and route structure are proposals. Preserve old deep links such as repository Graph/Learn URLs through explicit aliases or adapters. Do not break saved canvas URLs in pursuit of nicer terminology.

Do not show all destinations as empty tabs. Keep Overview/Learn/Map concise; surface conditional capabilities when they have a useful state.

For a canvas-only/topic project, do not render a broken repository header or fake code map. The Overview should adapt to its sources. The user should still reach Learn with the same primary action; source-specific tools are conditional.

### 8.2 Overview answers four questions

**What is this?** A short, editable summary with a source/AI-generated distinction.

**Where should I start or resume?** A clear main action with the current learning goal and exact resume destination.

**What can I learn or build here?** A small list of learning canvases or finite outcome paths. Show practical artifacts when available, not invented “completed builds.”

**What is relevant context?** A compact architecture summary, source freshness, and a few permissioned decisions or changes—not a complete event stream.

A first-time visitor gets orientation. A returning learner gets continuation. A viewer of a published project gets a read-only introduction with a clear path to make their own learning copy when allowed.

### 8.3 Learn

Each repository project has a default Learn canvas. Show a lightweight canvas picker when there are several. Open the real existing canvas, not a new simplified drawing implementation.

Project-level cards can include “Overview,” “Implementation deep dive,” and “My experiment” as fixture examples. These are not hardcoded names or mandatory tabs.

Personal exploration may create a private branch/copy without editing a teacher's or maintainer's shared original. Make edit mode, learner view, and source publication version distinguishable.

### 8.4 Map

The map supports understanding and source navigation. It should not force users to understand graph theory to learn a repository.

Default to a manageable overview of subsystems or a focused neighborhood if the existing graph data supports it. Provide search, filters, a legend, selected-node details, and a plain list/tree alternative.

The current screenshot has a Graph tab and a second Graph selection. Use one top-level **Map** destination with an internal **Graph / Files** switch, or an equally clear alternative approved in the mockup. Avoid duplicate navigation labels at adjacent levels.

A selected symbol should reveal its qualified name, file, relationship, source revision, and a relevant Learn action. Repeated names such as `__init__` need file/class context.

Do not redesign the graph physics or install a new graph library merely to style this page. Reuse the current graph renderer. If subsystem grouping is unavailable, show a source/file overview and record the grouping gap instead of inventing relationships.

### 8.5 Sources: attach to this project; manage accounts in Settings

Show the project's selected source records, original links, provider identity, imported/indexed revision, and source-specific readiness/access states. A connected external account itself is not a project source.

**Add source** reuses the common upload/connection picker. **Manage connections** opens the existing Settings → Connections view and preserves a return target to this project. A standalone canvas can invoke the same workflow with its own canvas ID and no repository requirement.

Do not create three unrelated Google Slides pickers for Start, Project, and Canvas. One source-attachment UI receives an explicit destination and supported capabilities. Copy and available fields can vary with the provider, but resource identity, permission messages, and cancellation behavior remain consistent.

New imported material need not automatically regenerate the code graph or replace a learner's notes. Display source-processing and graph-processing states separately; the backend integration determines which derived artifacts should refresh.

### 8.6 Build / Apps

Where a project has a runnable artifact, show its purpose, source, runtime status, access level, and launch action. Keep server/job operational metadata here rather than on learning Home.

An external demo is not a Rabbit Hole-deployed app. Label whether an action opens an external URL, an existing deployed app, or a future execution surface.

Do not embed or execute arbitrary repository code in this UI pass. Source imports must not auto-run installs or scripts.

---

## 9. Graphify and development memory: separate evidence layers

### Three graphs that must not be conflated

| Layer | Represents | Example |
|---|---|---|
| **Code graph** | Source structure and dependency evidence | `train.py` uses the model; a function calls another function |
| **Knowledge/context graph** | Concepts, documents, sessions, and decisions linked to evidence | An accepted decision explains a design tradeoff in a PR |
| **Learner model** | A person's evidence of understanding and current goals | A concept was practiced; a review is suggested |

Do not place private learner performance into the public code graph. Do not treat an inferred concept edge as an extracted code dependency.

### Graphify integration boundary

The product requirement is that connected repositories are graphified. The UI receives a normalized graph/status contract, not a specific vendor's raw data embedded in components.

Preserve source revision, extraction status, node/edge provenance, and exclusions. A graph generated from revision A while the source is at revision B should say “Update available” or “Map based on revision A,” not silently claim current truth.

Graphify's public README describes extracted versus inferred edge provenance; keep such distinctions when the installed version exposes them. Do not assume the public project's current schema matches the user's backend. [S2]

### Glen-inspired sessions and decisions

Glen's public profile emphasizes session history and the context behind changes. Rabbit Hole's use is different: turn authorized development context into understandable project knowledge and onboarding evidence. [S1]

An example journey:

```text
Select a code/module node
          ↓
See “Related decision: why this design changed”
          ↓
Read concise summary + author/date/status
          ↓
Open permitted source session, commit, document, or PR
          ↓
Ask a grounded question / add the relevant material to a Learn canvas
```

Represent sessions and decisions separately:

- **Session:** captured tool-visible messages, actions, outputs, and source references, subject to consent and filtering.
- **Decision:** a structured, reviewable statement with rationale, alternatives, supporting evidence, and status such as proposed/accepted/superseded.

Do not claim to capture hidden model reasoning or assume a transcript contains every organizational decision. A generated summary is a derived interpretation, not automatically an approved decision.

### CLI UX only for this pass

Design connection status, scope selection, pause/resume capture, last sync, redaction notice, review-before-sharing, disconnect, and delete/export requests. Do not invent an install command or claim capture is active before an actual CLI integration exists.

No secrets, credentials, raw private prompts, or restricted source paths in public fixtures. A project owner publishing a canvas must not automatically publish the backing agent sessions.

Show permission-aware graph layers: Code, Concepts, Decisions, Sessions. Only offer layers the data/capabilities support. Missing access is not the same as an empty organization.

---

## 10. Chat: keep it, clarify its scope, do not duplicate it

### Current interfaces versus proposed direction

- **Learn today:** bottom composer; existing Ask in chat above cards.
- **Graph screenshot today:** right-hand Graph Agent chat.
- **Recommended target for this redesign:** one contextual project conversation with a bottom composer across Overview/Map/Learn, with scope chips. An optional right-hand inspector can show selected-node/source details, not a second simultaneous chat.

This unification requires design approval. If migration would exceed the approved shell scope, preserve the existing Graph-only chat temporarily and document it; Learn must still retain its bottom composer. Do not misreport the existing Graph panel as nonexistent.

### Scope must be visible

Examples:

- `Project: nanoGPT`
- `Canvas: Understanding attention`
- `Selected: CausalSelfAttention.forward`
- `Sources: authorized project sources`

A pending message must not silently change target because the user hovered over a graph node or switched a tab. Preserve drafts by conversation/resource identity, and clearly show a changed scope. Freeze the input/context revision at Send.

Do not automatically send when clicking Ask in chat. Do not add Ask about this inside each card. Preserve the already implemented current-scene context contract.

Do not build another agent orchestration system. Reuse the existing chat and response-rendering path, including how answers are appended or displayed. If home-wide search is open, it remains search, not an unannounced conversation switch.

---

## 11. Standalone canvases, notes, teaching, and creator use

### A canvas can start empty

A standalone canvas should open without showing “repository not connected.” It can contain slides, PDFs, images, references, notes, visuals, and existing interactive blocks.

The project page and Home redesign must preserve the Learn card layout:

```text
Title / short explanation
Visualization
Playback controls when applicable
──────────────────────────────────
Learning controls below the visual
Optional practice only when useful
```

Do not restart the visualization or interaction milestone. No duplicated token controls, new card-level chat buttons, or automatic quizzes on every card.

### Teacher workflow

Create canvas → add uploaded slides or deliberately selected connected sources → organize/annotate → preview as learner → share a selected version. Google Slides and Notion source acquisition are designed now and activated only when their real integrations are available.

A student's notes and progress must not mutate the teacher's original. Sharing a class canvas does not automatically give the teacher access to every student's private notes or chat. Design that visibility explicitly for a later classroom backend.

### Creator workflow

Create or fork canvas → refine explanation → preview public version → share a link or export a supported artifact.

A LinkedIn-friendly share preview should display title, original creator/fork credit, and an appropriate preview. Do not silently upload or post to social media. If export is unsupported, show a prototype of the export UI separately; do not claim an export file was created.

### Several people collaborating later

Design future states for collaborator presence, comment permission, viewer mode, edit conflict, and reconnect. Do not animate fake live cursors or “Alex is editing” in connected UI without a real collaboration service.

Real-time concurrent editing, conflict resolution, and presence backends are outside this UI-first milestone.

---

## 12. Ownership, blue checkmarks, sharing, and forks

### 12.1 Blue checkmarks: verify a specific claim

The requested checkmark should mean **verified publisher/source relationship**, not “good,” “accurate,” “AI-approved,” or “this user imported a public repo.”

Separate these labels:

| Label | What it can mean |
|---|---|
| **My project** | I own the Rabbit Hole project record |
| **Community-created** | A person made this learning artifact about someone else's source |
| **Verified maintainer** | The service verified a stated relationship to the source owner/repository |
| **Forked from …** | This artifact derives from a particular published canvas version |
| **Reviewed** | A separately defined review happened; not the same as identity verification |

A checkmark needs a visible/accessible explanation, verification scope, and revocation/pending/unavailable states. Source authorship is not inferred from a GitHub URL. Repo account and permission metadata may contribute to a later backend verification process, but the UI must not invent proof. [S9]

Prototype checkmarks must be clearly part of sample data. Do not mark real public authors as verified publishers on Rabbit Hole merely to make a mockup look credible.

### 12.2 Share the selected resource, not its entire context

Design a consistent share dialog for project, canvas, and app, with an explicit target and effective access summary.

Suggested audience choices where supported: private, invited people, workspace, link-access, public. Suggested permissions: view, comment, edit. These are UI proposals; expose only capabilities the backend actually enforces.

Publishing a canvas must not implicitly expose its private repository, graph, raw sessions, chat, drafts, or learner records. Preview the recipient/public view. Embedded restricted content requires an explicit safe treatment; it must not be made public by screenshot export or a graph preview.

Permission decisions cannot be enforced by React state alone. In a backend-missing prototype, changing a control only changes the demo scenario and says so. Never show “Shared successfully” or issue a pretend public URL.

### 12.3 Save, duplicate, fork, publish are different

- **Save:** bookmark/reference the original.
- **Duplicate privately:** make an independent private copy where permitted; retain source provenance.
- **Fork and expand:** create a derivative with immutable lineage to the source version and original creator.
- **Publish:** explicitly release a selected version to a selected audience.

A fork should preserve a lineage record with original resource ID, immediate parent ID/version, original creator ID, title at fork, and the new owner's ID. Display a concise “Forked from … by …” line and allow opening the lineage.

Do not automatically pull upstream edits into a fork. Show “Original updated” where supported; updating is an explicit future action. Do not transfer the original creator's progress or verification badge to the fork.

Privacy and deletion complicate credits: preserve permitted attribution, but never expose a now-restricted original title or user identity just because it was cached. Define a safe “Original source unavailable” state rather than asserting lineage access will always be public.

Attribution is not permission to reuse every asset. The sharing/fork backend must carry the applicable reuse policy; this UI pass does not settle rights merely by adding a credit line.

---

## 13. Public profiles, reviews, and audience matching — designed, not all built

### Public portfolio

Later profile pages can show explicitly published Projects, Canvases, and Apps with authorship and fork credit. Public profile is opt-in. No private learning history, workspaces, chat, failed attempts, or confidential session details should appear automatically.

### Reviews

A later review may combine an overall 1–5 rating with clearer signals: explanation clarity, technical correctness concerns, prerequisites, and actual depth. Show count and version reviewed. Do not synthesize star ratings or testimonials.

Public content needs report-content, review-spam handling, version awareness, and moderation/removal states. Designing those states now is useful; implementing a social/reputation platform is not required for Home and Project.

### Audience/depth matching

For “teach me nanoGPT at a surface level,” use topic plus **requested depth, prerequisite familiarity, goal, and format preference**. Do not infer ability from demographic or sensitive personal characteristics.

Keep creator labels and AI-suggested classification separate. Let users correct recommendations and choose a deeper or simpler path. A recommendation should explain its basis without pretending certainty.

---

## 14. Adaptive progress: personal evidence, not a fixed-course percentage

### Separate three things

1. **Content structure:** concepts, steps, sources, and versions.
2. **User intent:** current goal, preferred depth, time available when supplied.
3. **Learning evidence:** attempts, artifacts, explanations, inspected content, and a resume pointer.

A page view or slider click is not proof of understanding. “Viewed,” “practiced,” and “demonstrated in a task” should not be synonyms.

### Home/project presentation

Use simple status language where supported: **Not started**, **In progress**, **Practiced**, **Review suggested**. A finite goal can have progress; an open-ended topic does not need an invented completion percentage.

Show evidence-based explanations such as “You last worked on this example” or “A refresher may help; your last practice was on an earlier version.” Do not declare that a person has regressed merely because time passed or code changed.

Across projects, concept IDs can later connect evidence about the same concept. Keep source version and task context; do not equate two similarly named concepts automatically.

### Backend handoff, not an implementation mandate

The future learner model will need resource/version IDs, concept/task IDs, event type, attempt/result provenance, timestamp, goal, and confidence/uncertainty where modeled. It also needs opt-in controls, correction/reset, retention, and workspace boundaries.

In this UI pass, consume real resume/progress fields when available and use explicit sample states in the prototype otherwise. Do not implement mastery estimation or a forgetting model just to fill Home cards.

Publishing/forking content does not publish/copy progress. Employer/investor access does not automatically grant access to individual learning records.

---

## 15. Visual direction: recognizable Rabbit Hole, not a Notion reskin

### What to change from the screenshots

- Replace the infrastructure-first table as Home's default with resume/start intent.
- Remove repeated navigation levels and excessive sidebar inventory.
- Give each resource a clear type, ownership, visibility, and next action.
- Make a Project welcoming before showing the full graph.
- Use consistent theme surfaces; the current white graph inside a dark shell feels disconnected.
- Keep dotted backgrounds for the actual canvas/map where useful, not every management screen.
- Hide operational detail until it serves a learning/build task.

### What makes the design distinct

The difference is behavior and information hierarchy, not replacing rectangles with whimsical shapes. Home should tell the user what they were trying to understand and where to go next. Projects should connect explanations, evidence, and practical work. Published canvases should invite an attributed continuation.

Proposed tone: curious, precise, adult, and calm. Use plain-language controls and real content. Avoid cartoon classroom quizzes, generic AI gradient wallpaper, endless dashboard metrics, and deliberately obscure rabbit-themed names for ordinary actions.

Use **Start a rabbit hole** and **Go deeper** where they fit. Keep **Library**, **Share**, **Search**, **Source**, and **Continue** understandable.

### Mascot

Reuse the approved White Rabbit-inspired character/model sheet from the branding work. Do not design a second rabbit independently in this branch. No need to load a sprite runtime or 3D mascot to deliver Home/Project.

Use the mascot sparingly on first-use/empty states or an unobtrusive transition. Never block controls, urge the learner to hurry, play unsolicited audio, or use a watch motif to create time pressure. Knowledge can be infinite without the UI demanding endless engagement.

### Typography, motion, responsive behavior

Use the existing application design tokens, not SVG scene coordinates, for Home/Library/Project UI. Preserve existing visual-runtime semantics.

Proposed screen-space design targets: normal body/control text around 14–16 CSS px or larger; secondary metadata remains comfortably readable. These are initial design targets, not permission to shrink text to fit. Long titles wrap or truncate with accessible disclosure; critical distinctions stay visible.

Use subtle CSS/existing Motion transitions only when they clarify navigation or state. Respect reduced motion. No additional cinematic animation milestone.

Home and Project layout should reflow at narrow widths and browser zoom. Graph/canvas regions may need controlled two-dimensional navigation, but surrounding forms, text, and navigation should still reflow. W3C's reflow guidance distinguishes such regions from ordinary content. [S6]

---

## 16. What to implement now, preview, or defer

Audit actual capability first. This table describes the **intended boundary**, not known backend availability.

| Feature | UI deliverable now | Backend-dependent behavior |
|---|---|---|
| Home + resume/start hierarchy | Build after mockup approval | Real progress/recommendations only if available |
| Library cards/list/search filters | Build on existing data or explicit fixture adapter | Global semantic search later if absent |
| Public/private repo connect | Reuse existing flow; redesign states | Do not build new GitHub auth/indexing here |
| Repo Map + Graphify status | Reuse graph; design fresh/partial/error states | Graph extraction/grouping revisions owned by backend |
| Default repo Learn canvas | Reuse supported creation/open path | Do not report creation success without a real result |
| Standalone canvas | First-class UI and route/creation contract | Reuse canvas persistence; record missing support |
| Upload sources | Reuse existing uploader and contextual Add source flow | No new PDF/slide extraction engine |
| Existing workspace/account menu and Settings | Reuse/refine working shell, entries, permissions, preference persistence, and Rabbit Hole copy | No account/workspace migration or settings rewrite by default |
| Existing Settings → Connections | Reuse current catalog/components; show account scope and honest states | Live connection management only for implemented providers |
| Google Slides / Notion / document connections | Mock up catalog, account selection, content picker, destination, and failure states | New OAuth, content fetching, extraction, sync, and writeback deferred |
| Contextual source attachment | One shared picker across Start, Project Sources, and Canvas Add source | No success or source-ready claims without backend confirmation |
| Reconnect / disconnect / revoked source states | Design consequences and existing actions accurately | Retention, source-policy enforcement, and new provider actions owned by backend |
| Collections | Design and use existing/local prototype support | Persistent shared organization only when supported |
| Sharing | Complete dialog/recipient-preview design | Real ACL changes only through authorized backend |
| Fork + credits | Complete lineage/prototype flow | Durable version/fork enforcement may be deferred |
| Apps / runnable artifacts | Show existing artifacts in Build/Library | No arbitrary repo execution service |
| Maintainer checkmark | Design precise badge/status states | No real badge without verified backend evidence |
| Session/decision timeline + graph links | Prototype representative states | CLI ingestion/redaction/retention deferred |
| Enterprise onboarding / invited reviewer | Demonstrate permission-aware journeys | Team provisioning/policies/SSO not part of this pass |
| Personal progress across projects | Design resume/evidence states | New learner-model inference deferred |
| Public Explore and depth filter | Prototype and connect existing public data | Ranking engine and large public corpus deferred |
| Profile/portfolio | One future-feature preview | Public profile publishing backend deferred |
| Reviews/5-star ratings | Future preview, clearly sample | Review moderation/reputation deferred |
| Multi-user canvas collaboration | Future state mockups only | No live presence/CRDT infrastructure |
| Export/social sharing | Use working export; otherwise preview | No fake file or social post success |

### No fake functionality

Every feature must be identified as **Connected**, **Prototype**, or **Unavailable** in the internal capability map. A prototype environment carries an unmistakable “Demo data — changes stay in this preview” indicator.

Do not place pretend collaborators, ratings, verification, live ingestion, personalized mastery, or successful sharing on a real user page. Future previews belong in an isolated design-review route, not an app filled with misleading enabled buttons.

Prototype creation/renaming/filtering/forking can work against a namespaced local fixture store if explicitly labeled. It must never write to real workspaces or clear ordinary localStorage.

---

## 17. UI architecture and backend handoff

### Do not hardcode the showcase

Generic UI components may implement resource cards, search, share dialogs, tabs, depth filters, Settings sections, connection cards, source pickers, and route actions. Data decides titles, source types, available capabilities, options, and content.

A reviewed provider catalog and provider adapters are legitimate implementation code. What is forbidden is hardcoding particular users, source titles, repository names, or mock successful authorization into shared components. Reuse an existing connector catalog before proposing a new one. New Google/Notion service adapters remain a later task.

Forbidden: branching on `nanoGPT`, a teacher's name, a scenario title, or a particular repository ID to decide layout/permissions. Domain-specific examples belong in fixture data or real API data, not shared renderer code.

Use stable IDs and explicit resource types. React state is associated with render-tree identity; redesigning component structure/keys can reset state. Preserve drafts and resume state deliberately instead of assuming they survive a visual refactor. [S3]

### Suggested view-model responsibilities

These are conceptual contracts for the coding agent to map onto real APIs, not a new schema to impose blindly:

- Resource summary: ID, type, title, description, owner/publisher, source references, visibility, capabilities, version, thumbnail, actual resume info.
- Project detail: goals, sources, graph status/revision, canvases, available apps, permitted decision summaries.
- Search result: resource/block anchor, permitted snippet, depth/prerequisites, reason/source of classification.
- Canvas lineage: root and parent identifiers/versions, creator, fork status, permitted attribution.
- Viewer capability: readable/openable/editable/shareable/forkable actions supplied by trusted services.
- Session/decision summary: provenance, status, timestamps, links, scope, redaction/access state.
- Progress summary: task/goal scope, evidence kind, last activity, resume location, estimated status clearly distinguished from fact.
- Settings context: account ID, active workspace ID, authorized settings sections, current saved values and their actual account/device/workspace scope, return route.
- Provider catalog item: stable provider ID, display name, availability, supported source types, declared actions, and whether an implemented connection adapter exists.
- Connection summary: connection ID, provider/account display identity, owner/scope, actual status, capabilities, and real last-sync information when available; never include secrets.
- Source attachment: stable source/provider IDs, original link/revision, destination project or standalone canvas, import/access state, and extraction limitations. Display names are not storage keys.

Reuse a thin service/adapter boundary with real and fixture implementations. Do not create an enterprise abstraction framework. Treat permission fields as UI hints, never security enforcement.

### Versioning and stale-state requirements

Source revision, published content version, user attempt history, and UI review seed are different versions. Do not use one as a substitute for another.

A new prototype seed must not silently replace a user's ordinary board. Unknown review routes show a clear error rather than an empty canvas. Loaded client build identity must match the build being reviewed; an endpoint reporting the latest source commit is not sufficient proof.

---

## 18. Tech stack, skills, plugins, and tools

### Recommended stack: preserve the existing app

| Layer | Direction | Do not do |
|---|---|---|
| Home/Library/Project UI | Existing React app, router, and build pipeline (retain Vite where the checkout uses it); current JS/JSX conventions | No Svelte/Next.js rewrite or TypeScript migration solely for this redesign |
| Styling | Existing CSS/design tokens; semantic HTML and responsive CSS | No second global styling system without a specific approved need |
| Controls/dialogs | Reuse installed accessible component primitives or native HTML | No hand-built inaccessible fake combobox/dialog |
| Settings/workspace switcher | Existing components, persistence, auth context, and scope rules | No duplicate Settings page, new account model, or preference reset |
| Connections/source pickers | Existing provider/catalog adapter where present; shared account-management and contextual content-selection UI | No new OAuth, token storage, or provider SDK dependency merely for mockups |
| Learn surface | Existing Learn canvas and card components | No new canvas renderer or old sidebar-chat assumption |
| Graph surface | Existing graph library behind a data adapter | No blanket graph-engine replacement |
| State/data | Current state/query/persistence approach plus a thin fixture adapter | No fake backend truth in component-local constants |
| Validation | Existing schema validation conventions | No new incompatible frontend API dialect |
| Motion | CSS and existing narrow Motion usage | No GSAP/Three.js project just for navigation polish |
| Tests | Existing unit runner + Playwright browser actions/screenshots | DOM counts alone are not visual approval |
| Backend | Reuse current endpoints/deployment contracts | No Graphify, CLI memory, adaptive-learning or collaboration backend build in this pass |

WAI's combobox and dialog patterns provide concrete keyboard/focus behavior for search and creation/sharing dialogs. Apply the appropriate pattern rather than treating accessibility as an icon/contrast exercise. [S4, S5]

Playwright supports real user actions and visual comparisons. Use actual clicks, search input, navigation, uploads where supported, and rendered screenshots; pin the screenshot environment for stable comparisons. [S7]

### Skills/workflow for the coding agent

Use the available **superpowers** workflow in the coding environment; it works best in Codex. These are agent-process skills, not dependencies shipped in Rabbit Hole:

1. **brainstorming:** understand user goals, propose two coherent directions, and expose assumptions.
2. **writing-plans:** after the written design is approved, turn it into a file-specific plan grounded in the checkout.
3. **using-git-worktrees:** reuse/create an approved isolated workspace before implementation; do not create nested worktrees blindly.
4. **test-driven-development:** tests for behavior, navigation, capability states, and state preservation.
5. **systematic-debugging:** investigate actual defects before stacking patches.
6. **requesting-code-review** and **verification-before-completion:** review diffs and verify the deployed experience before completion claims.
7. **subagent-driven-development** or **executing-plans:** use the selected execution method; parallelize only independent work.

If a dedicated frontend-design skill is installed in the coding environment, use it for the approved visual direction. Discover it first; do not claim an unverified skill/plugin is installed.

### Figma is connected: use it for design review before production code

The user connected Figma for this request. Use **Figma as the preferred editable mockup and review surface**, not as a replacement frontend framework or a new canvas inside Rabbit Hole. The official MCP documentation covers design-context retrieval, native canvas editing, and capturing an existing browser UI into editable frames. These are capabilities of the integration; the coding agent must discover the actions and permissions exposed in its own environment. [S8, S11]

At T03, create or use an explicitly approved file named **Rabbit Hole — Home & Projects**. Keep these review areas simple:

1. **Context and journeys:** current-screen observations, the resource model, and the key user flows. A FigJam board is suitable when that action is available; annotated frames are sufficient otherwise.
2. **Direction A / Direction B:** low-fidelity Home and Project alternatives with the same realistic content, so the comparison tests structure rather than decoration.
3. **Selected direction:** reusable components, semantic variables, Home, Project, Library/search, the reused Settings/Connections shell, and Start/Share/Add-source flows.
4. **States and future previews:** empty, loading, error, restricted, and prototype-only capabilities, including Google Slides/Notion attachment, clearly separated from connected features.

Use named reusable components and auto-layout for navigation, resource cards, depth controls, status badges, settings rows, connection cards, source selection, and dialogs. Keep copy and state variants editable. Do not deliver one flattened screenshot and call it a Figma prototype. Record the exact file/frame links and which revision received approval.

Before production implementation, retrieve the approved design context and token/component mappings. Adapt them to the existing React/CSS components rather than pasting generated markup as a second application. Figma describes its MCP output as context for the coding agent, not a guarantee of production-ready code. [S12]

Do not browse unrelated designs or overwrite an existing team file without approval. Do not insert private repositories, sessions, or student data into shared mockups; use synthetic fixture content instead.

If the coding environment cannot invoke the connected design actions, report the exact limitation and use an approved isolated React/CSS prototype as the fallback. Do not claim a Figma file was created when no action returned one. The connection alone is not proof of a completed design.

Use one source of design truth. A generated concept image may support a moodboard, but cannot prove navigation, permission behavior, or state transitions. Browser-based verification remains required after implementation.

**Handoff status:** this document specifies the workflow; no Figma mockup has yet been created or approved by this document.

### Development plugins are not product connectors

Figma and the superpowers skills help the coding agent design and implement Rabbit Hole. Future Google Slides/Notion connections are features inside Rabbit Hole. Connecting a tool in the coding agent's environment does not implement that connector for Rabbit Hole users or authorize use of their accounts. No external account needs to be connected merely to mock up these flows.

### What not to install now

No new Google/Notion OAuth clients, provider SDKs, extraction services, or sync workers solely for this design pass. No Webflow/Wix rewrite, new graph platform, social-network backend, learner-scoring vendor, or collaboration engine. Graphify/CLI capture are **product integrations**, not a reason to add every related development plugin. Existing repository and browser tools are sufficient for most of this UI milestone.

---

## 19. Design workflow: brainstorm → spec → mockup → plan → code

### Approval gates

**Gate A — product structure and written design:** approve terminology, navigation, key journeys, and the selected visual direction. Review the T02 written UX spec before detailed mockups; a conversation about an idea is not approval of a spec the user has not seen.

**Gate B — mockups:** approve Home and Project plus the existing Settings/Connections treatment and contextual Add-source flow in representative populated/empty/restricted states before implementation.

**Gate C — implementation plan:** approve exact file scope, adapters, preserved routes, mock-vs-live boundary, and tests.

**Gate D — deployed review:** the user reviews the actual build and explicitly decides whether to promote it.

Mockup approval is not permission to build the deferred backend. A successful prototype is not a production security review.

### What the first agent response should contain

A short actual-checkout map, two distinct Home/Project design approaches, a recommendation with tradeoffs, and only the questions that genuinely block a decision. Do not ask the user to repeat their brand, canvas location, or core use cases.

Recommended approaches to compare:

- **Learning hub:** resume/start-first Home; Project overview leads to canvas, source map, and outputs. Recommended default.
- **Conversation launchpad:** a large start/query surface with recent work below. Strong for first use, but risks burying library/reuse and personal progress.

A graph-first or database-first home can be shown as a rejected alternative with a reason; it should not be the default merely because the existing implementation already has it.

### Mockup package

Build two low-fidelity Home/Project directions first, then one selected high-fidelity direction. Required review states:

1. Home — first visit.
2. Home — returning learner with real-looking but labeled fixture history.
3. Library/search — mixed resource types and depth filtering.
4. Project overview — repository connected and map ready.
5. Project overview — indexing failed/partial but canvas usable.
6. Standalone canvas entry — teacher/student without a repo.
7. Shared/public canvas — origin credit and Fork/Save distinction.
8. Share dialog — restricted backing sources.
9. Map detail — code node plus evidence-backed decision/session preview.
10. Future-feature preview — profile/progress/collaboration states, clearly separated from connected UI.
11. Existing workspace menu → Settings → Preferences, with current behavior preserved and Rabbit Hole first-party copy.
12. Settings → Connections, with an available provider, a workspace-managed connection, and planned Google Slides/Notion entries.
13. Teacher starts from Google Slides; researcher selects a Notion page — clickable prototype journeys with destination/permission confirmation and a clear preview label.
14. Connection cancellation, reconnect needed, partial source import, source unavailable, and a restricted viewer/admin variant. These can be variants of shared frames rather than separate pages.

A state can be a variant in the same prototype rather than another production page. Include one narrow-screen variant and both themes for core Home/Project screens.

---

## 20. Checkable work packages for the coding agent

**All tasks begin unchecked.** Mark a subtask complete only with an actual result. Use the repository's existing progress ledger convention; do not create another management system.

For each task record: status, owner, exact files, dependencies, verification command/scenario, result, artifact/commit, and remaining limitation. “Implemented,” “prototype-only,” “reviewed,” and “backend-connected” are different statuses.

The task names below identify responsibilities, not verified file paths. T00 must map them to the checkout. Do not invent line numbers or duplicate modules just to match these names.

### T00 — Audit the current shell and protect existing work

**Depends on:** nothing. **Output:** baseline and capability/file map.

- [ ] Read the current repository instructions and relevant Home/Apps/Graph/Learn source.
- [ ] Map the existing workspace switcher and Settings shell, every visible settings entry, preference persistence scope, and role-gated actions; identify the actual Connections implementation before proposing replacements.
- [ ] Record branch, worktree, base commit, router, state/data layers, design tokens, and graph renderer actually used.
- [ ] Inventory real APIs for projects, canvases, uploads, sharing, forks, apps, search, and progress.
- [ ] Inventory actual provider/connection capabilities, account and workspace ownership, authorized source types, import paths, and any existing reconnect/disconnect behavior. Mark Google Slides/Notion as planned unless real implementation is verified.
- [ ] Mark every requested feature Connected / Prototype candidate / Unavailable.
- [ ] Identify preserved deep links, chat drafts, canvas seeds, storage namespaces, and current permissions.
- [ ] Record baseline test results without treating existing unrelated failures as new ones.
- [ ] Confirm which files/deployments another coding agent owns. Do not touch the visual evaluator or interactive branch uninvited.

**Done when:** a reviewer can see what is real, what is proposed, and what this branch may change.

### T01 — Approve information architecture and product direction

**Depends on:** T00. **Output:** two concise design directions and chosen vocabulary.

- [ ] Map the seven user jobs to one common resource model.
- [ ] Resolve Project / Canvas / App / Collection terminology and old Apps-route compatibility.
- [ ] Place the existing Settings/Connections entry in the proposed shell; separate account management from contextual source selection and source publishing.
- [ ] Present learning-hub and conversation-launchpad Home/Project options with realistic content.
- [ ] State the recommendation and the small set of unresolved decisions.
- [ ] Obtain approval of the product direction, then T02 approval of the written spec to complete **Gate A** before detailed mockups/implementation.

**Done when:** the user can explain where to resume, start a blank canvas, open a repo, and find shared work.

### T02 — Write the implementation-facing UX spec

**Depends on:** T01. **Output:** approved screen and state specification in the repo's docs convention.

- [ ] Specify core screen composition, routes/aliases, actions, and empty/loading/error states.
- [ ] Specify creation/import and search behavior without ambiguous Enter actions.
- [ ] Specify the Project chat scope/migration decision without changing Learn's bottom composer.
- [ ] Specify source/graph/session/version boundaries and sharing/fork visibility.
- [ ] Specify preservation of current Settings behavior, approved branding/grouping changes, settings scope labels, and return-to-canvas behavior.
- [ ] Specify Connections availability/auth/source-import states, future Google Slides/Notion journeys, multi-account scope, cancellation, reconnect, and disconnect consequences without inventing backend guarantees.
- [ ] Specify Connected vs Prototype feature exposure and fixture storage isolation.
- [ ] Include a requirement-to-screen/task traceability table, check it for contradictions, and obtain approval of the written spec before detailed mockups.

**Done when:** the written spec is approved and the mockup implementer can act without guessing what a disabled feature or badge means.

### T03 — Produce the mockups and clickable flow

**Depends on:** T02. **Output:** selected design prototype, not production behavior claims.

- [ ] Use the connected Figma workflow for two low-fidelity directions and then the chosen high-fidelity core screens; record real file/frame links or an explicitly approved local-prototype fallback.
- [ ] Use realistic fixtures spanning repo learning, student canvas, teacher sharing, and community fork.
- [ ] Implement click-through paths for resume, create, search, open project/canvas, and share/fork preview.
- [ ] Mock up the existing workspace menu, Preferences, and Connections in the approved shell, not as a second Settings application.
- [ ] Demonstrate Google Slides and Notion source attachment in labeled preview mode, including destination choice and return to the same project/canvas after cancellation.
- [ ] Show error/restricted states and no-data states, not only a perfect account.
- [ ] Inspect desktop/narrow layouts and both themes; preserve readable text and visible actions.
- [ ] Present the design and obtain **Gate B** approval.

**Done when:** the user chooses the design based on actual journeys, not a single attractive screenshot.

### T04 — Write the bounded coding plan

**Depends on:** T03 approval. **Output:** file-specific implementation/test plan.

- [ ] Map approved components to actual files and existing APIs.
- [ ] Assign one owner per shared file; split independent work only when it is genuinely independent.
- [ ] Define thin real/fixture adapters, feature flags, and permitted persistent actions.
- [ ] Name the existing Settings/provider modules to reuse, preserved preference keys/scopes, and exact UI-only connector work. Exclude new OAuth, extraction, sync, and credentials handling from this plan.
- [ ] Define navigation/state/permission-presentation tests before production edits.
- [ ] Define preview-deploy ownership, loaded-build verification, and rollback path.
- [ ] Obtain **Gate C** approval.

**Done when:** implementation is bounded and no future backend is an implicit prerequisite.

### T05 — Implement the shell, Library, and reuse existing Settings/Connections

**Depends on:** T04. **Output:** working navigation/resource presentation using approved data mode.

- [ ] Add Home/Library/Explore navigation and compact pinned/collection areas.
- [ ] Preserve existing resource IDs/routes and migration aliases.
- [ ] Implement generic resource cards/list with type, attribution, visibility, and capability-driven actions.
- [ ] Keep existing apps/jobs accessible without making operations the Home default.
- [ ] Wire the redesigned shell to the existing workspace/account menu and Settings shell; preserve Settings, New workspace, Log out, and permission-gated sections.
- [ ] Apply approved first-party Rabbit Hole copy and grouping changes without renaming workspaces, changing protocol/configuration identifiers, resetting preferences, or removing working integrations.
- [ ] Extend the existing Connections view using provider/capability data. Keep personal/workspace account scope visible and future-provider availability distinct from connection status.
- [ ] Keep Google Slides/Notion mock flows in a clearly labeled isolated preview unless T00 verified an existing usable backend. No fake connected state on real accounts.
- [ ] Verify Preferences save/load behavior, opening/closing Settings, and return-route/draft preservation. Preserve existing modal keyboard/focus behavior.
- [ ] Verify switching workspace cannot show the previous workspace's data or drafts.
- [ ] Run targeted tests and capture the new shell at normal zoom.

**Done when:** navigation, current Settings, and available Connections work without resource-specific hardcoding, changed tenant identities, preference resets, or data loss; future connectors are unmistakably previews.

### T06 — Implement Home and the Start flow

**Depends on:** T05. **Output:** first-use/returning Home and four-way creation entry.

- [ ] Implement empty and returning states with correct primary action.
- [ ] Connect available resume data or show honest recent work, not fake personalization.
- [ ] Connect supported repo/upload/question/blank-canvas paths through a common creation entry.
- [ ] Within Add sources, reuse Upload / From a connection choices and the same provider/source picker used elsewhere. Confirm the explicit destination and preserve it on cancel or recoverable failure.
- [ ] Implement indexing/partial/error views and preserve user inputs on failure.
- [ ] Keep unsupported flows in labeled prototype mode; never show fake import/share success.
- [ ] Verify a non-coding user can start a blank/source canvas without entering a repo URL.

**Done when:** a user can resume or start without knowing internal storage types.

### T07 — Implement search, filters, and Collections

**Depends on:** T05. **Output:** usable resource retrieval and organization.

- [ ] Add scoped search and type/depth/ownership filters using available data.
- [ ] Use accessible result navigation and distinguish Search from Ask/Create.
- [ ] Open exact resources/blocks and preserve search context on Back.
- [ ] Keep Collection membership separate from access/ownership.
- [ ] Test empty/no-match/loading/error states and duplicate titles.
- [ ] Keep source-provider labels, permissions, and revoked/unavailable source states honest wherever connected sources appear in results. Do not add a new indexing backend to populate this UI.
- [ ] Label prototype ranking; no claim of AI audience matching without a service.

**Done when:** a learner can find an overview canvas without opening every deep-dive resource.

### T08 — Implement Project overview and Learn handoff

**Depends on:** T05–T06. **Output:** approved Project hub with intact existing Learn editor.

- [ ] Build project header, source/index status, main resume/open action, and conditional destinations.
- [ ] Surface canvases and finite learn/build outcomes rather than only graph metrics.
- [ ] Preserve one default canvas and support a canvas picker without a one-canvas assumption.
- [ ] Keep standalone canvas routing independent of project/repo existence.
- [ ] Add/reuse Project Sources and Canvas Add source entry points with an explicit destination. Manage connections opens the existing Settings section and returns to the same destination without losing edits.
- [ ] Implement approved chat scope behavior; preserve drafts and explicit Send.
- [ ] Verify opening Learn leaves its controls, renderer, Ask in chat, and bottom composer intact.

**Done when:** first-time and returning users reach meaningful learning work from the project page.

### T09 — Implement Map/context and Build presentation

**Depends on:** T08. **Output:** reused graph with understandable context and conditional app access.

- [ ] Remove duplicate Graph navigation and use the approved Map/Files structure.
- [ ] Reuse graph rendering; show qualified symbols, provenance, source revision, and selected-node details.
- [ ] Add a plain source/list fallback and clear partial/stale/error states.
- [ ] Connect real session/decision data where supported; otherwise supply labeled prototype states only.
- [ ] Show existing apps/build outputs with clear external vs deployed behavior.
- [ ] Do not install CLI capture, rewrite graph layout, or create an execution service.

**Done when:** users can explain what a map connection means and trace it to permitted evidence.

### T10 — Implement sharing/fork/credit UI and future-feature previews

**Depends on:** T07–T09. **Output:** approved safe presentation of collaboration and provenance.

- [ ] Implement a target-specific Share dialog and public/recipient preview using actual capabilities.
- [ ] Preserve distinction among Save, private duplicate, attributed fork, and Publish.
- [ ] Show lineage and verified-publisher states without inherited/fabricated badges.
- [ ] Test restricted backing sources and unavailable originals.
- [ ] Show that connecting a provider does not publish its sources, and sharing/forking a canvas does not grant a recipient the creator's external-account authorization. Preview unavailable/private-source cases without leaking content.
- [ ] Build isolated sample states for future profiles, reviews, adaptive progress, and real-time collaboration.
- [ ] Connect no fake invitation, public publish, or profile change to production success messaging.

**Done when:** every visible trust/share action has an honest meaning and a known backend boundary.

### T11 — Validate behavior, accessibility, and data isolation

**Depends on:** T05–T10. **Output:** named checks and actual browser evidence.

- [ ] Run the acceptance journeys in Section 21 with real clicks/typing and keyboard use.
- [ ] Verify unknown routes, empty workspaces, long titles, upload errors, and unavailable source states.
- [ ] Verify deep-link compatibility, draft preservation, return navigation, and correct workspace targeting.
- [ ] Verify demo fixtures cannot mutate real resources or masquerade as backend authorization.
- [ ] Run existing Learn/graph/static/interactive regressions relevant to changed code.
- [ ] Review responsive reflow, focus order, dialogs, contrast, and loading feedback.
- [ ] Run J15–J22 for Settings and source connections: current preference behavior, correct account/workspace scope, planned-provider honesty, cancellation, partial imports, and disconnection states.
- [ ] Confirm no credentials or real private account/source data appear in fixture storage, Figma/prototype screens, screenshots, browser logs, or exported preview artifacts.

**Done when:** tests prove behavior, not only component presence or HTTP 200s.

### T12 — Deploy, inspect pixels, and stop

**Depends on:** T11. **Output:** verified approved preview, screenshots, and honest handoff.

- [ ] Coordinate the deployment with other agents; do not overwrite a shared worker unexpectedly.
- [ ] Verify expected build ID against the JavaScript actually loaded by the browser.
- [ ] Open the exact URLs in clean and returning browser contexts; verify saved state/seed behavior.
- [ ] Inspect Home, Project, Library/search, standalone canvas, and shared/fork views in both themes.
- [ ] Open the workspace menu and existing Settings on the deployed preview; inspect Preferences/Connections, preserve a real draft on return, and verify future-provider previews cannot report real authorization/import success.
- [ ] Exercise the main actions, not merely count blocks or nodes.
- [ ] Provide URLs, screenshots, implemented-vs-prototype table, remaining limitations, and rollout/rollback notes.
- [ ] Obtain **Gate D** user review. Do not promote to the live production target without explicit approval.
- [ ] **Stop.** Do not start new Google Slides/Notion/OAuth/sync backends, the CLI, adaptive learner model, collaboration backend, marketplace, or another visual-engine milestone.

**Done when:** the user can use the approved UI and knows exactly what is real, preview-only, or deferred.

---

## 21. Acceptance journeys: test the product, not a generic dashboard

| ID | Scenario | Required observable result |
|---|---|---|
| J01 | Returning learner clicks Continue | Opens the correct resource/step/version without losing prior work |
| J02 | First-time student starts blank | Opens a saveable standalone canvas without repo/index requirements |
| J03 | User connects a public repo | Source owner remains distinct from project creator; no automatic verified badge |
| J04 | User opens a private-source project | Source/index status clear; no private snippets in public preview or other workspace |
| J05 | Teacher uploads slides | Supported sources appear with honest status; partial extraction does not claim completeness |
| J06 | User searches “nanoGPT” + Overview | Results visibly distinguish depth/type/creator and open the intended resource |
| J07 | Creator forks a public canvas | New ownership + original/parent attribution retained; original not edited |
| J08 | User shares one canvas | Target/permissions clear; backing repo/session/chat not implicitly shared |
| J09 | New engineer opens project | Understands starting point, relevant sources, and next task without decoding the whole graph |
| J10 | Invited reviewer opens briefing | Sees only permitted presentation/evidence; no private personal learning data |
| J11 | User changes project then returns | Correct draft, scope, search state, and canvas state restored deliberately |
| J12 | Map indexing fails | Canvas remains usable; status/retry clear; no fabricated ready graph |
| J13 | Original of a fork becomes unavailable | Safe lineage state, no broken or leaked private attribution |
| J14 | New review build with old browser state | Correct new preview loads without erasing ordinary user boards |
| J15 | User opens Settings from the workspace menu and closes it | Existing shell opens for the correct account/workspace; returns to the prior route without losing drafts or selection |
| J16 | User changes supported theme/input preferences, reloads, and revisits | Existing persistence/scope and Enter/newline semantics survive; branding does not reset settings |
| J17 | Teacher selects planned Google Slides entry | Live UI says Planned or omits the action; prototype is clearly simulated; no fake OAuth/import success |
| J18 | User chooses one permitted deck/page for a standalone canvas | Explicit account, selected source, and destination; no repo needed and no unrelated content imported; fixture flow labeled when backend absent |
| J19 | User cancels connection/source selection from a project | Returns to the same source task/project with draft and destination preserved; no partial phantom source |
| J20 | User switches workspace or views a managed connection without admin rights | No credential/source leakage, no authority inferred from account identity; correct managed/restricted UI |
| J21 | Source becomes partial, stale, revoked, or temporarily unavailable | Per-source status is distinct from account status; notes remain intact; unavailable material is not presented as newly fetched evidence |
| J22 | User previews disconnecting an account or removing one source | Actions/consequences are distinct; confirmation reflects real capabilities; no imaginary deletion, access grant, or sync guarantee |

### Human review questions

- Can the user identify the main next action without explanation?
- Can a teacher/student start without feeling this is only a GitHub tool?
- Can they find Connections without opening developer/MCP settings, and tell “account connected” from “this deck attached”?
- Does existing Settings feel like part of the redesigned product without losing working account/workspace controls?
- Can an engineer find code and rationale without losing the learning journey?
- Does a canvas feel like something to learn/build with, not merely a saved document?
- Are creator credit, source authorship, privacy, and verification understandable?
- Is Home useful without fake progress, fake recommendations, or a crowded feed?
- Does the product feel distinct because of its learning loop, not just its rabbit logo?

Use one focused independent product review and one bounded repair confirmation. If a blocker persists, report it for a scope decision rather than silently starting an unlimited redesign cycle. Do not waive correctness/privacy failures to meet a cosmetic deadline.

---

## 22. Worktree, deployment, and handoff safeguards

Use an approved isolated worktree for this Home/Project redesign. Git worktrees have separate working trees and index state but share repository objects; they do not isolate a Cloudflare deployment, database, asset bucket, or browser origin. [S10]

Record the actual path/branch/base and active server port. Preserve another agent's uncommitted/staged work; never clean/reset it. Follow existing commit conventions and inspect the staged diff.

The Home agent must not overwrite the interactive-visual agent's engine changes or deployment. Agree on shared-file ownership, merge points, and preview destinations. Keep backend migrations and service bindings out of this pass unless separately approved.

Use versioned review fixtures without renaming boards blindly. Register each review route. Never hand the user a blank route on the assumption that a new query-string name automatically seeds it.

A handoff is not done until the agent has opened the exact deployed URL, used its primary flows, and inspected rendered pixels. Report a missing browser capability honestly rather than claiming visual verification.

---

## 23. Missing product decisions to capture, not build immediately

The user already supplied the vision. The following decisions prevent expensive contradictions later:

1. **Finite outcomes inside infinite exploration:** what does finishing a goal look like?
2. **Source freshness:** how are lessons and maps tied to repo/paper versions?
3. **Visibility boundaries:** exactly what sharing a canvas exposes, including embedded assets and linked evidence.
4. **Capture consent:** what the CLI is permitted to collect, redact, retain, or delete.
5. **Trust semantics:** verified publisher, correctness review, fork credit, and recommendation confidence must differ.
6. **Personal learning privacy:** learner records do not become public/manager-visible by default.
7. **Creation versus execution:** connecting a repo must not silently run it.
8. **Recovery:** undo, draft saving, source disconnection, partial indexing, and unavailable originals.
9. **Content reuse and moderation:** publishing/forking needs permissions and future abuse-handling states.
10. **Adaptation control:** users can set/override depth and correct the system's assumptions.
11. **A clean cost boundary:** long imports or AI generation should not surprise the user with unbounded work; design status/cancel/confirmation where the existing service supports it.
12. **Product/backend truth:** mock UI cannot certify security, live collaboration, review quality, or mastery.
13. **Connection versus source scope:** who owns an account connection, which documents may be attached, and what recipients can see after sharing.
14. **External-source lifecycle:** one-time import versus future sync, source revision, reconnect, revocation, and the difference between unlinking a source and disconnecting its account. Preserve existing rules; unresolved future backend behavior is not a frontend guarantee.

Do not turn this list into new engineering milestones now. Put unresolved backend decisions in the handoff, with a clear UI fallback.

---

## 24. Agent kickoff message

> We are redesigning Rabbit Hole's authenticated Home and Project experience, not repainting an Apps table or building a new canvas engine. This is your complete first brief; do not assume I sent an earlier version.
>
> Rabbit Hole is an adaptive learning-and-building environment. Users start from public/private repositories, papers/slides, questions, or blank Learn canvases; follow concepts into evidence and implementation; share/fork learning artifacts with credits; and later use permissioned development memory, public discovery, and personal learning progress. Brand: Rabbit Hole. Value proposition: “Knowledge is infinite.” CTA: “Start a rabbit hole.” Reuse the approved White Rabbit-inspired mascot sparingly.
>
> Read this v2 brief and start with T00: inspect the actual checkout, map existing capabilities and file ownership, and identify real versus prototype-only features. Then T01: propose two Home/Project UX directions and recommend one. Stop for approval; do not begin production edits immediately.
>
> We ALREADY have a workspace/account switcher and Settings, including Preferences, workspace/admin sections, and a Connections entry. Reuse and refine those components and working behavior; do not create a second Settings system. Preserve workspace identities, saved preferences, permissions, integrations, and drafts. “Gmail” may be a user-created workspace name, not product branding to overwrite.
>
> Extend the existing Settings → Connections design for future Google Slides, Notion, and related document sources. Settings manages connected accounts; Start/Add source, Project Sources, and Canvas Add source select specific content for a specific destination. Account connection is not import, sharing, or automatic whole-account access. Design future provider states and import journeys as labeled prototypes; do not implement new OAuth, extraction, sync, or provider backends in this UI pass.
>
> Keep the existing React/CSS/router/state/graph/Learn stack. No nanoGPT-specific branches in shared UI: nanoGPT is fixture content only. Prove the approved design also fits an unrelated repo, a company project, and a standalone slide/notes canvas through data changes.
>
> Preserve Learn's bottom composer, existing Ask in chat above cards, and controls below each visual. Do not add Ask about this buttons inside cards or a new tutor sidebar. The Graph page's existing side chat is real; any unification is an explicit design decision, not an assumption.
>
> Follow brainstorm → approved written UX spec → editable Figma mockups/click-through flows → approval → file-specific implementation plan → approval → code. Include Settings/Connections and a Google Slides/Notion source-attachment prototype in mockup review, not just Home screenshots. Mark T00–T12 subtasks complete only with evidence.
>
> Keep future features honest: no fake successful sharing/imports, connected accounts, verification badges, mastery scores, or live collaborators. Preserve existing deep links, storage, and other agents' work/deployments. Before handing over links, open the exact deployed preview, perform the main journeys, and inspect both themes in the actual browser.
>
> Deliver the approved UI and a clear connected/prototype/deferred report, then stop for my review. Do not expand into new connector backends, graph ingestion, CLI memory, collaboration, or learning-policy engines.

---

## 25. Source notes

The design recommendations above are proposals based on the user's requirements and screenshots. External source summaries are limited to the points cited; company descriptions are self-descriptions, not independently established performance claims.

- **[S1] Glen — YC company profile.** Describes an organizational context layer using agent sessions and other company sources, including querying the context behind code. Used only as conceptual inspiration for permissioned sessions/decisions. https://www.ycombinator.com/companies/glen
- **[S2] Graphify — public project README.** Describes knowledge-graph extraction and extracted/inferred edge provenance. Exact installed integration must be verified. https://github.com/Graphify-Labs/graphify
- **[S3] React — Preserving and Resetting State.** Supports explicit resource/conversation identity and draft/state preservation during shell changes. https://react.dev/learn/preserving-and-resetting-state
- **[S4] W3C WAI — Combobox Pattern.** Reference for search suggestions, labels, keyboard interaction, and explicit selection. https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- **[S5] W3C WAI — Dialog (Modal) Pattern.** Reference for focus and interaction in creation/sharing dialogs. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **[S6] W3C — Understanding Reflow.** Reference for responsive text/form/navigation behavior and treatment of intrinsically two-dimensional content. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- **[S7] Playwright — Actions and Visual Comparisons.** Browser interaction evidence and consistent screenshot environments. https://playwright.dev/docs/input and https://playwright.dev/docs/test-snapshots
- **[S8] Figma — MCP Server Introduction.** Connected design-context and editable mockup workflow; actual actions must be verified in the coding environment. https://developers.figma.com/docs/figma-mcp-server/
- **[S9] GitHub — REST API endpoints for repositories.** Source metadata/permission context for a future verification flow, not a ready-made Rabbit Hole verification badge policy. https://docs.github.com/en/rest/repos/repos
- **[S10] Git — git-worktree.** Worktree isolation and shared repository context. https://git-scm.com/docs/git-worktree
- **[S11] Figma — Tools and Prompts; Code to Canvas.** Native file-editing and browser-UI capture workflows, subject to the actions actually available in the agent environment. https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ and https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/
- **[S12] Figma — What the MCP sends vs. what the agent does.** Design context is an input to implementation, not an automatic production-code guarantee. https://developers.figma.com/docs/figma-mcp-server/mcp-vs-agent/

External source references above are retained from the earlier brief, whose recorded check date is 2026-09-23. This v2 update is based on the user's supplied Settings/workspace-menu screenshots and stated future-connector requirements; it does not independently verify Google/Notion API capabilities or add new connector research. The receiving agent must check actual integration capabilities before implementation.

No running Rabbit Hole repository, account, backend, preview deployment, connection, or Figma file was modified or verified while preparing this update. Figma is connected for the design workflow; mockups and app implementation remain subsequent tasks. An integration available to the coding assistant does not establish that Rabbit Hole has that integration for its users.

**Finish line:** an approved, honest, usable Home and Project experience with the existing Settings integrated cleanly, available connection flows preserved, and future source connections designed explicitly. Help users start, resume, find, understand, attach, and share learning work—without reopening the visual engine, resetting current settings, or pretending future services are already built.
