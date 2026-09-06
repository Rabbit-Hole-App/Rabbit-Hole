import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Shield, Square, Trash2, User, Users, X } from 'lucide-react';
import { api, navigate, wsName } from './api.js';
import Shell from './Shell.jsx';
import { Avatar, Button, cn, ConfirmDialog, IconBtn, Input, Menu, MenuItem, Pill, ShareInput, SkeletonRows, toast } from './ui.jsx';

// "acme.com" and "acme-com" are the same org - dots normalize to dashes.
const norm = (s) => (s || '').toLowerCase().replace(/\./g, '-');

export default function MembersPage() {
  return <Shell>{(data) => <MembersContent data={data} />}</Shell>;
}

function MembersContent({ data }) {
  const [teams, setTeams] = useState([]);
  const [pool, setPool] = useState({ members: [], added: [] }); // the org's people pool
  const [teamOpen, setTeamOpen] = useState(null); // team name expanded inline
  const [newTeam, setNewTeam] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPerson, setNewPerson] = useState(null);
  const [menuFor, setMenuFor] = useState(null); // team name with ⋯ open
  const [renaming, setRenaming] = useState(null); // { from, value }
  const [confirm, setConfirm] = useState(null); // { kind: 'group'|'person', name }

  const load = () => Promise.all([
    api('/api/teams').then((d) => setTeams(d.teams)),
    api('/api/members').then(setPool),
  ]).catch(() => {});
  useEffect(() => { load(); }, []);

  const apps = data?.apps || [];
  const org = data?.org || 'small';

  // email → { owned, shared } across every app; union with the added-by-hand pool
  const people = {};
  const at = (e) => (people[e] ||= { owned: 0, shared: 0 });
  for (const a of apps) {
    at(a.owner_email).owned++;
    for (const m of a.members || []) if (m.email !== a.owner_email) at(m.email).shared++;
  }
  for (const e of pool.members) at(e);
  const rows = Object.entries(people).sort(([a], [b]) => a.localeCompare(b));
  const isGuest = (email) => norm(email.split('@')[1]) !== norm(org);

  const addToTeam = async (team, email) => {
    setNewEmail('');
    try {
      await api(`/api/teams/${team}/members`, { method: 'POST', body: JSON.stringify({ email }) });
      load();
    } catch (e) {
      toast(`✗ ${e.message}`);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1150px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
        <div className="pb-8 text-sm text-ink-2">
          <button onClick={() => navigate('/apps')} className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink">{wsName(org)}</button>
          <span className="px-1">/</span> <span className="text-ink">Members</span>
        </div>
        <div className="flex items-center justify-between pb-5">
          <h1 className="text-[40px] leading-[1.2] font-bold tracking-[-0.01em]">Members</h1>
          <Button variant="secondary" size="sm" onClick={() => setNewPerson(newPerson === null ? '' : null)}>
            <Plus size={14} strokeWidth={1.5} /> Add person
          </Button>
        </div>

        {data?.error && <div className="text-ink-2">✗ {data.error}</div>}
        {!data && <SkeletonRows />}

        {newPerson !== null && (
          <form
            className="max-w-xs pb-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const email = newPerson.trim().toLowerCase();
              if (!email.includes('@')) return;
              try { await api('/api/members', { method: 'POST', body: JSON.stringify({ email }) }); load(); } catch (err) { toast(`✗ ${err.message}`); }
              setNewPerson(null);
            }}
          >
            <Input autoFocus value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="colleague@company.com" />
          </form>
        )}

        {rows.length > 0 && (
          <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs whitespace-nowrap text-ink-2">
                  <th className="h-8 pr-3 pl-1 font-normal"><span className="inline-flex items-center gap-1.5"><User size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />Person</span></th>
                  <th className="h-8 pr-3 font-normal"><span className="inline-flex items-center gap-1.5"><Shield size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />Role</span></th>
                  <th className="h-8 pr-3 font-normal"><span className="inline-flex items-center gap-1.5"><Square size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />Apps</span></th>
                  <th className="h-8 pr-1 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([email, p]) => (
                  <tr key={email} className="group/p h-8 border-b border-line whitespace-nowrap hover:bg-hover">
                    <td className="rounded-l-sm pr-3 pl-1">
                      <span className="flex items-center gap-2">
                        <Avatar email={email} />
                        {email}
                      </span>
                    </td>
                    <td className="pr-3">
                      <Pill color={isGuest(email) ? 'yellow' : 'grey'}>{isGuest(email) ? 'guest' : 'member'}</Pill>
                    </td>
                    <td className="pr-3 text-ink-2">{p.owned} owned · {p.shared} shared</td>
                    <td className="rounded-r-sm pr-1 text-right">
                      {p.owned === 0 && email !== data?.email && (
                        <button
                          aria-label={`Remove ${email}`}
                          title="Remove from this workspace (their shares and team seats go too)"
                          onClick={() => setConfirm({ kind: 'person', name: email })}
                          className="rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/p:opacity-100 hover:text-ink"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex h-7 items-center pl-1 text-xs text-ink-3">Count {rows.length}</div>
          </>
        )}

        <div className="flex items-center justify-between pt-8 pb-2">
          <span className="text-sm font-medium">Groups</span>
          <Button variant="secondary" size="sm" onClick={() => setNewTeam(newTeam === null ? '' : null)}>
            <Plus size={14} strokeWidth={1.5} /> New group
          </Button>
        </div>
        {newTeam !== null && (
          <form
            className="pb-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newTeam.trim().replace(/^#/, '').toLowerCase();
              if (!/^[a-z0-9-]{1,30}$/.test(name)) { toast('✗ group name must be letters, numbers or dashes'); return; }
              try { await api('/api/teams', { method: 'POST', body: JSON.stringify({ name }) }); load(); } catch (err) { toast(`✗ ${err.message}`); }
              setNewTeam(null);
            }}
          >
            <Input autoFocus value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="#team-name" className="max-w-xs" />
          </form>
        )}
        {teams.map((t) => {
          const open = teamOpen === t.name;
          return (
            <div key={t.name}>
              <div className="group/t relative flex items-center">
                {renaming?.from === t.name ? (
                  <form
                    className="flex-1 py-0.5 pl-7"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = renaming.value.trim();
                      setRenaming(null);
                      if (!name) return;
                      try { await api(`/api/teams/${t.name}/rename`, { method: 'POST', body: JSON.stringify({ name }) }); load(); } catch (err) { toast(`✗ ${err.message}`); }
                    }}
                  >
                    <Input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onBlur={() => setRenaming(null)}
                      className="h-7 max-w-55"
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => { setTeamOpen(open ? null : t.name); setNewEmail(''); }}
                    className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
                  >
                    {open
                      ? <ChevronDown size={12} className="shrink-0 text-ink-2" />
                      : <ChevronRight size={12} className="shrink-0 text-ink-2" />}
                    <Users size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
                    <span className="truncate">#{t.name}</span>
                    <span className="ml-auto text-xs text-ink-2">{t.members.length} people</span>
                  </button>
                )}
                <IconBtn
                  title="More"
                  onClick={() => setMenuFor(menuFor === t.name ? null : t.name)}
                  className={cn('opacity-0 group-hover/t:opacity-100', menuFor === t.name && 'bg-active text-ink opacity-100')}
                >
                  <MoreHorizontal size={16} strokeWidth={1.5} />
                </IconBtn>
                <Menu open={menuFor === t.name} onClose={() => setMenuFor(null)} className="top-8 right-0">
                  <MenuItem icon={Pencil} onClick={() => { setMenuFor(null); setRenaming({ from: t.name, value: `#${t.name}` }); }}>
                    Rename
                  </MenuItem>
                  <MenuItem icon={Trash2} className="text-danger" onClick={() => { setMenuFor(null); setConfirm({ kind: 'group', name: t.name }); }}>
                    Delete
                  </MenuItem>
                </Menu>
              </div>
              {open && (
                <div className="mb-2 ml-7 max-w-xs">
                  <form
                    className="py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const email = newEmail.trim().toLowerCase();
                      if (email.includes('@')) addToTeam(t.name, email);
                    }}
                  >
                    {/* autocomplete from the members pool - groups can only hold known people */}
                    <ShareInput
                      autoFocus
                      value={newEmail}
                      onChange={setNewEmail}
                      onPick={(it) => it.email && addToTeam(t.name, it.email)}
                      people={pool.members}
                      exclude={t.members}
                      placeholder="Add from members…"
                    />
                  </form>
                  {t.members.length > 0 && <div className="pt-1 pb-0.5 text-xs text-ink-3">In this group</div>}
                  {t.members.map((m) => (
                    <div key={m} className="group/m flex h-8 items-center gap-2 rounded-sm px-2 text-sm hover:bg-hover">
                      <Avatar email={m} />
                      <span className="min-w-0 flex-1 truncate">{m}</span>
                      <button
                        aria-label={`Remove ${m}`}
                        onClick={async () => { try { await api(`/api/teams/${t.name}/members`, { method: 'POST', body: JSON.stringify({ email: m, remove: true }) }); load(); } catch {} }}
                        className="rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/m:opacity-100 hover:text-ink"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {confirm?.kind === 'group' && (
          <ConfirmDialog
            title={`Delete #${confirm.name}?`}
            body="Apps shared with this group lose those people's access. It cannot be undone."
            onConfirm={async () => {
              const name = confirm.name;
              setConfirm(null);
              try { await api(`/api/teams/${name}/delete`, { method: 'POST' }); setTeamOpen(null); toast(`Deleted #${name}`); load(); } catch (e) { toast(`✗ ${e.message}`); }
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
        {confirm?.kind === 'person' && (
          <ConfirmDialog
            title={`Remove ${confirm.name}?`}
            body="They leave the members list. Nothing they were shared on changes."
            confirmLabel="Remove"
            onConfirm={async () => {
              const email = confirm.name;
              setConfirm(null);
              try { await api('/api/members', { method: 'POST', body: JSON.stringify({ email, remove: true }) }); load(); } catch (e) { toast(`✗ ${e.message}`); }
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </main>
  );
}
