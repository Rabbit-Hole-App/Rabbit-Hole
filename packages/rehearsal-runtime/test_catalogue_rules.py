"""Unit tests of the controller's rule table (catalogue.derive, merged_requirements, rule_routes, finalize): no model, no Modal, no network.
Run from this directory: python -m pytest test_catalogue_rules.py"""
import copy
import json
import random

import catalogue as cat
import contracts
from model import ModelReply

QUICK = 'Quick — just Python'


def route(rid='r', steps=1, title=None, req=None, **kw):
    return {'routeId': rid, 'title': title or rid.replace('_', ' ').title(), 'description': 'Does a thing.', 'resultKind': 'stdout',
            'stepsSketch': [{'cmd': f'python s{i}.py', 'source': f'README.md:{i + 1}'} for i in range(steps)], 'requirements': req or {}, **kw}


def derived(**req):
    r = route(req=req)
    r['requirements'] = cat.merged_requirements(r)
    return cat.derive(r)


# ---- one case per rule --------------------------------------------------------------------------------------------------------------------------

def test_no_requirements_is_practical_python():
    assert derived() == (True, QUICK, None)
    assert derived(language='python', docker=False, gpu=False, services=[], downloadGB=0, accounts=[]) == (True, QUICK, None)


def test_gpu():
    assert derived(gpu=True) == (False, 'Heavy — needs a GPU', 'needs a GPU')


def test_download_over_half_a_gb_is_not_practical_and_exactly_half_is():
    ok, effort, reason = derived(downloadGB=0.51)
    assert (ok, effort) == (False, 'Heavy — large download') and '0.51 GB' in reason
    assert derived(downloadGB=0.5)[0] is True


def test_docker():
    assert derived(docker=True) == (False, 'Medium — needs Docker', cat.DOCKER_REASON)


def test_service_that_needs_docker():
    ok, effort, reason = derived(services=['PostgreSQL'])
    assert (ok, effort) == (False, 'Medium — needs Docker') and 'PostgreSQL' in reason
    assert derived(services=['sqlite'])[0] is True  # in-process, not a daemon


def test_download_host_outside_the_sandbox_allowlist():
    ok, effort, reason = derived(downloadHosts=['https://huggingface.co/datasets/x'])
    assert (ok, effort) == (False, 'Not practical here') and 'huggingface.co' in reason
    assert derived(downloadHosts=['HuggingFace.co:443'])[0] is False
    for host in ('pypi.org', 'raw.githubusercontent.com', 'api.github.com', 'download.pytorch.org', 'https://github.com/a/b/archive/x.zip'):
        assert derived(downloadHosts=[host])[0] is True, host
    assert derived(downloadHosts=['github.com.evil.example'])[0] is False


def test_accounts():
    ok, effort, reason = derived(accounts=['Kaggle API key'])
    assert (ok, effort) == (False, 'Not practical here') and 'Kaggle API key' in reason


def test_platform():
    assert derived(platform='macOS')[0] is False
    assert derived(platform='linux')[0] is True


def test_foreign_toolchain():
    for lang in ('node', 'TypeScript', 'rust', 'go', 'python and node'):
        ok, effort, reason = derived(language=lang)
        assert (ok, effort) == (False, 'Not practical here') and 'toolchain' in reason, lang
    assert derived(language='Python with C extensions')[0] is True


def test_first_hit_wins_the_effort_and_the_reason_lists_every_cause():
    ok, effort, reason = derived(gpu=True, docker=True, accounts=['x'])
    assert effort == 'Heavy — needs a GPU' and reason.startswith('needs a GPU') and 'account' in reason and 'Docker' in reason
    assert 'browser' in derived(downloadHosts=['cdn.playwright.dev'])[2]
    assert derived(docker=True, accounts=['x'])[1] == 'Medium — needs Docker'
    assert derived(downloadGB=5, docker=True)[1] == 'Heavy — large download'


# ---- the route's own commands count, whatever the model said ----------------------------------------------------------------------------------

def hinted(*cmds, **req):
    r = route(req=req)
    r['stepsSketch'] = [{'cmd': c, 'source': f'README.md:{i + 1}'} for i, c in enumerate(cmds)]
    r['requirements'] = cat.merged_requirements(r)
    return cat.derive(r)


