import { z } from 'zod';

// Brief 35: the three answers that pick a scene layout (docs/features/interact/layout.md section 4). Brief 36: the layout's picture (the panel, else the stage) is drawn by the written renderer with
// renderTutorDiagram's `parts` switches; a card names the ones it changes here (title and caption true or false, legend auto, none or always) and the rest follow the renderer's own defaults.
// One schema for the plan, the composition and the template data; it imports nothing of the layout module (the plan's client bundle must not pull in the renderer).
export const figureParts = z.object({ title: z.boolean().optional(), caption: z.boolean().optional(), legend: z.enum(['auto', 'none', 'always']).optional() }).strict();
export const layoutAnswers = z.object({
  pictureCount: z.enum(['one', 'two']), runs: z.enum(['left-to-right', 'top-to-bottom', 'compact']), panelRole: z.enum(['none', 'records-main', 'equal', 'aligned']),
  figureParts: figureParts.optional(),
}).strict();
