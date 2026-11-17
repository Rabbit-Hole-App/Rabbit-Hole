"""Unit tests of entrypoints.py and its use in catalogue (S1c): the CLI's own serve, one-shot and test entry points are found by rule, the model must cover them, the controller adds what it misses,
and the recommended route is a serve route. No model, no Modal, no network. Run from this directory: python -m pytest test_catalogue_entrypoints.py"""
import copy
import json
from pathlib import Path

import catalogue as cat
import contracts
import entrypoints as ep
from model import ModelReply

VARIANTS = json.loads((Path(__file__).parent / 'fixtures' / 'datasette-e9d45fe' / 'catalogue-variants.json').read_text(encoding='utf-8'))

# simonw/datasette at e9d45fe reduced to what the rules read: a click group with a default command, console script, pytest config, a docs Makefile
FILES = {
    'README.md': '# datasette\n\n```\npip install -e .\ndatasette create-token root\n```\n',
    'pyproject.toml': '[project]\nname = "datasette"\nrequires-python = ">=3.10"\ndependencies = ["click"]\n\n[project.scripts]\ndatasette = "datasette.cli:cli"\n\n[tool.pytest.ini_options]\nmarkers = ["serial"]\n',
    'datasette/cli.py': 'import click\nfrom click_default_group import DefaultGroup\n\n\n@click.group(cls=DefaultGroup, default="serve", default_if_no_args=True)\ndef cli():\n    """Datasette"""\n\n\n'
                        '@cli.command()\n@click.argument("files", nargs=-1)\ndef inspect(files):\n    pass\n\n\n@cli.group()\ndef publish():\n    pass\n\n\n@cli.command()\n@click.option("--all", is_flag=True)\ndef plugins(all):\n    pass\n\n\n'
                        '@cli.command()\n@click.argument("files", nargs=-1)\ndef package(files):\n    pass\n\n\n'
                        '@cli.command(name="create-token")\n@click.argument("id")\n@click.option("--secret")\ndef create_token(id, secret):\n    pass\n\n\n'
                        '@cli.command()\n@click.argument("files", nargs=-1)\n@click.option("-p", "--port", default=8001)\n@click.option("--get")\ndef serve(files, port, get):\n    pass\n',
    'tests/test_api.py': 'def test_a():\n    pass\n',
    'docs/Makefile': 'html:\n\tsphinx-build -b html . _build\n',
}
RP = cat.rule_pass(FILES)
ENTRIES, SUBS = ep.entry_candidates(RP['candidates'], FILES)


def route(cmds, kind='stdout', rid='r'):
    return {'routeId': rid, 'title': rid, 'description': 'd', 'resultKind': kind, 'requirements': {'language': 'python'}, 'stepsSketch': [{'cmd': c, 'source': 'a:1'} for c in cmds]}


def classes(cmds):
    return ep.route_classes(route(cmds), ENTRIES, SUBS)


# ---- the candidates --------------------------------------------------------------------------------------------------------------------------

def test_the_rules_find_and_classify_the_entry_points():
    found = sorted((e['cls'], e['cmd'], e['flag']) for e in ENTRIES)
    assert found == sorted([('serve', 'datasette serve', ''), ('oneshot', 'datasette serve', '--get'), ('oneshot', 'datasette inspect', ''), ('plugins', 'datasette plugins', ''),
                            ('auth', 'datasette create-token', ''), ('tests', 'pytest', '')])
    assert next(e for e in ENTRIES if e['cls'] == 'serve')['default'] is True  # click_default_group: `datasette fixtures.db` is `datasette serve fixtures.db`
    assert SUBS['datasette'] >= {'serve', 'plugins', 'create-token', 'inspect', 'publish', 'package'}


# ---- what counts as running an entry point ----------------------------------------------------------------------------------------------------

