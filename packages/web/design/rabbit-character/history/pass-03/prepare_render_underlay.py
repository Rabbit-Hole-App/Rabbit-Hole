"""Repack the approved joint coordinates as an image-conditioning underlay."""

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw
from prepare_joint_guide import ROOT, OUT, draw_pose, font, PAPER, INK


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
    approval = {"approved": True, "scope": "motion basis only; not rabbit art or Character Bible v1",
                "user_instruction": "Guide approved as the motion basis.",
                "joint_data_sha256": hashlib.sha256((OUT / "joint-data.json").read_bytes()).hexdigest(),
                "underlay_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                "coordinates_changed": False}
    (OUT / "approval.json").write_text(json.dumps(approval, indent=2)+"\n", encoding="utf-8")
    print("Saved exact approved joint underlay; original guide coordinates are unchanged.")


if __name__ == "__main__":
    main()