def test_commands_imply_requirements():
    assert hinted('pip install -e .', 'docker compose up web')[1] == 'Medium — needs Docker'
    assert hinted('torchrun --standalone --nproc_per_node=8 train.py')[1] == 'Heavy — needs a GPU'
    assert hinted('python train.py --device=cuda')[1] == 'Heavy — needs a GPU'
    assert hinted('terraform apply')[1:] == ('Not practical here', 'needs an account or API key (a cloud account)')
    assert hinted('datasette publish cloudrun x.db')[0] is False
    assert hinted('brew install datasette')[0] is False
    assert hinted('playwright install chromium')[0] is False
    assert hinted('curl -O https://huggingface.co/x/model.bin')[0] is False
    assert hinted('pip install torch --index-url https://download.pytorch.org/whl/cpu')[0] is True
    assert hinted('curl http://127.0.0.1:8001/-/versions.json')[0] is True
    assert hinted('pytest -m "not playwright"')[0] is True
    assert hinted('pip install docker')[0] is True  # the Python package, not the command
    assert hinted('npm ci', 'npm run prettier:check', language='python')[2] == "needs a Node toolchain, which isn't available in the sandbox yet"  # the model named the wrong language
    assert hinted('cargo run --bin x')[0] is False and hinted('go test ./...')[0] is False
    assert hinted('python -m pip install -e .', 'pytest')[0] is True
    assert hinted('datasette publish heroku x.db', accounts=['Heroku account'])[2].endswith('(Heroku account)')  # the model's own words are kept


# ---- the model's practical / effort / reason / recommended are ignored ------------------------------------------------------------------------

def doc_of(*routes):
    return {'repo': 'a/b', 'commit': 'a' * 40, 'hardware': 'cpu', 'summary': 'A thing.', 'groups': [{'id': 'main', 'label': 'main program', 'path': './'}], 'routes': list(routes)}


def test_model_supplied_judgements_are_overwritten():
    liar = route('liar', req={'gpu': True}, practical=True, effort=QUICK, recommended=True)
    modest = route('modest', practical=False, effort='Not practical here', reason='the model felt like it')
    d = doc_of(liar, modest)
    cat.finalize(d, [])
    by = {r['routeId']: r for r in d['routes']}
    assert by['liar']['practical'] is False and by['liar']['effort'] == 'Heavy — needs a GPU' and 'recommended' not in by['liar']
    assert by['modest']['practical'] is True and by['modest']['effort'] == QUICK and 'reason' not in by['modest'] and by['modest']['recommended'] is True


def test_model_schema_leaves_out_what_the_controller_derives():
    s = cat.model_schema()
    props, req = s['$defs']['route']['properties'], s['$defs']['route']['required']
    for k in ('practical', 'effort', 'reason', 'recommended'):
        assert k not in props and k not in req
    assert 'more' not in s['properties'] and 'if' not in s['$defs']['route'] and 'requirements' in req
    assert {'downloadHosts', 'evidence', 'platform'} <= set(props['requirements']['properties'])
    assert 'practical' in json.loads((contracts.SCHEMAS / 'catalogue.json').read_text(encoding='utf-8'))['$defs']['route']['properties']  # the final shape keeps them


# ---- rule-found impractical routes are always listed ------------------------------------------------------------------------------------------

def cand(kind, cmd, source, group='main', **kw):
    return {'kind': kind, 'cmd': cmd, 'source': source, 'group': group, **kw}


RULE_FOUND = [
    cand('doc_cmd', 'brew install datasette', 'README.md:33'),
    cand('doc_cmd', 'datasette publish cloudrun mydb.db --service=x', 'README.md:79'),
    cand('doc_cmd', 'terraform apply', 'infra/README.md:3', group='infra'),
    cand('doc_cmd', 'playwright install chromium', 'docs/contributing.rst:67'),
    cand('just_recipe', 'just test-playwright', 'Justfile:16', recipe='pytest -m playwright'),
    cand('compose_service', 'docker compose up web', 'docker-compose.yml:3'),
    cand('doc_cmd', 'torchrun --standalone train.py', 'README.md:99'),
    cand('command', 'datasette package', 'datasette/cli.py:207', words=['docker', 'package']),
]


