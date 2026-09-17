export const PEXELS_TOOL = { name: 'search_pexels', description: 'Find an illustrative photograph for the lesson. Use generic public concepts only, never private code, names, or organization data. Results include descriptions and attribution; choose a returned photo ID for an image block.', input_schema: {
  type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 100 } },
} };

export async function searchPexels(env, query, fetcher = fetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new Error('Invalid photo search');
  if (!env.PEXELS_API_KEY) throw new Error('Photo search is not configured');
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query); url.searchParams.set('per_page', '3');
  const response = await fetcher(url, { headers: { Authorization: env.PEXELS_API_KEY }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Photo search unavailable (${response.status})`);
  const data = await response.json();
  const validUrl = (value, host) => { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password; } catch { return false; } };
  return (data.photos || []).filter(p => Number.isSafeInteger(p.id) && Number.isFinite(p.width) && p.width > 0 && Number.isFinite(p.height) && p.height > 0 && validUrl(p.src?.medium, 'images.pexels.com') && validUrl(p.url, 'www.pexels.com')).slice(0, 3).map(p => ({
    id: p.id, width: p.width, height: p.height, src: p.src.medium, url: p.url,
    alt: String(p.alt || query).slice(0, 200), photographer: String(p.photographer || 'Pexels photographer').slice(0, 100),
  }));
}

export const INSPECT_IMAGE_TOOL = { name: 'inspect_image', description: 'View a photo returned by search_pexels before placing or annotating it. Use the full uncropped preview to choose normalized annotation coordinates.', input_schema: {
  type: 'object', additionalProperties: false, required: ['photoId'], properties: { photoId: { type: 'integer' } },
} };

export function inspectImage(photos, photoId) {
  const photo = photos.get(photoId);
  if (!photo) throw new Error('Choose a photo ID returned by search_pexels');
  return [{ type: 'text', text: JSON.stringify(photo) }, { type: 'image', source: { type: 'url', url: photo.src } }];
}
