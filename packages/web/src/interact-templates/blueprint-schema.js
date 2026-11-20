import { z } from 'zod';
import { BUILT_SCHEMA } from '../interact-blueprint.js';
// Brief 46: a card is { blueprint, buildSchema }: the blueprint (the lesson and its math function) and the build-schema (where everything goes, returned by the Build model). A leaf module: the family data imports it, the template re-exports it.
export const blueprintCardSchema = z.object({ blueprint: BUILT_SCHEMA, buildSchema: z.record(z.string(), z.unknown()), yRange: z.tuple([z.number(), z.number()]).optional() }).strict();
