"""Normalize one generated four-view sheet for visual approval, without mirroring."""

import hashlib
import json

from PIL import Image

from prepare_preview import ROOT, SIZE, LOGICAL, FLOOR, contact, dither


def main():
    source_path = ROOT / "generated/turnaround-source-sheet.png"
    source = Image.open(source_path).convert("RGBA")
    if source.size != (1774, 887):
        raise ValueError("Turnaround source changed: remeasure its shared scale and anchors.")
    directions = ["front", "back", "left", "right"]
    # Mid-stance/spine landmarks, not independently cropped silhouette centers.
    roots = [235, 673, 1102, 1578]
    scale = 0.45
    (ROOT / "turnaround").mkdir(exist_ok=True)
    frames, registration = [], []
    for i, (direction, root_x) in enumerate(zip(directions, roots)):
        left, right = round(i * source.width / 4), round((i + 1) * source.width / 4)
        cell = source.crop((left, 0, right, source.height))
        dx, dy = 256 - (root_x - left) * scale, FLOOR - 832 * scale
        logical = cell.transform((LOGICAL, LOGICAL), Image.Transform.AFFINE,
                                 (2 / scale, 0, -dx / scale, 0, 2 / scale, -dy / scale),
                                 resample=Image.Resampling.BICUBIC)
        frame = dither(logical, standing=True)
        frame.save(ROOT / f"turnaround/{direction}.png")
        frames.append(frame)
        registration.append({"direction": direction, "source_cell": [left, 0, right, source.height],
                             "source_stance_x": root_x - left, "offset": [dx, dy],
                             "ink_bounds": frame.getbbox()})
    contact(frames, ["Front / towards camera", "Back / away from camera", "Left / authored opposite side", "Right / source side"],
            4, ROOT / "turnaround-sheet.png")
    seed = Image.open(ROOT / "character-seed.png").convert("RGBA")
    run = Image.open(ROOT / "animations/run_right/frames/01.png").convert("RGBA")
    contact([seed, run, frames[3]], ["Original mascot / exact seed", "Run / right", "Turnaround / right"],
            3, ROOT / "turnaround-comparison.png")
    path = ROOT / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["turnaround"] = {"approved": False, "source_generated_together": True,
                              "sheet": "turnaround-sheet.png", "views": {
                                  direction: f"turnaround/{direction}.png" for direction in directions},
                              "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
                              "shared_source_scale": scale, "source_floor_y": 832,
                              "watch_hand": "anatomical right (proposed, requires approval)",
                              "mirrored": False, "registration": registration}
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["turnaround"], indent=2))


if __name__ == "__main__":
    main()
