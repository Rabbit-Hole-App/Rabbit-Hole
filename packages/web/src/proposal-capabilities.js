// MOT-20b: what the shared proposal flow reads of CR-1's capability declaration (inline-ai-route.js CHAT_CAPABILITIES, via
// chatCapability): whether a capability is proposed before anything is made, and its card's fields. No registry of its own.
import { chatCapability } from './inline-ai-route.js';
import { settingsOf } from './generation-confirmation-schema.js';

export const reviewRequired = id => chatCapability(id)?.flow === 'proposal';
// -> the schema's FieldDefinitions in declaration order (generation-confirmation-schema.js); [] for a capability without settings.
export const proposalFields = id => settingsOf(id);
