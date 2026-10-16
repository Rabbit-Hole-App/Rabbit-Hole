import { createElement } from 'react';

// A lazy feature's import that never rejects (follow-up R3 item 1). A chunk that cannot load - offline, or gone after a
// deploy - resolves to `Unavailable` in the feature's place, so React.lazy never throws it to the root, where main.jsx's
// onUncaughtError would replace the whole page and drop the live canvas. Unavailable gets the error, the import to retry
// and the feature's own props, to render the feature once a retry loads it.
export const featureLoader = (factory, Unavailable) => () => Promise.resolve().then(factory).then(module => {
  if (module?.default == null) throw new Error('The feature did not load.');
  return module;
}).catch(error => ({ default: props => createElement(Unavailable, { error, retry: factory, props }) }));
