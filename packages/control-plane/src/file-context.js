// Imported files as chat context (docs/features/canvas-file-imports.md section 6; lead rulings 2026-10-16). A turn's `file`
// refs are resolved here into bounded excerpts of each source's ready text derivative, with their locations, and each ref
// gets one coverage label said to the model: extracted, partial, transcribed, listed (no text derivative), unavailable (not
// authorized, revision gone, unreadable) or omitted (over this turn's budget). Never the original, never a derivative of
// another revision, and no model, OCR or transcription call: only what a lane already extracted.
//
// Text derivative (contract section 4, lead ruling 2026-10-16): file_derivatives kind 'text' (or 'transcript' for audio and
// video), status 'ready', media type application/json, body { v: 1, units: [{ loc, text }], complete, limited? } where loc is
// one of the section 6 range shapes; a text/plain body is one unit with no location (lines counted for a {start, end} range).
import { authorizeFileSource } from './file-access.js';
import { memberContext } from './canvas-comments.js';
import { ownerRow } from './learn-boards.js';
import { FILE_SOURCE } from '../../web/src/file-chat-ref.js';

export const FILE_CONTEXT = Object.freeze({ perRef: 4000, perTurn: 12000 });

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// A unit's location as a citation label: "p. 3", "slide 2", "Q1!A1:C9", "rows 2-9", "L10-42", "cell c7", "0:12-0:40", "part Wheel".
export function locLabel(loc) {
  if (!loc) return '';
  if (loc.page != null) return `p. ${loc.page}`;
  if (loc.slide != null) return `slide ${loc.slide}`;
  if (loc.sheet != null) return loc.cells ? `${loc.sheet}!${loc.cells}` : `sheet ${loc.sheet}`;
  if (loc.rows) return `rows ${loc.rows[0]}-${loc.rows[1]}${loc.cols ? `, columns ${loc.cols[0]}-${loc.cols[1]}` : ''}`;
  if (loc.start != null) return loc.end > loc.start ? `L${loc.start}-${loc.end}` : `L${loc.start}`;
  if (loc.cell != null) return `cell ${loc.cell}`;
  if (loc.startSec != null) return loc.endSec != null ? `${clock(loc.startSec)}-${clock(loc.endSec)}` : clock(loc.startSec);
  if (loc.object != null) return `part ${loc.object}`;
  return '';
}
const overlaps = (a, b) => a[0] <= b[1] && b[0] <= a[1];
// Whether a unit at loc falls inside the ref's range (null range: every unit). A unit without a location matches only the
// whole source.
export function inRange(loc, range) {
  if (!range) return true;
  if (!loc) return false;
  if (range.page != null) return loc.page === range.page;
  if (range.slide != null) return loc.slide === range.slide;
  if (range.sheet != null) return loc.sheet === range.sheet; // ponytail: a cells range selects its sheet's units; cell-level cuts need the grid
  if (range.rows) return !!loc.rows && overlaps(loc.rows, range.rows);
  if (range.start != null) return loc.start != null && overlaps([loc.start, loc.end ?? loc.start], [range.start, range.end]);
  if (range.cell != null) return loc.cell === range.cell;
  if (range.startSec != null) return loc.startSec != null && overlaps([loc.startSec, loc.endSec ?? loc.startSec], [range.startSec, range.endSec ?? Infinity]);
  if (range.object != null) return loc.object === range.object;
  return false;
}
// A derivative body as units: the JSON shape, or plain text as one unit (lines of it for a line range).
export function unitsOf(body, mediaType, range) {
  if (/json/.test(mediaType || '')) {
    const parsed = JSON.parse(body);
    if (parsed?.v !== 1 || !Array.isArray(parsed.units)) throw Error('unknown text derivative');
    return { units: parsed.units.filter(u => u && typeof u.text === 'string'), complete: parsed.complete !== false, limited: typeof parsed.limited === 'string' ? parsed.limited.slice(0, 120) : null };
  }
  if (range?.start != null) {
    const lines = String(body).split('\n');
    return { units: [{ loc: { start: range.start, end: Math.min(range.end, lines.length) }, text: lines.slice(range.start - 1, range.end).join('\n') }], complete: true, limited: null };
  }
  return { units: [{ loc: null, text: String(body) }], complete: true, limited: null };
}

