"""Entry-point candidates by rule (S1c): what the repository's own CLI, server and tests can DO, classified, so the catalogue covers them whatever the model happens to list.
The rule pass (catalogue.rule_pass) already finds click/typer commands with their flags, argparse scripts, pytest layout and Makefile targets; this module classifies them and checks that routes run them.
Classes: serve (a command named serve/run/start..., or one that takes --port/--host), oneshot (a --get/--query flag, or a command named get/query/ask/inspect), plugins (plugins/list), auth (a token command),
tests (a test-suite candidate), docs (a documentation build, recognised on a route's commands, never recommended over a serve or one-shot route).
Pure functions over the candidate list and the snapshot files; no model, no network."""
import re

SERVE_NAMES = {'serve', 'run', 'start', 'runserver', 'server', 'dev'}
ONESHOT_NAMES = {'get', 'query', 'ask', 'inspect', 'eval', 'exec'}
ONESHOT_FLAGS = ('--get', '--query', '--eval', '--execute', '--once')
PLUGIN_NAMES = {'plugins', 'list', 'ls'}
PORT_FLAGS = {'--port', '--host', '--bind'}
FAMILY = ('oneshot', 'plugins', 'auth')  # one of these must be covered
MAX_SERVE, MAX_TESTS = 3, 2
DOCS = re.compile(r'\bmake\s+(?:html|dirhtml|docs?)\b|\bsphinx-build\b|\bmkdocs\s+(?:build|serve)\b|\bjupyter-book\s+build\b')
_RUNNERS = {'uv', 'poetry', 'pipenv', 'pdm', 'hatch'}
_VALUE_FLAGS = {'--group', '--with', '--extra', '--python', '-p', '--directory', '--project', '--only-group'}
_DEFAULT = re.compile(r'click\.group\([^)]*?default\s*=\s*["\']([\w-]+)["\']', re.S)
_GROUPS = re.compile(r'@\w+\.group\([^)]*\)\s*(?:@[^\n]+\s*)*(?:async\s+)?def\s+(\w+)')


def head_tokens(cmd: str) -> list:
    """The command a step runs, as tokens: up to the first pipe, redirect or `&&`, without `uv run [--group x]`, `python -m` or a leading environment assignment."""
    t = re.split(r'\s*(?:\|\||\||&&|;|>)\s*', (cmd or '').strip())[0].split()
    while t and re.fullmatch(r'\w+=\S*', t[0]):
        t = t[1:]
    if len(t) > 1 and t[0] in _RUNNERS and t[1] == 'run':
        i = 2
        while i < len(t) and t[i].startswith('-'):
            i += 2 if t[i] in _VALUE_FLAGS else 1
        t = t[i:]
    if t and re.fullmatch(r'python3?(?:\.\d+)?', t[0]):
        t = ['python'] + t[1:]
        if len(t) > 2 and t[1] == '-m':
            t = t[2:]
    return t


def _prefix(cmd: str) -> str:
    return cmd.rpartition(' ')[0]


def entry_candidates(cands: list, files: dict) -> tuple:
    """-> (entries, subcommands). Each entry: {cls, cmd, tokens, flag, source, cand, default}. `subcommands` maps a command prefix to the names of its subcommands and groups (so `datasette publish x` is not `datasette <default command>`)."""
    subs, defaults = {}, {}
    for c in cands:
        if c['kind'] == 'command':
            path = c['source'].split(':')[0]
            text = files.get(path) if isinstance(files.get(path), str) else ''
            subs.setdefault(_prefix(c['cmd']), set()).add(c['cmd'].rpartition(' ')[2])
            m = _DEFAULT.search(text)
            if m and (path, _prefix(c['cmd'])) not in defaults:
                defaults[(path, _prefix(c['cmd']))] = m.group(1)
                subs[_prefix(c['cmd'])] |= {g.replace('_', '-') for g in _GROUPS.findall(text)}
    out, seen = [], set()

    def add(cls, c, flag='', source=None):
        e = {'cls': cls, 'cmd': c['cmd'], 'tokens': head_tokens(c['cmd']), 'flag': flag, 'source': source or c['source'], 'cand': c,
             'default': c['kind'] == 'command' and defaults.get((c['source'].split(':')[0], _prefix(c['cmd']))) == c['cmd'].rpartition(' ')[2]}
        k = (cls, tuple(e['tokens']), flag)
        if k not in seen:
            seen.add(k)
            out.append(e)
    for c in cands:
        flags = {f['flag']: f['source'] for f in c.get('flags', [])}
        if c['kind'] == 'command' or (c['kind'] == 'script' and 'framework' in c):
            name = c['cmd'].rpartition(' ')[2]
            if name in SERVE_NAMES or PORT_FLAGS & set(flags) or 'uvicorn' in c.get('framework', []):
                add('serve', c)
            if c['kind'] == 'command':
                if name in ONESHOT_NAMES:
                    add('oneshot', c)
                if name in PLUGIN_NAMES:
                    add('plugins', c)
                if 'token' in name or name == 'auth':
                    add('auth', c)
            for f in ONESHOT_FLAGS:
                if f in flags:
                    add('oneshot', c, f, flags[f])
        elif c['kind'] == 'tests':
            add('tests', c)
    return out, subs


