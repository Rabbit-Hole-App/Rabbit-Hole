# Wikipedia on the lesson canvas

A Wikipedia article is a source like an arXiv paper or an uploaded PDF: the
learner can put one on the canvas, the tutor can open one in front of the
learner, and whatever is on screen rides along with the next question.

Read [learn-canvas-blocks.md](learn-canvas-blocks.md) for the canvas the card
lives on and [source-provenance.md](source-provenance.md) for what attaching
and detaching a source means.

## Terms

- **Article** — one page of English Wikipedia, identified by its wiki key
  (`Machine_learning`), not its display title.
- **Section** — one `<section data-mw-section-id="N">`. `N` is the Action API's
  `index`; section `0` is the lead.
- **Wiki card** — a canvas block showing an article, scrolled by the learner.
- **Wiki reader** — the same article in the right-hand panel.

English only. `WIKI_LANG` is the constant `'en'`, the host is always
`https://en.wikipedia.org`, and no tool takes a language. A URL for another
language is refused rather than answered from the English article that happens
to share its spelling. The constant exists so that adding a language later is a
new value rather than a migration.

## What the learner does

Sources ▸ *Wikipedia article…* opens a search box. Typing runs a prefix search
after a 250 ms pause, from two characters, aborting the request in flight — the
existing arXiv picker submits on Enter, and this one must not become one
upstream request per keystroke. Ten results, each a title, a one-line
description and a thumbnail where the article has one.

Picking one drops a wiki card on the canvas and opens the reader.

The card scrolls the whole article. Clicking a blue link navigates in place, and
a back control returns to the previous article at the scroll position it was
left at. Selecting text in the card or reader and asking a question sends that
text with the question.

## What the tutor does

Three tools, modelled on the arXiv three:

- `search_wikipedia(query)` — titles and descriptions, so it can find the right
  article before committing to one.
- `read_wikipedia(title, section?)` — returns
  `{title, displayTitle, section, sectionTitle, text, truncated, toc, url}`.
  `toc` is every section as `{index, level, title, anchor}`, so the index it
  later passes to `show_wikipedia` came from a result it actually saw. `section`
  accepts a heading, an anchor or a number; omitted, it reads the lead.
- `show_wikipedia(title, section?)` — opens the article in the learner's reader,
  scrolled to that section.

`show_wikipedia` is refused unless this answer already read that article **or**
the article arrived as `wiki_context`. An open card counts as read, because the
tutor being made to re-read what the learner is already looking at is a wasted
call and the obvious case: *"explain this bit"*.

At most three articles per answer, and at most one `show_wikipedia`; a second is
refused rather than silently replacing the first. All three tools spend the same
six-call research loop the arXiv tools use, so a full walkthrough — search,
read, read a second section, show — is four of the six.

Unlike an outline proposal there is no Apply gate: opening a reader destroys
nothing, and detaching the source is the undo.

## Two speeds, on purpose

The full HTML of *Machine learning* is 978,697 bytes (169 KB gzipped). One
section is 16,927 (4,913 gzipped) — **200× smaller**. So:

- The **card and reader** fetch the whole article once and scroll natively. No
  lazy loading, no placeholder heights, no intersection observers.
- The **`read_wikipedia` tool** fetches one section, capped at 6,000 characters
  with `truncated: true` when it was cut. The model never receives a whole
  article.

Scrolling to a section needs no index of our own: the rendered HTML carries
`<section data-mw-section-id="N">`, contiguous from `0` and aligned 1:1 with the
Action API's `index`. Opening at a section is `scrollIntoView` on that element.

## Where the bytes come from

Every request goes through the worker, never the browser. Both reasons were
measured, not assumed:

- Wikimedia returns **HTTP 403 to any request with no User-Agent**, which a
  browser cannot set. With a descriptive one the limit is 200 req/min; without,
  10.
- The only endpoint returning a single section is `w/api.php`, which sends **no
  `Access-Control-Allow-Origin` header** unless `&origin=*` is appended.

| purpose | endpoint |
| --- | --- |
| picker | `/w/rest.php/v1/search/title?q=&limit=10` |
| tool search | `/w/rest.php/v1/search/page?q=&limit=5` |
| article HTML | `/w/rest.php/v1/page/{title}/html` |
| licence, revision | `/w/rest.php/v1/page/{title}/bare` |
| section list | `w/api.php?action=parse&prop=tocdata` |
| one section | `w/api.php?action=parse&prop=text&section=N&disableeditsection=1` |

Every Action API call carries `redirects=1`. Without it, reading *ML* returns
the one-line redirect stub rather than *Machine learning*.

