import { Search } from 'lucide-react';
import { Input } from './ui.jsx';

// The one-line command search field of the Chat composer's Auto palette (LearnSlash.jsx). Focused when it mounts. An input, so the
// canvas's keyboard shortcuts stand down while it is typed in. (The Slash Commands window draws its own search: SlashCommandsSheet.jsx.)
export const CommandSearch = ({ className = '', ...props }) => (
  <label className={`relative block ${className}`}>
    <Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
    <Input type="search" autoFocus data-slash-search aria-label="Search commands" placeholder="Search commands" className="pl-8" {...props} />
  </label>
);
