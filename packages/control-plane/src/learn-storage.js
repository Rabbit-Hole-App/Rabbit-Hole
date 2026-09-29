// Where Learn media lives: paper uploads, dropped images, chat attachments,
// generated clips and scenes, shared-board files and moment-index records.
// Dev and review workers bind LEARN_MEDIA to their own bucket
// (small-learn-media-dev), so a review clone never creates Learn artifacts in
// production storage. Production has no LEARN_MEDIA and keeps using RUNS
// (small-runs), unchanged. RUNS itself stays bound everywhere for the live
// App/Job output reads (bundles, run outputs) - the "live outputs" binding.
// dev-worker.js refuses to serve when LEARN_MEDIA is missing.
export const learnMedia = env => env?.LEARN_MEDIA || env?.RUNS;
