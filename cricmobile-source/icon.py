from PIL import Image, ImageDraw, ImageFilter
import math

def make(size):
    S = 1024
    img = Image.new('RGB', (S, S), '#06122b')
    d = ImageDraw.Draw(img)
    # radial-ish background
    for r in range(S, 0, -8):
        t = r / S
        c = (int(6 + 30 * (1 - t)), int(18 + 60 * (1 - t)), int(43 + 90 * (1 - t)))
        d.ellipse([S/2 - r, S*0.55 - r, S/2 + r, S*0.55 + r], fill=c)
    # ball
    cx, cy, R = S*0.5, S*0.52, S*0.3
    ball = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(ball)
    bd.ellipse([cx-R, cy-R, cx+R, cy+R], fill=(186, 18, 38, 255))
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hl)
    hd.ellipse([cx-R*0.75, cy-R*0.85, cx+R*0.1, cy-R*0.05], fill=(255, 255, 255, 70))
    hl = hl.filter(ImageFilter.GaussianBlur(40))
    ball = Image.alpha_composite(ball, hl)
    # seam
    sd = ImageDraw.Draw(ball)
    for k in (-1, 1):
        pts = []
        for i in range(0, 181):
            a = math.radians(i - 90)
            x = cx + k * R * 0.18 + k * math.cos(a) * R * 0.12
            y = cy + math.sin(a) * R * 0.97
            pts.append((x, y))
        sd.line(pts, fill=(250, 240, 220, 255), width=int(S*0.012))
        for i in range(10, 171, 12):
            a = math.radians(i - 90)
            x = cx + k * R * 0.18 + k * math.cos(a) * R * 0.12
            y = cy + math.sin(a) * R * 0.97
            sd.line([(x - S*0.025, y), (x + S*0.025, y)], fill=(250, 240, 220, 255), width=int(S*0.008))
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).ellipse([cx-R, cy-R, cx+R, cy+R], fill=255)
    img.paste(ball, (0, 0), Image.composite(ball.split()[3], Image.new('L', (S, S), 0), mask))
    # "CM" text plate
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([S*0.28, S*0.08, S*0.72, S*0.24], radius=40, fill='#ffd23f')
    from PIL import ImageFont
    f = ImageFont.load_default(size=int(S*0.12))
    d.text((S*0.5, S*0.16), 'CM', font=f, fill='#1b1300', anchor='mm')
    return img.resize((size, size), Image.LANCZOS)

for s in (180, 192, 512, 1024):
    make(s).save(f'dist/icon-{s}.png')
