// Review and e2e sessions are minted only on the Rabbit Hole dev control plane (P0-B Phase 2B,
// docs/features/rabbit-hole-dev.md), with RABBIT_HOLE_DEV_TEST_BYPASS from the repo-root .env.
// There is no production fallback: small-cp has no test bypass. The session is signed with the
// dev MASTER_KEY, so a dev/review worker (CONTROL_PLANE = rabbit-hole-cp-dev) accepts it as its cookie.
export const DEV_CP = process.env.RABBIT_HOLE_DEV_CP || 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
