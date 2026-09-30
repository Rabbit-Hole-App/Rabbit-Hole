"""Check the new motion guide's geometry, independently of artwork approval."""

import copy
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import prepare_joint_guide as guide


def near(value, expected, label):
    assert abs(value-expected) < 1e-6, (label, value, expected)


def inspect_pose(pose):
    d = guide.D
    near(math.dist(pose["root"], pose["shoulder_root"]), d["torso_length"], "torso")
    near(math.dist(*(pose["legs"][s]["hip"] for s in ("left", "right"))), d["hip_width"], "hip width")
    near(math.dist(*(pose["arms"][s]["shoulder"] for s in ("left", "right"))), d["shoulder_width"], "shoulder width")
    near(pose["root"][0], 256, "fixed local root x")
    assert pose["hip_yaw_degrees"]*pose["shoulder_yaw_degrees"] <= 0
    support = []
    for side in ("left", "right"):
        leg, arm = pose["legs"][side], pose["arms"][side]
        for a, b, length in [("hip", "knee", "upper_leg"), ("knee", "ankle", "lower_leg"), ("heel", "toe", "foot_length")]:
            near(math.dist(leg[a], leg[b]), d[length], f"{side} {length}")
        for a, b, length in [("shoulder", "elbow", "upper_arm"), ("elbow", "wrist", "forearm"), ("wrist", "grip", "hand")]:
            near(math.dist(arm[a], arm[b]), d[length], f"{side} {length}")
        # Knee-forward IK branch cannot spontaneously invert through a straight leg.
        hip, knee, ankle = (leg[k] for k in ("hip", "knee", "ankle"))
        cross = ((ankle[0]-hip[0])*(knee[1]-hip[1])
                 -(ankle[1]-hip[1])*(knee[0]-hip[0]))
        assert cross < 0, (side, "inverted knee", cross)
        assert max(leg["heel"][1], leg["toe"][1]) <= guide.FLOOR+1e-7
        if leg["support"]:
            near(leg["toe"][1], guide.FLOOR, "support baseline")
            near(leg["toe"][0]+guide.STEP*leg["local_phase"], guide.TOE_START, "world toe lock")
            support.append(side)
        else:
            assert max(leg["heel"][1], leg["toe"][1]) < guide.FLOOR
    assert len(support) <= 1, "running must not acquire double support"
    if "watch" in pose:
        watch = pose["watch"]
        assert watch["hand"] == "right"
        near(math.dist(watch["grip"], pose["arms"]["right"]["grip"]), 0, "watch/right grip")
        near(math.dist(watch["center"], watch["grip"]), d["watch_grip_to_center"], "watch suspension")
        near(watch["diameter"], d["watch_diameter"], "watch size")
    return support[0] if support else None


def inspect_keys(keys):
    supports = [inspect_pose(p) for p in keys]
    assert supports == ["left", "left", "left", None, "right", "right", "right", None]
    for i in range(4):
        for a, b in (("left", "right"), ("right", "left")):
            for joint in ("hip", "knee", "ankle", "heel", "toe"):
                near(math.dist(keys[i]["legs"][a][joint][:2], keys[i+4]["legs"][b][joint][:2]),
                     0, f"complementary keys {i+1}/{i+5}: {joint}")
    for index, lead, front_arm in ((0, "left", "right"), (4, "right", "left")):
        p = keys[index]
        other_leg = "right" if lead == "left" else "left"
        other_arm = "right" if front_arm == "left" else "left"
        assert p["legs"][lead]["ankle"][0] > p["root"][0]+30
        assert p["legs"][other_leg]["ankle"][0] < p["root"][0]-60
        assert p["arms"][front_arm]["grip"][0] > p["shoulder_root"][0]+70
        assert p["arms"][other_arm]["grip"][0] < p["shoulder_root"][0]-50
    return supports


def all_points(pose):
    result = [pose[k] for k in ("root", "shoulder_root", "head")]
    for side in ("left", "right"):
        result += [pose["legs"][side][k] for k in ("hip", "knee", "ankle", "heel", "toe")]
        result += [pose["arms"][side][k] for k in ("shoulder", "elbow", "wrist", "grip")]
    return result


