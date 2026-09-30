"""Register the authored cardinal and diagonal views, without mirroring."""

import hashlib
import json

from PIL import Image

from prepare_preview import ROOT, LOGICAL, FLOOR, contact, dither


def main():
    scale = 432 / 832
    # Each source group shares one scale. The left correction has a different
    # source resolution, not a different physical body scale.
    groups = [
        ("turnaround-source-sheet.png", (1774, 887), 4, scale,
         [("front", 0, 263, 864), ("back", 1, 690, 864),
          ("left", 2, 1108, 866), ("right", 3, 1540, 866)]),
        ("diagonals-initial.png", (1774, 887), 4, scale,
         [("front_right", 0, 288, 861), ("back_right", 1, 690, 856)]),
        ("diagonals-left-corrected.png", (1254, 1254), 2, scale * 887 / 1254,
         [("back_left", 0, 320, 1212), ("front_left", 1, 853, 1220)]),
    ]
    (ROOT / "turnaround").mkdir(exist_ok=True)
    frames, registration, sources = {}, [], []
    for name, expected_size, columns, source_scale, views in groups:
        source_path = ROOT / "generated" / name
        source = Image.open(source_path).convert("RGBA")
        if source.size != expected_size:
            raise ValueError(f"Source changed: remeasure {name} before preparation.")
        sources.append({"file": f"generated/{name}", "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
                        "shared_scale": source_scale, "views": [item[0] for item in views]})
        for direction, column, root_x, floor_y in views:
            left = round(column * source.width / columns)
            right = round((column + 1) * source.width / columns)
            cell = source.crop((left, 0, right, source.height))
            dx = 256 - (root_x - left) * source_scale
            dy = FLOOR - floor_y * source_scale
            logical = cell.transform((LOGICAL, LOGICAL), Image.Transform.AFFINE,
                                     (2 / source_scale, 0, -dx / source_scale,
                                      0, 2 / source_scale, -dy / source_scale),
                                     resample=Image.Resampling.BICUBIC)
            frame = dither(logical, standing=True)
            frame.save(ROOT / f"turnaround/{direction}.png")
            frames[direction] = frame
            registration.append({"direction": direction, "source": f"generated/{name}",
                                 "source_cell": [left, 0, right, source.height],
                                 "source_stance_x": root_x - left, "source_floor_y": floor_y,
                                 "offset": [dx, dy], "ink_bounds": frame.getbbox()})
    cardinal = ["front", "back", "left", "right"]
    order = ["front", "front_left", "left", "back_left", "back", "back_right", "right", "front_right"]
    contact([frames[d] for d in cardinal], [d.replace("_", " ").title() for d in cardinal],
            4, ROOT / "turnaround-sheet.png")
    contact([frames[d] for d in order], [d.replace("_", " ").title() for d in order],
            4, ROOT / "turnaround-8-view-sheet.png")
    seed = Image.open(ROOT / "character-seed.png").convert("RGBA")
    run = Image.open(ROOT / "animations/run_right/frames/01.png").convert("RGBA")
    contact([seed, run, frames["right"]], ["Original ink / unchanged scale", "Refined run / right", "Standing / right"],
            3, ROOT / "turnaround-comparison.png")
    path = ROOT / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["turnaround"] = {
        "approved": False, "cardinal_sheet": "turnaround-sheet.png", "sheet": "turnaround-8-view-sheet.png",
        "views": {direction: f"turnaround/{direction}.png" for direction in order},
        "source_groups": sources, "canonical_height_px": 432,
        "watch_hand": "anatomical right; far hand in left-facing views",
        "mirrored": False, "registration": registration,
        "generation": "Cardinals together; diagonals conditioned on cardinals; two left views corrected together.",
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"views": len(frames), "baseline": FLOOR,
                      "bounds": {key: frame.getbbox() for key, frame in frames.items()}}, indent=2))


if __name__ == "__main__":
    main()