Not used, and why: `/page/related` and `/page/mobile-sections` return 403 at the
Wikimedia edge; `/page/mobile-html` ships `<script>` tags; `api.wikimedia.org`
has a URL replacement scheduled for July 2026–June 2027;
`action=parse&prop=sections` is deprecated in favour of `prop=tocdata`.

`wikiFetch` sets a descriptive User-Agent, follows redirects, times out at 20 s
and caches responses for an hour through the Cache API. It deliberately does
**not** copy `arxivFetch`'s 3-second inter-request spacing: Wikimedia's
allowance is per minute, and a learner clicking links must never queue behind a
background read. The picker's debounce is what keeps the request count sane.

The worker turns section HTML into text with a bounded strip, not a parser:
`DOMParser` does not exist in the Workers runtime. The browser has one, and uses
it for the card.

### When it fails

| failure | the learner sees | the model sees |
| --- | --- | --- |
| unknown article | `No Wikipedia article called X` | same, as `is_error` |
| unknown section | — | `No section "X" in Y. Its sections are: …` |
| 429 | `Wikipedia is rate-limiting these requests. Wait a minute and try again.` | same |
| 5xx | `Wikipedia is unavailable (503)` | same |
| timeout (20 s) | `Wikipedia did not answer in time. Try again.` | same |
| article over 4 MB | `That article is too large to open` | — |

Naming the sections an article does have is the difference between a dead end
and a next step, so the unknown-section error carries them.

## Rendering an article outside Wikipedia

The HTML is Parsoid output and contains **zero `<script>` elements**. It is
still sanitised: anyone can edit Wikipedia, so this is the least trusted input
the product renders.

Sanitising is an **allowlist**, not a strip-list. A denylist that forgets one of
`onerror`, `javascript:`, `<iframe>`, `<object>`, `<form>` or a `style`
attribute ships script execution inside the lesson.

- **Tags kept**: the structural and text elements an article is made of —
  sections, headings, paragraphs, lists, tables, figures, images, links, spans,
  and MathML. Everything else is unwrapped, keeping its text.
- **Attributes kept**: `id`, `alt`, `title`, `dir`, `lang`, `colspan`,
  `rowspan`, `span`, `width`, `height`, `typeof`, `datetime`, `value`, `start`,
  `reversed`, `src`, `srcset`, `data-mw-section-id`. Everything else — every
  `on*` handler, every inline `style` — is dropped. `href` is read before the
  strip and becomes the classifier's decision, never a raw value.
- **Classes are namespaced, not kept**: every token is prefixed `wiki-`. This
  app is Tailwind, so an unprefixed class is a live utility; `class="fixed
  inset-0 z-50 bg-white"` — which MediaWiki's own sanitiser permits — would
  otherwise let any editor cover the canvas and the composer with their own
  markup, on our origin, without a line of CSS or script. `fixed` becomes
  `wiki-fixed`, which matches nothing.
- **Schemes allowed**: `https:` only, plus in-document fragments. `javascript:`,
  `data:`, `blob:` and `file:` are refused by the classifier, and so is a plain
  `http:` link to another site. An `http:` *article* link still resolves,
  because the article is refetched over our own route.
- Protocol-relative `//upload.wikimedia.org` becomes `https:`, in `src` and
  every candidate of `srcset`.
- `<base>` is dropped, which is what breaks every internal link and forces the
  rewrite below.
- The `mwe-math-fallback-image` duplicate of each MathML block is dropped, or
  both render.

Infoboxes get roughly twenty lines of our own CSS. Wikipedia's stylesheet is a
site-relative `load.php` bundle and is not loaded; pulling it in would drag
Wikipedia's whole visual language onto the canvas.

### What each kind of link does

| link | behaviour |
| --- | --- |
| `./Article` | navigate in place |
| `./Article#Section`, `#Section` | scroll |
| `#cite_note-N` | scroll to the reference |
| `?action=edit&redlink=1` (article does not exist) | not clickable |
| `./File:…` | open the image |
| `./Help:`, `./Special:`, `./Wikipedia:`, other namespaces | new tab |
| external `https://`, other wikis | new tab, `rel="noreferrer"` |
| `http://` to another site, any other scheme | refused |

A colon is not a namespace marker: *Dune: Part Two* is an article.

Navigation state — the current article and the back stack — lives in component
state, not in the block. `changeBlock` snapshots on every write and clears the
redo stack, so writing navigation into the block would spend the learner's undo
history on link clicks. The block keeps the article it was created with, so a
reload returns there rather than to wherever browsing ended.

## The card

