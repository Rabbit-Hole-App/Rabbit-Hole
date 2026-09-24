"""Authoring-time numbers for the depth ladder's tokenization cards.

All three depths share one example: the start of line 2 of Tiny Shakespeare, "Before we
proceed any further", as NanoGPT's two data pipelines tokenize it (the base
fixture already records those IDs). This script adds what the base fixture
does not hold, each read from or run against the pinned sources:

  * the full 65-character vocabulary, rebuilt as data/shakespeare_char/
    prepare.py does (sorted(set(data))) - the Guided card's lookup table;
  * the whole-text sizes: characters, prepare.py's 90/10 split by position,
    and the same split encoded with tiktoken "gpt2" as data/shakespeare/
    prepare.py does - checked against the sizes both files print in their
    closing comments;
  * train.py's from-scratch fallback vocab_size (parsed from its source line)
    and GPTConfig's default, checked to be GPT-2's 50257 padded to 64;
  * the uint16 bound both prepare.py files store IDs with;
  * sample.py's two encoders run on two prompts: the dataset line, and
    "Sonnet 18", whose digits 1 and 8 never occur in Tiny Shakespeare - the
    character encoder raises KeyError, GPT-2's byte-level BPE encodes it.

No randomness and no model run.

Regenerate:   uv run --with tiktoken==0.14.0 python gen_tokenization.py
Verify only:  uv run --with tiktoken==0.14.0 python gen_tokenization.py --check
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'fixtures'))
import generate_fixtures as base  # noqa: E402

# generate_fixtures pins neither file, so they are pinned here.
SAMPLE_SHA = '1c4bb3716ec55395be2e6ad136693614b0b38de9defda889041efe2057a0c1f1'
BPE_PREPARE_SHA = 'f8d47267f00963138314bb969e75071211bf1140c248bf31b9e60e7750027f06'
OUT = os.path.join(HERE, 'tokenization.generated.js')
LINE = 'Before we proceed any further'  # the start of line 2 of the dataset, the base fixture's example
PROMPT = 'Sonnet 18'                     # a new prompt: digits the play never uses


def pinned(path, sha):
    url = f'https://raw.githubusercontent.com/{base.NANOGPT_REPO}/{base.NANOGPT_SHA}/{path}'
    return base.fetch(url, sha).decode('utf-8')


def require(src, snippet, where):
    """The line this script replicates must still be in the pinned source."""
    if snippet not in src:
        sys.exit(f'{where} does not contain {snippet!r} - re-check the tokenization cards')


def comment_count(src, pattern, where):
    match = re.search(pattern, src)
    if not match:
        sys.exit(f'{where}: no match for {pattern!r}')
    return int(match.group(1).replace(',', ''))


def gpt2():
    try:
        import tiktoken
        from importlib.metadata import version
    except ImportError:
        sys.exit(f'tiktoken missing - run: uv run --with tiktoken=={base.TIKTOKEN_VERSION} python gen_tokenization.py')
    if version('tiktoken') != base.TIKTOKEN_VERSION:
        sys.exit(f'tiktoken {version("tiktoken")} found; this fixture pins {base.TIKTOKEN_VERSION}')
    return tiktoken.get_encoding('gpt2')


def build():
    text = base.fetch(base.DATASET_URL, base.DATASET_SHA).decode('utf-8')
    train_src = base.nanogpt('train.py')
    model_src = base.nanogpt('model.py')
    char_prep = base.nanogpt('data/shakespeare_char/prepare.py')
    bpe_prep = pinned('data/shakespeare/prepare.py', BPE_PREPARE_SHA)
    sample_src = pinned('sample.py', SAMPLE_SHA)
    for snippet in ('chars = sorted(list(set(data)))', 'stoi = { ch:i for i,ch in enumerate(chars) }',
                    'train_data = data[:int(n*0.9)]', 'val_data = data[int(n*0.9):]',
                    'train_ids = np.array(train_ids, dtype=np.uint16)'):
        require(char_prep, snippet, 'data/shakespeare_char/prepare.py')
    for snippet in ('enc = tiktoken.get_encoding("gpt2")', 'train_ids = enc.encode_ordinary(train_data)',
                    'val_ids = enc.encode_ordinary(val_data)', 'train_data = data[:int(n*0.9)]',
                    'train_ids = np.array(train_ids, dtype=np.uint16)'):
        require(bpe_prep, snippet, 'data/shakespeare/prepare.py')
    require(sample_src, 'encode = lambda s: [stoi[c] for c in s]', 'sample.py')
    require(sample_src, 'encode = lambda s: enc.encode(s, allowed_special={"<|endoftext|>"})', 'sample.py')
    require(train_src, "dtype=np.uint16, mode='r')", 'train.py')

    enc = gpt2()
    fallback = comment_count(train_src, r"model_args\['vocab_size'\] = meta_vocab_size if meta_vocab_size is not None else (\d+)", 'train.py')
    config_default = comment_count(model_src, r'vocab_size: int = (\d+)', 'model.py')
    assert fallback == config_default == math.ceil(enc.n_vocab / 64) * 64, (fallback, config_default, enc.n_vocab)

    chars = sorted(list(set(text)))  # prepare.py, verbatim logic
    stoi = {ch: i for i, ch in enumerate(chars)}
    n = len(text)
    train_data, val_data = text[:int(n * 0.9)], text[int(n * 0.9):]
    bpe_train, bpe_val = len(enc.encode_ordinary(train_data)), len(enc.encode_ordinary(val_data))
    # Both prepare.py files print these sizes in their closing comments.
    assert len(train_data) == comment_count(char_prep, r'# train has ([\d,]+) tokens', 'char prepare.py')
    assert len(val_data) == comment_count(char_prep, r'# val has ([\d,]+) tokens', 'char prepare.py')
    assert bpe_train == comment_count(bpe_prep, r'# train\.bin has ([\d,]+) tokens', 'bpe prepare.py')
    assert bpe_val == comment_count(bpe_prep, r'# val\.bin has ([\d,]+) tokens', 'bpe prepare.py')
    uint16_max = 2 ** 16 - 1  # np.uint16's largest value
    assert len(chars) - 1 <= uint16_max and enc.n_vocab - 1 <= uint16_max

    def char_encode(s):
        # sample.py's character encoder, run: the first unknown character raises.
        try:
            return {'ids': [stoi[c] for c in s]}
        except KeyError as error:
            missing = error.args[0]
            at = s.index(missing)
            return {'error': f'KeyError: {missing!r}', 'missing': missing, 'at': at, 'ids': [stoi[c] for c in s[:at]]}

    def bpe_encode(s):
        ids = enc.encode(s, allowed_special={'<|endoftext|>'})  # sample.py's GPT-2 encoder
        return {'ids': ids, 'tokens': [enc.decode([i]) for i in ids]}

    assert LINE in text
    return {
        'provenance': {'nanogpt': f'{base.NANOGPT_REPO}@{base.NANOGPT_SHA}', 'samplePySha256': SAMPLE_SHA,
                       'bpePreparePySha256': BPE_PREPARE_SHA, 'dataset': base.DATASET_SHA,
                       'tiktoken': base.TIKTOKEN_VERSION, 'generator': 'gen_tokenization.py'},
        'vocab': chars,
        'digits': [d for d in '0123456789' if d in stoi],
        'chars': {'total': n, 'train': len(train_data), 'val': len(val_data)},
        'bpe': {'vocab': enc.n_vocab, 'train': bpe_train, 'val': bpe_val, 'total': bpe_train + bpe_val,
                'charsPerId': base.r(n / (bpe_train + bpe_val), 2)},
        'vocabFallback': fallback,
        'uint16Max': uint16_max,
        'prompts': [{'id': pid, 'text': s, 'char': char_encode(s), 'bpe': bpe_encode(s)}
                    for pid, s in (('line', LINE), ('digits', PROMPT))],
    }


def render(data):
    header = ('// GENERATED by gen_tokenization.py - do not edit by hand.\n'
              '// Regenerate: uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_tokenization.py\n'
              '// Read from / run against the pinned NanoGPT sources, Tiny Shakespeare and\n'
              '// tiktoken "gpt2" - see the script.\n')
    return header + 'export default ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n'


if __name__ == '__main__':
    out = render(build())
    if '--check' in sys.argv:
        current = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if current != out:
            sys.exit('tokenization fixture is STALE or edited by hand - regenerate it')
        print('tokenization fixture matches a fresh regeneration')
    else:
        with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(out)
        print(f'wrote {OUT}')
