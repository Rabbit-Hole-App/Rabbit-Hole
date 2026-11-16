"""Unit tests of the learn call (catalogue.learn_clean, add_learn, catalogue_with_learn): the enforced rules and the additive merge. No model, no Modal, no network.
Run from this directory: python -m pytest test_catalogue_learn.py"""
import copy
import json
import re
from pathlib import Path

import catalogue as cat
import contracts
from model import ModelReply

FILES = {'README.md': '# demo\n\n```\npip install -e .\npython run.py\n```\n', 'run.py': "if __name__ == '__main__':\n    print(1)\n", 'lib/core.py': 'x = 1\n', 'lib/data.py': 'y = 2\n',
         'docs/guide.md': '# guide\n', 'docs/extra.md': '# extra\n', 'tests/test_core.py': 'def test_x():\n    pass\n'}
PATHS = set(FILES)
JOB = {'repo': 'a/b', 'commit': 'c' * 40, 'files': FILES, 'graphLabels': ['Core', 'load']}


def opt(kind='science', label='How the core works', anchors=('lib/core.py',), **kw):
    return {'id': kind, 'label': label, 'what': 'You would understand the core.', 'anchors': list(anchors), 'kind': kind, **kw}


def clean(options, cannot=()):
    return cat.learn_clean({'options': options, 'cannot': list(cannot)}, PATHS)[0]


def kinds(learn):
    return [o['kind'] for o in learn['options']]


# ---- one case per enforced rule -----------------------------------------------------------------------------------------------------------------

def test_a_good_reply_passes_and_is_ordered_by_kind_priority():
    learn = clean([opt('testing', 'How it is tested', ('tests/test_core.py',)), opt('science'), opt('data', 'How data is held', ('lib/data.py',))],
                  [{'kind': 'deploy', 'thing': 'deployment', 'why': 'there is nothing to deploy'}])
    assert kinds(learn) == ['science', 'data', 'testing'] and learn['cannot'] == [{'kind': 'deploy', 'thing': 'deployment', 'why': 'there is nothing to deploy'}]


def test_at_most_four_options_the_first_four_by_priority():
    learn = clean([opt(k, f'Topic {k}') for k in ('other', 'domain', 'deploy', 'testing', 'structure', 'data')])
    assert kinds(learn) == ['data', 'structure', 'testing', 'deploy']


def test_an_anchor_that_is_not_in_the_snapshot_is_removed_and_an_option_left_with_none_is_dropped():
    learn = clean([opt('science', anchors=('lib/core.py', 'nope/gone.py')), opt('data', 'How data is held', ('nope/gone.py',))])
    assert kinds(learn) == ['science'] and learn['options'][0]['anchors'] == ['lib/core.py']


def test_a_directory_anchor_counts_when_a_file_lives_under_it():
    assert clean([opt('structure', anchors=('lib/', 'lib'))])['options'][0]['anchors'] == ['lib/', 'lib']
    assert cat.learn_clean({'options': [opt('structure', anchors=('missing/',))]}, PATHS)[0] is None


def test_a_label_with_a_path_or_file_name_drops_the_option():
    for label in ('Read lib/core.py', 'What train.py does', 'The `core` module', 'Look at README.md:3'):
        assert cat.learn_clean({'options': [opt(label=label)]}, PATHS)[0] is None, label
    assert clean([opt(label='Make a model learn')])  # a plain verb is not a command


def test_a_label_of_more_than_six_words_drops_the_option():
    assert cat.learn_clean({'options': [opt(label='one two three four five six seven')]}, PATHS)[0] is None
    assert clean([opt(label='one two three four five six')])


def test_a_kind_outside_the_list_drops_the_option():
    assert cat.learn_clean({'options': [opt(kind='magic')]}, PATHS)[0] is None


def test_an_option_whose_anchors_are_all_under_docs_is_dropped_and_one_other_anchor_saves_it():
    learn = clean([opt('structure', anchors=('docs/guide.md', 'docs/extra.md')), opt('science', anchors=('docs/guide.md', 'lib/core.py'))])
    assert kinds(learn) == ['science']


def test_kinds_are_unique_the_first_wins():
    learn = clean([opt('data', 'First data topic', ('lib/data.py',)), opt('data', 'Second data topic', ('lib/core.py',))])
    assert [o['label'] for o in learn['options']] == ['First data topic']


