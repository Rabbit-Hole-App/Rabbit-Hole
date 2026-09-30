"""Check exported artifact integrity; this does not grant visual approval."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def paper(image):
    result = Image.new("RGBA", image.size, "white")
    result.alpha_composite(image.convert("RGBA"))
    return result.convert("RGB")


def sprite(name):
    image = Image.open(ROOT / name).convert("RGBA")
    assert image.size == (512, 512), name
    assert set(image.get_flattened_data()) <= {(0, 0, 0, 0), (10, 10, 10, 255)}, name
    x0, y0, x1, y1 = image.getbbox()
    assert min(x0, y0, 512 - x1, 512 - y1) > 0, name
    return image


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    props = json.loads((ROOT / "proportions.json").read_text())
    assert manifest["revision"] == 3
    assert manifest["anchor_px"] == props["root_pixels"] == [256, 480]
    original = Image.open(ROOT.parent / "rabbit-sprite.png").convert("RGBA").crop((0, 0, 240, 168))
    original = original.crop(original.getbbox()).resize((298, 286), Image.Resampling.NEAREST)
    expected = Image.new("RGBA", (512, 512))
    expected.alpha_composite(original, (107, 194))
    seed = sprite("character-seed.png")
    assert paper(seed).tobytes() == paper(expected).tobytes()
    assert seed.getchannel("A").tobytes() == expected.getchannel("A").tobytes()
    frames = [sprite(f"animations/run_right/frames/{i:02d}.png") for i in range(1, 9)]
    assert len({hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames}) == 8
    strip = Image.open(ROOT / "run-strip.png").convert("RGBA")
    assert strip.size == (4096, 512)
    for i, frame in enumerate(frames):
        assert strip.crop((i * 512, 0, (i + 1) * 512, 512)).tobytes() == frame.tobytes()
    assert all(frames[i].getbbox()[3] == 480 for i in [0, 1, 2, 4, 5, 6])
    assert [480 - frames[i].getbbox()[3] for i in [3, 7]] == [12, 4]
    encoded = {}
    for extension in ["gif", "webp"]:
        image = Image.open(ROOT / f"run-preview.{extension}")
        assert image.n_frames == 8 and image.info["loop"] == 0
        durations = []
        for i, frame in enumerate(frames):
            image.seek(i)
            decoded = image.convert("RGBA")
            assert paper(decoded).tobytes() == paper(frame).tobytes()
            if extension == "webp":
                assert decoded.getchannel("A").tobytes() == frame.getchannel("A").tobytes()
            durations.append(image.info["duration"])
        assert durations == (manifest["gif_durations_ms"] if extension == "gif" else [77] * 8)
        encoded[extension] = {"frames": 8, "durations_ms": durations, "cycle_ms": sum(durations)}
    comparison = Image.open(ROOT / "run-comparison.gif")
    seam = Image.open(ROOT / "run-seam-preview.gif")
    assert comparison.n_frames == seam.n_frames == 8
    for i, frame in enumerate(frames):
        comparison.seek(i)
        assert comparison.convert("RGB").crop((512, 0, 1024, 512)).tobytes() == paper(frame).tobytes()
        old = Image.new("RGBA", (512, 512))
        old.alpha_composite(Image.open(ROOT / f"history/pass-02/animations/run_right/frames/{i + 1:02d}.png").convert("RGBA"))
        assert comparison.convert("RGB").crop((0, 0, 512, 512)).tobytes() == paper(old).tobytes()
    for position, index in enumerate([6, 7, 0, 1, 2, 3, 4, 5]):
        seam.seek(position)
        assert seam.info["duration"] == 250
        assert seam.convert("RGB").crop((0, 0, 512, 512)).tobytes() == paper(frames[index]).tobytes()
    views = {direction: sprite(name) for direction, name in manifest["turnaround"]["views"].items()}
    assert list(views) == props["turnaround_order"] and len(views) == 8
    assert all(frame.getbbox()[3] == 480 for frame in views.values())
    assert not manifest["mirror_allowed"] and not manifest["turnaround"]["mirrored"]
    assert list(manifest["clips"]) == ["run_right"]
    assert not manifest["clips"]["run_right"]["approved"]
    assert not manifest["turnaround"]["approved"] and not manifest["character_bible"]["approved"]
    assert hashlib.sha256((ROOT / "generated/run-source-sheet.png").read_bytes()).hexdigest() == manifest["source_sha256"]
    for source in manifest["turnaround"]["source_groups"]:
        assert hashlib.sha256((ROOT / source["file"]).read_bytes()).hexdigest() == source["sha256"]
    browser = json.loads((ROOT / "qa/browser-verification.json").read_text())
    assert browser["pass"] and len(browser["images"]) == 5
    assert browser["distinct_visible_frames"] == {"gif": 8, "webp": 8, "compare": 8, "seam": 8}
    strip_hash = hashlib.sha256((ROOT / "run-strip.png").read_bytes()).hexdigest()
    assert browser["source_sha256"] == strip_hash
    travel = json.loads((ROOT / "qa/world-travel-verification.json").read_text())
    contacts = json.loads((ROOT / "qa/foot-contacts.json").read_text())
    assert travel["pass"] and travel["source_sha256"] == contacts["current_strip_sha256"] == strip_hash
    assert travel["linear_world_travel"] and travel["root_moves_during_held_sprite_frame"]
    assert not travel["camera_motion"] and not travel["root_correction_per_frame"]
    assert [(s["fps"], s["speed_ratio"]) for s in travel["test_speeds"]] == [(13,.8),(13,1),(13,1.2),(11,1),(15,1)]
    assert not manifest["world_travel_review"]["foot_sliding_resolved"]
    world_exports = {}
    for ext in ["gif", "webp"]:
        image = Image.open(ROOT / f"run-world-comparison.{ext}")
        assert image.n_frames == 64 and image.size == (1040,660) and image.info["loop"] == 0
        durations = []
        for i in range(image.n_frames):
            image.seek(i)
            image.load()
            durations.append(image.info["duration"])
        assert 1220 <= sum(durations) <= 1240
        world_exports[ext] = {"frames":64,"cycle_ms":sum(durations)}
    report = {
        "verified_at": datetime.now(timezone.utc).isoformat(), "revision": 3, "pass": True,
        "seed_matches_original_visible_ink_and_alpha_at_2x": True, "frame_size": [512, 512],
        "anchor": [256, 480], "unique_run_frames": 8, "stance_frames": [1, 2, 3, 5, 6, 7],
        "flight_clearance_pixels": {"4": 12, "8": 4}, "transparent_ink_only": True,
        "strip_matches_frames": True, "lossless_decoded_run_previews": encoded,
        "comparison_matches_original_and_refined_frames": True,
        "slow_loop_frame_order": [7, 8, 1, 2, 3, 4, 5, 6],
        "turnaround_views": list(views),
        "turnaround_ink_heights": {name: frame.getbbox()[3] - frame.getbbox()[1] for name, frame in views.items()},
        "source_hashes_match": True, "browser_verification": "browser-verification.json",
        "world_travel_verification": "world-travel-verification.json", "world_preview_exports": world_exports,
        "visual_approval": "pending user review",
        "limits": ["Horizontal world travel was tested in isolated Chrome; held-frame sliding remains visible.",
                   "Drawing targets and equal image bounds do not prove anatomical accuracy.",
                   "Eight static views do not implement a smooth turn animation."]}
    (ROOT / "qa/artifact-verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
