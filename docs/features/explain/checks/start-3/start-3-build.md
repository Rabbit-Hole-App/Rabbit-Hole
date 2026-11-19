# START-3: the reference library built on first use (feat/start-3 cdbb13e0a, off main 8837d4a19)

The lead wrote this file from Agent Y's final text (agents' report files are refused by the harness).

## Mechanism
The library cost is about 116 ms inclusive across about 60 reference and data module bodies (no single hotspot: the largest self times are 3 to 8 ms each), so a memoised getter cannot defer it. A new `packages/control-plane/src/reference-library-lazy.js` loads `reference-library.js` and `reference-single-variants.js` on demand: `referenceLibraryReady()` (async, memoised, one dynamic import per isolate) and `referenceLibrary()` (sync: loads synchronously under Node; in a Worker it throws an explicit error if not preloaded). Each worker awaits `referenceLibraryReady()` once per isolate on its first `/api/` request: `packages/web/dev-worker.js` `respond()` (app-worker.js forwards to it) and `packages/control-plane/src/index.js` `fetch` (a gap found in the review: it statically reaches `learn-code-explain.js` and `learn-inline.js` through `chat-capability-route.js`; two lines added). The bundle's emitted lazy import is `Promise.resolve().then(() => (init_reference_library(), ...))`; a startup profile of the START-3 bundle shows the library modules gone from startup.

## Importer groups
`explanation-references.js` is the only non-test importer of the library (readers: `selectWithSteer`, `selectForAuthor`, `preferSingleVariants`, `fallbackKind`; callers: `learn-artifact.js`, `learn-code-explain.js`); its two module-level uses are now lazy. The other 36 test files keep the static import. Durable Objects: `RoadmapJobs` and the moment-index queue consumer do not reach explanation-references.js; `ExplainJobs` reaches it only through explanation-fast-chain.js, which calls no reader; `roadmap-generate.js` is not reachable from index.js: no preload needed. Scheduled handlers: `scheduledRoadmapKick` is an outbox scan, no generation.

## Tests and guards (tip cdbb13e0a, all green)
470 request hashes and the 474-row replay identical to main; tutor-diagrams plus theme 1371 tests, 0 fail; the 24 mvp-fast-path tests; the 73 control-plane test files that import the readers: 805 tests, 0 fail (the earlier two failures were load timing flakes); svg-snapshots.json untouched; main still 8837d4a19 (merge was a no-op). New `reference-library-lazy.test.js` (2 tests): a child process with `process.getBuiltinModule` deleted simulates a Worker: the sync read throws "read before referenceLibraryReady() was awaited", then works after the async load.

## Bundle and startup
Total Upload 9077.66 KiB / gzip 2297.82 KiB against 161's 9075.33 / 2297.47 (+2.3 KiB for the new module). Quiet-machine active startup (the lead's, six alternating runs each): 161 bundle median 245 ms, START-3 bundle median 152 ms: **-93 ms**, every START-3 run (147 to 160) below every 161 run (218 to 256) (checks/startup/quiet-measurement-1119.md).

## Risks and notes
Not checked: a Worker-runtime request against a real clone: the release preview's first /api/ request exercises the preload. GEN-1 R2's `exampleReferences` must read the library through `referenceLibrary()`, never a static import, or it undoes this (Agent Z has been told). START-4 candidate: the remaining zod startup time comes from `explain-contract.js`, `interact-plan.js` and `explain-program/contract.js`.
