"""Build review comparisons, a measured model sheet, and a slow loop preview."""

import json
from PIL import Image, ImageDraw, ImageFont

from prepare_preview import ROOT, SIZE, FLOOR, contact, paper


def main():
    props = json.loads((ROOT / "proportions.json").read_text())
    manifest = json.loads((ROOT / "manifest.json").read_text())
    font = ImageFont.load_default(size=16)
    title = ImageFont.load_default(size=23)
    frames = [Image.open(ROOT / f"animations/run_right/frames/{i:02d}.png").convert("RGBA") for i in range(1, 9)]
    prior = []
    for i in range(1, 9):
        frame = Image.new("RGBA", (SIZE, SIZE))
        frame.alpha_composite(Image.open(ROOT / f"history/pass-02/animations/run_right/frames/{i:02d}.png").convert("RGBA"))
        prior.append(frame)
    comparison = []
    for i, (old, new) in enumerate(zip(prior, frames)):
        canvas = Image.new("RGB", (SIZE * 2, SIZE + 48), "white")
        canvas.paste(paper(old), (0, 0)); canvas.paste(paper(new), (SIZE, 0))
        draw = ImageDraw.Draw(canvas)
        draw.text((24, SIZE + 12), f"Previous candidate / {i + 1:02d}", fill="#555", font=font)
        draw.text((SIZE + 24, SIZE + 12), f"Refinement 03 / {i + 1:02d}", fill="#222", font=font)
        comparison.append(canvas)
    comparison[0].save(ROOT / "run-comparison.gif", save_all=True, append_images=comparison[1:],
                       duration=manifest["gif_durations_ms"], loop=0, disposal=2, optimize=False)
    contact(prior + frames, [f"Previous / {i:02d}" for i in range(1, 9)] +
            [f"Refinement / {i:02d}" for i in range(1, 9)], 8, ROOT / "run-comparison-sheet.png")
    contact([frames[i] for i in [6, 7, 0, 1]], ["07 / toe-off", "08 / flight", "01 / contact", "02 / compression"],
            4, ROOT / "run-seam-sheet.png")
    slow = []
    for i in [6, 7, 0, 1, 2, 3, 4, 5]:
        canvas = Image.new("RGB", (SIZE, SIZE + 48), "white")
        canvas.paste(paper(frames[i]), (0, 0))
        draw = ImageDraw.Draw(canvas)
        draw.text((24, SIZE + 12), f"Frame {i + 1:02d} / slow loop, including 08 to 01", fill="#333", font=font)
        slow.append(canvas)
    slow[0].save(ROOT / "run-seam-preview.gif", save_all=True, append_images=slow[1:],
                 duration=250, loop=0, disposal=2, optimize=False)

    # Targets stay separate from observed ink extents. Guides do not certify
    # hidden joint lengths or the physical correctness of a generated pose.
    canvas = Image.new("RGB", (SIZE * 4, 1120), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 20), "RABBIT / CANONICAL PROPORTIONS / refinement 03 - awaiting visual approval", font=title, fill="#222")
    height = props["height_pixels"]
    top = FLOOR - height
    for column, direction in enumerate(["front", "back", "left", "right"]):
        frame = Image.open(ROOT / f"turnaround/{direction}.png").convert("RGBA")
        canvas.paste(paper(frame), (column * SIZE, 60))
        draw.text((column * SIZE + 24, 578), direction.upper(), fill="#444", font=font)
        for name in ["ear_roots", "shoulders", "hips", "coat_hem", "knees", "soles"]:
            y = round(60 + top + height * props["landmarks_y_H"][name])
            x = column * SIZE
            draw.line((x + 24, y, x + 148, y), fill="#a8afb8", width=1)
            draw.line((x + 365, y, x + 488, y), fill="#a8afb8", width=1)
    draw.text((24, 628), "Drawing targets: H = 1.00 standing height = 432 px. Shared canvas 512 x 512. Sole/root [256, 480].", font=title, fill="#222")
    keys = list(props["dimensions_H"])
    for i, key in enumerate(keys):
        col, row = divmod(i, 8)
        value = props["dimensions_H"][key]
        draw.text((24 + col * 665, 680 + row * 30), f"{key.replace('_', ' '):26s}  {value:.3f} H  /  {value * height:.1f} px", font=font, fill="#333")
    draw.text((24, 949), "RIGHT PAW holds the watch bow. Front: image-left. Back: image-right. Left-facing views: far hand / natural occlusion.", font=font, fill="#333")
    draw.text((24, 982), "Targets are a drawing contract. Observed full-figure ink heights: " + ", ".join(
        f"{r['direction']} {r['ink_bounds'][3]-r['ink_bounds'][1]} px" for r in manifest["turnaround"]["registration"][:4]), font=font, fill="#555")
    draw.text((24, 1015), "Ear pitch, hidden joint placement and view consistency require visual review; matching bounds alone does not approve anatomy.", font=font, fill="#555")
    draw.text((24, 1048), "After approval, this sheet + proportions.json + the eight-view turnaround become the conditioning reference for every new action.", font=font, fill="#333")
    canvas.save(ROOT / "canonical-proportion-sheet.png")

    views, labels = [], []
    for direction in props["turnaround_order"]:
        for version, prefix in [("Previous", "history/pass-02/"), ("Refined", "")]:
            views.append(Image.open(ROOT / f"{prefix}turnaround/{direction}.png").convert("RGBA"))
            labels.append(f"{direction.replace('_', ' ')} / {version}")
    contact(views, labels, 4, ROOT / "turnaround-refinement-comparison.png")
    manifest["review"] = {"proportion_sheet": "canonical-proportion-sheet.png", "comparison": "run-comparison.gif",
                          "turnaround_comparison": "turnaround-refinement-comparison.png",
                          "seam_preview": "run-seam-preview.gif", "seam_sheet": "run-seam-sheet.png", "approved": False}
    manifest["character_bible"] = {"approved": False, "proportions": "proportions.json",
                                  "references": ["character-seed.png", "canonical-proportion-sheet.png", "turnaround-8-view-sheet.png"],
                                  "rule": "After approval, condition all future actions on the approved turnaround plus proportions."}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Saved old/new run comparison, seam contact sheet, slow loop, and canonical proportion sheet.")


if __name__ == "__main__":
    main()
