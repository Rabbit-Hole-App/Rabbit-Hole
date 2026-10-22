// MOT-20b: what the shared proposal flow reads of CR-1's capability declaration (inline-ai-route.js CHAT_CAPABILITIES, via
// chatCapability): whether a capability is proposed before anything is made, and its card's fields. No registry of its own.
import { chatCapability } from './inline-ai-route.js';

export const reviewRequired = id => chatCapability(id)?.flow === 'proposal';
// -> [{ key, type, label, ... }] in declaration order; [] for a capability without settings (no duration or audio there).
export const proposalFields = id => Object.entries(chatCapability(id)?.settings || {}).map(([key, field]) => ({ key, ...field }));
