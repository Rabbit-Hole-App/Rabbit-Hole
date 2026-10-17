import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('cad_validation', Path(__file__).with_name('validate.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.facts = {'bounds_mm': {'x':40,'y':20,'z':6}, 'solid_count':1, 'volume_mm3':4800, 'circular_diameters_mm':[3,6]}
    def test_dimensions(self):
        result=module.evaluate(self.facts,[{'kind':'bounds_mm','axis':'x','value':40},{'kind':'solid_count','value':2}])
        self.assertEqual([r['passed'] for r in result],[True,False])
    def test_unchecked_is_not_pass(self):
        result=module.evaluate(self.facts,[{'kind':'manufacturing_safe','value':1}])
        self.assertEqual(result[0]['status'],'unchecked')
        self.assertFalse(result[0]['passed'])
    def test_nonfinite_rejected(self):
        self.assertEqual(module.evaluate(self.facts,[{'kind':'solid_count','value':float('nan')}])[0]['status'],'unchecked')
if __name__ == '__main__': unittest.main()