// Who is asking about which board: the source's owner first, then the asker's own board of this canvas, then the member
// board they are on (canvas-comments.js memberContext: the owner or an active member). A Response never escapes: refused is
// just unavailable for this ref.
async function authorized(req, env, sourceId, { user, app, member }) {
  const own = await authorizeFileSource(req, env, sourceId);
  if (!(own instanceof Response)) return own;
  if (user && app) {
    const row = await ownerRow(env, user, app, 'main');
    const viaBoard = row && await authorizeFileSource(req, env, sourceId, { row });
    if (viaBoard && !(viaBoard instanceof Response)) return viaBoard;
  }
  if (member) {
    const ctx = await memberContext(req, env, String(member));
    if (ctx instanceof Response) return null;
    const row = await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE id = ?').bind(ctx.board.id).first();
    const viaMember = row && await authorizeFileSource(req, env, sourceId, { row });
    if (viaMember && !(viaMember instanceof Response)) return viaMember;
  }
  return null;
}

// refs: the turn's validated context refs (only kind 'file' are read). Returns { coverage: Map(refKey -> label),
// blocks: [text] } for chatContext. user: { org, email } of the asker; app: the canvas asked on; member: a member board id.
export async function fileContext(req, env, refs, { user = null, app = null, member = null, limits = FILE_CONTEXT } = {}) {
  const coverage = new Map(), blocks = [];
  let left = limits.perTurn;
  for (const ref of (refs || []).filter(r => r.kind === 'file')) {
    const key = `${ref.sourceId}|${JSON.stringify(ref.range ?? null)}`;
    const say = label => coverage.set(key, label);
    const m = FILE_SOURCE.exec(ref.sourceId);
    if (!m) { say('unavailable'); continue; }
    const [, sourceId, rev] = m;
    let access = null;
    try { access = await authorized(req, env, sourceId, { user, app, member }); } catch { access = null; }
    if (!access || access.source.sha256 !== rev) { say('unavailable'); continue; }
    const derivative = await env.LEARN_DB.prepare("SELECT id, kind, media_type, r2_key, converter_version FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND kind IN ('text', 'transcript') AND status = 'ready' ORDER BY updated_at DESC LIMIT 1")
      .bind(sourceId, rev).first();
    if (!derivative) { say('listed'); continue; }
    if (left <= 0) { say('omitted'); continue; }
    let read;
    try {
      const object = await env.LEARN_MEDIA.get(derivative.r2_key);
      if (!object) { say('unavailable'); continue; }
      read = unitsOf(await object.text(), derivative.media_type, ref.range);
    } catch { say('unavailable'); continue; }
    const chosen = read.units.filter(u => inRange(u.loc, ref.range));
    if (!chosen.length) { say('listed'); continue; }
    const full = chosen.map(u => (locLabel(u.loc) ? `[${locLabel(u.loc)}] ${u.text}` : u.text)).join('\n');
    const cap = Math.min(limits.perRef, left), text = full.slice(0, cap);
    left -= text.length;
    const cut = text.length < full.length || !read.complete;
    const label = derivative.kind === 'transcript' ? (cut ? 'partial' : 'transcribed') : cut ? 'partial' : 'extracted';
    say(label);
    const why = [text.length < full.length && `the first ${text.length} of ${full.length} characters`, read.limited && `the extraction kept ${read.limited}`,
      !read.complete && !read.limited && 'the extraction is incomplete'].filter(Boolean);
    const note = cut ? ` - partial: ${why.join('; ')}` : '';
    blocks.push(`${derivative.kind === 'transcript' ? 'Transcript' : 'Extracted text'} of ${JSON.stringify(ref.name)} (${ref.sourceId}${ref.range ? ` range ${JSON.stringify(ref.range)}` : ''}, extraction ${derivative.converter_version || 'v1'})${note}; cite by the bracketed locations:\n${text}${text.length < full.length ? '\n[file excerpt truncated]' : ''}`);
  }
  return { coverage, blocks };
}

