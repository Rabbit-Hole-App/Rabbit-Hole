"""Measured motion diagrams, not rabbit artwork or a runtime animation rig.

The eight requested keys sample a continuous, fixed-length skeleton. Anatomical
identity never follows screen position. Pillow draws only geometric diagrams.
"""

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "motion/run_right/guide-04"
PROPS = json.loads((ROOT / "proportions.json").read_text())
H = PROPS["height_pixels"]
D = {name: value * H for name, value in PROPS["dimensions_H"].items()}
FPS = 13
STEP = 60.0  # Source pixels travelled per 1/13 s; this is a guide speed.
FLOOR = 480.0
TOE_START = 356.0
STANCE_END = 2.5
LEFT = "#146e99"
RIGHT = "#b54e29"
INK = "#343e45"
MUTED = "#67747c"
PAPER = "#fbfaf6"
PHASES = ["CONTACT A", "COMPRESSION A", "PASSING / PUSH A", "FLIGHT A",
          "CONTACT B", "COMPRESSION B", "PASSING / PUSH B", "FLIGHT B"]
NOTES = [
    ("LEFT supports; RIGHT recovers behind.", "RIGHT/watch arm forward; LEFT arm back."),
    ("LEFT knee bends under load.", "RIGHT leg recovers; pelvis reaches its low point."),
    ("LEFT heel rises; toe pushes behind root.", "RIGHT knee passes under pelvis; arms cross mid-swing."),
    ("Both feet clear; LEFT trails behind.", "RIGHT knee leads; LEFT arm forward, watch arm back."),
    ("RIGHT supports; LEFT recovers behind.", "LEFT/empty arm forward; RIGHT/watch arm back."),
    ("RIGHT knee bends under load.", "LEFT leg recovers; pelvis reaches its low point."),
    ("RIGHT heel rises; toe pushes behind root.", "LEFT knee passes under pelvis; arms cross mid-swing."),
    ("Both feet clear; RIGHT trails behind.", "LEFT knee leads; watch arm returning forward."),
]


def font(size, bold=False):
    path = Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf")
    return ImageFont.truetype(str(path), size)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def polar(length, degrees):
    angle = math.radians(degrees)
    return (length * math.sin(angle), length * math.cos(angle), 0.0)


def hermite(a, b, va, vb, t, span=1.0):
    return ((2*t**3-3*t*t+1)*a + (t**3-2*t*t+t)*va*span
            + (-2*t**3+3*t*t)*b + (t**3-t*t)*vb*span)


def periodic(values, phase):
    p = phase % len(values)
    i = int(p)
    n = len(values)
    return hermite(values[i], values[(i+1) % n],
                   (values[(i+1) % n]-values[(i-1) % n])/2,
                   (values[(i+2) % n]-values[i])/2, p-i)


def rotate(point, degrees):
    angle = math.radians(degrees)
    x, y = point
    return (x*math.cos(angle)-y*math.sin(angle),
            x*math.sin(angle)+y*math.cos(angle))


def foot_from_ankle(ankle, angle):
    toe = add(ankle, (*rotate((D["foot_length"]-16, 15), angle), 0))
    heel = add(ankle, (*rotate((-16, 15), angle), 0))
    return heel, toe


def stance_ankle(p):
    amount = max(0.0, min(1.0, (p-1.0)/(STANCE_END-1.0)))
    angle = 55 * (3*amount**2 - 2*amount**3)
    dx, dy = rotate((D["foot_length"]-16, 15), angle)
    return (TOE_START-STEP*p-dx, FLOOR-dy), angle


SWING_START, _ = stance_ankle(STANCE_END)
SWING_END, _ = stance_ankle(0)
SWING = [(2.5, *SWING_START, 55), (3.0, 160, 410, 5),
         (4.0, 161, 394, -35), (5.0, 176, 401, -15),
         (6.0, 211, 426, -8), (7.0, 308, 425, -12),
         (8.0, *SWING_END, 0)]


