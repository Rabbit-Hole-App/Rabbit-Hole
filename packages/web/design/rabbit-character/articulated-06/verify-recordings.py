"""Check exported evidence against actual browser captures; no visual approval."""
import hashlib
import json
import math
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
from PIL import Image, ImageSequence

OUT=Path(__file__).resolve().parent
ROOT=OUT.parent
WORKSPACE=ROOT.parents[3]
CAPTURES=WORKSPACE/"tmp/rabbit-mascot/articulated-captures"


def main():
    rig=json.loads((OUT/"rig.json").read_text())
    browser=json.loads((OUT/"qa/browser-verification.json").read_text())
    motion=json.loads((OUT/"qa/motion-verification.json").read_text())
    assert browser["pass"] and motion["mathematical_checks_pass"]
    assert not rig["visual_approval"] and "failed" in rig["visual_status"]
    assert motion["worst_surface_stretch"]["left_leg"]["max_edge_stretch"]>5
    for filename,expected in rig["source_sha256"].items():
        assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()==expected,filename
    # Re-read the actual screenshot pixels, independent of the browser's scan.
    contact_values={r:{s:[] for s in ["left","right"]} for r in range(3)}
    for i,state in enumerate(browser["world"][:64]):
        pixels=np.array(Image.open(CAPTURES/f"world-{i:03d}.png").convert("RGB"))
        for row,item in enumerate(state["rows"]):
            y=item["baseline"]
            for side,contact in item["contacts"].items():
                x=math.floor(contact["expected_world_x"]-42)
                window=pixels[y-3:y+1,x:x+85]
                ys,xs=np.where(np.all(window<80,axis=2))
                assert len(xs), (i,row,side)
                observed=int(xs.max()+x)
                assert observed==contact["observed_ink_x"],(i,row,side,observed,contact)
                contact_values[row][side].append(observed)
    ranges={str(row):{side:max(v)-min(v) for side,v in sides.items()} for row,sides in contact_values.items()}
    assert ranges["2"]=={"left":1,"right":2}
    assert all(len(v)==21 for side in contact_values.values() for v in side.values())
    outputs={}
    for name,count,size in [("normal-run",32,(512,512)),("slow-run",64,(512,512)),
                            ("comparison-slow",64,(1536,560)),("skeleton-overlay",64,(512,512)),
                            ("world-motion",64,(1040,910)),("foot-lock",64,(1040,910)),
                            ("cycle-seam",64,(512,512))]:
        for extension in ["gif","webp"]:
            file=OUT/f"{name}.{extension}"
            image=Image.open(file)
            assert image.n_frames==count,(file,image.n_frames)
            assert image.size==size,(file,image.size)
            durations=[]
            for frame in ImageSequence.Iterator(image):
                frame.load();durations.append(frame.info.get("duration",0))
            outputs[file.name]={"frames":count,"size":size,"duration_ms":sum(durations),
                                "sha256":hashlib.sha256(file.read_bytes()).hexdigest()}
    for name,size in [("rig-visualization.png",(1536,550)),("rendered-key-review.png",(2048,1100)),
                      ("leg-deformation-closeups.png",(1440,1608)),("arm-deformation-closeups.png",(1440,1608)),
                      ("surface-continuity-review.png",(1920,1074)),("foot-lock-closeup.png",(2200,418))]:
        image=Image.open(OUT/name);image.load();assert image.size==size,(name,image.size)
    # Lossless archives retain every original recording sample, not just selected
    # attractive poses. Review GIFs may quantize anti-aliasing through a palette.
    for name,prefix,count in [("normal-run-104hz.webp","single",64),("world-motion-104hz.webp","world",128)]:
        image=Image.open(OUT/name);assert image.n_frames==count
        for i,frame in enumerate(ImageSequence.Iterator(image)):
            original=np.array(Image.open(CAPTURES/f"{prefix}-{i:03d}.png").convert("RGB"))
            assert np.array_equal(np.array(frame.convert("RGB")),original),(name,i)
    report={"tested_at":datetime.now(timezone.utc).isoformat(),"technical_evidence_checks_pass":True,
            "visual_gate":"failed: pinched recovery ankles; no visual approval",
            "independent_pixel_ranges_display_px":ranges,"samples_per_support":21,
            "unchanged_inputs":len(rig["source_sha256"]),"recordings":outputs,
            "lossless_archives_match_all_browser_pixels":True}
    (OUT/"qa/artifact-verification.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"technical_evidence_checks_pass":True,"visual_gate":"failed",
                      "independent_pixel_ranges_display_px":ranges,"recordings":len(outputs)}))


if __name__=="__main__":
    main()
