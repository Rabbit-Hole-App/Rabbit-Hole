// Code references on a repository context (owner, 2026-10-08; docs/features/repository-browser.md "Code references"): the
// repository's page (RepositoryPage) provides { has(path), open(path, start, end) } for every answer under it (ask.jsx Md).
import { createContext } from 'react';

export const CodeRefs = createContext(null);