def swing_value(p, component):
    def tangent(index):
        if index in (0, len(SWING)-1):
            return -STEP if component == 1 else 0.0
        before, after = SWING[index-1], SWING[index+1]
        return (after[component]-before[component])/(after[0]-before[0])
    i = next(i for i in range(len(SWING)-1) if p <= SWING[i+1][0])
    a, b = SWING[i], SWING[i+1]
    span = b[0]-a[0]
    return hermite(a[component], b[component], tangent(i), tangent(i+1),
                   (p-a[0])/span, span)


def knee_between(hip, ankle):
    """Two fixed-length segments; choose the knee-forward sagittal solution."""
    dx, dy = ankle[0]-hip[0], ankle[1]-hip[1]
    distance = math.hypot(dx, dy)
    upper, lower = D["upper_leg"], D["lower_leg"]
    if not abs(upper-lower) < distance < upper+lower:
        raise ValueError(f"Unreachable ankle: {distance:.3f}, hip={hip}, ankle={ankle}")
    along = (upper**2-lower**2+distance**2)/(2*distance)
    normal = math.sqrt(upper**2-along**2)
    return (hip[0]+along*dx/distance+normal*dy/distance,
            hip[1]+along*dy/distance-normal*dx/distance, hip[2])


def pose(phase):
    p = phase % 8
    root = (256.0, periodic([356, 371, 358, 348], p), 0.0)
    lean = periodic([12, 13, 11, 12], p)
    shoulder_root = add(root, polar(D["torso_length"], 180-lean))
    head = add(shoulder_root, (14, -45, 0))
    hip_yaw = -6*math.cos(p*math.pi/4)
    shoulder_yaw = 8*math.cos(p*math.pi/4)
    result = {"phase": p, "root": root, "shoulder_root": shoulder_root,
              "head": head, "lean_degrees": lean, "hip_yaw_degrees": hip_yaw,
              "shoulder_yaw_degrees": shoulder_yaw, "legs": {}, "arms": {}}
    for side, sign in [("left", -1), ("right", 1)]:
        hip = add(root, (sign*D["hip_width"]/2*math.sin(math.radians(hip_yaw)),
                         0, sign*D["hip_width"]/2*math.cos(math.radians(hip_yaw))))
        leg_phase = (p + (0 if side == "left" else 4)) % 8
        if leg_phase <= STANCE_END:
            (x, y), angle = stance_ankle(leg_phase)
            support = True
        else:
            x, y, angle = (swing_value(leg_phase, i) for i in (1, 2, 3))
            support = False
        ankle = (x, y, hip[2])
        heel, toe = foot_from_ankle(ankle, angle)
        result["legs"][side] = {"hip": hip, "knee": knee_between(hip, ankle),
                                 "ankle": ankle, "heel": heel, "toe": toe,
                                 "support": support, "foot_angle_degrees": angle,
                                 "local_phase": leg_phase}
        shoulder = add(shoulder_root,
                       (sign*D["shoulder_width"]/2*math.sin(math.radians(shoulder_yaw)),
                        0, sign*D["shoulder_width"]/2*math.cos(math.radians(shoulder_yaw))))
        # Near right arm has a slightly more open elbow for the pinched watch grip.
        arm_phase = p + (0 if side == "right" else 4)
        counter = math.cos(arm_phase*math.pi/4)
        upper_angle = -16.5+41.5*counter
        elbow_angle = (110-20*counter) if side == "right" else (103-25*counter)
        forearm_angle = upper_angle+180-elbow_angle
        elbow = add(shoulder, polar(D["upper_arm"], upper_angle))
        wrist = add(elbow, polar(D["forearm"], forearm_angle))
        grip = add(wrist, polar(D["hand"], forearm_angle-8))
        result["arms"][side] = {"shoulder": shoulder, "elbow": elbow,
                                 "wrist": wrist, "grip": grip,
                                 "elbow_angle_degrees": elbow_angle}
    return result