def test_serve_is_run_by_the_command_or_by_the_default_command_not_by_a_one_shot_or_docker():
    assert 'serve' in classes(['datasette serve fixtures.db'])
    assert 'serve' in classes(['uv run datasette fixtures.db'])  # the default command
    assert 'serve' in classes(['datasette -p 8001 fixtures.db'])
    assert 'serve' not in classes(['datasette --get /-/versions.json'])  # answers one request and exits
    assert 'serve' not in classes(['datasette plugins'])
    assert 'serve' not in classes(['datasette publish heroku fixtures.db'])  # a group, not the default command
    assert 'serve' not in classes(['docker run -p 8001:8001 datasetteproject/datasette datasette -p 8001 /mnt/fixtures.db'])
    assert 'serve' not in classes(['pip install -e .'])


def test_one_shot_plugins_auth_tests_and_docs():
    assert 'oneshot' in classes(['datasette --memory --actor \'{"id": "root"}\' --get \'/-/actor.json\''])
    assert 'oneshot' in classes(["datasette --get '/-/versions.json' | jq ."])
    assert 'oneshot' not in classes(['datasette fixtures.db'])
    assert 'oneshot' in classes(['datasette inspect fixtures.db > inspect-data.json'])
    assert 'plugins' in classes(['datasette plugins --requirements'])
    assert 'auth' in classes(['datasette create-token root --secret mysecret'])
    assert 'tests' in classes(['uv run --group dev pytest -n auto -m "not serial"']) and 'tests' in classes(['python -m pytest'])
    assert classes(['python3 -m pip install -e . --group dev', 'uv run make html']) == {'docs'}


# ---- the three real datasette runs --------------------------------------------------------------------------------------------------------------

def finish(name):
    doc = {'repo': 'simonw/datasette', 'commit': 'e' * 40, 'hardware': 'cpu', 'summary': 'x', 'groups': copy.deepcopy(VARIANTS[name]['groups']), 'routes': copy.deepcopy(VARIANTS[name]['routes'])}
    need = ep.uncovered(doc['routes'], ENTRIES, SUBS)
    cat.add_missing(doc, need, RP)
    cat.finalize(doc, RP['candidates'], FILES)
    return doc, need


def practical_classes(doc):
    return sorted(sorted(ep.route_classes(r, ENTRIES, SUBS)) for r in doc['routes'] if r['practical'])


def test_three_real_runs_give_the_same_practical_set_by_class_and_a_serve_route_is_recommended():
    out = [finish(n) for n in ('run1', 'run2', 'run3')]
    sets = [practical_classes(d) for d, _ in out]
    assert sets[0] == sets[1] == sets[2] == [['auth'], ['docs'], ['oneshot'], ['plugins'], ['serve'], ['tests']]
    for d, need in out:
        rec = [r for r in d['routes'] if r.get('recommended')]
        assert len(rec) == 1 and 'serve' in ep.route_classes(rec[0], ENTRIES, SUBS) and rec[0]['practical'] and 'docs' not in ep.route_classes(rec[0], ENTRIES, SUBS)
        assert contracts.errors('catalogue', d) == []
    assert [[e['cls'] for e in need] for _, need in out] == [['serve'], ['serve'], []]  # runs 1 and 2 never listed the serve route; run 3 did
    for d, _ in out:
        assert all(not r['practical'] for r in d['routes'] if any(s['cmd'].startswith(('docker ', 'datasette publish', 'brew ')) for s in r['stepsSketch']))


def test_a_docs_build_is_never_recommended_while_a_serve_or_one_shot_route_is_practical():
    d = {'routes': [route(['make html'], 'files', 'a_docs'), route(['datasette --get /'], 'stdout', 'z_query')]}
    cat.finalize(d, RP['candidates'], FILES)
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['z_query']
    d = {'routes': [route(['make html'], 'files', 'a_docs'), route(['datasette plugins'], 'stdout', 'z_plugins')]}
    cat.finalize(d, RP['candidates'], FILES)
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['z_plugins']  # no serve or query route: the other tiers, docs last
    d = {'routes': [route(['make html'], 'files', 'a_docs')]}
    cat.finalize(d, RP['candidates'], FILES)
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['a_docs']  # docs when nothing else is practical


def test_serve_beats_one_shot_whatever_the_step_count():
    d = {'routes': [route(['datasette --get /'], 'stdout', 'a_query'), route(['pip install -e .', 'python x.py', 'datasette serve'], 'http', 'z_serve')]}
    cat.finalize(d, RP['candidates'], FILES)
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['z_serve']


