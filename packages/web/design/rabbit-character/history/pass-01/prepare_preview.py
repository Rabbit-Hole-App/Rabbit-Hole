"""Prepare the approved-scope run candidate; no model calls or runtime changes.

Run from any directory: python packages/web/design/rabbit-character/prepare_preview.py
Source poses are generated together. Registration uses measured anatomical
landmarks, a single scale, and one floor, never independent bounding-box fitting.
"""

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SIZE, LOGICAL, SCALE, FLOOR = 512, 256, 0.75, 408
BAYER = [(v + 0.5) / 16 for v in
         [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]]
# Pupil x is the same rigid head landmark in each source cell. Subtracting a
# constant head-to-root offset registers the body without following ear/foot bounds.
EYE_X = [321, 780, 1198, 1642, 309, 772, 1203, 1657]
BEATS = ["01 / Contact", "02 / Compression", "03 / Push + pass", "04 / Flight",
         "05 / Contact", "06 / Compression", "07 / Push + pass", "08 / Flight"]
SOURCE = ROOT / "generated/run-source-sheet.png"


def dither(image, standing=False):
    coverage = []
    for q, (r, g, b, a) in enumerate(image.get_flattened_data()):
        x, y = q % LOGICAL, q // LOGICAL
        lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
        white_at = 0.94 if standing else 0.88
        c = max(0, (white_at - lum) / (white_at - 0.25)) * a / 255 if a > 128 else 0
        # Grayscale generation retains coat shading removed by the original blue
        # key; a shared coverage curve restores its light ink/paper balance.
        c = min(1, c) ** 1.3
        # The existing page lifts pale ear and paw ink before the Bayer pass.
        ear_span = 60 < x < 190 and y < 68 if standing else 60 < x < 162 and y < 106
        if c > 0.03 and ear_span:
            c = c * 1.45 + 0.10
        if not standing and c > 0.02 and 72 < x < 137 and 67 < y < 100:
            c = c * 1.35 + 0.08
        if c > 0.02 and y > 176:
            c = c * 1.7 + 0.10
        coverage.append(min(1, c))

    # Same two-pixel bridge and largest 8-connected figure cleanup as the page.
    mask = Image.new("L", image.size)
    mask.putdata([255 if c > 0.12 else 0 for c in coverage])
    grown = bytearray(mask.filter(ImageFilter.MaxFilter(5)).tobytes())
    largest = []
    for start in range(len(grown)):
        if not grown[start]:
            continue
        grown[start] = 0
        todo, component = deque([start]), []
        while todo:
            q = todo.popleft()
            component.append(q)
            x, y = q % LOGICAL, q // LOGICAL
            for ny in range(max(0, y - 1), min(LOGICAL, y + 2)):
                for nx in range(max(0, x - 1), min(LOGICAL, x + 2)):
                    n = ny * LOGICAL + nx
                    if grown[n]:
                        grown[n] = 0
                        todo.append(n)
        if len(component) > len(largest):
            largest = component
    connected = set(largest)
    pixels = []
    for q, c in enumerate(coverage):
        x, y = q % LOGICAL, q // LOGICAL
        on = q in connected and c > BAYER[(y & 3) * 4 + (x & 3)]
        pixels.append((10, 10, 10, 255) if on else (0, 0, 0, 0))
    result = Image.new("RGBA", image.size)
    result.putdata(pixels)
    return result.resize((SIZE, SIZE), Image.Resampling.NEAREST)


def paper(image):
    result = Image.new("RGBA", image.size, "white")
    result.alpha_composite(image)
    return result.convert("RGB")