def watch_angles():
    """Small stylized lag from grip acceleration, warmed to a periodic response."""
    samples, angle, velocity = 416, 0.0, 0.0
    dt = 8/FPS/samples
    result = []
    for step in range(samples*16):
        p = (step % samples)*8/samples
        epsilon = .002
        x = pose(p)["arms"]["right"]["grip"][0]
        before = pose(p-epsilon)["arms"]["right"]["grip"][0]
        after = pose(p+epsilon)["arms"]["right"]["grip"][0]
        acceleration = (after-2*x+before)/(epsilon/FPS)**2
        target = max(-.24, min(.24, math.atan2(-.07*acceleration, H*5)))
        velocity += (18**2*(target-angle)-2*.85*18*velocity)*dt
        angle += velocity*dt
        if step >= samples*15:
            result.append(angle)
    return result


WATCH = None


def with_watch(phase):
    result = pose(phase)
    index = (phase % 8)/8*len(WATCH)
    i, t = int(index), index % 1
    angle = WATCH[i]*(1-t)+WATCH[(i+1) % len(WATCH)]*t
    grip = result["arms"]["right"]["grip"]
    center = add(grip, (D["watch_grip_to_center"]*math.sin(angle),
                        D["watch_grip_to_center"]*math.cos(angle), 0))
    result["watch"] = {"hand": "right", "grip": grip, "center": center,
                       "diameter": D["watch_diameter"], "lag_degrees": math.degrees(angle)}
    return result


def draw_pose(draw, data, origin=(0, 0), scale=1.0, labels=False, ground=True):
    def xy(point):
        return (origin[0]+point[0]*scale, origin[1]+point[1]*scale)
    def line(a, b, color, width=4, dashed=False):
        a, b = xy(a), xy(b)
        if not dashed:
            draw.line((a, b), fill=color, width=max(1, round(width*scale)))
            return
        distance = math.dist(a, b)
        for start in range(0, max(1, int(distance)), max(3, round(12*scale))):
            end = min(distance, start+8*scale)
            pts = [(a[0]+(b[0]-a[0])*v/distance, a[1]+(b[1]-a[1])*v/distance)
                   for v in (start, end)]
            draw.line(pts, fill=color, width=max(1, round(width*scale)))
    def joint(point, side, radius=4):
        x, y = xy(point)
        r = radius*scale
        bounds = (x-r, y-r, x+r, y+r)
        if side == "left":
            draw.rectangle(bounds, fill=PAPER, outline=LEFT, width=max(1, round(2*scale)))
        else:
            draw.ellipse(bounds, fill=PAPER, outline=RIGHT, width=max(1, round(2*scale)))
    if ground:
        line((50, FLOOR), (470, FLOOR), "#a7adb0", 1)
        line((256, 315), (256, 495), "#d8dcdd", 1, True)
    line(data["root"], data["shoulder_root"], "#687880", 7)
    line(data["shoulder_root"], data["head"], "#687880", 5)
    line(data["legs"]["left"]["hip"], data["legs"]["right"]["hip"], INK, 7)
    line(data["arms"]["left"]["shoulder"], data["arms"]["right"]["shoulder"], INK, 6)
    hx, hy = xy(data["head"])
    draw.ellipse((hx-41*scale, hy-31*scale, hx+41*scale, hy+31*scale),
                 fill=PAPER, outline=INK, width=max(1, round(2*scale)))
    line(add(data["head"], (20, -4, 0)), add(data["head"], (46, -4, 0)), INK, 2)
    for side in ("left", "right"):
        color = LEFT if side == "left" else RIGHT
        leg, arm = data["legs"][side], data["arms"][side]
        for chain in ([leg[k] for k in ("hip", "knee", "ankle")],
                      [arm[k] for k in ("shoulder", "elbow", "wrist", "grip")]):
            for a, b in zip(chain, chain[1:]):
                line(a, b, color, 5, side == "left")
            for point in chain:
                joint(point, side)
        line(leg["ankle"], leg["heel"], color, 2, side == "left")
        line(leg["heel"], leg["toe"], color, 6, side == "left")
        joint(leg["toe"], side, 3)
        if leg["support"]:
            x, y = xy(leg["toe"])
            draw.polygon([(x-7*scale, y+12*scale), (x+7*scale, y+12*scale), (x, y+3*scale)], fill=color)
        if labels:
            # Keep the passing-pose overlap readable; the separate joint map names
            # every node. Side letters here track anatomical identity, not depth.
            x, y = xy(leg["knee"])
            draw.text((x+(-19 if side == "left" else 9)*scale, y-19*scale),
                      side[0].upper(), fill=color, font=font(max(10, round(14*scale)), True))
            x, y = xy(arm["elbow"])
            draw.text((x+(-19 if side == "left" else 9)*scale, y-18*scale),
                      side[0].upper(), fill=color, font=font(max(10, round(14*scale)), True))
    watch = data["watch"]
    line(watch["grip"], watch["center"], RIGHT, 2)
    cx, cy = xy(watch["center"])
    radius = watch["diameter"]/2*scale
    draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline=RIGHT, width=max(1, round(2*scale)))
    draw.text((cx-6*scale, cy-11*scale), "W", font=font(max(10, round(14*scale)), True), fill=RIGHT)
    rx, ry = xy(data["root"])
    draw.rectangle((rx-4*scale, ry-4*scale, rx+4*scale, ry+4*scale), fill=INK)


