import copy
import json
import unittest
from pathlib import Path
from validation import validate

class SceneValidation(unittest.TestCase):
    def setUp(self): self.scene = json.loads(Path(__file__).with_name('example-scene.json').read_text())
    def test_example(self): self.assertEqual(validate(self.scene)['duration'], 2)
    def test_no_code_or_external_assets(self):
        for key in ('script', 'python', 'modelUrl'):
            data = copy.deepcopy(self.scene); data[key] = 'anything'
            with self.assertRaises(ValueError): validate(data)
    def test_bounds(self):
        for duration in (0, 11, float('inf'), True):
            data = copy.deepcopy(self.scene); data['duration'] = duration
            with self.assertRaises(ValueError): validate(data)
    def test_cycles_and_channels(self):
        self.scene['scene']['objects'][0]['parent'] = 'frustum'
        with self.assertRaises(ValueError): validate(self.scene)
        del self.scene['scene']['objects'][0]['parent']
        self.scene['scene']['animations'] *= 2
        with self.assertRaises(ValueError): validate(self.scene)

if __name__ == '__main__': unittest.main()
