// Test helper: turns every slash command flag on (agent/slash.js SLASH_FLAGS) so a test about a command's behaviour does not depend
// on which commands ship. Import it first. SHIPPED_FLAGS is what the build really ships, for the one test that pins it.
import { SLASH_FLAGS } from './slash.js';

export const SHIPPED_FLAGS = { ...SLASH_FLAGS };
for (const name of Object.keys(SLASH_FLAGS)) SLASH_FLAGS[name] = true;