def card(index, labels=True):
    canvas = Image.new("RGB", (512, 620), PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 20), f"{index+1:02d}   {PHASES[index]}", font=font(23, True), fill=INK)
    draw.text((24, 57), "L = anatomical left    R = anatomical right", font=font(15), fill=MUTED)
    draw_pose(draw, with_watch(index), labels=labels)
    draw.text((24, 516), NOTES[index][0], font=font(17, True), fill=INK)
    draw.text((24, 546), NOTES[index][1], font=font(14), fill=MUTED)
    support = "none / flight" if index in (3, 7) else ("LEFT" if index < 4 else "RIGHT")
    draw.text((24, 580), f"Support: {support}     |     Watch: RIGHT paw", font=font(15), fill=INK)
    return canvas


def header(draw, title, subtitle):
    draw.text((24, 15), title, font=font(30, True), fill=INK)
    draw.text((24, 58), subtitle, font=font(17), fill=MUTED)
    draw.text((24, 87), "BLUE / dashed / squares = LEFT (far)     ORANGE / solid / circles = RIGHT (near, watch)",
              font=font(17, True), fill=INK)


def save_loop(frames, stem, durations):
    frames[0].save(OUT / f"{stem}.gif", save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, disposal=2, optimize=False)
    frames[0].save(OUT / f"{stem}.webp", save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, lossless=True)


def world_frames():
    frames = []
    scale = .70
    for sample in range(64):
        p = sample/4
        canvas = Image.new("RGB", (1120, 820), PAPER)
        draw = ImageDraw.Draw(canvas)
        draw.text((24, 15), "Same gait + same continuous travel: two different sampling methods", font=font(23, True), fill=INK)
        draw.text((24, 54), "Skeleton diagnostic only. No new rabbit artwork or gameplay. Camera / ground stay fixed.", font=font(17), fill=MUTED)
        root_x = 115+STEP*p*scale
        for row, local_phase in enumerate((p, math.floor(p))):
            baseline = 412+row*365
            title = "CONTINUOUS JOINTS: support toe holds one world point" if row == 0 else "EIGHT HELD POSES: visible slip inside each frame remains"
            draw.text((24, baseline-321), title, font=font(18, True), fill=INK)
            draw.line((30, baseline, 1090, baseline), fill="#9aa5aa", width=2)
            for x in range(50, 1100, 50):
                draw.line((x, baseline, x, baseline+9), fill="#9aa5aa", width=2)
            data = with_watch(local_phase)
            origin = (root_x-256*scale, baseline-FLOOR*scale)
            draw_pose(draw, data, origin, scale, ground=False)
            for side in ("left", "right"):
                if data["legs"][side]["support"]:
                    contact_phase = math.floor(p/8)*8+(0 if side == "left" else 4)
                    if contact_phase > p:
                        contact_phase -= 8
                    anchor = 115+(STEP*contact_phase+TOE_START-256)*scale
                    draw.line((anchor, baseline-12, anchor, baseline+20),
                              fill=LEFT if side == "left" else RIGHT, width=2)
            draw.text((820, baseline-34), f"{p/FPS:.3f}s  /  pose {int(local_phase)%8+1:02d}", font=font(17), fill=MUTED)
        frames.append(canvas)
    return frames


