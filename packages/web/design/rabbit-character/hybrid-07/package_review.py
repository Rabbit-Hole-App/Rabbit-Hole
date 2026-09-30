"""Package captured Chrome frames as evidence, never as run playback assets."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
CAP = ROOT.parents[3] / "tmp/rabbit-mascot/hybrid-captures"
FONT = ImageFont.load_default(size=16)


def sequence(name, prefix, count, step, duration, height=None):
    images = [Image.open(CAP/f"{prefix}-{i:03d}.png").convert("RGB") for i in range(0, count, step)]
    if height:
        images = [im.resize((round(im.width*height/im.height), height)) for im in images]
    images[0].save(OUT/f"{name}.webp", save_all=True, append_images=images[1:], duration=duration, loop=0, lossless=True, method=1)
    return images


def main():
    sequence("normal-run", "single", 64, 2, 19)
    sequence("slow-run", "single", 64, 1, 38)
    sequence("candidate06-vs07", "compare", 64, 1, 38)
    sequence("world-motion", "world", 128, 2, 19)
    sequence("foot-lock", "locks", 128, 2, 19)
    phases = [0, .65, 1, 1.5, 2, 2.5, 3, 4, 4.25, 4.65, 5.5, 6, 6.35, 6.5, 7, 7.875]
    for side in ["left", "right"]:
        sheet = Image.new("RGB", (1120, len(phases)*235), "white")
        draw = ImageDraw.Draw(sheet)
        for row, phase in enumerate(phases):
            original = Image.open(CAP/f"leg-{side}-plain-{row}.png").convert("RGB")
            gray = original.convert("L"); bounds = gray.point(lambda p: 255 if p<220 else 0).getbbox()
            x0,y0,x1,y1 = bounds
            bounds = (max(0,x0-8), max(0,y0-8), min(512,x1+8), min(512,y1+8))
            for column, view in enumerate(["plain", "skeleton", "weights", "outline"]):
                im = Image.open(CAP/f"leg-{side}-{view}-{row}.png").crop(bounds).convert("RGB")
                im.thumbnail((258,190))
                sheet.paste(im, (column*280+(280-im.width)//2,row*235+5))
                draw.text((column*280+10,row*235+202),f"{side.upper()} p{phase:g} / {view}",fill="#3f484d",font=FONT)
        sheet.save(OUT/f"{side}-leg-deformation-sheet.png")
    # One plain comparison with Pass 04; this is a review sheet, not a new strip.
    keys = Image.open(ROOT/"run-strip.png")
    sheet = Image.new("RGB", (1536, 3*560), "white")
    for row, (phase, index) in enumerate([(0,0),(4,7),(6,11)]):
        frame = keys.crop((phase*512,0,(phase+1)*512,512))
        sheet.paste(frame,(0,row*560),frame)
        sheet.paste(Image.open(CAP/f"compare-p{index}.png"),(512,row*560))
        ImageDraw.Draw(sheet).text((24,row*560+536),f"Pass 04 / key {phase+1:02d}",font=FONT,fill="#444444")
    sheet.save(OUT/"pass04-vs06-vs07.png")
    (OUT/"decision.json").write_text(json.dumps({"architecture_approved":True,"visual_approval":False,
      "decision":"park articulated skinning; use user-authorized Pass 04 temporarily",
      "further_run_refinement_requires_user_request":True},indent=2)+"\n")
    print("Saved final hybrid review; no additional run refinement.")


if __name__ == "__main__":
    main()
