// packages/web/src/notebook-runtime.js
// What the canvas notebook can import today (learn-section-make-spec.md section 3d; DECISIONS Q; CONTRACT.md "Notebook runtime list"): the notebook site runs
// jupyterlite-pyodide-kernel 0.8.6 (packages/web/notebook/requirements.txt), which loads Pyodide 314.0.6 (Python 3.14). The site publishes no package list of its own,
// so this is the Pyodide list as data: Python's standard library less what Pyodide leaves out (tkinter, turtle, curses, idlelib, ensurepip, venv), plus every
// importable top-level name of the packages in https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide-lock.json (read 2026-11-16), plus pyodide's own modules.
// A limitation of today, not a rule: when the runtime grows, this list grows and nothing else changes. Pure: the control plane's notebook validator imports it too.
// shortcut: the standard library names are CPython 3.13's sys.stdlib_module_names plus 3.14's annotationlib and compression; regenerate from the lock file when the kernel is upgraded.

export const RUNTIME_PACKAGES = Object.freeze([
  '__future__', '_argon2_cffi_bindings', '_distutils_hack', '_pyrsistent_version', '_pytest', '_yaml', '_zengl', 'abc', 'affine', 'aiohappyeyeballs', 'aiohttp',
  'aiosignal', 'altair', 'annotated_doc', 'annotated_types', 'annotationlib', 'antigravity', 'anyio', 'argon2', 'argparse', 'array', 'ast', 'astropy', 'astropy_iers_data',
  'asttokens', 'async_timeout', 'asyncio', 'atexit', 'atomicwrites', 'attr', 'attrs', 'audioop', 'b2d', 'base64', 'bcrypt', 'bdb', 'bigtests', 'bilby_cython', 'binascii',
  'Bio', 'BioSQL', 'bisect', 'bitarray', 'bitstring', 'bleach', 'bokeh', 'boost_histogram', 'bottleneck', 'brotli', 'bs4', 'builtins', 'bz2', 'cachetools', 'calendar',
  'cartopy', 'casadi', 'cbor_diag', 'certifi', 'cffi', 'cffi_example', 'cftime', 'charset_normalizer', 'clarabel', 'click', 'cligj', 'clingo', 'cloudpickle', 'cmath',
  'cmd', 'cmyt', 'cobs', 'code', 'codecs', 'codeop', 'collections', 'colorspacious', 'colorsys', 'compileall', 'compression', 'concurrent', 'configparser', 'contextlib',
  'contextvars', 'contourpy', 'CoolProp', 'copy', 'copyreg', 'coverage', 'cProfile', 'crc32c', 'crcmod', 'Crypto', 'cryptography', 'cssselect', 'csv', 'ctypes', 'cv2',
  'cvxpy', 'cycler', 'cysignals', 'cytoolz', 'dataclasses', 'datetime', 'dateutil', 'dbm', 'decimal', 'decorator', 'demes', 'deprecated', 'deprecation', 'difflib', 'dis',
  'diskcache', 'distlib', 'distro', 'dns', 'doctest', 'docutils', 'donfig', 'duckdb', 'email', 'encodings', 'enum', 'erfa', 'errno', 'ewah_bool_utils', 'exceptiongroup',
  'executing', 'fastapi', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fiona', 'fitz', 'flirt', 'fnmatch', 'fontTools', 'fractions', 'freesasa', 'frozenlist',
  'fsspec', 'ftplib', 'functools', 'future', 'galpy', 'gc', 'genericpath', 'geopandas', 'getopt', 'getpass', 'gettext', 'glob', 'gmpy2', 'google', 'google_crc32c',
  'graphlib', 'gridfs', 'grp', 'gzip', 'h11', 'h3', 'h5py', 'hashlib', 'healpy', 'heapq', 'highspy', 'hmac', 'html', 'html5lib', 'http', 'httpcore', 'httpx', 'idna',
  'igraph', 'imageio', 'imaplib', 'iminuit', 'importlib', 'iniconfig', 'inspect', 'InSpice', 'io', 'ipaddress', 'IPython', 'isympy', 'itertools', 'jedi', 'jinja2',
  'jiter', 'joblib', 'js', 'json', 'jsonpatch', 'jsonpointer', 'jsonschema', 'jsonschema_specifications', 'keyword', 'kiwisolver', 'lakers', 'lazy_loader',
  'lazy_object_proxy', 'libcst', 'librt', 'lightgbm', 'linecache', 'locale', 'logbook', 'logging', 'lxml', 'lz4', 'lzma', 'mailbox', 'markupsafe', 'marshal', 'math',
  'matplotlib', 'memory_allocator', 'micropip', 'mimetypes', 'ml_dtypes', 'mmap', 'mmh3', 'modulefinder', 'more_itertools', 'mpl_toolkits', 'mpmath', 'msgpack', 'msgspec',
  'msprime', 'multidict', 'multiprocessing', 'munch', 'mypy', 'mypyc', 'MySQLdb', 'nacl', 'narwhals', 'ndindex', 'netCDF4', 'netrc', 'networkx', 'newick', 'nh3', 'nlopt',
  'nltk', 'ntpath', 'nturl2path', 'numbers', 'numcodecs', 'numpy', 'opcode', 'openai', 'operator', 'optlang', 'optparse', 'orjson', 'os', 'packaging', 'pandas', 'parso',
  'pathlib', 'patsy', 'pcodec', 'pdb', 'peewee', 'PhiSpyModules', 'PhiSpyRepeatFinder', 'pi_heif', 'pickle', 'pickletools', 'PIL', 'pillow_heif', 'pkgconfig', 'pkgutil',
  'platform', 'platformdirs', 'plistlib', 'pluggy', 'ply', 'polars', 'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'prompt_toolkit', 'propcache', 'pstats',
  'psycopg', 'psycopg_c', 'pty', 'pure_eval', 'pwd', 'py', 'py_compile', 'pyarrow', 'pyclbr', 'pyclipper', 'pycparser', 'pydantic', 'pydantic_core', 'pydoc', 'pydoc_data',
  'pyexpat', 'pygame', 'pygments', 'pyheif', 'pyiceberg', 'pyinstrument', 'pylab', 'pymongo', 'pymupdf', 'pyodide', 'pyodide_http', 'pyodide_js', 'pyparsing', 'pyproj',
  'pyroaring', 'pyrodigal', 'pyrsistent', 'pysam', 'pysat', 'pytest', 'pytest_asyncio', 'pytest_benchmark', 'pytest_httpx', 'python_calamine', 'python_solvespace', 'pytz',
  'pywt', 'pyxirr', 'queue', 'quopri', 'random', 'rasterio', 'rateslib', 're', 'readline', 'rebound', 'reboundx', 'referencing', 'regex', 'reprlib', 'requests',
  'resource', 'retrying', 'rich', 'rlcompleter', 'rpds', 'ruamel', 'runpy', 'safetensors', 'sched', 'scipy', 'screed', 'secrets', 'select', 'selectors', 'sentencepiece',
  'setuptools', 'shapefile', 'shapely', 'shelve', 'shlex', 'shutil', 'signal', 'simplejson', 'sisl', 'sisl_toolbox', 'site', 'six', 'skimage', 'sklearn', 'smart_open',
  'smtplib', 'sniffio', 'socket', 'socketserver', 'sortedcontainers', 'soundfile', 'soupsieve', 'sourmash', 'soxr', 'sparseqr', 'sqlalchemy', 'sqlite3', 'sre_compile',
  'sre_constants', 'sre_parse', 'ssl', 'stack_data', 'starlette', 'stat', 'statistics', 'statsmodels', 'strictyaml', 'string', 'stringprep', 'struct', 'subprocess',
  'svgwrite', 'swiglpk', 'sympy', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny', 'taglib', 'tarfile', 'tblib', 'tempfile', 'termcolor', 'termios', 'texttable',
  'texture2ddecoder', 'textwrap', 'this', 'threading', 'threadpoolctl', 'tiktoken', 'tiktoken_ext', 'time', 'timeit', 'tlz', 'token', 'tokenize', 'tomli', 'tomli_w',
  'tomllib', 'toolz', 'tqdm', 'trace', 'traceback', 'tracemalloc', 'traitlets', 'traits', 'tree_sitter', 'tree_sitter_go', 'tree_sitter_java', 'tree_sitter_python',
  'tskit', 'tty', 'types', 'typing', 'typing_extensions', 'typing_inspection', 'tzdata', 'ujson', 'uncertainties', 'unicodedata', 'unittest', 'unix_timezones', 'unyt',
  'urllib', 'urllib3', 'uuid', 'vega_datasets', 'vrplib', 'warnings', 'wave', 'wcwidth', 'weakref', 'webbrowser', 'webencodings', 'wordcloud', 'wrapt', 'wsgiref',
  'xarray', 'xgboost', 'xlrd', 'xml', 'xmlrpc', 'xxhash', 'xyzservices', 'yaml', 'yarl', 'yt', 'zarr', 'zengl', 'zfpy', 'zipapp', 'zipfile', 'zipimport', 'zlib',
  'zoneinfo', 'zstandard'
]);
const KNOWN = new Set(RUNTIME_PACKAGES);

