"""Build connected bind meshes from existing art. Never export run sprite frames."""
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageChops

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
sys.path.insert(0, str(ROOT))
import prepare_joint_guide as guide

OLD = ROOT / "controlled-05"
PARTS = json.loads((OLD / "authoring/cutouts.json").read_text())["parts"]
SOURCES = {i: Image.open(OLD / f"authoring/source-keys/{i:02d}.png").convert("RGBA") for i in (1, 5)}


def norm(v):
    return v / np.linalg.norm(v)


def affine(a, b, c, d):
    u, v = np.array(b)-a, np.array(d)-c
    su, tv = norm(u), norm(v)
    matrix = np.outer(v / np.linalg.norm(u), su) + np.outer([-tv[1], tv[0]], [-su[1], su[0]])
    return matrix, np.array(c)-matrix@a


def weights_at(point, chain, radius, foot=False):
    # Signed joint bisectors give continuous weights over the *entire* surface.
    # Nearest-segment selection is discontinuous on the inside of bent joints.
    transitions = []
    for i in range(1, len(chain)-1):
        axis = norm(norm(chain[i]-chain[i-1])+norm(chain[i+1]-chain[i]))
        if foot and i == 2:
            # The whole heel/sole belongs to the rigid foot. A diagonal ankle
            # bisector wrongly gives the heel shin weights, curling the paw.
            # Bend the lower fur above the ankle; preserve the authored foot.
            axis = norm(chain[i]-chain[i-1])
            t = np.clip((np.dot(point-chain[i],axis)+34)/24,0,1)
        else:
            t = np.clip((np.dot(point-chain[i], axis)+radius)/(2*radius),0,1)
        transitions.append(t*t*(3-2*t))
    result, remainder = [], 1.0
    for t in transitions:
        result.append(remainder*(1-t))
        remainder *= t
    return np.array(result+[remainder])


def mask_texture(spec):
    image = SOURCES[spec["key"]].copy()
    mask = Image.new("L", (512, 512))
    draw = ImageDraw.Draw(mask)
    if "polygon" in spec:
        draw.polygon([tuple(p) for p in spec["polygon"]], fill=255)
    else:
        draw.ellipse(spec["ellipse"], fill=255)
    image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return image


