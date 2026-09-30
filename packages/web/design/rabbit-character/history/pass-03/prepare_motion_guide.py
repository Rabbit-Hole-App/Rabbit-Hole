"""Draw a joint-position diagram for image conditioning, not character artwork."""

import json
from PIL import Image, ImageDraw, ImageFont
from prepare_preview import ROOT

# Local sprite coordinates. Same toe landmark recedes 68 px per support pose.
# Near anatomical right limbs are orange; far left limbs blue.
poses = [
    [[246,360],[281,296],[335,260], [[281,296],[222,318],[194,351]], [[278,291],[310,323],[339,285]],
     [[252,362],[293,411],[292,466],[360,480]], [[242,356],[196,409],[163,429],[146,406]], [[188,182],[215,164]]],
    [[246,374],[278,310],[333,274], [[278,310],[226,342],[249,375]], [[282,305],[310,332],[295,371]],
     [[252,376],[274,425],[233,463],[292,480]], [[241,368],[288,402],[247,429],[220,410]], [[183,232],[213,211]]],
    [[246,357],[285,291],[336,257], [[285,291],[325,327],[355,306]], [[280,292],[231,315],[214,355]],
     [[250,359],[211,411],[194,455],[224,480]], [[243,350],[296,370],[303,426],[345,423]], [[194,247],[219,217]]],
    [[246,347],[282,281],[335,246], [[286,281],[335,307],[367,276]], [[277,284],[229,296],[207,341]],
     [[250,350],[213,399],[181,419],[150,395]], [[242,345],[301,392],[308,444],[370,461]], [[184,216],[213,185]]],
    [[246,360],[281,296],[335,260], [[276,294],[330,309],[352,274]], [[282,297],[224,315],[201,351]],
     [[251,360],[207,412],[171,433],[148,407]], [[243,366],[289,411],[292,466],[360,480]], [[198,178],[223,162]]],
    [[246,374],[278,310],[333,274], [[280,310],[248,345],[280,381]], [[276,305],[291,345],[323,318]],
     [[251,368],[298,403],[251,432],[223,412]], [[241,376],[274,425],[233,463],[292,480]], [[189,215],[213,194]]],
    [[246,357],[285,291],[336,257], [[284,291],[233,312],[206,351]], [[280,287],[312,321],[347,286]],
     [[251,350],[296,370],[303,426],[345,423]], [[241,359],[211,411],[194,455],[224,480]], [[194,246],[218,221]]],
    [[246,347],[282,281],[335,246], [[282,280],[226,307],[191,337]], [[280,277],[310,315],[345,280]],
     [[251,345],[301,392],[308,444],[370,461]], [[241,350],[213,399],[181,419],[150,395]], [[188,210],[214,180]]],
]

def main():
    canvas = Image.new('RGB', (2048,1024), 'white')
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=15)
    records = []
    for i, (hip, shoulder, head, right_arm, left_arm, right_leg, left_leg, tips) in enumerate(poses):
        ox, oy = i % 4 * 512, i // 4 * 512
        def point(p): return p[0] + ox, p[1] + oy
        def chain(points, color, width):
            draw.line([point(p) for p in points], fill=color, width=width, joint='curve')
            for p in points:
                x,y=point(p); draw.ellipse((x-5,y-5,x+5,y+5),fill='white',outline=color,width=2)
        draw.text((ox+20,oy+12),f'{i+1:02d} / '+['R contact','R compression','R push','flight to L','L contact','L compression','L push','flight to R'][i],fill='#333',font=font)
        draw.text((ox+20,oy+35),'Orange = near RIGHT / blue = far LEFT',fill='#555',font=font)
        draw.line((ox+40,oy+480,ox+470,oy+480),fill='#aaa',width=2)
        chain(left_leg,'#557d9d',8); chain(left_arm,'#557d9d',8)
        chain([hip,shoulder,head],'#777',12)
        hx,hy=point(head); draw.ellipse((hx-44,hy-32,hx+44,hy+32),outline='#555',width=3)
        for j,tip in enumerate(tips):
            chain([[head[0]-23+j*11,head[1]-25],[tip[0]+45,tip[1]-10],tip],'#777',5)
        chain(right_leg,'#b45e36',9); chain(right_arm,'#b45e36',9)
        grip=right_arm[-1]; lag=[5,-8,-12,-10,3,10,9,4][i]
        wx,wy=point([grip[0]+lag,grip[1]+33])
        draw.line([point(grip),(wx,wy-27)],fill='#b45e36',width=3)
        draw.ellipse((wx-27,wy-27,wx+27,wy+27),outline='#b45e36',width=3)
        records.append({'frame':i+1,'hip':hip,'shoulder':shoulder,'head':head,
                        'right_arm':right_arm,'left_arm':left_arm,'right_leg':right_leg,'left_leg':left_leg})
    canvas.save(ROOT/'generated/run-refinement-03-pose-guide.png')
    (ROOT/'prompts/refinement-03-joints.json').write_text(json.dumps(records,indent=2)+'\n')
    print('Saved eight-pose joint diagram; guide only, not rendered character frames.')

if __name__=='__main__': main()
