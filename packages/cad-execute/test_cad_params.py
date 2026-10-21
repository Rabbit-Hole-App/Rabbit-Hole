import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RUNTIME = Path(__file__).with_name('runtime')


def run(source, values):
    job = Path(tempfile.mkdtemp())
    (job / 'in').mkdir(); (job / 'out').mkdir()
    if values is not None:
        (job / 'in' / 'parameters.json').write_text(json.dumps({'schema': 'cad-param-values/1', 'values': values}))
    (job / 'in' / 'model.py').write_text(source)
    env = {**os.environ, 'PYTHONPATH': str(RUNTIME), 'CAD_JOB_DIR': str(job)}
    result = subprocess.run([sys.executable, str(job / 'in' / 'model.py')], env=env, capture_output=True, text=True)
    report = job / 'out' / 'controls.json'
    return result, json.loads(report.read_text()) if report.exists() else None


class CadParamsTests(unittest.TestCase):
    def test_reads_are_recorded_and_computed_values_reported(self):
        result, report = run("from cad_params import value, computed\nw = value('width')\nvalue('width')\ncomputed('half', w / 2)\n", {'width': 30, 'unused': 1})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report, {'read': ['width'], 'computed': {'half': 15.0}})

    def test_unknown_parameter_fails_the_build(self):
        result, _ = run("from cad_params import value\nvalue('missing')\n", {'width': 30})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CAD parameter 'missing' was not supplied", result.stderr)

    def test_legacy_job_without_values_cannot_read(self):
        result, _ = run("from cad_params import value\nvalue('width')\n", None)
        self.assertNotEqual(result.returncode, 0)

    def test_computed_values_must_be_finite_numbers(self):
        for bad in ("float('nan')", "'12'", 'True'):
            result, _ = run(f"from cad_params import computed\ncomputed('x', {bad})\n", {})
            self.assertNotEqual(result.returncode, 0, bad)


if __name__ == '__main__':
    unittest.main()
