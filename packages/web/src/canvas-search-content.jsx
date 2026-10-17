import { createContext, createElement, useContext, useEffect } from 'react';
export const SearchContentContext = createContext(null);
export function SearchContentProvider({ registry, children }) {
  return createElement(SearchContentContext.Provider, { value: registry }, children);
}
// Records must be memoized by their existing parse/load result. Registration never starts a read.
export function useSearchContent(objectId, record) {
  const registry = useContext(SearchContentContext);
  useEffect(() => registry && record ? registry.register(objectId, record) : undefined, [registry, objectId, record]);
}