def main():
    data = json.loads((guide.OUT/"joint-data.json").read_text())
    assert not data["guide_approved"] and not data["new_rabbit_art_generated"]
    keys = data["keys"]
    assert [p["frame"] for p in keys] == list(range(1, 9))
    supports = inspect_keys(keys)
    for file, key in [("proportions.json", "character_proportions_sha256"),
                      ("history/pass-03/run-strip.png", "preserved_run_strip_sha256"),
                      ("turnaround-8-view-sheet.png", "preserved_turnaround_sha256")]:
        assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest() == data[key], file
    approval = json.loads((guide.OUT/"approval.json").read_text())
    assert approval["approved"] and approval["joint_data_sha256"] == hashlib.sha256((guide.OUT/"joint-data.json").read_bytes()).hexdigest()
    dense = [guide.pose(i/100) for i in range(800)]
    for pose in dense:
        inspect_pose(pose)
    # Test seam position AND tangent continuity, not merely a wrapped frame index.
    epsilon = 1e-5
    before, at, after = (all_points(guide.pose(p)) for p in (8-epsilon, 0, epsilon))
    seam_gap = max(math.dist(a, b) for a, b in zip(before, after))
    tangent_error = max(math.dist([(b[j]-a[j])/epsilon for j in range(3)],
                                  [(c[j]-b[j])/epsilon for j in range(3)])
                        for a, b, c in zip(before, at, after))
    assert seam_gap < .01 and tangent_error < .03, (seam_gap, tangent_error)
    # The verifier must actually reject the reported failure modes.
    rejected = []
    for failure in ("repeat_half_stride", "stretch_shin", "switch_watch_hand"):
        bad = copy.deepcopy(keys)
        if failure == "repeat_half_stride":
            bad[4]["legs"] = copy.deepcopy(bad[0]["legs"])
        elif failure == "stretch_shin":
            bad[1]["legs"]["left"]["ankle"][0] += 18
        else:
            bad[4]["watch"]["grip"] = bad[4]["arms"]["left"]["grip"]
        try:
            inspect_keys(bad)
        except AssertionError:
            rejected.append(failure)
        else:
            raise AssertionError(f"Verifier accepted {failure}")
    exports = {}
    for name, frames in [("motion-guide", 8), ("motion-guide-slow", 8),
                         ("seam-08-to-01", 8), ("continuous-skeleton", 64),
                         ("world-contact-diagnostic", 64)]:
        for extension in ("gif", "webp"):
            im = Image.open(guide.OUT/f"{name}.{extension}")
            assert im.n_frames == frames and im.info["loop"] == 0
            durations, hashes = [], []
            for i in range(frames):
                im.seek(i)
                hashes.append(hashlib.sha256(im.convert("RGB").tobytes()).hexdigest())
                durations.append(im.info["duration"])
            assert len(set(hashes)) == frames
            exports[f"{name}.{extension}"] = {"frames": frames, "size": im.size, "cycle_ms": sum(durations)}
    normal, seam = (Image.open(guide.OUT/name) for name in ("motion-guide.webp", "seam-08-to-01.webp"))
    for position, index in enumerate((6, 7, 0, 1, 2, 3, 4, 5)):
        normal.seek(index)
        seam.seek(position)
        assert normal.convert("RGB").tobytes() == seam.convert("RGB").tobytes()
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "pass": True,
              "scope": "skeletal design and exports only; not rabbit artwork or runtime approval",
              "visual_approval": True, "approval_scope": "motion basis only", "rabbit_run_approved": False,
              "rabbit_foot_sliding_resolved": False, "dense_poses_checked": len(dense),
              "key_support_order": supports, "bone_lengths_px": {k: guide.D[k] for k in
                  ("upper_leg", "lower_leg", "foot_length", "upper_arm", "forearm", "hand", "torso_length")},
              "complementary_leg_pairs": ["01/05", "02/06", "03/07", "04/08"],
              "contralateral_contacts": True, "watch_hand": "anatomical right",
              "seam_near_endpoint_gap_px": seam_gap, "seam_tangent_error_px_per_phase": tangent_error,
              "regression_mutations_rejected": rejected,
              "continuous_skeleton_support_toe_drift_px": max(abs(l["toe"][0]+guide.STEP*l["local_phase"]-guide.TOE_START)
                  for p in dense for l in p["legs"].values() if l["support"]),
              "held_pose_translation_per_frame_source_px": guide.STEP,
              "held_pose_translation_per_frame_diagnostic_display_px": guide.STEP*.70,
              "source_speed_px_s": guide.STEP*guide.FPS, "exports": exports,
              "source_sha256": hashlib.sha256((guide.OUT/"joint-data.json").read_bytes()).hexdigest()}
    (guide.OUT/"validation.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("pass", "dense_poses_checked", "key_support_order", "regression_mutations_rejected", "seam_near_endpoint_gap_px", "seam_tangent_error_px_per_phase", "rabbit_foot_sliding_resolved")}, indent=2))


if __name__ == "__main__":
    main()
