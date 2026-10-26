// IMG-01: whether the SERVER offers image generation to this signed-in person (GET /api/learn/image-jobs: the public flag, else the
// listed owner-only operator). The answer switches the /image command (id `generate-image`) on (agent/slash.js setImageGeneration); the web build
// holds no such switch, and the server refuses a direct call from anyone it does not list.
import { setImageGeneration } from './agent/slash.js';

let asked = null;
// fetcher: fetch (headers added by the caller). Asked once per page load; a failed read is "not offered" and is asked again next time.
export function loadImageCapability(fetcher, headers = {}) {
  asked ||= Promise.resolve().then(() => fetcher('/api/learn/image-jobs', { headers })).then(r => (r.ok ? r.json() : null)).then(d => {
    const on = d?.available === true;
    setImageGeneration(on);
    return on;
  }).catch(() => { asked = null; setImageGeneration(false); return false; });
  return asked;
}
export const resetImageCapability = () => { asked = null; setImageGeneration(false); };