def covers(route: dict, entry: dict, subs: dict) -> bool:
    """A step of the route runs the entry's command (not inside Docker, not through another program): its tokens start with the entry's, or the entry is the default command of its group and the step gives the
    group a first argument that is not another subcommand. A serve entry is not covered by a one-shot step (`--get` answers one request and exits); a flag entry needs its flag."""
    e = entry['tokens']
    for s in route.get('stepsSketch', []):
        t = head_tokens(s.get('cmd', ''))
        oneshot = any(x.split('=')[0] in ONESHOT_FLAGS for x in t)
        p = e[:-1]
        hit = t[:len(e)] == e or (entry['default'] and p and t[:len(p)] == p and (len(t) == len(p) or t[len(p)] not in subs.get(' '.join(p), ())))
        if not hit:
            continue
        if entry['flag']:
            if any(x == entry['flag'] or x.startswith(entry['flag'] + '=') for x in t):
                return True
        elif not (entry['cls'] == 'serve' and oneshot):
            return True
    return False


def route_classes(route: dict, entries: list, subs: dict) -> set:
    out = {e['cls'] for e in entries if covers(route, e, subs)}
    if any(DOCS.search(s.get('cmd', '')) for s in route.get('stepsSketch', [])):
        out.add('docs')
    return out


def uncovered(routes: list, entries: list, subs: dict) -> list:
    """The entries no route runs that must be run: every serve (first MAX_SERVE) and tests (first MAX_TESTS) entry, and one one-shot entry when no route runs any of oneshot/plugins/auth."""
    need = [e for e in [x for x in entries if x['cls'] == 'serve'][:MAX_SERVE] + [x for x in entries if x['cls'] == 'tests'][:MAX_TESTS] if not any(covers(r, e, subs) for r in routes)]
    fam = [e for k in FAMILY for e in entries if e['cls'] == k]
    if fam and not any(covers(r, e, subs) for r in routes for e in fam):
        need.append(fam[0])
    return need


# Plain-words templates for a route the controller builds from an entry (title, description, resultKind): no command, path or file:line.
TEMPLATES = {
    'serve': ('Start the server and open it in a browser', 'Starts it as a local service and checks that it answers.', 'http'),
    'oneshot': ('Ask it one question and read the answer', 'Runs it once on a sample request and prints the result.', 'stdout'),
    'plugins': ('List what is installed', 'Runs the command that lists what it has installed and prints it.', 'stdout'),
    'auth': ('Create an access token and print it', 'Runs the command that makes an access token and prints it.', 'stdout'),
    'tests': ('Run the test suite and watch it pass', "Runs the project's own tests and reports how many pass.", 'tests'),
}


def minimal_route(entry: dict, install: str, ids: set) -> dict:
    """A route from the entry's own source-derived command: install the checkout (cited to the manifest) when there is one, run the command. `requirements` stay empty so the rules read them from the commands."""
    title, desc, kind = TEMPLATES[entry['cls']]
    cmd = entry['cmd'] + (' ' + entry['flag'] + (' /' if entry['flag'] == '--get' else '') if entry['flag'] else '')
    rid, n = f"{entry['cls']}_{re.sub(r'[^a-z0-9]+', '_', entry['cmd'].lower()).strip('_')[:40]}", 2
    while rid in ids:
        rid, n = f'{rid}_{n}', n + 1
    ids.add(rid)
    lang = entry['cand'].get('ecosystem', 'python')
    steps = ([{'cmd': 'pip install -e .', 'source': install}] if install and lang == 'python' else []) + [{'cmd': cmd, 'source': entry['source']}]
    return {'routeId': rid, 'group': entry['cand'].get('group', 'main'), 'title': title, 'description': desc, 'resultKind': kind, 'requirements': {'language': lang}, 'prerequisites': [], 'stepsSketch': steps}