def joint_map():
    canvas = Image.new("RGB", (1280, 850), PAPER)
    draw = ImageDraw.Draw(canvas)
    header(draw, "Joint topology / anatomical identities never change", "Frame 01, enlarged 1.1x. Lines show actual joint connectivity; the torso is transparent for review.")
    data = with_watch(0)
    origin = (350, 85)
    draw_pose(draw, data, origin, 1.1, ground=True)
    labels = [("HEAD", data["head"], 90, 230, INK),
              ("Shoulder root", data["shoulder_root"], 90, 285, INK),
              ("L shoulder", data["arms"]["left"]["shoulder"], 90, 335, LEFT),
              ("L elbow", data["arms"]["left"]["elbow"], 90, 385, LEFT),
              ("L wrist / empty hand", data["arms"]["left"]["wrist"], 90, 435, LEFT),
              ("PELVIS / ROOT", data["root"], 90, 490, INK),
              ("L hip", data["legs"]["left"]["hip"], 90, 540, LEFT),
              ("L knee", data["legs"]["left"]["knee"], 90, 590, LEFT),
              ("L ankle", data["legs"]["left"]["ankle"], 90, 640, LEFT),
              ("L heel + toe / support", data["legs"]["left"]["toe"], 90, 690, LEFT),
              ("R shoulder", data["arms"]["right"]["shoulder"], 925, 275, RIGHT),
              ("R elbow", data["arms"]["right"]["elbow"], 925, 325, RIGHT),
              ("R wrist", data["arms"]["right"]["wrist"], 925, 375, RIGHT),
              ("R hand / bow grip", data["arms"]["right"]["grip"], 925, 425, RIGHT),
              ("Watch center", data["watch"]["center"], 925, 475, RIGHT),
              ("R hip", data["legs"]["right"]["hip"], 925, 535, RIGHT),
              ("R knee", data["legs"]["right"]["knee"], 925, 585, RIGHT),
              ("R ankle", data["legs"]["right"]["ankle"], 925, 635, RIGHT),
              ("R heel + toe / recovering", data["legs"]["right"]["toe"], 925, 685, RIGHT)]
    for label, point, x, y, color in labels:
        draw.text((x, y), label, fill=color, font=font(19, label in ("HEAD", "PELVIS / ROOT")))
        endpoint = (origin[0]+point[0]*1.1, origin[1]+point[1]*1.1)
        start = (325 if x < 500 else 910, y+13)
        draw.line((start, endpoint), fill="#bdc3c6", width=1)
    draw.text((90, 770), "Both hips belong to one pelvis. Both shoulders belong to one chest. The watch belongs only to the R hand.", font=font(19, True), fill=INK)
    draw.text((90, 808), "Hips/chest yaw in opposition; projected joint overlap is intentional. Colors are diagnostic, not costume markings.", font=font(18), fill=MUTED)
    canvas.save(OUT/"joint-topology.png")


