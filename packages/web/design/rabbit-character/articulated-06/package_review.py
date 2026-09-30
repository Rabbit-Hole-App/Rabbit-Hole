"""Package recordings of the live renderer; these are never playback assets."""
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
WORKSPACE = ROOT.parents[3]
CAPTURES = WORKSPACE / "tmp/rabbit-mascot/articulated-captures"
sys.path.insert(0, str(ROOT))
import prepare_joint_guide as guide


def load(name):
    return Image.open(CAPTURES / f"{name}.png").convert("RGB")


def loop(frames,stem,duration,gif=True):
    milliseconds = [round((i+1)*duration)-round(i*duration) for i in range(len(frames))]
    frames[0].save(OUT/f"{stem}.webp",save_all=True,append_images=frames[1:],
                   duration=milliseconds,loop=0,lossless=True,method=5)
    if gif:
        steps = [round((i+1)*duration/10)*10-round(i*duration/10)*10 for i in range(len(frames))]
        assert min(steps)>=10
        frames[0].save(OUT/f"{stem}.gif",save_all=True,append_images=frames[1:],
                       duration=steps,loop=0,disposal=2,optimize=False)


def sheet(images,labels,columns,name,size=(512,512),scale=1):
    w,h=size;cw,ch=round(w*scale),round(h*scale)
    result=Image.new("RGB",(columns*cw,((len(images)+columns-1)//columns)*(ch+38)),"white")
    draw=ImageDraw.Draw(result)
    for i,(im,label) in enumerate(zip(images,labels)):
        x,y=i%columns*cw,i//columns*(ch+38)
        result.paste(im.resize((cw,ch),Image.Resampling.NEAREST),(x,y))
        draw.text((x+12,y+ch+8),label,font=guide.font(15),fill="#445059")
    result.save(OUT/name)


def main():
    report=json.loads((OUT/"qa/browser-verification.json").read_text())
    assert report["pass"]
    single=[load(f"single-{i:03d}") for i in range(64)]
    compare=[load(f"compare-{i:03d}") for i in range(64)]
    overlay=[load(f"overlay-{i:03d}") for i in range(64)]
    world=[load(f"world-{i:03d}") for i in range(128)]
    locks=[load(f"locks-{i:03d}") for i in range(0,128,2)]
    # GIF centiseconds cannot represent 104 Hz; use 52 Hz for the normal GIF.
    loop(single[::2],"normal-run",1000/52)
    loop(single,"slow-run",4000/104)
    loop(compare,"comparison-slow",4000/104)
    loop(overlay,"skeleton-overlay",4000/104)
    loop(world[::2],"world-motion",1000/52)
    loop(locks,"foot-lock",1000/52)
    # Preserve all Chrome samples separately in lossless recordings.
    loop(single,"normal-run-104hz",1000/104,False)
    loop(world,"world-motion-104hz",1000/104,False)
    loop(single[56:]+single[:56],"cycle-seam",4000/104)
    sheet(single[::8],guide.PHASES,4,"rendered-key-review.png")
    sheet([load("rig-mesh"),single[0],overlay[0]],
          ["Shared mesh surface","Plain rendered skin","Anatomical L/R overlay"],3,"rig-visualization.png")
    phases=[0,.65,1.5,2,2.4,2.5,3,3.5,4,4.25,4.65,5.5,6,6.35,6.5,7,7.5,7.875]
    # Plain raster close-ups contain no joint overlay that could hide damage.
    for kind in ["leg","arm"]:
        images,labels=[],[]
        for side in ["left","right"]:
            for i,phase in enumerate(phases):
                raw=load(f"{side}_{kind}-{i:02d}")
                bounds=raw.point(lambda p:255-p).getbbox()
                if not bounds:raise AssertionError(f"Empty {side} {kind}")
                x0,y0,x1,y1=bounds
                crop=raw.crop((max(0,x0-8),max(0,y0-8),min(512,x1+8),min(512,y1+8)))
                canvas=Image.new("RGB",(240,230),"white")
                factor=min(220/crop.width,210/crop.height)
                crop=crop.resize((round(crop.width*factor),round(crop.height*factor)),Image.Resampling.NEAREST)
                canvas.paste(crop,((240-crop.width)//2,(230-crop.height)//2))
                images.append(canvas);labels.append(f"{side.upper()} / phase {phase:.3f}")
        sheet(images,labels,6,f"{kind}-deformation-closeups.png",(240,230))
    sheet([load(f"gray-{i:02d}") for i in range(len(phases))],
          [f"Undithered coverage / phase {p:.3f}" for p in phases],6,
          "surface-continuity-review.png",scale=.625)
    # Enlarged world crops for the same support hold at phases 0/.125/.25/.375.
    crops=[]
    for frame in world[:4]:
        crops.append(frame.crop((165,780,275,856)).resize((550,380),Image.Resampling.NEAREST))
    sheet(crops,["Continuous support: "+str(i) for i in range(4)],4,
          "foot-lock-closeup.png",(550,380))
    # Contact art, not an animation strip, is retained only as review evidence.
    (OUT/"recordings.json").write_text(json.dumps({
        "source":"isolated Chrome screenshots of live WebGL mesh evaluations",
        "runtime_uses_recordings":False,"runtime_full_character_pngs":False,
        "normal_cycle_seconds":8/13,"capture_samples_per_cycle":64,
        "gif_normal_samples_per_cycle":32,"slowdown":4,
        "world_repeat":"Two-cycle travel resets at file repeat; local gait seam occurs inside travel.",
        "capture_directory":str(CAPTURES.relative_to(WORKSPACE)),
        "review_does_not_imply_user_approval":True},indent=2)+"\n")
    print(json.dumps({"recorded_poses":64,"world_samples":128,"runtime_sprite_strips_created":0}))


if __name__=="__main__":
    main()
