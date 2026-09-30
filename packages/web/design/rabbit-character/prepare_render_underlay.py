"""Repack the approved joint coordinates as an image-conditioning underlay."""

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw
from prepare_joint_guide import ROOT, OUT, draw_pose, font, PAPER, INK, LEFT, RIGHT


def main():
    data = json.loads((OUT / "joint-data.json").read_text())
    canvas = Image.new("RGB", (2048, 1024), PAPER)
    draw = ImageDraw.Draw(canvas)
    for i, pose in enumerate(data["keys"]):
        ox, oy = i % 4 * 512, i // 4 * 512
        draw_pose(draw, pose, (ox, oy), labels=False, ground=True)
        draw.text((ox+20, oy+12), f'{i+1:02d}  {pose["phase_name"]}', font=font(19, True), fill=INK)
        draw.text((ox+20, oy+40), "BLUE = LEFT/far   ORANGE = RIGHT/near + WATCH", font=font(13), fill=INK)
    target = ROOT / "generated/run-04-approved-underlay.png"
    canvas.save(target)
    # A second geometric view makes depth order explicit without changing a
    # single approved joint. Capsules are diagram guides, not character art.
    depth = Image.new("RGB", (2048, 1024), PAPER)
    draw = ImageDraw.Draw(depth)
    for i, pose in enumerate(data["keys"]):
        ox, oy = i % 4 * 512, i // 4 * 512
        def xy(p): return p[0]+ox, p[1]+oy
        def chain(points, width, color):
            pts = [xy(p) for p in points]
            draw.line(pts, fill=color, width=width, joint="curve")
            for x,y in pts:
                draw.ellipse((x-width/2,y-width/2,x+width/2,y+width/2),fill=color)
        def limbs(side):
            color = LEFT if side == "left" else RIGHT
            leg, arm = pose["legs"][side], pose["arms"][side]
            chain([leg[k] for k in ("hip","knee")], 31, color)
            chain([leg[k] for k in ("knee","ankle")], 15, color)
            chain([leg[k] for k in ("heel","toe")], 10, color)
            chain([arm[k] for k in ("shoulder","elbow","wrist")], 19, color)
            chain([arm[k] for k in ("wrist","grip")], 14, color)
        limbs("left")
        chain([pose["root"],pose["shoulder_root"]], 52, "#9b9c98")
        hx,hy=xy(pose["head"])
        draw.ellipse((hx-41,hy-31,hx+41,hy+31),fill="#b5b6b1")
        draw.polygon([(hx+32,hy-10),(hx+52,hy+1),(hx+32,hy+12)],fill="#b5b6b1")
        limbs("right")
        grip=xy(pose["watch"]["grip"]); cx,cy=xy(pose["watch"]["center"])
        draw.line((grip,(cx,cy)),fill=RIGHT,width=3)
        draw.ellipse((cx-27,cy-27,cx+27,cy+27),fill=PAPER,outline=RIGHT,width=4)
        draw.text((cx-7,cy-12),"W",font=font(17,True),fill=RIGHT)
        draw.line((ox+50,oy+480,ox+470,oy+480),fill="#b9bbb7",width=1)
        draw.text((ox+20,oy+14),f'{i+1:02d} / RIGHT FACING',font=font(20,True),fill=INK)
        draw.text((ox+20,oy+46),"ORANGE near = right + watch / BLUE far = left",font=font(14),fill=INK)
    depth.save(ROOT / "generated/run-04-depth-underlay.png")
    approval = {"approved": True, "scope": "motion basis only; not rabbit art or Character Bible v1",
                "user_instruction": "Guide approved as the motion basis.",
                "joint_data_sha256": hashlib.sha256((OUT / "joint-data.json").read_bytes()).hexdigest(),
                "underlay_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                "depth_underlay_sha256": hashlib.sha256((ROOT / "generated/run-04-depth-underlay.png").read_bytes()).hexdigest(),
                "coordinates_changed": False}
    (OUT / "approval.json").write_text(json.dumps(approval, indent=2)+"\n", encoding="utf-8")
    print("Saved exact approved joint underlay; original guide coordinates are unchanged.")


if __name__ == "__main__":
    main()