def test_rule_found_impractical_routes_are_listed_when_the_model_omits_them():
    d = doc_of()
    cat.finalize(d, RULE_FOUND)
    by = {r['routeId']: r for r in d['routes']}
    assert set(by) == {'docker_main', 'playwright_main', 'deploy_infra', 'publish_main', 'brew_main', 'gpu_main'}
    assert all(r['practical'] is False and r['reason'] and r['stepsSketch'] and 'recommended' not in r for r in by.values())
    assert by['docker_main']['effort'] == 'Medium — needs Docker' and by['docker_main']['reason'] == cat.DOCKER_REASON
    assert by['gpu_main']['effort'] == 'Heavy — needs a GPU'
    assert by['brew_main']['effort'] == by['publish_main']['effort'] == 'Not practical here'
    assert {s['source'] for s in by['playwright_main']['stepsSketch']} == {'docs/contributing.rst:67', 'Justfile:16'}
    assert {s['source'] for s in by['docker_main']['stepsSketch']} == {'docker-compose.yml:3', 'datasette/cli.py:207'}
    assert contracts.errors('catalogue', d) == []
    assert not [r for r in by.values() if cat.prose_problem(r['title'])]


def test_rule_routes_are_not_duplicated_when_the_model_already_covers_the_class():
    mine = route('deploy_aws', req={}, title='Deploy to AWS')
    mine['stepsSketch'] = [{'cmd': 'terraform apply', 'source': 'infra/README.md:3'}]
    d = doc_of(mine)
    cat.finalize(d, RULE_FOUND)
    ids = [r['routeId'] for r in d['routes']]
    assert ids.count('deploy_aws') == 1 and 'deploy_infra' not in ids
    assert next(r for r in d['routes'] if r['routeId'] == 'deploy_aws')['practical'] is False  # derived from its own command
    # a candidate the model's practical route cites is that route's business, not a second route
    cited = route('uses_pkg')
    cited['stepsSketch'] = [{'cmd': 'datasette package', 'source': 'datasette/cli.py:207'}]
    d = doc_of(cited)
    cat.finalize(d, [RULE_FOUND[-1]])
    assert [r['routeId'] for r in d['routes']] == ['uses_pkg']


def test_a_negated_playwright_marker_is_not_a_playwright_route():
    d = doc_of()
    cat.finalize(d, [cand('doc_cmd', 'pytest -m "not playwright"', 'README.md:5'), cand('doc_cmd', 'pip install -e .', 'README.md:4')])
    assert d['routes'] == []


# ---- order, recommendation, cap ---------------------------------------------------------------------------------------------------------------

def test_order_is_practical_then_steps_then_title_then_id():
    d = doc_of(route('z', 1, 'Zed', req={'gpu': True}), route('b', 3, 'Beta'), route('a2', 2, 'Alpha'), route('a1', 2, 'alpha'), route('c', 2, 'Charlie'), route('d', 1, 'Delta', req={'accounts': ['x']}))
    cat.finalize(d, [])
    assert [r['routeId'] for r in d['routes']] == ['a1', 'a2', 'c', 'b', 'd', 'z']
    assert [r['practical'] for r in d['routes']] == [True] * 4 + [False] * 2


def test_exactly_one_recommended_on_the_first_practical_route_that_is_not_a_test_suite():
    t = route('t', 1, 'Run the tests')
    t['resultKind'] = 'tests'
    d = doc_of(t, route('serve', 3, 'Serve it'), route('gpu', 1, 'Train', req={'gpu': True}))
    cat.finalize(d, [])
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['serve']
    d = doc_of(t, route('gpu', 1, 'Train', req={'gpu': True}))
    cat.finalize(d, [])
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['t']  # nothing else is practical


def test_no_practical_route_means_no_recommendation():
    d = doc_of(route('gpu', 1, req={'gpu': True}))
    cat.finalize(d, [])
    assert not any('recommended' in r for r in d['routes']) and 'more' not in d


