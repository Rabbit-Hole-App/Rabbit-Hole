"""Freeze registered candidate-04 pixels for controlled, offline pose authoring."""
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
sys.path.insert(0, str(ROOT))
import prepare_preview as old


def main():
    frozen = OUT/"authoring/source-hashes.json"
    if frozen.exists():
        for name, expected in json.loads(frozen.read_text()).items():
            actual = hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
            if actual != expected:
                raise ValueError(f"Frozen input changed: {name}; do not silently rebind this candidate.")
    directory = OUT / "authoring/source-keys"
    directory.mkdir(parents=True, exist_ok=True)
    source = Image.open(old.SOURCE).convert("RGBA")
    for i in range(8):
        col, row = i % 4, i // 4
        left, top = round(col*source.width/4), round(row*source.height/2)
        right, bottom = round((col+1)*source.width/4), round((row+1)*source.height/2)
        cell = source.crop((left, top, right, bottom))
        dx = 256-(old.PELVIS_X[i]-left)*old.SCALE
        dy = old.FLOOR-(old.SOURCE_FLOORS[i]-top)*old.SCALE
        registered = cell.transform((512, 512), Image.Transform.AFFINE,
                                    (1/old.SCALE, 0, -dx/old.SCALE,
                                     0, 1/old.SCALE, -dy/old.SCALE),
                                    resample=Image.Resampling.BICUBIC)
        registered.save(directory / f"{i+1:02d}.png")
        grid = old.paper(registered)
        draw = ImageDraw.Draw(grid)
        for v in range(0, 512, 32):
            draw.line((v, 0, v, 512), fill="#9ed7e2", width=1)
            draw.line((0, v, 512, v), fill="#9ed7e2", width=1)
            draw.text((v+1, 0), str(v), fill="#246476")
            draw.text((0, v+1), str(v), fill="#246476")
        grid.save(directory / f"{i+1:02d}-grid.png")
    preserved = ["character-seed.png", "proportions.json", "canonical-proportion-sheet.png",
                 "turnaround-sheet.png", "turnaround-8-view-sheet.png", "run-strip.png",
                 "generated/run-source-sheet.png", "motion/run_right/guide-04/joint-data.json"]
    preserved += [p.relative_to(ROOT).as_posix() for p in (ROOT/"turnaround").glob("*.png")]
    hashes = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in preserved}
    (OUT/"authoring/source-hashes.json").write_text(json.dumps(hashes, indent=2)+"\n")
    print("Registered all eight existing source keys; preserved source hashes.")


if __name__ == "__main__":
    main()
