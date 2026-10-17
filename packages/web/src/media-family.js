// Which Lane 3 family a file name names, by extension (case-insensitive). The only media code the canvas loads up front:
// the parsers in media-formats.js and media-import.js load with the first media drop. MIME is a hint only (Windows drops
// often carry none), and the bytes decide after this.
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
export const extensionOf = name => { const base = String(name || '').split(/[/\\]/).pop().toLowerCase(); return base.includes('.') ? base.split('.').pop() : ''; };
export function mediaFamilyOf(name) {
  const ext = extensionOf(name);
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  if (ext === 'gif') return 'gif';
  if (ext === 'svg' || ext === 'svgz') return 'svg';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return null;
}
