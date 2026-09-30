"""Author shape-preserving leg sections from retained Pass 04 material.

No action strips or raster in-betweens are produced. Source artwork is unchanged.
"""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageChops

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
module_spec = importlib.util.spec_from_file_location("previous_rig", ROOT / "articulated-06/prepare_rig.py")
previous = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(previous)
PARTS = previous.PARTS


def make_section(side, section):
    name = f"{side}_{section}"
    spec = PARTS[name]
    texture = previous.mask_texture(spec)
    source = np.array(spec["bind"], float)
    length = previous.guide.D[{"thigh": "upper_leg", "shin": "lower_leg", "foot": "foot_length"}[section]]
    if section == "foot":
        # Normalize once to the approved heel/toe landmarks. Every runtime vertex
        # receives the SAME rigid transform, including heel, instep and toes.
        target = np.array([[0, 0], [-16, 15], [length-16, 15]])
        coefficients = np.linalg.solve(np.column_stack((source, np.ones(3))), target)
        matrix, translation = coefficients[:2].T, coefficients[2]
        bind = [[0, 0], [length-16, 15]]
    else:
        direction = previous.norm(source[1]-source[0])
        matrix, translation = previous.affine(source[0], source[1], np.array([0., 0.]), np.array([0., length]))
        bind = [[0, 0], [0, length]]
        # Remove the neighbouring section; use rounded overlapping anatomical
        # caps, never the rectangle around the raster crop.
        yy, xx = np.indices((512, 512))
        along = (xx-source[0, 0])*direction[0] + (yy-source[0, 1])*direction[1]
        alpha = np.array(texture.getchannel("A"))
        if section == "thigh":
            alpha[along > np.linalg.norm(source[1]-source[0])+2] = 0
        else:
            alpha[along > np.linalg.norm(source[1]-source[0])-5] = 0
            alpha[along < -7] = 0
        texture.putalpha(Image.fromarray(alpha))
    texture.save(OUT / f"textures/{name}.png")
    vertices, triangles = previous.grid(texture, lambda p: (matrix@p+translation, np.array([1.])))
    return {"name": name, "kind": "leg-section", "side": side, "section": section,
            "source_key": spec["key"], "texture": f"textures/{name}.png", "bind": bind,
            "source_bind": spec["bind"], "regions": [name], "vertices": vertices,
            "triangles": triangles, "weight_policy": "100% owning bone; no runtime scale/shear",
            "source_outline": spec["polygon"],
            "outline": [(matrix@p+translation).tolist() for p in np.array(spec["polygon"], float)]}


def make_joint(side, joint):
    key = 1 if side == "left" else 5
    source = np.array(PARTS[f"{side}_shin"]["bind"][0 if joint == "knee" else 1], float)
    source += [-6, -3] if joint == "knee" else [0, -4]
    radius = [13, 12] if joint == "knee" else [9, 10]
    image = previous.SOURCES[key].copy()
    # A tiny authored overlap disc supplies otherwise hidden skin. Fill only
    # missing material inside that disc from its nearest existing source pixel.
    pixels = np.array(image)
    valid = np.argwhere(pixels[:, :, 3] > 180)
    local = valid[(abs(valid[:, 1]-source[0]) < 28) & (abs(valid[:, 0]-source[1]) < 28)]
    for y in range(int(source[1]-radius[1]-2), int(source[1]+radius[1]+3)):
        for x in range(int(source[0]-radius[0]-2), int(source[0]+radius[0]+3)):
            if pixels[y, x, 3] < 180:
                sy, sx = local[np.argmin((local[:, 1]-x)**2+(local[:, 0]-y)**2)]
                pixels[y, x] = pixels[sy, sx]
    image = Image.fromarray(pixels)
    mask = Image.new("L", (512, 512)); ImageDraw.Draw(mask).ellipse(
        [source[0]-radius[0]-1, source[1]-radius[1]-1, source[0]+radius[0]+1, source[1]+radius[1]+1], fill=255)
    image.putalpha(mask)
    name = f"{side}_{joint}_skin"
    image.save(OUT / f"textures/{name}.png")
    vertices = [{"position": [0, 0], "uv": (source/512).tolist(), "weights": [1.]}]
    triangles = []
    for i in range(32):
        angle = math.tau*i/32
        position = np.array([radius[0]*math.cos(angle), radius[1]*math.sin(angle)])
        vertices.append({"position": position.tolist(), "uv": ((source+position)/512).tolist(), "weights": [1.]})
        triangles.extend([0, i+1, (i+1)%32+1])
    return {"name": name, "kind": "joint-skin", "side": side, "joint": joint,
            "texture": f"textures/{name}.png", "source_key": key,
            "bind": [[0, 0], [0, 1]], "regions": [name], "vertices": vertices, "triangles": triangles,
            "radius": radius, "corrections": "local contour only; never section or joint relocation"}


def main():
    rig = json.loads((ROOT / "articulated-06/rig.json").read_text())
    for name, expected in rig["source_sha256"].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, name
    (OUT / "textures").mkdir(parents=True, exist_ok=True)
    (OUT / "qa").mkdir(exist_ok=True)
    parts = []
    for side in ["left", "right"]:
        # Whole near leg occludes the far leg. Within one leg the rounded joint
        # material sits behind the anatomical sections, with the intact foot last.
        parts.extend([make_joint(side, "knee"), make_joint(side, "ankle")])
        parts.extend(make_section(side, name) for name in ["shin", "thigh", "foot"])
    for part in rig["parts"]:
        if part["name"].endswith("_leg"):
            continue
        part = copy.deepcopy(part)
        part["texture"] = "../articulated-06/"+part["texture"]
        parts.append(part)
    rig.update({"version": 7, "architecture_approved": True, "visual_approval": False,
                "visual_status": "candidate pending rendered review",
                "renderer": "continuous rigid anatomical sections / local corrective joint skin",
                "parts": parts, "semantic_layers": [r for p in parts for r in p["regions"]],
                "draw_order": [p["name"] for p in parts if p["kind"] in ["leg-section", "joint-skin"]] +
                    ["left_arm", "tail", "pelvis", "torso_coat", "left_ear", "right_ear", "head", "watch", "watch_bow", "right_arm"],
                "correction_shapes": {
                    "compression": {"phase": 1, "width": 1.1, "knee_radius_delta": [1, -1], "ankle_radius_delta": [1, 0]},
                    "toe_off": {"phase": 2.5, "width": .65, "knee_radius_delta": [0, 0], "ankle_radius_delta": [1, -1]},
                    "deep_recovery": {"phase": 4.2, "width": 1.6, "knee_radius_delta": [1, 0], "ankle_radius_delta": [0, -2]}
                }})
    (OUT / "rig.json").write_text(json.dumps(rig, separators=(",", ":"))+"\n")
    print(json.dumps({"anatomical_sections": 6, "local_joint_surfaces": 4,
                      "unchanged_nonleg_parts": len(parts)-10, "unchanged_source_inputs": len(rig["source_sha256"])}))


if __name__ == "__main__":
    main()