def contact(images, labels, columns, path):
    rows = (len(images) + columns - 1) // columns
    canvas = Image.new("RGB", (columns * SIZE, rows * (SIZE + 40)), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=16)
    for i, (frame, label) in enumerate(zip(images, labels)):
        x, y = (i % columns) * SIZE, (i // columns) * (SIZE + 40)
        canvas.paste(paper(frame), (x, y))
        draw.text((x + 24, y + SIZE + 8), label, fill="#555555", font=font)
    canvas.save(path)


def main():
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1774, 887):
        raise ValueError("Source changed: remeasure registration before preparing frames.")
    frames, registration, raw_cells = [], [], []
    frame_dir = ROOT / "animations/run_right/frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for i, eye_x in enumerate(EYE_X):
        col, row = i % 4, i // 4
        left, top = round(col * source.width / 4), round(row * source.height / 2)
        right, bottom = round((col + 1) * source.width / 4), round((row + 1) * source.height / 2)
        cell = source.crop((left, top, right, bottom))
        raw_cells.append(cell)
        offset_x = 336 - (eye_x - left) * SCALE
        # The top source row's stance floor is two output pixels lower than the
        # bottom row. Correct the shared row origin, retaining every pose's bob.
        offset_y = FLOOR - 416 * SCALE - (2 if row == 0 else 0)
        # Resample one shared anatomical scale. Airborne feet stay airborne.
        logical = cell.transform((LOGICAL, LOGICAL), Image.Transform.AFFINE,
                                 (2 / SCALE, 0, -offset_x / SCALE,
                                  0, 2 / SCALE, -offset_y / SCALE),
                                 resample=Image.Resampling.BICUBIC)
        frame = dither(logical)
        frame.save(frame_dir / f"{i + 1:02d}.png")
        frames.append(frame)
        registration.append({"frame": i + 1, "source_cell": [left, top, right, bottom],
                             "source_pupil_x": eye_x - left,
                             "offset": [offset_x, offset_y], "ink_bounds": frame.getbbox()})

    strip = Image.new("RGBA", (SIZE * 8, SIZE))
    for i, frame in enumerate(frames):
        strip.alpha_composite(frame, (i * SIZE, 0))
    strip.save(ROOT / "run-strip.png")
    raw_strip = Image.new("RGBA", (444 * 8, 444))
    for i, cell in enumerate(raw_cells):
        raw_strip.alpha_composite(cell, (i * 444, 0))
    raw_strip.save(ROOT / "generated/run-strip-source.png")

    contact(frames, BEATS, 4, ROOT / "contact-sheet.png")
    seed = Image.open(ROOT / "character-seed.png").convert("RGBA")
    contact([seed, frames[0], frames[3], frames[7]],
            ["Original mascot / exact seed", "Run / first (01)", "Run / middle (04)", "Run / final (08)"],
            4, ROOT / "identity-comparison.png")
    gif_frames = [paper(frame) for frame in frames]
    durations = [80, 70, 80, 80, 70, 80, 80, 80]
    gif_frames[0].save(ROOT / "run-preview.gif", save_all=True, append_images=gif_frames[1:],
                       duration=durations, loop=0, disposal=2, optimize=False)
    frames[0].save(ROOT / "run-preview.webp", save_all=True, append_images=frames[1:],
                   duration=77, loop=0, lossless=True, exact=True, method=6)

    manifest = {"schema_version": 1, "character": "rabbit-hole-mascot",
                "status": "candidate pending user visual approval", "frame_count": 8,
                "frame_size": [SIZE, SIZE], "facing": "right", "loop": True,
                "target_fps": 13, "gif_durations_ms": durations, "webp_frame_duration_ms": 77,
                "baseline_y": FLOOR, "anchor_px": [256, FLOOR], "shared_source_scale": SCALE,
                "source_row_offset_y": [94, 96],
                "allowed_directions": ["front", "back", "left", "right"],
                "optional_directions": ["front_left", "front_right", "back_left", "back_right"],
                "mirror_allowed": False,
                "clips": {"run_right": {"action": "run", "facing": "right", "fps": 13,
                                         "sheet": "run-strip.png", "frames": "animations/run_right/frames",
                                         "frame_count": 8, "loop": True, "approved": False}},
                "canonical_reference": "../rabbit-sprite.png, first 240 x 168 frame",
                "underlying_reference": "../rabbit_1.jpg", "seed_redrawn": False,
                "source_generated_together": True, "source_layout": "4 columns x 2 rows",
                "runtime_layout": "8 columns x 1 row", "generator": "built-in image_gen through ChatGPT",
                "upstream_sprite_pipeline_commit": "1dc195897af4161d039b80d8471ec0a10c9bbc89",
                "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "registration": registration}
    if (ROOT / "manifest.json").exists():
        prior = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        if "turnaround" in prior:
            manifest["turnaround"] = prior["turnaround"]
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"saved": str(ROOT), "frames": 8,
                      "ink_bounds": [frame.getbbox() for frame in frames]}, indent=2))


if __name__ == "__main__":
    main()
