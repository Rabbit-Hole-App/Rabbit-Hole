// The ONE canvas permission model (SHARE-01, contract C:/s/spec/share/contract-permissions.md): menus, the toolbar, keyboard
// shortcuts and the control plane's shared routes all ask can(capability, ctx). Pure data, no React, so the server imports it.
//
// Roles: owner (the canvas is theirs), editor (explicitly authorized to edit the source; no route grants it yet), commenter
// (a canvas member, or a signed-in visitor where the canvas's comments take posts), viewer (signed in, no more), guest
// (signed out). ctx.shared marks the shared surface (/b/<token>, /e/<token>, /c/<board id>): an owner opening their own link
// sees what a visitor sees there, minus nothing they could not do on their own page.
//
// Answer: { allowed, reason, hidden?, signIn? }. hidden: not offered at all (owner-only administration). signIn: allowed
// after signing in, so the control stays enabled and goes through sign-in. reason: a short line for a disabled control.

export const ROLES = ['owner', 'editor', 'commenter', 'viewer', 'guest'];

// The role a visitor has on a canvas. member: an active canvas member (comments section 5); commenting: the canvas's
// comments take posts from signed-in visitors (a publication whose comments are Open).
export function roleFor({ signedIn = false, owner = false, editor = false, member = false, commenting = false } = {}) {
  if (!signedIn) return 'guest';
  if (owner) return 'owner';
  if (editor) return 'editor';
  return member || commenting ? 'commenter' : 'viewer';
}

const ok = { allowed: true, reason: null };
const no = reason => ({ allowed: false, reason });
const hide = { allowed: false, reason: null, hidden: true };
const signIn = reason => ({ allowed: false, reason, signIn: true });
const writes = role => role === 'owner' || role === 'editor';

// A capability a visitor reaches only with an account, and on a canvas that is theirs to write: generation, captures and
// runs land as cards, and a visitor's copy is unsaved until Fork, so paid work never goes into a copy that can vanish.
const ownedWork = (what) => (role) => (writes(role) ? ok : role === 'guest' ? signIn(`Sign in to ${what}`) : no(`Fork to ${what} in your own copy`));
const paid = ownedWork('generate');
const ownerOnly = (role, ctx) => (role === 'owner' && !ctx.shared ? ok : hide);
// Personal learning surfaces (Progress, goals, the TOC's Tutor, plan and assessments) never show on a shared canvas.
const personal = (role, ctx) => (writes(role) && !ctx.shared ? ok : hide);

const RULES = {
  // Anyone who can open the canvas. On a shared canvas, local editing is the visitor's temporary copy (S2): it never writes
  // the source, whatever the role, unless source.write also allows.
  'canvas.view': () => ok,
  'canvas.local-edit': () => ok,
  'content.copy': () => ok,
  'card.open': () => ok, // open/expand, Explanation steps, 3D interaction, PDF/webpage scrolling, local selection
  'media.playback': () => ok,
  'map.view': () => ok, // the Rabbit Hole Map: its rows are filtered by the server to canvases this visitor may open
  'toc.navigate': () => ok, // the outline: navigation only, no model call, no learning-record write
  'panel.find': () => ok,
  'panel.chat': () => ok,

  // Chat (S3 owns the guest allowance): Ask in Chat, Explain in Chat and Ask about selection are one capability. A guest asks
  // while ctx.guestChat.remaining is unknown or above zero; the server refuses message 11 whatever the client shows.
  'chat.ask': (role, ctx) => (role !== 'guest' || !(ctx.guestChat?.remaining <= 0) ? ok : signIn('Sign in to continue')),

  // Comments: reading follows the canvas's comments being on (ctx.comments.read); anyone may draft; posting needs an account
  // and the canvas's permission (ctx.comments.post, the server's `can.post`).
  'comment.read': (role, ctx) => (ctx.comments?.read ? ok : hide),
  'comment.draft': (role, ctx) => (ctx.comments?.read ? ok : hide),
  'comment.post': (role, ctx) => (!ctx.comments?.read ? hide : role === 'guest' ? signIn('Sign in to post') : ctx.comments.post ? ok : no('Comments are closed')),

  // Fork: the visitor's own editable copy, temporary edits included (S2). Signed out it goes through sign-in.
  'canvas.fork': role => (role === 'guest' ? signIn('Sign in to fork') : ok),

  // Paid generation and server work (credits from the actor's own allowance, enforced by the existing spend checks).
  'generate.paid': paid,
  'generate.explain-card': paid, // the /explain card; "Explain in Chat" is chat.ask
  'generate.motion': paid,
  'generate.3d': paid,
  'generate.cad': paid,
  'webpage.capture': ownedWork('capture webpages'), // new capture and Refresh
  'code.execute': ownedWork('run code'), // server-side execution; local playback is media.playback

  // Persistent storage of the visitor's own: a child canvas (Start Rabbit Hole) and a new canvas live in their account, so
  // any account may; an upload lands on this canvas, so only a writer may.
  'canvas.child': role => (role === 'guest' ? signIn('Sign in to start a Rabbit Hole') : ok),
  'canvas.create': role => (role === 'guest' ? signIn('Sign in to create a canvas') : ok),
  'file.upload': ownedWork('add files'),

  // The original canvas itself.
  'source.write': role => (writes(role) ? ok : no('Fork to keep your changes')), // autosave and server PUT of the source
  'source.code-edit': role => (role === 'owner' ? ok : no('Only the canvas owner can edit its code')), // repository code

  // Owner administration: hidden for everyone else, and on the shared surface.
  'owner.admin': ownerOnly, // share/publish settings, rename, members
  'owner.delete': ownerOnly, // deleting the source canvas
  'owner.permissions': ownerOnly,

  // Personal panels.
  'panel.progress': personal,
  'panel.goals': personal,
  'toc.tutor': personal,
  // Context and Files show their contents only where those are shareable (ctx.shareable, decided by the server).
  'panel.context': (role, ctx) => (!ctx.shared || ctx.shareable?.context ? ok : hide),
  'panel.files': (role, ctx) => (!ctx.shared || ctx.shareable?.files ? ok : hide),
};

export const CAPABILITIES = Object.freeze(Object.keys(RULES));

// The right panel's tabs on a shared canvas, in the normal order: Chat (where the page has one), Find, Table of contents,
// Comments (unless hidden). Progress is never among them (panel.progress is hidden on a shared canvas).
export const sharedPanelTabs = (ctx, { chat = false } = {}) => [['chat', 'panel.chat'], ['find', 'panel.find'], ['toc', 'toc.navigate'], ['comments', 'comment.read']]
  .filter(([id, capability]) => (id !== 'chat' || chat) && !can(capability, ctx).hidden && (id === 'comments' || can(capability, ctx).allowed)).map(([id]) => id);

// can('generate.motion', { role: 'viewer', shared: true }) -> { allowed: false, reason: 'Fork to generate in your own copy' }.
// An unknown capability or role is refused, never allowed by accident.
export function can(capability, ctx = {}) {
  const rule = RULES[capability];
  if (!rule) return no(`Unknown capability: ${capability}`);
  const role = ROLES.includes(ctx.role) ? ctx.role : 'guest';
  return rule(role, { ...ctx, role });
}