def main():
    global WATCH
    OUT.mkdir(parents=True, exist_ok=True)
    WATCH = watch_angles()
    keys = [{"frame": i+1, "phase_name": PHASES[i], **with_watch(i)} for i in range(8)]
    records = {"status": "motion design candidate; user approval pending; not rabbit artwork",
               "guide_approved": False, "new_rabbit_art_generated": False,
               "character_proportions_sha256": hashlib.sha256((ROOT/"proportions.json").read_bytes()).hexdigest(),
               "preserved_run_strip_sha256": hashlib.sha256((ROOT/"run-strip.png").read_bytes()).hexdigest(),
               "preserved_turnaround_sha256": hashlib.sha256((ROOT/"turnaround-8-view-sheet.png").read_bytes()).hexdigest(),
               "canvas": [512, 512], "ground_anchor": [256, FLOOR], "height_px": H,
               "fps": FPS, "source_speed_px_s": STEP*FPS, "travel_px_per_pose": STEP,
               "stance_interval_each_leg": [0, STANCE_END],
               "coordinates": "x forward, y down, z toward viewer; orthographic x/y projection",
               "dimensions_px": D, "keys": keys}
    (OUT/"joint-data.json").write_text(json.dumps(records, indent=2)+"\n", encoding="utf-8")
    cards = [card(i) for i in range(8)]
    sheet = Image.new("RGB", (2048, 1380), PAPER)
    draw = ImageDraw.Draw(sheet)
    header(draw, "RUN RIGHT / joint guide 04", "01-04: LEFT support half     05-08: RIGHT support half     Same proportions as refinement 03")
    for i, panel in enumerate(cards):
        sheet.paste(panel, (i % 4*512, 132+i//4*620))
    sheet.save(OUT/"motion-skeleton-sheet.png")
    strip = Image.new("RGB", (4096, 620), PAPER)
    for i, panel in enumerate(cards):
        strip.paste(panel, (i*512, 0))
    strip.save(OUT/"stride-phase-sheet.png")
    compare = Image.new("RGB", (1024, 842), PAPER)
    draw = ImageDraw.Draw(compare)
    header(draw, "01 versus 05 / the stride must exchange sides", "Same body pose and limb lengths; opposite anatomical limbs carry each job.")
    compare.paste(cards[0], (0, 132))
    compare.paste(cards[4], (512, 132))
    draw.text((24, 765), "01: L leg + R arm forward       ->       05: R leg + L arm forward", font=font(24, True), fill=INK)
    draw.text((24, 810), "Watch follows the ORANGE right-hand chain in both poses. It never changes hands.", font=font(18), fill=MUTED)
    compare.save(OUT/"contact-a-vs-b.png")
    joint_map()
    save_loop(cards, "motion-guide", [80, 70, 80, 80, 70, 80, 80, 80])
    save_loop(cards, "motion-guide-slow", [250]*8)
    # A full cycle rotated to 07,08,01,02... avoids a fake 02->07 reset.
    save_loop([cards[i] for i in (6, 7, 0, 1, 2, 3, 4, 5)], "seam-08-to-01", [250]*8)
    smooth = []
    for i in range(64):
        panel = Image.new("RGB", (512, 620), PAPER)
        draw = ImageDraw.Draw(panel)
        draw.text((24, 22), "CONTINUOUS SKELETON", font=font(25, True), fill=INK)
        draw.text((24, 61), "Intermediates are rig samples, not extra rabbit frames.", font=font(16), fill=MUTED)
        draw_pose(draw, with_watch(i/8), labels=False)
        draw.text((24, 534), "LEFT: blue dashed / RIGHT + watch: orange", font=font(19), fill=INK)
        draw.text((24, 573), f"Phase {i/8+1:.3f}   |   geometry loop, slowed 2x", font=font(17), fill=MUTED)
        smooth.append(panel)
    save_loop(smooth, "continuous-skeleton", [20 if i % 13 else 10 for i in range(64)])
    travel = world_frames()
    save_loop(travel, "world-contact-diagnostic", [20 if i % 13 else 10 for i in range(64)])
    travel[23].save(OUT/"world-contact-diagnostic-still.png")
    print(f"Saved joint guide, complementary contacts, phase strip and motion diagnostics to {OUT}")


if __name__ == "__main__":
    main()