`width={COLUMN}`, default height 640, resizable with `w`/`h` saved on the block
exactly as `PdfCard` does. Inserted through a new `insertWiki({title, section})`
on the canvas API and rendered from a `block.type === 'wiki'` branch beside the
PDF one. The block stores `{type, dx, dy, title, section, w?, h?}` and nothing
else — the canvas save path strips only a field named `src` over 120,000
characters, so HTML stored under any other name would exhaust the localStorage
quota and take the learner's ink with it. The article is refetched on mount.

Unlike the PDF card this is not an iframe, so keyboard events stay in our
document and copy, paste, undo and delete keep working while it is focused. As
with the PDF card the first press selects it and the second reaches the
article, so a drag on the board does not begin inside a document the learner is
only reading. The card tracks the article it has navigated to itself, because
navigation is deliberately not written to the block.

Stripping `href` also strips what makes an anchor a link: every navigable one
carries `role="link"` and `tabindex="0"`, and Enter on a focused link is treated
as a press.

## What the agent is given

`wiki_context` `{title, section, selection?}` rides with a question, the way
`paper_context` carries the page.

- **The reader is the authority** when it is open, as it is for papers. With no
  reader open, the focused card reports instead.
- `section` is the highest-numbered `data-mw-section-id` whose top is at or
  above the viewport top — what the learner is actually reading, not what they
  scrolled past.
- `selection` is selected text, never a cropped image: the paper reader can crop
  because pdf.js paints onto a `<canvas>`, and HTML has no such surface. Text is
  cheaper and more precise for prose.
- One reader holds one thing, so `wiki_context` is ignored when `paper_context`
  is also present, and the `wiki` SSE event is not sent when a paper was shown
  in the same answer.
- Arriving `wiki_context` seeds the answer's read set, which is what lets
  `show_wikipedia` point at another section of the article already open.
- A section the contents list does not name falls back to the lead. The rendered
  HTML carries ids `tocdata` does not always list, and losing the whole question
  over a heading is worse than answering from the introduction.

The tutor-initiated open travels back as `event: wiki` with
`{lang, title, displayTitle, section, sectionTitle, url}`, sent from `ask.js`
beside the existing `paper` event and read from `research.shownWiki()`.

## Sources

Every article on the canvas is a card, whoever brought it — the picker and
`show_wikipedia` take the same path, so there is one shape to reason about.

Each card registers one source, `{id: 'wiki:<blockId>', kind: 'wiki'}`, whose
label follows whatever article the card currently shows. The id names the
**card**, not the article, which is what stops five minutes of link-clicking
from producing twenty rows: `withSource` refreshes the label of an id it already
knows and leaves the attach flag alone.

Detaching a wiki source omits `wiki_context` from the request body. The reader
stays open — detaching is a context switch, not a deletion.

**Known gap, not fixed here:** detaching a `paper` or `pdf` source still changes
nothing that is sent. `isAttached` has one consumer, `repoAttached`, and the two
`paper_context` build sites cannot look up a source id from what they hold —
arXiv registers `paper:<id>` while an upload registers a bare id. Fixing it
needs the source id carried on the context object at registration time. That is
its own change; this feature does not silently grow to include it.

## Licence

Article text is CC BY-SA 4.0. Every card and reader shows one footer line naming
the licence and linking both to the article and to the licence text, taken from
`/page/{title}/bare` (`license.title`, `license.url`), with a compliant default
if that lookup fails. This is a licence term, not a nicety, and must be visible
with the content. Images carry their own licences and are not covered by it.

## Deliberately not included

- **Region select on a wiki card.** No raster surface to crop, no screenshot
  dependency in the repo. Text selection covers it.
- **A zoom control.** HTML reflows; it does not scale.
- **Sending the browsing trail to the tutor.** `wiki_context` names what is on
  screen. Add the trail if "you were just reading about X" turns out to matter.
- **Hover prefetch, edit links, talk pages, other languages, forward navigation.**
- **Wikipedia in the canvas planner.** The tools register on the ask path only;
  `learn-board.js` runs its own loop and does not need them.

## Verification

`make test-unit` covers the pure modules: title normalisation and URL building,
the contents shape, section resolution by name, anchor and number, the link
classifier including every refused scheme, the HTML allowlist, each tool
validator, and the refusals — `show_wikipedia` before a read, a second
`show_wikipedia`, a fourth article, an unknown section, `wiki_context` outside
Learn.

A browser check with stubbed responses covers what unit tests cannot: that a
card reaches the canvas and survives a reload, that a `wiki` SSE event opens the
reader at the named section, that clicking an internal link navigates and back
returns to the scroll position, that a `javascript:` link does nothing, and that
a question asked while reading carries `wiki_context`.

The check asserts a card is on the canvas, not that a component renders. The PDF
card was written, dispatched and unreachable for exactly as long as nobody made
that distinction.
