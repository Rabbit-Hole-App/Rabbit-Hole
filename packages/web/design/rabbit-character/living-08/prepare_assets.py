"""Prepare existing character art for continuous living poses; no image generation."""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parents[1] / "public/mascot"
AUTHOR = Path(__file__).resolve().parent


def mesh(image, name):
    alpha = np.array(image.getchannel("A")); vertices, triangles, ids = [], [], {}
    def vertex(x, y):
        if (x,y) not in ids:
            ids[(x,y)] = len(vertices)
            vertices.append({"position":[x,y],"uv":[x/512,y/512],"weights":[1]})
        return ids[(x,y)]
    for y in range(0,508,4):
        for x in range(0,508,4):
            if alpha[y:y+5,x:x+5].max()==0: continue
            a,b,c,d=[vertex(*p) for p in [(x,y),(x+4,y),(x,y+4),(x+4,y+4)]]
            triangles.extend([a,b,c,b,d,c])
    image.save(OUT/f"{name}.png")
    return {"name":name,"kind":"living","texture":f"{name}.png","vertices":vertices,"triangles":triangles}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    hashes=json.loads((ROOT/"controlled-05/authoring/source-hashes.json").read_text())
    for path,expected in hashes.items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected
    source=Image.open(ROOT/"generated/run-04-right-profile-reference.png").convert("RGBA")
    scale=432/378; dx=256-214*scale; dy=480-418*scale
    standing=source.transform((512,512),Image.Transform.AFFINE,(1/scale,0,-dx/scale,0,1/scale,-dy/scale),Image.Resampling.BICUBIC)
    (AUTHOR/"authoring").mkdir(exist_ok=True)
    standing.save(AUTHOR/"authoring/standing-right.png")
    def points(poly): return [(round(x*scale+dx),round(y*scale+dy)) for x,y in poly]
    polygons={
      "body":[(197,171),(229,178),(247,201),(252,253),(242,288),(232,310),(230,351),(225,373),(234,388),(255,397),(267,407),(263,418),(201,421),(183,403),(184,382),(199,351),(190,321),(176,318),(170,281),(183,265),(188,230),(186,205)],
      "head":[(202,122),(220,114),(244,124),(254,143),(274,153),(277,168),(253,181),(231,185),(209,178),(195,166)],
      "ear_far":[(161,37),(178,46),(195,64),(210,93),(223,125),(214,138),(194,104),(182,82),(169,63)],
      "ear_near":[(142,51),(163,57),(185,77),(205,104),(218,128),(208,138),(188,122),(169,113),(155,93),(146,76)],
      "arm":[(199,190),(212,185),(224,193),(225,215),(221,239),(227,260),(226,275),(229,288),(228,302),(222,310),(209,307),(204,296),(199,280),(194,262),(192,241),(190,218),(192,201)],
      "watch":[(203,308),(216,305),(229,310),(241,320),(242,337),(232,348),(216,352),(201,346),(193,333),(195,318)],
      "bow":[(211,301),(219,300),(226,309),(223,318),(212,317),(208,310)]
    }
    parts=[]
    for name,poly in polygons.items():
        mask=Image.new('L',(512,512));ImageDraw.Draw(mask).polygon(points(poly),fill=255)
        image=standing.copy();image.putalpha(ImageChops.multiply(image.getchannel('A'),mask))
        if name=='body':
            # Behind the raised sleeve/watch use existing coat/trouser material.
            # This patch is occluded at rest and never touches head, feet or hem.
            arr=np.array(image); src=np.array(standing)
            x0,y0=points([(193,190)])[0]; x1,y1=points([(230,305)])[0]
            for y in range(y0,y1):
                for x in range(x0,x1):
                    sx,sy=(x-dx)/scale,(y-dy)/scale
                    if sy<278:
                        tx,ty=points([(min(245,sx+24),sy)])[0]
                    else:
                        tx,ty=points([(229,282+(sy-278)%12)])[0]
                    if arr[y,x,3]>0 and src[ty,tx,3]>160: arr[y,x]=src[ty,tx]
            # The source watch occludes the breeches completely. Author that
            # small concealed surface with a tapered silhouette and cloth tone;
            # do not clone the clock face or extend a rectangular sample tile.
            pants=Image.new('L',(512,512));ImageDraw.Draw(pants).polygon(points(
                [(207,299),(231,297),(231,318),(227,341),(224,363),(204,363),(204,343),(200,325)]),fill=255)
            pm=np.array(pants)
            for y,x in np.argwhere(pm>0):
                sx,sy=(x-dx)/scale,(y-dy)/scale
                edge=min(abs(sx-204),abs(sx-(231-(sy-300)*.11)))
                value=int(96+min(1,edge/5)*57+5*np.sin((sx+sy*.15)*2.2))
                arr[y,x]=[value,value,value,255]
            image=Image.fromarray(arr)
        parts.append(mesh(image,name))
    # Full authored opposing views supply facing changes, never mirrored watch art.
    for direction in ['left','front','back','front_left','front_right','back_left','back_right']:
        shutil.copyfile(ROOT/f'turnaround/{direction}.png',OUT/f'view-{direction}.png')
    shutil.copyfile(ROOT/'run-strip.png',OUT/'run-pass04.png')
    rig={"version":8,"action_technology":"continuous local mesh; existing WebGL compositor",
      "parts":parts,"draw_order":["body","ear_far","ear_near","head","watch","bow","arm"],
      "watch_hand":"right","mirroring_allowed":False,"source_sha256":hashes,
      "standing_registration":{"scale":scale,"offset":[dx,dy]},
      "joints":{name:points([p])[0] for name,p in {'pelvis':(215,333),'shoulder':(207,202),'elbow':(207,255),
         'wrist':(218,292),'grip':(216,305),'watch':(217,329),'neck':(218,175),'head':(233,147),'ear_root':(213,132)}.items()},
      "active_run":{"asset":"run-pass04.png","frames":8,"fps":13,"status":"user-authorized temporary MVP run; articulated work parked"}}
    (OUT/'rig.json').write_text(json.dumps(rig,separators=(',',':'))+'\n')
    (AUTHOR/'asset-manifest.json').write_text(json.dumps({"source":"existing standing right profile and unchanged Pass 04",
      "generated_images":0,"rig":"packages/web/public/mascot/rig.json","watch_hand":"right","source_sha256":hashes},indent=2)+'\n')
    print(json.dumps({"parts":len(parts),"output":str(OUT),"models_called":0}))


if __name__=='__main__': main()
