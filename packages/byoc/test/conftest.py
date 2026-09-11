import sys
from pathlib import Path

# Lambda packages inline these shared helpers; local tests import the same module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
