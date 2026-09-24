"""Offline, articulated correction from existing pixels; exports held raster frames.

This authoring script is deliberately not wired into the web app. The approved
motion guide supplies the immutable keys and interpolated fixed-length joints.
No generative calls, optical flow or world-space sprite translation occurs here.
"""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageChops

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
sys.path.insert(0, str(ROOT))
import prepare_joint_guide as guide
import prepare_preview as style

SIZE = 512
CONFIG = json.loads((OUT/"authoring/cutouts.json").read_text())
SOURCES = {i: Image.open(OUT/f"authoring/source-keys/{i:02d}.png").convert("RGBA") for i in (1, 5)}


def extract(part):
    spec = CONFIG["parts"][part]
    cut = SOURCES[spec["key"]].copy()
    mask = Image.new("L", (SIZE, SIZE))
    draw = ImageDraw.Draw(mask)
    if "polygon" in spec:
        draw.polygon([tuple(p) for p in spec["polygon"]], fill=255)
    else:
        draw.ellipse(spec["ellipse"], fill=255)
    cut.putalpha(ImageChops.multiply(cut.getchannel("A"), mask))
    return cut


CUTS = {part: extract(part) for part in CONFIG["parts"]}


def two_point_matrix(source, target, width_scale=1.0):
    """Map bone endpoints exactly, retaining authored transverse thickness."""
    a, b = np.array([p[:2] for p in source], float)
    c, d = np.array([p[:2] for p in target], float)
    u, v = b-a, d-c
    sl, tl = np.linalg.norm(u), np.linalg.norm(v)
    sm = np.column_stack((u/sl, [-u[1]/sl, u[0]/sl]))
    tm = np.column_stack((v/sl, np.array([-v[1]/tl, v[0]/tl])*width_scale))
    linear = tm @ sm.T
    return linear, c-linear@a


def transformed(part, target, width_scale=1.0):
    source = CONFIG["parts"][part]["bind"]
    if len(source) == 2:
        linear, offset = two_point_matrix(source, target, width_scale)
    else:
        src = np.column_stack((np.array(source)[:, :2], np.ones(3)))
        coefficients = np.linalg.solve(src, np.array(target)[:, :2])
        linear, offset = coefficients[:2].T, coefficients[2]
    inverse = np.linalg.inv(linear)
    translation = -inverse@offset
    return CUTS[part].transform((SIZE, SIZE), Image.Transform.AFFINE,
                               (*inverse[0], translation[0], *inverse[1], translation[1]),
                               resample=Image.Resampling.BICUBIC)


def add2(a, b):
    return (a[0]+b[0], a[1]+b[1])


def ear_response():
    """Periodic, damped lag driven by head acceleration; two different responses."""
    samples, fps = 416, 13
    result = {"near": [], "far": []}
    for side, frequency, damping in (("near", 19., .72), ("far", 22., .8)):
        angle = velocity = 0.0
        dt = 8/fps/samples
        for step in range(samples*20):
            phase = step % samples*8/samples
            epsilon = .004
            center = guide.pose(phase)["head"]
            before = guide.pose(phase-epsilon)["head"]
            after = guide.pose(phase+epsilon)["head"]
            acceleration_y = (after[1]-2*center[1]+before[1])/(epsilon/fps)**2
            target = max(-10., min(10., -.00055*acceleration_y))
            velocity += (frequency**2*(target-angle)-2*damping*frequency*velocity)*dt
            angle += velocity*dt
            if step >= samples*19:
                result[side].append(angle)
    return result


EARS = ear_response()


def sampled(values, phase):
    index = phase % 8/8*len(values)
    i, t = int(index), index % 1
    return values[i]*(1-t)+values[(i+1) % len(values)]*t


def ear_layer(side, data):
    part = f"ear_{side}"
    root, middle, tip = CONFIG["parts"][part]["bind"]
    head_delta = (data["head"][0]-306, data["head"][1]-196)
    angle = sampled(EARS[side], data["phase"])
    target_root = add2(root, head_delta)
    targets = [target_root]
    # Root remains attached; the distal half bends slightly farther than the base.
    for point, amount in ((middle, .7), (tip, 1.0)):
        relative = (point[0]-root[0], point[1]-root[1])
        targets.append(add2(target_root, guide.rotate(relative, angle*amount)))
    return transformed(part, targets)