// Strings and comments are not code: their text is blanked (quotes kept) before imports are read. Triple-quoted strings first.
const blank = text => text.replace(/("""|''')[\s\S]*?\1|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, quoted => quoted.slice(0, 1) + quoted.slice(-1)).replace(/#[^\n]*/g, '');

// A cell's or file's code -> the top-level modules it imports that the runtime does not have, in order of first use, each once. Relative imports, __future__ and the
// workspace's own modules (`local`: module names of the card's .py files, e.g. ['helpers']) are not packages.
export function unavailableImports(code, { local = [] } = {}) {
  const own = new Set(local), out = [];
  const add = name => { const top = String(name || '').trim().split('.')[0]; if (/^[A-Za-z_]\w*$/.test(top) && !KNOWN.has(top) && !own.has(top) && !out.includes(top)) out.push(top); };
  const text = blank(String(code ?? '').replace(/\r\n?/g, '\n'))
    .replace(/\\\n/g, ' ') // a backslash continuation joins its line
    .replace(/\(([^()]*)\)/g, (_, inner) => `(${inner.replace(/\n/g, ' ')})`); // a parenthesised import list over several lines
  for (const raw of text.split('\n')) {
    for (const statement of raw.split(';')) {
      const line = statement.trim();
      let match = /^from\s+([\w.]+)\s+import\b/.exec(line);
      if (match) { if (!match[1].startsWith('.')) add(match[1]); continue; }
      match = /^import\s+(.+)$/.exec(line);
      if (match) for (const part of match[1].replace(/[()]/g, '').split(',')) add(part.trim().split(/\s+as\s+/)[0]);
    }
  }
  return out;
}
