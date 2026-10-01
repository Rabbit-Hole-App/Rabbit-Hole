// One icon per Start path (start.js PATHS), shared by the Start a rabbit hole tabs and the
// composer's + menu so both show the same mark for Repository, Sources, Question and Blank canvas.
import { FileText, FolderGit2, MessageCircleQuestion, SquareDashed } from 'lucide-react';

export const PATH_ICONS = { repository: FolderGit2, sources: FileText, question: MessageCircleQuestion, blank: SquareDashed };