def render(phase, diagnostics=False):
    data = guide.with_watch(phase)
    result = Image.new("RGBA", (SIZE, SIZE))
    def layer(part, targets, width=1.0):
        result.alpha_composite(transformed(part, targets, width))
    foot_layers = {}
    # Anatomical LEFT remains far, RIGHT near. Layer order never swaps identities.
    for side in ("left", "right"):
        leg = data["legs"][side]
        layer(f"{side}_thigh", [leg["hip"], leg["knee"]])
        layer(f"{side}_shin", [leg["knee"], leg["ankle"]])
        foot = transformed(f"{side}_foot", [leg["ankle"], leg["heel"], leg["toe"]])
        # The source mask includes antialiased padding below the measured sole.
        # Trim this padding at the immutable contact plane, never move the foot.
        if leg["support"]:
            alpha = foot.getchannel("A")
            ImageDraw.Draw(alpha).rectangle((0, 480, 512, 512), fill=0)
            foot.putalpha(alpha)
        result.alpha_composite(foot)
        foot_layers[side] = foot
    arm = data["arms"]["left"]
    layer("left_upper_arm", [arm["shoulder"], arm["elbow"]])
    layer("left_forearm", [arm["elbow"], arm["wrist"]])
    layer("left_paw", [arm["wrist"], arm["grip"]])
    layer("tail", [data["root"], data["shoulder_root"]])
    layer("body", [data["root"], data["shoulder_root"]])
    result.alpha_composite(ear_layer("far", data))
    result.alpha_composite(ear_layer("near", data))
    layer("head", [data["head"], add2(data["head"], (21, 0))])
    arm = data["arms"]["right"]
    layer("right_upper_arm", [arm["shoulder"], arm["elbow"]])
    layer("right_forearm", [arm["elbow"], arm["wrist"]])
    watch = data["watch"]
    center = watch["center"]
    angle = watch["lag_degrees"]
    layer("watch_face", [center, add2(center, guide.rotate((27, 0), -angle))])
    layer("watch_bow", [arm["grip"], add2(center, guide.rotate((0, -21), -angle))])
    layer("right_paw", [arm["wrist"], arm["grip"]])
    # Requantize once, after posing. No crossfading, flow or resampling of dots.
    dithered = style.dither(result.resize((256, 256), Image.Resampling.LANCZOS))
    return result, dithered, data, foot_layers


def save_loop(frames, name, milliseconds):
    paper = [style.paper(frame) for frame in frames]
    durations = [round((i+1)*milliseconds/10)*10-round(i*milliseconds/10)*10 for i in range(len(frames))]
    paper[0].save(OUT/f"{name}.gif", save_all=True, append_images=paper[1:],
                  duration=durations, loop=0, disposal=2, optimize=False)
    precise = [round((i+1)*milliseconds)-round(i*milliseconds) for i in range(len(frames))]
    frames[0].save(OUT/f"{name}.webp", save_all=True, append_images=frames[1:],
                   duration=precise, loop=0, lossless=True, exact=True, method=6)


