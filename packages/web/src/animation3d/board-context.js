// Which canvas an animation3d card is on and who is viewing it (storage.js hydrateAnimation's context: { kind, boardId }). The
// owner's canvas page (LearnPage) provides it; anywhere else (a share link, a publication) there is none, so a saved card shows
// its honest placeholder and never calls an owner route. Its own module, so the page does not load the card's 3D code with it.
import { createContext } from 'react';

export const AnimationBoard = createContext(null);
