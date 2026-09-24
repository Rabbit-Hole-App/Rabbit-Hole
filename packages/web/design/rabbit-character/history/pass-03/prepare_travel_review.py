"""Measure support patches and package actual Chrome travel captures for review."""

import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from prepare_preview import ROOT, contact

FPS = 13
DISPLAY_SCALE = .375
STANCE = [1, 2, 3, 5, 6, 7]


def contacts(prefix):
    result = []
    for number in STANCE:
        frame = Image.open(ROOT / prefix / f"animations/run_right/frames/{number:02d}.png").convert("RGBA")
        # The foremost ink in the lowest 4px support band is a repeatable contact
        # patch proxy, not an exact material vertex or an automatic anatomy claim.
        bounds = frame.getchannel("A").crop((0, 476, 512, 480)).getbbox()
        if not bounds or frame.getbbox()[3] != 480:
            raise ValueError(f"Inspect support/baseline for {prefix} frame {number}.")
        x = bounds[2] - 1
        ys = [y for y in range(476,480) if frame.getpixel((x,y))[3]]
        result.append({"frame": number, "x": x, "y": max(ys),
                       "support": "right" if number < 4 else "left"})
    return result


def fitted_speed(points):
    # One common slope, separate intercept for each support episode.
    return -sum(points[start+2]["x"] - points[start]["x"] for start in [0,3]) * FPS / 4


def drift(points, speed, fps=FPS):
    episodes = []
    for start in [0,3]:
        phase = points[start:start+3]
        positions = [p["x"] + i * speed / fps for i,p in enumerate(phase)]
        extent = max(positions) - min(positions)
        episodes.append({"frames": [p["frame"] for p in phase],
                         "world_patch_x_source_px": positions,
                         "pose_to_pose_range_source_px": round(extent,3),
                         "pose_to_pose_range_display_px": round(extent * DISPLAY_SCALE,3)})
    return episodes


def prepare():
    current, previous = contacts(""), contacts("history/pass-02")
    speed = fitted_speed(current)
    config = {"fps": FPS, "display_scale": DISPLAY_SCALE, "speed_source_px_s": speed,
              "current": current, "previous": previous,
              "measurement": "Foremost opaque ink in y=476..479 support band, visually checked against each support pose.",
              "uncertainty_source_px": 4,
              "current_strip_sha256": hashlib.sha256((ROOT/'run-strip.png').read_bytes()).hexdigest(),
              "previous_strip_sha256": hashlib.sha256((ROOT/'history/pass-02/run-strip.png').read_bytes()).hexdigest()}
    (ROOT/'qa/foot-contacts.json').write_text(json.dumps(config,indent=2)+'\n')
    report = {"fps":FPS,"display_scale":DISPLAY_SCALE,"fitted_speed_source_px_s":speed,
              "fitted_speed_display_px_s":speed*DISPLAY_SCALE,
              "previous_best_fit_source_px_s":fitted_speed(previous),
              "current_at_fitted_speed":drift(current,speed),
              "previous_at_same_speed":drift(previous,speed),
              "previous_at_own_best_fit":drift(previous,fitted_speed(previous)),
              "speed_sweep":[{"ratio":ratio,"current":drift(current,speed*ratio)} for ratio in [.8,1,1.2]],
              "playback_sweep":[{"fps":fps,"current":drift(current,speed,fps)} for fps in [11,13,15]],
              "within_held_frame_travel_display_px":speed/FPS*DISPLAY_SCALE,
              "limits":["Support patch edge can move as the foot rolls; this is not exact toe material tracking.",
                        "Continuous world motion moves held raster feet between pose changes; zero slip is not established.",
                        "No per-frame root correction, interpolation, camera tracking or dynamic rescaling is used."],
              "visual_approval":False}
    (ROOT/'qa/foot-contact-review.json').write_text(json.dumps(report,indent=2)+'\n')
    marked, labels = [], []
    for prefix, points, name in [('history/pass-02',previous,'Previous'),('',current,'Revised')]:
        for point in points:
            frame=Image.open(ROOT/prefix/f"animations/run_right/frames/{point['frame']:02d}.png").convert('RGBA')
            draw=ImageDraw.Draw(frame); x,y=point['x'],point['y']
            draw.ellipse((x-7,y-7,x+7,y+7),outline='#b6533b',width=2)
            marked.append(frame); labels.append(f"{name} {point['frame']:02d} / support edge x={x}")
    contact(marked,labels,6,ROOT/'qa/foot-contact-landmarks.png')
    print(json.dumps({k:report[k] for k in ['fitted_speed_source_px_s','fitted_speed_display_px_s',
        'current_at_fitted_speed','previous_at_same_speed','within_held_frame_travel_display_px']},indent=2))


def package():
    report=json.loads((ROOT/'qa/world-travel-verification.json').read_text())
    if not report['pass']:
        raise ValueError('Browser travel validation did not pass.')
    if report['source_sha256'] != hashlib.sha256((ROOT/'run-strip.png').read_bytes()).hexdigest():
        raise ValueError('Travel captures are stale; rerun Chrome verification.')
    directory=Path(report['captures']['directory'])
    frames=[Image.open(directory/f'{i:03d}.png').convert('RGB') for i in range(64)]
    durations=[(round((i+1)*100/52)-round(i*100/52))*10 for i in range(64)]
    frames[0].save(ROOT/'run-world-comparison.gif',save_all=True,append_images=frames[1:],
                   duration=durations,loop=0,disposal=2,optimize=False)
    frames[0].save(ROOT/'run-world-comparison.webp',save_all=True,append_images=frames[1:],
                   duration=[round((i+1)*1000/52)-round(i*1000/52) for i in range(64)],loop=0,lossless=True)
    timeline=Image.new('RGB',(1350,492),'white')
    draw=ImageDraw.Draw(timeline); font=ImageFont.load_default(size=14)
    for n,index in enumerate([0,3,4,7,8,11]):
        x,y=n%3*450,n//3*246
        timeline.paste(frames[index].crop((70,420,520,611)),(x,y))
        draw.text((x+10,y+222),f'{round(index*1000/52)} ms / pose {index//4+1} / fixed ground',fill='#555',font=font)
    timeline.save(ROOT/'qa/world-support-timeline.png')
    manifest=json.loads((ROOT/'manifest.json').read_text())
    manifest['world_travel_review']={'preview':'run-world-comparison.gif','browser':'qa/world-travel-verification.json',
        'measurements':'qa/foot-contact-review.json','fps':FPS,'display_scale':DISPLAY_SCALE,
        'speed_source_px_s':report['test_speeds'][1]['speed_source_px_s'],'foot_sliding_resolved':False,'approved':False}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Packaged 64 actual Chrome canvas captures at 52 samples/s, two cycles; visual approval remains pending.')


if __name__=='__main__':
    package() if '--package' in sys.argv else prepare()