def main():
    approval = json.loads((ROOT/"motion/run_right/guide-04/approval.json").read_text())
    assert approval["approved"]
    guide.WATCH = guide.watch_angles()
    for directory in ("frames", "keys", "raw", "qa", "authoring/cuts"):
        (OUT/directory).mkdir(parents=True, exist_ok=True)
    for part, cut in CUTS.items():
        cut.save(OUT/f"authoring/cuts/{part}.png")
    frames, poses, foot_metrics = [], [], []
    for i in range(16):
        raw, frame, data, feet = render(i/2)
        raw.save(OUT/f"raw/{i+1:02d}.png")
        frame.save(OUT/f"frames/{i+1:02d}.png")
        frames.append(frame)
        poses.append(data)
        entry = {"frame": i+1, "phase": i/2, "feet": {}}
        for side, foot in feet.items():
            foot.save(OUT/f"qa/foot-{side}-{i+1:02d}.png")
            entry["feet"][side] = {"support": data["legs"][side]["support"],
                                   "toe": data["legs"][side]["toe"][:2]}
        foot_metrics.append(entry)
        if i % 2 == 0:
            frame.save(OUT/f"keys/{i//2+1:02d}.png")
    for count, selected in ((8, frames[::2]), (16, frames)):
        sheet = Image.new("RGBA", (count*512, 512))
        for i, frame in enumerate(selected):
            sheet.alpha_composite(frame, (i*512, 0))
        sheet.save(OUT/f"run-right-{count}.png")
    style.contact(frames[::2], style.BEATS, 4, OUT/"corrected-key-contact-sheet.png")
    labels = [f"{i+1:02d} / " + (f"key {i//2+1:02d}" if i % 2 == 0 else f"between {i//2+1:02d}-{(i//2+1)%8+1:02d}") for i in range(16)]
    style.contact(frames, labels, 4, OUT/"contact-sheet-16.png")
    save_loop(frames, "run-16", 1000/26)
    save_loop(frames, "run-16-slow", 150)
    save_loop(frames[::2], "corrected-keys", 1000/13)
    seam_order = list(range(12, 16))+list(range(12))
    save_loop([frames[i] for i in seam_order], "cycle-seam", 150)
    style.contact([frames[i] for i in [12,13,14,15,0,1,2,3]],
                  [labels[i] for i in [12,13,14,15,0,1,2,3]], 4, OUT/"cycle-seam-sheet.png")
    overlays = []
    for i, frame in enumerate(frames[::2]):
        overlay = Image.new("RGBA", (512,512))
        guide.draw_pose(ImageDraw.Draw(overlay), poses[i*2], labels=False)
        overlay.putdata([(0,0,0,0) if p[:3] == (251,250,246) else p
                         for p in overlay.get_flattened_data()])
        composite = style.paper(frame).convert("RGBA")
        composite.alpha_composite(overlay)
        overlays.append(composite)
    style.contact([p.convert("RGBA") for p in overlays], style.BEATS, 4, OUT/"joint-guide-overlay.png")
    old = [Image.open(ROOT/f"animations/run_right/frames/{i+1:02d}.png").convert("RGBA") for i in range(8)]
    comparisons = []
    for i, frame in enumerate(frames):
        canvas = Image.new("RGBA", (1536, 552), "white")
        draw = ImageDraw.Draw(canvas)
        for col, (asset, label) in enumerate(((old[i//2], "Candidate 04 / 8 held frames"),
                                               (frames[i//2*2], "Corrected 8 keys"),
                                               (frame, "Corrected 16 frames"))):
            canvas.alpha_composite(asset, (col*512, 0))
            draw.text((col*512+24, 520), label, fill="#555555", font=guide.font(18))
        comparisons.append(canvas)
    save_loop(comparisons, "three-way-slow", 150)
    (OUT/"poses.json").write_text(json.dumps(poses, indent=2)+"\n")
    (OUT/"qa/foot-landmarks.json").write_text(json.dumps(foot_metrics, indent=2)+"\n")
    metadata = {
        "revision": 5, "status": "rejected by user as final visual candidate; visibly broken leg deformation",
        "visual_approved": False, "runtime_migrated": False, "generation_calls": 0,
        "source": "../generated/run-source-sheet.png", "authoring": "authoring/cutouts.json",
        "motion_basis": "../motion/run_right/guide-04/approval.json",
        "canvas": [512,512], "anchor": [256,480], "key_count": 8, "frame_count": 16,
        "action": "run", "facing": "right",
        "fps": 26, "cycle_seconds": 8/13, "cycle_travel_source_px": 480,
        "calibrated_speed_source_px_s": 780, "phase_per_distance_source_px": 1/60,
        "watch_owner": "anatomical_right", "mirror_allowed": False,
        "visual_root_compensation": {"enabled": False, "offset_source_px": [0,0],
                                      "reason": "Evaluate unmodified physics/world root first."},
        "physics": "Owns independent world position, velocity, collision and grounded state.",
        "animation": "Owns local guide pelvis/limbs and exported pose; never writes physics position.",
        "ear_curves": {"method": "periodic damped head-acceleration response", "samples": EARS},
        "source_hashes": "authoring/source-hashes.json"
    }
    (OUT/"manifest.json").write_text(json.dumps(metadata, indent=2)+"\n")
    print(json.dumps({"frames":16,"keys":8,"generation_calls":0,"bounds":[f.getbbox() for f in frames]}, indent=2))


if __name__ == "__main__":
    main()
