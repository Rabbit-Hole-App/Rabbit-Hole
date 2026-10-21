import importlib.util
import math
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
        # The axis travels with a size result, so the card can place its dimension label (cad-dimensions.js).
        self.assertEqual(result[0]['axis'],'x'); self.assertNotIn('axis',result[1])
    def test_unchecked_is_not_pass(self):
        result=module.evaluate(self.facts,[{'kind':'manufacturing_safe','value':1}])
        self.assertEqual(result[0]['status'],'unchecked')
        self.assertFalse(result[0]['passed'])
    def test_nonfinite_rejected(self):
        self.assertEqual(module.evaluate(self.facts,[{'kind':'solid_count','value':float('nan')}])[0]['status'],'unchecked')
    def test_scanner_expected_arithmetic_preserves_independent_validation(self):
        # Recorded production facts, also independently verified from the saved
        # handwritten fixture STEP. Neither geometry nor tolerance is changed.
        facts = {'bounds_mm': {'x':160,'y':120,'z':8}, 'solid_count':1,
                 'volume_mm3':82691.06199011843, 'circular_diameters_mm':[4.5]}
        checks = [{'kind':'bounds_mm','axis':axis,'value':value,'tolerance':0.01}
                  for axis,value in [('x',160),('y',120),('z',8)]]
        checks += [{'kind':'solid_count','value':1,'tolerance':0},
                   {'kind':'circular_diameter_mm','value':4.5,'tolerance':0.01}]
        original = {'kind':'volume_mm3','value':69172.2,'tolerance':150}
        before = module.evaluate(facts, checks + [original])
        self.assertEqual([item['passed'] for item in before], [True]*5 + [False])
        expected = (160*120-110*80)*8-4*math.pi*(4.5/2)*(4.5/2)*8
        after = module.evaluate(facts, checks + [{**original, 'value':expected}])
        self.assertEqual([item['passed'] for item in after], [True]*6)
        self.assertEqual(after[-1]['tolerance'], before[-1]['tolerance'])
        self.assertEqual(after[-1]['actual'], before[-1]['actual'])
if __name__ == '__main__': unittest.main()
