// What the canvas offers an Explanation card's interaction layer (E2, docs/features/explain.md section 4). AdaptiveCanvas provides it; a surface without a
// canvas (a shared view, a test) provides nothing and the card omits the controls that need it. Every function takes the card id and the revision the
// learner was looking at, captured when the control was used, so a late result or a later edit can never redirect the action to other text.
//   (dig was removed 2026-11-09: a term's Explore button makes a new /explain card through ask with destination 'explore')
//   ask({ id, revision, question, destination, actionId }, { onAdmitted })
//        -> Promise<boolean>   destination 'here' (the Chat's conversation about this card), 'card' (the written /explain into a linked child) 'follow-up' (the same /explain with no link) or 'explore' (the same, for a term's new card);
//        onAdmitted fires once, when the Chat or command dispatcher has taken the turn; the promise answers false when it was refused
//   note({ id, quote })                              one Sticky note beside the card, no connector (quote only for Create note: it opens the note's text, in italics) -> note id, or null
//   quickAsk()                                       the selection toolbar's Ctrl+K button: opens Ctrl+K over the highlighted words, as the key does -> boolean
import { createContext } from 'react';

export const ExplanationHost = createContext(null);
