"""Measure visible stance edges separately from the known joint contact points."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
SCALE, SPEED = .375, 780


def contact(frame):
    # Same image-space proxy as pass 04, so the comparison is like-for-like.
    candidates = [(x, y) for y in range(476, 480) for x in range(512)
                  if frame.getpixel((x, y))[3] > 128]
    if not candidates:
        return None
    x = max(p[0] for p in candidates)
    return {"x": x, "y": sum(p[1] for p in candidates if p[0] == x)/sum(p[0] == x for p in candidates)}


def metrics(points, fps, speed):
    ranges = {}
    for side in ("left", "right"):
        samples = [{**p, "world_x_source": p["x"]+(p["frame"]-1)*speed/fps}
                   for p in points if p["support"] == side]
        values = [p["world_x_source"] for p in samples]
        ranges[side] = {"range_source_px": max(values)-min(values),
                        "range_display_px": (max(values)-min(values))*SCALE,
                        "samples": samples}
    return {"fps": fps, "speed_source_px_s": speed, "stance": ranges,
            "within_hold_travel_source_px": speed/fps,
            "within_hold_travel_display_px": speed/fps*SCALE,
            "continuous_lock": False}


def measure():
    old = json.loads((ROOT/"qa/foot-contacts.json").read_text())["current"]
    poses = json.loads((OUT/"poses.json").read_text())
    points = []
    for index, pose in enumerate(poses):
        for side, leg in pose["legs"].items():
            if leg["support"]:
                edge = contact(Image.open(OUT/f"frames/{index+1:02d}.png").convert("RGBA"))
                if edge is None:
                    raise AssertionError(f"Visible contact missing: frame {index+1}, {side}")
                points.append({"frame": index+1, "support": side, **edge,
                               "guide_toe": leg["toe"][:2],
                               "toe_x_error_source_px": edge["x"]-leg["toe"][0]})
    keys = [{**p, "frame": (p["frame"]+1)//2} for p in points if p["frame"] % 2 == 1]
    versions = [
        {"id": "pass04", "label": "Candidate 04 / 8 frames", "fps": 13, "count": 8, "points": old},
        {"id": "keys", "label": "Corrected / 8 keys", "fps": 13, "count": 8, "points": keys},
        {"id": "sixteen", "label": "Controlled / 16 frames", "fps": 26, "count": 16, "points": points},
    ]
    for version in versions:
        version["metrics"] = metrics(version["points"], version["fps"], SPEED)
    data = {"display_scale": SCALE, "speed_source_px_s": SPEED,
            "cycle_seconds": 8/13, "versions": versions,
            "pass04_at_previous_fitted_speed": metrics(old,13,1040),
            "proxy": "Foremost final-frame opaque pixel in y=476..479, same as pass 04.",
            "proxy_uncertainty_source_px": 4,
            "physics_root": "Independent continuous world translation; no camera motion.",
            "visual_root_offset": [0,0],
            "foot_sliding_resolved": False,
            "note": "Pose boundary ranges exclude sliding inside holds. Neither mathematical joints nor edge proxies establish visual approval."}
    (OUT/"qa/foot-slip.json").write_text(json.dumps(data, indent=2)+"\n")
    print(json.dumps({v["id"]: v["metrics"] for v in versions}, indent=2))


def package():
    capture_dir = ROOT.parents[3]/"tmp/rabbit-mascot/controlled-captures"
    files = sorted(capture_dir.glob("*.png"))
    if len(files) != 128:
        raise AssertionError(f"Expected 128 fresh actual browser captures, found {len(files)}")
    report = json.loads((OUT/"qa/browser-verification.json").read_text())
    assert report["pass"] and report["captures"]["count"] == len(files)
    assert report["source_sha256"]["sixteen"] == hashlib.sha256((OUT/"run-right-16.png").read_bytes()).hexdigest()
    frames = [Image.open(path).convert("RGB") for path in files]
    # GIF centiseconds cannot represent 104Hz: preserve measured capture order
    # in WebP, and use every other browser sample for the 52Hz GIF.
    gif = frames[::2]
    durations = [round((i+1)*100/52)*10-round(i*100/52)*10 for i in range(len(gif))]
    gif[0].save(OUT/"world-movement.gif", save_all=True, append_images=gif[1:],
                duration=durations, loop=0, disposal=2, optimize=False)
    durations = [round((i+1)*1000/104)-round(i*1000/104) for i in range(len(frames))]
    frames[0].save(OUT/"world-movement.webp", save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, lossless=True, method=6)
    # One support event across a held 16-frame pose, at 0, 1/4, 1/2, 3/4 hold.
    details = []
    for i in range(4):
        crop = frames[i].crop((175, 800, 250, 855)).resize((300,220), Image.Resampling.NEAREST)
        tile = Image.new("RGB", (300,255), "white")
        tile.paste(crop, (0,0))
        ImageDraw.Draw(tile).text((10,229), f"{i}/4 hold; world t={i/104:.4f}s", fill="#333333")
        details.append(tile)
    sheet = Image.new("RGB", (1200,255), "white")
    for i, detail in enumerate(details):
        sheet.paste(detail,(i*300,0))
    sheet.save(OUT/"qa/within-hold-detail.png")
    print("Packaged two cycles from 128 actual Chrome captures; GIF uses 64 captures.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", action="store_true")
    args = parser.parse_args()
    package() if args.package else measure()
