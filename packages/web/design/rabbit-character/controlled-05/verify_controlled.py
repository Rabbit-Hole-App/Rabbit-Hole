"""Check frozen inputs, pose constraints, visible contacts and exported evidence."""
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageSequence

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
sys.path.insert(0, str(ROOT))
import prepare_joint_guide as guide
import prepare_preview as style
import prepare_controlled_run as author


def same(a, b):
    return a.size == b.size and a.tobytes() == b.tobytes()


def main():
    hashes = json.loads((OUT/"authoring/source-hashes.json").read_text())
    for name, expected in hashes.items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, f"Frozen input changed: {name}"
    original = json.loads((ROOT/"motion/run_right/guide-04/joint-data.json").read_text())
    poses = json.loads((OUT/"poses.json").read_text())
    frames = [Image.open(OUT/f"frames/{i+1:02d}.png").convert("RGBA") for i in range(16)]
    assert len({hashlib.sha256(f.tobytes()).hexdigest() for f in frames}) == 16
    raw_frames = [Image.open(OUT/f"raw/{i+1:02d}.png").convert("RGBA") for i in range(16)]
    joint_errors = []
    lengths = []
    for index, (frame, pose, raw) in enumerate(zip(frames,poses,raw_frames)):
        assert frame.size == (512,512)
        assert set(frame.get_flattened_data()) <= {(0,0,0,0),(10,10,10,255)}
        assert same(frame,frame.resize((256,256),Image.Resampling.NEAREST).resize((512,512),Image.Resampling.NEAREST))
        x0,y0,x1,y1 = frame.getbbox()
        assert 0 < x0 < x1 < 512 and 0 < y0 < y1 < 512
        if index % 2 == 0:
            key = original["keys"][index//2]
            assert pose["root"] == key["root"]
            for group, names in (("legs",("hip","knee","ankle","heel","toe")),
                                 ("arms",("shoulder","elbow","wrist","grip"))):
                for side in ("left","right"):
                    for name in names:
                        error = math.dist(pose[group][side][name],key[group][side][name])
                        joint_errors.append(error)
                        assert error < 1e-8
            assert same(frame,Image.open(OUT/f"keys/{index//2+1:02d}.png").convert("RGBA"))
        for side in ("left","right"):
            leg, arm = pose["legs"][side],pose["arms"][side]
            checks = [(leg,"hip","knee","upper_leg"),(leg,"knee","ankle","lower_leg"),
                      (arm,"shoulder","elbow","upper_arm"),(arm,"elbow","wrist","forearm"),
                      (arm,"wrist","grip","hand")]
            for chain,a,b,dimension in checks:
                delta = abs(math.dist(chain[a],chain[b])-guide.D[dimension])
                lengths.append(delta)
                assert delta < 1e-7
            # A correct skeleton must actually land on connected raster material.
            for point in (leg["knee"],leg["ankle"],arm["elbow"],arm["wrist"],arm["grip"]):
                x,y = map(round,point[:2])
                assert raw.getchannel("A").crop((x-4,y-4,x+5,y+5)).getextrema()[1] > 128, (index,side,point)
        assert pose["watch"]["hand"] == "right"
        assert pose["watch"]["grip"] == pose["arms"]["right"]["grip"]
        assert abs(math.dist(pose["watch"]["grip"],pose["watch"]["center"])-32.832) < 1e-8
        assert pose["watch"]["diameter"] == 54
    for count, selected in ((8,frames[::2]),(16,frames)):
        strip = Image.open(OUT/f"run-right-{count}.png").convert("RGBA")
        assert strip.size == (512*count,512)
        assert all(same(f,strip.crop((i*512,0,(i+1)*512,512))) for i,f in enumerate(selected))
    codecs = {}
    for name, order, expected_duration in (("run-16",range(16),1000*8/13),
                                            ("run-16-slow",range(16),2400),
                                            ("cycle-seam",list(range(12,16))+list(range(12)),2400)):
        for extension in ("gif","webp"):
            source = Image.open(OUT/f"{name}.{extension}")
            decoded = [f.convert("RGBA") for f in ImageSequence.Iterator(source)]
            assert len(decoded) == 16
            if extension == "webp":
                assert all(same(a,b) for a,b in zip(decoded,[frames[i] for i in order]))
            else:
                assert all(same(a.convert("RGB"),style.paper(frames[i])) for a,i in zip(decoded,order))
            duration=0
            for i in range(source.n_frames):
                source.seek(i); source.load(); duration += source.info.get("duration",0)
            assert abs(duration-expected_duration) <= (5 if extension=="gif" else 1), (name,extension,duration)
            codecs[f"{name}.{extension}"]={"frames":len(decoded),"duration_ms":duration}
    guide.WATCH = guide.watch_angles()
    _, repeated, _, _ = author.render(8)
    assert same(repeated,frames[0]), "Cycle restart changes the rendered identity, attachment or ear state."
    displacements = {}
    for label, extractor in (("pelvis",lambda p:p["root"]),
                              ("watch",lambda p:p["watch"]["center"]),
                              ("right_ankle",lambda p:p["legs"]["right"]["ankle"]),
                              ("left_ankle",lambda p:p["legs"]["left"]["ankle"])):
        steps=[math.dist(extractor(poses[i]),extractor(poses[(i+1)%16])) for i in range(16)]
        displacements[label]={"seam_step_source_px":steps[-1],"max_other_step_source_px":max(steps[:-1])}
        assert steps[-1] <= max(steps[:-1])+1e-7, f"Seam jump is an outlier: {label}"
    browser=json.loads((OUT/"qa/browser-verification.json").read_text())
    assert browser["pass"] and browser["live_visible_frames"] == [list(range(1,9)),list(range(1,9)),list(range(1,17))]
    assert browser["source_sha256"]["sixteen"] == hashlib.sha256((OUT/"run-right-16.png").read_bytes()).hexdigest()
    measurements=json.loads((OUT/"qa/foot-slip.json").read_text())
    assert measurements["versions"][2]["metrics"]["within_hold_travel_display_px"] == 11.25
    assert not measurements["foot_sliding_resolved"]
    for extension, expected_count in (("gif",64),("webp",128)):
        world=Image.open(OUT/f"world-movement.{extension}")
        assert world.n_frames == expected_count and world.size == (1040,910)
    style.contact([Image.open(ROOT/"character-seed.png").convert("RGBA"),frames[0],frames[8],frames[15]],
                  ["Original seed / unchanged pixels", "First / key 01", "Middle / key 05", "Final / 08 to 01 in-between"],
                  4,OUT/"identity-comparison.png")
    overlays=[]
    for i,frame in enumerate(frames[::2]):
        layer=Image.new("RGBA",(512,512))
        guide.draw_pose(ImageDraw.Draw(layer),poses[i*2],labels=False)
        layer.putdata([(0,0,0,0) if p[:3]==(251,250,246) else p for p in layer.get_flattened_data()])
        overlay=style.paper(frame).convert("RGBA");overlay.alpha_composite(layer);overlays.append(overlay)
    style.contact(overlays,style.BEATS,4,OUT/"joint-guide-overlay.png")
    report={"tested_at":datetime.now(timezone.utc).isoformat(),"pass":True,
            "frozen_input_hashes_checked":len(hashes),"unique_frames":16,
            "max_key_joint_error_source_px":max(joint_errors),"max_bone_length_error_source_px":max(lengths),
            "cycle_restart_pixels_identical":True,"seam_displacements":displacements,
            "codecs":codecs,"watch_owner":"anatomical_right","watch_diameter_source_px":54,
            "visual_quality_approved":False,"continuous_foot_lock":False,
            "limits":["Mathematical constraints and raster coverage do not certify appealing motion.",
                      "Passing legs overlap in the approved side projection; depth remains a visual judgment.",
                      "The 16-frame output still holds drawings; no continuous runtime has been implemented."]}
    (OUT/"qa/artifact-verification.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