# ---- coverage: the model is asked once, then the controller adds the route -----------------------------------------------------------------------

def test_uncovered_needs_every_serve_and_tests_entry_and_one_one_shot():
    assert [e['cls'] for e in ep.uncovered([], ENTRIES, SUBS)] == ['serve', 'tests', 'oneshot']
    assert ep.uncovered([route(['datasette fixtures.db']), route(['pytest']), route(['datasette plugins'])], ENTRIES, SUBS) == []
    assert [e['cls'] for e in ep.uncovered([route(['datasette fixtures.db']), route(['pytest'])], ENTRIES, SUBS)] == ['oneshot']
    assert ep.uncovered([route(['datasette fixtures.db']), route(['pytest']), route(['datasette create-token x'])], ENTRIES, SUBS) == []  # any of the one-shot family


class Stub:
    def __init__(self, *replies):
        self.replies, self.seen = list(replies), []

    def complete(self, model, system, messages, tools, max_tokens):
        self.seen.append(messages)
        return ModelReply(content=[{'type': 'text', 'text': json.dumps(self.replies.pop(0))}], input_tokens=100, output_tokens=100, model=model)


def test_a_missing_serve_candidate_is_asked_for_once_then_added_by_the_controller():
    reply = {'summary': 'A tool.', 'routes': [{'routeId': 'make_token', 'title': 'Make an access token', 'description': 'Prints a token.', 'resultKind': 'stdout', 'requirements': {'language': 'python'},
                                               'stepsSketch': [{'cmd': 'pip install -e .', 'source': 'README.md:4'}, {'cmd': 'datasette create-token root', 'source': 'README.md:5'}]}]}
    model = Stub(reply, copy.deepcopy(reply))
    doc, calls = cat.run_catalogue({'repo': 'a/b', 'commit': 'c' * 40, 'files': FILES}, model)
    assert len(calls) == 2  # one re-ask, no more
    first = json.loads(model.seen[0][0]['content'])
    assert {(e['class'], e['cmd']) for e in first['entryPoints']} >= {('serve', 'datasette serve'), ('tests', 'pytest'), ('oneshot', 'datasette serve --get')}
    assert 'no route runs these entry points: datasette serve (datasette/cli.py:40-44); pytest (pyproject.toml:9)' in model.seen[1][-1]['content']
    by = {r['routeId']: r for r in doc['routes']}
    assert 'serve_datasette_serve' in by and 'tests_pytest' in by and 'make_token' in by
    serve = by['serve_datasette_serve']
    assert serve['practical'] is True and serve['title'] == 'Start the server and open it in a browser' and serve['resultKind'] == 'http'
    assert [s['cmd'] for s in serve['stepsSketch']] == ['pip install -e .', 'datasette serve'] and serve['stepsSketch'][0]['source'] == 'pyproject.toml:1'
    assert [r['routeId'] for r in doc['routes'] if r.get('recommended')] == ['serve_datasette_serve']
    assert contracts.errors('catalogue', doc) == [] and not cat.catalogue_problems(doc, RP['candidates'], RP['groups'])


def test_the_model_covering_the_entry_points_on_the_first_reply_costs_no_second_call():
    steps = lambda cmds: [{'cmd': c, 'source': 'README.md:5'} for c in cmds]
    mk = lambda rid, title, cmds, kind='stdout': {'routeId': rid, 'title': title, 'description': 'Does it.', 'resultKind': kind, 'requirements': {'language': 'python'}, 'stepsSketch': steps(cmds)}
    reply = {'summary': 'A tool.', 'routes': [mk('serve_it', 'Serve a database', ['datasette fixtures.db'], 'http'), mk('run_tests', 'Run the tests', ['pytest'], 'tests'), mk('tokens', 'Make a token', ['datasette create-token root'])]}
    doc, calls = cat.run_catalogue({'repo': 'a/b', 'commit': 'c' * 40, 'files': FILES}, Stub(reply))
    assert len(calls) == 1 and [r['routeId'] for r in doc['routes'] if r.get('recommended')] == ['serve_it'] and not [r for r in doc['routes'] if r['routeId'].startswith(('serve_datasette', 'tests_'))]