def test_cannot_never_repeats_a_kind_of_the_options_nor_itself_and_is_capped():
    learn = clean([opt('science')], [{'kind': 'science', 'thing': 'maths', 'why': 'x'}, {'kind': 'testing', 'thing': 'tests', 'why': 'there are none'}, {'kind': 'testing', 'thing': 'tests again', 'why': 'x'},
                                      {'kind': 'deploy', 'thing': 'deployment', 'why': 'y'}, {'kind': 'data', 'thing': 'data', 'why': 'z'}, {'kind': 'bogus', 'thing': 't', 'why': 'w'}, {'kind': 'domain', 'thing': ''}])
    assert [c['kind'] for c in learn['cannot']] == ['testing', 'deploy']


def test_a_reply_that_is_not_an_options_list_is_none():
    for raw in (None, [], {}, {'options': 'x'}, {'options': []}, {'options': ['x']}):
        assert cat.learn_clean(raw, PATHS)[0] is None


def test_the_default_is_one_structure_option_from_the_top_level_modules():
    d = cat.learn_default(PATHS)
    assert kinds(d) == ['structure'] and d['options'][0]['label'] == 'How it is organised' and d['options'][0]['anchors'] == ['lib', 'run.py']
    assert cat.learn_default({'README.md'})['options'][0]['anchors'] == ['README.md']


def test_file_roles_come_from_patterns():
    r = cat.file_role
    assert [r(p) for p in ('tests/test_core.py', '.github/workflows/ci.yml', 'Dockerfile', 'docs/a.rst', 'README.md', 'lib/core.py', 'data/x.csv', 'pyproject.toml', 'a.ipynb', 'x.bin')] == \
        ['test', 'ci', 'deploy', 'docs', 'docs', 'source', 'data', 'config', 'notebook', 'data']


def test_the_model_schema_for_routes_does_not_show_learn():
    assert 'learn' not in cat.model_schema()['properties'] and 'learn' in json.loads((contracts.SCHEMAS / 'catalogue.json').read_text(encoding='utf-8'))['properties']


# ---- the call and the additive merge ------------------------------------------------------------------------------------------------------------

class Stub:
    def __init__(self, *replies):
        self.replies, self.seen = list(replies), []

    def complete(self, model, system, messages, tools, max_tokens):
        self.seen.append(messages)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return ModelReply(content=[{'type': 'text', 'text': r if isinstance(r, str) else json.dumps(r)}], input_tokens=1000, output_tokens=200, model=model)


GOOD = {'options': [opt('science'), opt('data', 'How data is held', ('lib/data.py',))], 'cannot': [{'kind': 'deploy', 'thing': 'deployment', 'why': 'nothing is deployed'}]}


def stored_doc():
    steps = [{'cmd': 'pip install -e .', 'source': 'README.md:4'}, {'cmd': 'python run.py', 'source': 'README.md:5'}]
    route = {'routeId': 'run_it', 'title': 'Run the demo and see it print', 'description': 'It prints a line.', 'resultKind': 'stdout', 'practical': True, 'recommended': True, 'effort': 'Quick — just Python',
             'requirements': {'language': 'python'}, 'stepsSketch': steps}
    return {'repo': 'a/b', 'commit': 'c' * 40, 'hardware': 'cpu', 'summary': 'A demo.', 'groups': [{'id': 'main', 'label': 'command-line tool'}], 'routes': [route]}


def test_the_prompt_has_the_readme_the_roles_the_routes_and_no_other_file_text():
    body = json.loads(cat.learn_prompt(JOB, cat.rule_pass(FILES), stored_doc()))
    assert set(body) == {'repo', 'summary', 'readmes', 'fileCounts', 'files', 'routes', 'groups', 'graphLabels'}
    assert body['files']['test'] == ['tests/test_core.py'] and body['fileCounts']['docs'] == 3 and list(body['readmes']) == ['README.md']
    assert 'x = 1' not in json.dumps(body) and body['routes'][0]['title'] == 'Run the demo and see it print'