def grid(texture, transform):
    """Shared 4px lattice; neighboring triangles reference identical vertices."""
    alpha = np.array(texture.getchannel("A"))
    bounds = texture.getbbox()
    vertices, triangles, table = [], [], {}
    def vertex(x, y):
        key = (x, y)
        if key not in table:
            table[key] = len(vertices)
            position, weights = transform(np.array([x, y], float))
            vertices.append({"position": position.tolist(), "uv": [x/512, y/512], "weights": weights.tolist()})
        return table[key]
    for y in range(max(0, bounds[1]//4*4-4), min(508, bounds[3]+4), 4):
        for x in range(max(0, bounds[0]//4*4-4), min(508, bounds[2]+4), 4):
            if not alpha[y:y+5, x:x+5].max():
                continue
            a,b,c,d = [vertex(*p) for p in [(x,y),(x+4,y),(x,y+4),(x+4,y+4)]]
            triangles.extend([a,b,c,b,d,c])
    return vertices, triangles


def chain_part(name, key, polygon, source_chain, lengths, radius, labels):
    source = np.array(source_chain, float)
    bind = [source[0]]
    for i, length in enumerate(lengths):
        bind.append(bind[-1]+norm(source[i+1]-source[i])*length)
    bind = np.array(bind)
    matrices = [affine(a,b,c,d) for a,b,c,d in zip(source,source[1:],bind,bind[1:])]
    # The toe and heel bind to the approved physical foot, not its padded crop.
    if name.endswith("leg"):
        side = name.split("_")[0]
        ankle, heel, toe = np.array(PARTS[f"{side}_foot"]["bind"], float)
        bind[-1] = bind[-2]+[guide.D["foot_length"]-16, 15]
        src = np.column_stack(([ankle, heel, toe], np.ones(3)))
        dst = np.array([bind[-2], bind[-2]+[-16,15], bind[-1]])
        coefficients = np.linalg.solve(src, dst)
        matrices[-1] = coefficients[:2].T, coefficients[2]
    def transform(p):
        weights = weights_at(p, source, radius, name.endswith("leg"))
        position = sum(w*(m@p+t) for w,(m,t) in zip(weights, matrices))
        return position, weights
    texture = mask_texture({"key":key,"polygon":polygon})
    texture.save(OUT / f"textures/{name}.png")
    vertices, triangles = grid(texture, transform)
    return {"name":name,"kind":"chain","texture":f"textures/{name}.png",
            "source_key":key,"source_chain":source.tolist(),"bind":bind.tolist(),
            "regions":labels,"blend_radius_source_px":radius,
            "vertices":vertices,"triangles":triangles}


def simple_part(name, source_name, kind="rigid", spec=None):
    spec = spec or PARTS[source_name]
    texture = mask_texture(spec)
    texture.save(OUT / f"textures/{name}.png")
    vertices, triangles = grid(texture, lambda p:(p,np.array([1.])))
    return {"name":name,"kind":kind,"texture":f"textures/{name}.png",
            "source_key":spec["key"],"bind":spec["bind"],"regions":[name],
            "vertices":vertices,"triangles":triangles}


def main():
    hashes = json.loads((OLD / "authoring/source-hashes.json").read_text())
    for filename, expected in hashes.items():
        assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest() == expected, filename
    assert json.loads((guide.OUT/"approval.json").read_text())["approved"]
    (OUT/"textures").mkdir(parents=True, exist_ok=True)
    (OUT/"qa").mkdir(exist_ok=True)
    parts = []
    for side, key in [("left",1),("right",5)]:
        # One uninterrupted silhouette including the cuff, ankle and whole paw.
        polygon = ([[248,332],[270,339],[287,352],[308,374],[324,391],[325,426],
                    [325,448],[331,461],[348,464],[371,463],[386,470],[386,481],
                    [304,484],[287,478],[286,468],[292,450],[288,426],[283,410],
                    [267,394],[245,374],[234,354]])
        ankle = [311,462] if side=="right" else [310,462]
        knee = [316,402] if side=="right" else [315,402]
        toe = PARTS[f"{side}_foot"]["bind"][2]
        parts.append(chain_part(f"{side}_leg",key,polygon,
            [[260,354],knee,ankle,toe],
            [guide.D["upper_leg"],guide.D["lower_leg"],guide.D["foot_length"]-16],
            18,[f"{side}_thigh",f"{side}_shin",f"{side}_foot"]))
    parts.append(chain_part("left_arm",1,
        [[242,222],[257,226],[256,243],[239,255],[231,271],[226,288],
         [224,303],[218,314],[207,319],[196,315],[189,306],[192,293],
         [193,276],[200,254],[207,238],[225,230]],
        [[244,236],[216,268],[210,294],[205,309]],
        [guide.D["upper_arm"],guide.D["forearm"],guide.D["hand"]],12,
        ["left_upper_arm","left_forearm","left_paw"]))
    parts += [simple_part("tail","tail"),simple_part("pelvis","body",spec={
        "key":5,"polygon":[[236,316],[279,318],[296,344],[289,369],[269,382],
                           [246,376],[228,359],[227,337]],"bind":[[256,356],[278,241]]}),
              simple_part("torso_coat","body"),simple_part("left_ear","ear_far","ear"),
              simple_part("right_ear","ear_near","ear"),simple_part("head","head")]
    parts.append(chain_part("right_arm",1,
        [[263,223],[279,219],[291,226],[296,242],[299,258],[310,266],
         [331,259],[346,256],[355,250],[369,249],[381,256],[385,268],
         [382,280],[375,286],[362,284],[350,287],[333,290],[313,294],
         [297,298],[281,285],[270,267],[258,247]],
        [[275,240],[296,278],[347,270],[375,280]],
        [guide.D["upper_arm"],guide.D["forearm"],guide.D["hand"]],14,
        ["right_upper_arm","right_forearm","right_paw"]))
    parts += [simple_part("watch","watch_face"),simple_part("watch_bow","watch_bow")]
    guide.WATCH = guide.watch_angles()
    old_manifest = json.loads((OLD/"manifest.json").read_text())
    rig = {"version":6,"visual_approval":False,"visual_status":"failed skinning gate: pinched recovery ankles",
           "action":"run","facing":"right",
           "renderer":"continuous connected mesh / dual quaternion",
           "source_sha256":hashes,"dimensions":guide.D,"parts":parts,
           "watch_curve":guide.WATCH,"ear_curves":old_manifest["ear_curves"]["samples"],
           "semantic_layers":[r for p in parts for r in p["regions"]],
           "physics_root_owned_by":"caller","visual_root_compensation":[0,0],
           "mirroring_allowed":False,"watch_hand":"right","step_source_px":60,
           "cycle_source_px":480,"nominal_speed_source_px_s":780}
    (OUT/"rig.json").write_text(json.dumps(rig,separators=(",",":"))+"\n")
    fixtures=[guide.with_watch(p) for p in [i/104 for i in range(832)]]
    (OUT/"qa/guide-fixture.json").write_text(json.dumps(fixtures,separators=(",",":"))+"\n")
    print(json.dumps({"parts":len(parts),"semantic_layers":len(rig["semantic_layers"]),
          "vertices":sum(len(p["vertices"]) for p in parts),"unchanged_inputs":len(hashes)}))


if __name__ == "__main__":
    main()