def test_practical_routes_beyond_the_cap_go_to_more_and_the_recommended_is_kept():
    routes = [route(f'r{i:02d}', 2, f'Route {i:02d}') for i in range(10)]
    routes[9]['stepsSketch'] = routes[9]['stepsSketch'][:1]
    for r in routes[:9]:
        r['resultKind'] = 'tests'  # the one non-test route is the recommended one, whatever its place
    routes[9]['resultKind'] = 'stdout'
    d = doc_of(*routes)
    cat.finalize(d, [])
    assert sum(r['practical'] for r in d['routes']) == cat.MAX_PRACTICAL
    assert len(d['more']) == 2 and {m['routeId'] for m in d['more']} == {'r08', 'r07'}
    assert [r['routeId'] for r in d['routes'] if r.get('recommended')] == ['r09']
    assert contracts.errors('catalogue', d) == []


def test_a_route_that_needs_an_impractical_prerequisite_is_impractical():
    api = route('api', req={'docker': True})
    worker = route('worker', prerequisites=['api'])
    d = doc_of(api, worker, route('lone'))
    cat.finalize(d, [])
    by = {r['routeId']: r for r in d['routes']}
    assert by['worker']['practical'] is False and 'api' in by['worker']['reason'].lower() and by['lone']['practical'] is True


# ---- determinism ------------------------------------------------------------------------------------------------------------------------------

def test_same_requirements_in_any_order_give_the_same_practical_set_and_order():
    base = [route('a', 2, 'Alpha'), route('b', 2, 'Alpha'), route('c', 1, 'Gamma', req={'gpu': True}), route('d', 3, 'Delta', req={'downloadGB': 2}), route('e', 1, 'Echo', req={'downloadHosts': ['pypi.org']}),
            route('f', 2, 'Foxtrot', req={'accounts': ['x']}), route('g', 4, 'Golf'), route('h', 1, 'Hotel', req={'services': ['redis']}), route('i', 2, 'India')]
    outs = []
    for seed in range(12):
        rs = copy.deepcopy(base)
        random.Random(seed).shuffle(rs)
        cands = copy.deepcopy(RULE_FOUND)
        random.Random(seed).shuffle(cands)
        d = doc_of(*rs)
        cat.finalize(d, cands)
        outs.append(d)
    assert all(o == outs[0] for o in outs[1:])
    assert [r['routeId'] for r in outs[0]['routes'] if r['practical']] == ['e', 'a', 'b', 'i', 'g']


# ---- the whole pass with a stub model (no network): the re-ask for missing requirements, and the final document -----------------------------

class StubModel:
    def __init__(self, *replies):
        self.replies, self.seen = list(replies), []

    def complete(self, model, system, messages, tools, max_tokens):
        self.seen.append(messages)
        return ModelReply(content=[{'type': 'text', 'text': json.dumps(self.replies.pop(0))}], input_tokens=100, output_tokens=100, model=model)


def test_run_catalogue_with_a_stub_model():
    files = {'README.md': '# demo\n\n```\npip install -e .\npython run.py\nbrew install demo\n```\n', 'run.py': "if __name__ == '__main__':\n    print(1)\n"}
    job = {'repo': 'a/b', 'commit': 'c' * 40, 'files': files}
    steps = [{'cmd': 'pip install -e .', 'source': 'README.md:4'}, {'cmd': 'python run.py', 'source': 'README.md:5'}]
    bare = {'summary': 'A demo.', 'routes': [{'routeId': 'run_it', 'title': 'Run the demo and see it print', 'description': 'It prints a line.', 'resultKind': 'stdout', 'practical': True, 'effort': QUICK, 'stepsSketch': steps}]}
    full = copy.deepcopy(bare)
    full['routes'][0]['requirements'] = {'language': 'python', 'docker': False, 'gpu': False, 'downloadGB': 0}
    model = StubModel(bare, full)
    doc, calls = cat.run_catalogue(job, model)
    assert len(calls) == 2 and 'routes without requirements: run_it' in model.seen[1][-1]['content']
    assert [(r['routeId'], r['practical'], r.get('recommended')) for r in doc['routes']] == [('run_it', True, True), ('brew_main', False, None)]  # brew was found by the rules, not the model
    assert contracts.errors('catalogue', doc) == []
