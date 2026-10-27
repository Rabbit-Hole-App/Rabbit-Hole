export const SUPPORT_PATHS = ['/privacy', '/terms', '/404'];

// The public Docs were removed (owner 2026-10-26): /docs and any /docs/* answer the 404 page.
export const isRemovedDocsPath = path => /^\/docs(?:\/|$)/i.test(path);

// Keep API responses, hosted apps, authentication and static asset failures intact.
export function isPublicPageRequest(request) {
  const path = new URL(request.url).pathname;
  return ['GET', 'HEAD'].includes(request.method)
    && request.headers.get('accept')?.includes('text/html')
    && !/^\/(?:api|a|auth|login|logout|test|slack|static|landing|audio|lesson-assets|mascot)(?:\/|$)/.test(path)
    && !/\.[a-z0-9]{1,8}$/i.test(path);
}
