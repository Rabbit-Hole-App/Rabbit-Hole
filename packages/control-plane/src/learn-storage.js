// Where Learn media lives: paper uploads, dropped images, chat attachments,
// generated clips and scenes, shared-board files and moment-index records.
// Dev and review workers bind LEARN_MEDIA to their own bucket
// (small-learn-media-dev), so a review clone never creates Learn artifacts in
// production storage. Production has no LEARN_MEDIA and keeps using RUNS
// (small-runs), unchanged. Dev and review workers bind no RUNS at all, so with
// LEARN_MEDIA missing this is undefined there: nothing to fall back to. Every dev
// entry point also refuses without LEARN_MEDIA: dev-worker.js fetch and queue, and
// the LearnVideos / LearnScenes alarms (docs/features/dev-prod-write-barrier.md).
export const learnMedia = env => env?.LEARN_MEDIA || env?.RUNS;

// Where the video-moment log (learn_moments) lives. Every learn_moments statement
// goes through this, and nothing else: a dev or review worker binds LEARN_DB
// (small-learn-dev), so its moment log, Keep/Dismiss and hot path never reach the
// production D1 its DB binding names. Production small-cp binds no LEARN_DB and
// keeps using DB, unchanged. ponytail: small-learn-dev has no learn_moments table
// yet (owner decision 1, 2026-09-29), so dev moments go quiet until it is added.
export const learnMomentsDb = env => env?.LEARN_DB || env?.DB;
