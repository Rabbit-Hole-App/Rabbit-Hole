// One original-file read attempt. Cancelling prevents late results crossing card/source/access changes.
// The caller owns Retry and the existing loader owns authorization/cache policy; this helper never fetches.
export function readFileDocOriginal(load, publish) {
  let active = true;
  Promise.resolve().then(load).then(value => {
    if (active) publish(value == null ? { status: 'missing', blob: null } : { status: 'ready', blob: typeof value === 'string' ? new Blob([value], { type: 'text/plain' }) : value });
  }, () => { if (active) publish({ status: 'failed', blob: null }); });
  return () => { active = false; };
}