def test_a_stored_document_without_learn_gets_only_the_learn_call_and_keeps_its_routes():
    stored = stored_doc()
    before = copy.deepcopy(stored)
    model = Stub(GOOD)
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored}, model)
    assert len(calls) == 1 and calls[0]['role'] == 'learn' and len(model.seen) == 1
    assert stored == before  # the stored document itself is not touched
    assert doc['routes'] == before['routes'] and doc['commit'] == before['commit'] and kinds(doc['learn']) == ['science', 'data']
    assert calls[0]['usd'] > 0 and 'modelSpendUsd' not in doc['learn'] and 'usd' not in json.dumps(doc).lower() and contracts.errors('catalogue', doc) == []  # no dollar figure in the document


def test_a_stored_document_that_already_has_learn_makes_no_call():
    stored = stored_doc()
    stored['learn'] = clean([opt('structure')])
    model = Stub()
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored}, model)
    assert calls == [] and doc == stored


def test_a_stored_document_of_another_commit_or_that_is_invalid_is_refused():
    for bad in ({**stored_doc(), 'commit': 'd' * 40}, {'repo': 'a/b'}):
        try:
            cat.catalogue_with_learn({**JOB, 'catalogue': bad}, Stub(GOOD))
        except cat.CatalogueFailed as e:
            assert e.code == 'no_catalogue'
        else:
            raise AssertionError('accepted')


def test_broken_json_is_asked_again_once_then_the_default_option():
    model = Stub('not json', {'options': [opt(kind='magic')]})
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored_doc()}, model)
    assert len(calls) == 2 and 'did not validate' in model.seen[1][-1]['content']
    assert kinds(doc['learn']) == ['structure'] and doc['learn']['cannot'] == [] and contracts.errors('catalogue', doc) == []


def test_the_re_ask_can_repair_the_reply():
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored_doc()}, Stub('not json', GOOD))
    assert len(calls) == 2 and kinds(doc['learn']) == ['science', 'data']


def test_an_option_dropped_for_a_rule_is_asked_for_again_and_the_better_reply_wins():
    long = opt('data', 'one two three four five six seven', ('lib/data.py',))
    model = Stub({'options': [opt('science'), long]}, GOOD)
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored_doc()}, model)
    assert len(calls) == 2 and 'more than 6 words' in model.seen[1][-1]['content'] and kinds(doc['learn']) == ['science', 'data']
    worse = Stub({'options': [opt('science'), long]}, {'options': [long]})  # the re-ask kept nothing: the first reply stands
    doc, calls = cat.catalogue_with_learn({**JOB, 'catalogue': stored_doc()}, worse)
    assert len(calls) == 2 and kinds(doc['learn']) == ['science']


def test_a_failed_learn_call_fails_an_additive_job_but_never_loses_a_fresh_catalogue():
    try:
        cat.catalogue_with_learn({**JOB, 'catalogue': stored_doc()}, Stub(RuntimeError('network')))
    except RuntimeError:
        pass
    else:
        raise AssertionError('swallowed')
    steps = [{'cmd': 'pip install -e .', 'source': 'README.md:4'}, {'cmd': 'python run.py', 'source': 'README.md:5'}]
    routes = {'summary': 'A demo.', 'routes': [{'routeId': 'run_it', 'title': 'Run the demo and see it print', 'description': 'It prints a line.', 'resultKind': 'stdout', 'requirements': {'language': 'python', 'docker': False, 'gpu': False, 'downloadGB': 0},
                                                'stepsSketch': steps}]}
    fresh = {**JOB, 'files': {k: v for k, v in FILES.items() if not k.startswith('tests/')}}  # a test file would be an entry point the stub routes do not run
    doc, calls = cat.catalogue_with_learn(fresh, Stub(routes, RuntimeError('network')))
    assert 'learn' not in doc and len(calls) == 1 and doc['routes'][0]['routeId'] == 'run_it'
    doc, calls = cat.catalogue_with_learn(fresh, Stub(routes, GOOD))
    assert [c['role'] for c in calls] == ['catalogue', 'learn'] and kinds(doc['learn']) == ['science', 'data'] and contracts.errors('catalogue', doc) == []


def test_catalogue_py_names_no_repository():
    text = (Path(__file__).parent / 'catalogue.py').read_text(encoding='utf-8')
    assert not re.search(r'nanoGPT|datasette|shakespeare', text, re.I)
