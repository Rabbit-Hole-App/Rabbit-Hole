// Whether the SERVER offers /whiteboard (id `whiteboard-video`) here (GET /api/learn/whiteboard/jobs answers { available }: its
// WHITEBOARD_ENABLED). The answer switches the command on (agent/slash.js setWhiteboardVideo), as image-capability.js does for /image.
import { setWhiteboardVideo } from './agent/slash.js';

let asked = null;
// fetcher: fetch (headers added by the caller). Asked once per page load; a failed read is "not offered" and is asked again next time.
export function loadWhiteboardCapability(fetcher, headers = {}) {
  asked ||= Promise.resolve().then(() => fetcher('/api/learn/whiteboard/jobs', { headers })).then(r => (r.ok ? r.json() : null)).then(d => {
    const on = d?.available === true;
    setWhiteboardVideo(on);
    return on;
  }).catch(() => { asked = null; setWhiteboardVideo(false); return false; });
  return asked;
}
export const resetWhiteboardCapability = () => { asked = null; setWhiteboardVideo(false); };
