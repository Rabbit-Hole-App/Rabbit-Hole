"""Compare the actual rendered candidate with the unchanged approved targets.

The overlay is evidence of deviations, not a pose detector or a conformance pass.
"""

import hashlib
import json
from PIL import Image, ImageDraw, ImageFont
from prepare_preview import ROOT, SIZE, contact, paper
from prepare_joint_guide import draw_pose


def overlay(frame, pose):
    result = paper(frame).convert("RGBA")
    layer = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(layer)
    for side, color in [("left", (20, 110, 153, 205)), ("right", (181, 78, 41, 220))]:
        leg, arm = pose["legs"][side], pose["arms"][side]
        for chain in [[leg[k][:2] for k in ("hip", "knee", "ankle")],
                      [leg[k][:2] for k in ("ankle", "heel", "toe")],
                      [arm[k][:2] for k in ("shoulder", "elbow", "wrist", "grip")]]:
            draw.line(chain, fill=color, width=2)
            for x, y in chain:
                draw.ellipse((x-4,y-4,x+4,y+4),outline=color,width=2)
    for a,b in [("root","shoulder_root"),("shoulder_root","head")]:
        draw.line([pose[a][:2],pose[b][:2]],fill=(76,90,90,190),width=2)
    x,y=pose["root"][:2]
    draw.rectangle((x-5,y-5,x+5,y+5),outline=(40,40,40,220),width=2)
    watch=pose["watch"]
    draw.line([watch["grip"][:2],watch["center"][:2]],fill=(181,78,41,220),width=2)
    x,y=watch["center"][:2]
    draw.ellipse((x-27,y-27,x+27,y+27),outline=(181,78,41,190),width=2)
    draw.line((40,480,472,480),fill=(80,80,80,150),width=1)
    result.alpha_composite(layer)
    return result


def main():
    guide_path=ROOT/"motion/run_right/guide-04/joint-data.json"
    data=json.loads(guide_path.read_text())
    approval=json.loads((guide_path.parent/"approval.json").read_text())
    assert approval["approved"] and approval["joint_data_sha256"] == hashlib.sha256(guide_path.read_bytes()).hexdigest()
    frames=[Image.open(ROOT/f"animations/run_right/frames/{i:02d}.png").convert("RGBA") for i in range(1,9)]
    poses=data["keys"]
    overlays=[overlay(frame,pose) for frame,pose in zip(frames,poses)]
    labels=[f'{i+1:02d} / approved target overlay - deviations visible' for i in range(8)]
    contact(overlays,labels,4,ROOT/"run-guide-overlay.png")
    panels, captions=[],[]
    for i in (0,4,2,6):
        diagram=Image.new("RGBA",(SIZE,SIZE),"white")
        draw_pose(ImageDraw.Draw(diagram),poses[i],labels=False)
        panels.extend([diagram,frames[i],overlays[i]])
        captions.extend([f'{i+1:02d} / approved guide',f'{i+1:02d} / rendered candidate',f'{i+1:02d} / target overlay, not exact match'])
    contact(panels,captions,3,ROOT/"run-guide-comparison.png")
    contact([frames[0],frames[4]],
            ["01 / LEFT (far) support; RIGHT watch arm forward",
             "05 / RIGHT (near) support; RIGHT watch arm back"],2,ROOT/"run-contact-exchange.png")
    contacts=json.loads((ROOT/"qa/foot-contacts.json").read_text())
    observed=[]
    for point in contacts["current"]:
        pose=poses[point["frame"]-1]
        side=point["support"]
        target=pose["legs"][side]["toe"]
        observed.append({"frame":point["frame"],"support":side,"target_toe_x":target[0],
                         "rendered_support_edge_x":point["x"],
                         "difference_source_px":round(point["x"]-target[0],3)})
    flight=[]
    for i in (3,7):
        target=480-max(p["heel"][1] for p in poses[i]["legs"].values())
        target=min(target,480-max(p["toe"][1] for p in poses[i]["legs"].values()))
        flight.append({"frame":i+1,"guide_clearance_px":round(target,3),
                       "rendered_ink_clearance_px":480-frames[i].getbbox()[3]})
    report={"status":"candidate; not an exact geometric trace of the approved guide",
            "guide_approved":True,"run_approved":False,"exact_pose_conformance":False,
            "anatomical_role_visual_review":"01 far-left support / near-right thigh back; 05 near-right support / far-left thigh back; watch remains on the near-right sleeve chain.",
            "not_automatic_joint_detection":True,
            "remaining_art_issues":["Recovery-foot orientation differs from the guide in the contact poses.",
                                    "Passing/toe-off shins and far-foot separation remain more compressed/occluded than the guide.",
                                    "Flight poses 04 and 08 have unequal clearances and trailing-foot silhouettes.",
                                    "Shoulder/hand and inferred hip locations are not exact guide coordinates."],
            "support_edge_vs_guide":observed,"flight":flight,
            "uncertainty":"Support edge is an ink-patch proxy, not the exact physical toe; allow about 4 source px. Hidden joints are not measured as ground truth.",
            "guide_speed_source_px_s":data["source_speed_px_s"],
            "rendered_fitted_speed_source_px_s":contacts["speed_source_px_s"],
            "source_sha256":hashlib.sha256((ROOT/"run-strip.png").read_bytes()).hexdigest(),
            "guide_joint_data_sha256":approval["joint_data_sha256"]}
    (ROOT/"qa/guide-render-review.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    manifest=json.loads((ROOT/"manifest.json").read_text())
    manifest["review"].update({"guide_overlay":"run-guide-overlay.png","guide_comparison":"run-guide-comparison.png",
                              "guide_deviations":"qa/guide-render-review.json","exact_pose_conformance":False})
    (ROOT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"saved":"guide overlay and comparisons","support_edge_vs_guide":observed,
                      "exact_pose_conformance":False,"flight":flight},indent=2))


if __name__ == "__main__": main()
