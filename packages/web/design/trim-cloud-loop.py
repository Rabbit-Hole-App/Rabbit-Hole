"""Trim the existing animation's white bookends; never draw or retouch artwork.

The original visible section already runs forward and backward. Frame 12 is
duplicated at 13, and its return at 96 is duplicated at 97. Keep 13..96 so the
loop turnaround retains the original two-frame hold instead of doubling it.
Every exported frame is checked against the original on the page's white
background, including its duration. Pillow may combine identical held frames.
"""
from pathlib import Path
from PIL import Image, ImageChops
import hashlib
import json

root = Path(__file__).resolve().parents[3]
source = root / 'packages/web/public/landing/typesafe-pink-cloud.gif'
output = source.with_name('typesafe-pink-cloud-loop.gif')


def displayed(frame):
    white = Image.new('RGBA', frame.size, 'white')
    white.alpha_composite(frame.convert('RGBA'))
    return white.convert('RGB')


frames, durations, expected = [], [], []
with Image.open(source) as original:
    for index in range(13, 97):
        original.seek(index)
        rgb = displayed(original)
        indexed = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE)
        assert ImageChops.difference(rgb, indexed.convert('RGB')).getbbox() is None
        duration = original.info['duration']
        frames.append(indexed)
        durations.append(duration)
        digest = hashlib.sha256(rgb.tobytes()).hexdigest()
        if expected and expected[-1]['sha256'] == digest:
            expected[-1]['duration_ms'] += duration
        else:
            expected.append({'sha256': digest, 'duration_ms': duration})

frames[0].save(output, save_all=True, append_images=frames[1:],
               duration=durations, loop=0, disposal=2, optimize=False)

actual = []
with Image.open(output) as loop:
    assert loop.info.get('loop') == 0
    for index in range(loop.n_frames):
        loop.seek(index)
        rgb = displayed(loop)
        actual.append({'sha256': hashlib.sha256(rgb.tobytes()).hexdigest(),
                       'duration_ms': loop.info['duration']})
    assert actual == expected, 'Export changed a frame or its original timing'
    assert actual[0]['sha256'] == actual[-1]['sha256'], 'Loop seam differs'

report = {
    'source': str(source.relative_to(root)).replace('\\', '/'),
    'output': str(output.relative_to(root)).replace('\\', '/'),
    'source_frames_zero_based_inclusive': [13, 96],
    'duration_ms': sum(durations),
    'exported_frames': len(actual),
    'source_logical_frames': len(frames),
    'all_frames_pixel_identical_to_source_on_white': True,
    'original_frame_timing_preserved': True,
    'first_and_last_frame_pixel_identical': True,
    'loop_forever': True,
    'removed': 'White opening/closing holds and their transition frames only',
    'no_generated_center_or_static_base': True,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
}
report_file = Path(__file__).with_name('cloud-loop-verification.json')
report_file.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
