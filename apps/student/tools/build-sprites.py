"""Builds the four building sprites + pixel halos from the Kenney RPG Urban Kit tilemap (CC0).
Run from apps/student:  python3 tools/build-sprites.py   (needs Pillow)
Sprite size / positions must match src/screens/LocationScreen.tsx and BUILD in tools/build-world.py."""
from PIL import Image, ImageFilter

T, PAD, W, H = 16, 4, 5, 6
sheet = Image.open('assets-src/kenney/tilemap_packed.png').convert('RGBA')
tile = lambda c, r: sheet.crop((c * T, r * T, (c + 1) * T, (r + 1) * T))


def canvas():
    return Image.new('RGBA', (W * T + 2 * PAD, H * T + 2 * PAD))


def put(im, spr, col, row):
    im.alpha_composite(spr, (PAD + col * T, PAD + row * T))


def roof(im, cols, rows):
    """cols=(left, mid, right) sheet columns, rows=sheet rows used for the 4 roof rows."""
    for y, r in enumerate(rows):
        for x in range(W):
            c = cols[0] if x == 0 else cols[2] if x == W - 1 else cols[1]
            put(im, tile(c, r), x, y)


def wall(im, fill):
    for y in (4, 5):
        for x in range(W):
            put(im, tile(*fill), x, y)


def cross(im):
    red, cx, cy = (214, 64, 64, 255), PAD + W * T // 2, PAD + 2 * T
    for a in range(-2, 3):
        for b in range(-8, 9):
            im.putpixel((cx + a, cy + b), red)
            im.putpixel((cx + b, cy + a), red)


def glass(im, cols, x0, x1):
    for x in range(x0, x1 + 1):
        c = cols[0] if x == x0 else cols[2] if x == x1 else cols[1]
        put(im, tile(c, 13), x, 4)
        put(im, tile(c, 14), x, 5)


RED, ORANGE, GRAY, TAN = (17, 18, 19), (17, 18, 19), (8, 9, 10), (0, 1, 2)
GLASS = (8, 9, 10)
WIN, DOOR_O, DOOR_OO, DOOR_W = (12, 13), (13, 10), (14, 10), (15, 10)
B = {}

im = canvas(); roof(im, RED, (0, 1, 2, 3)); wall(im, (1, 4))
for x in range(W): put(im, tile(*WIN), x, 4)
for x in (0, 1, 3, 4): put(im, tile(*WIN), x, 5)
put(im, tile(*DOOR_OO), 2, 5); B['school'] = im

im = canvas(); roof(im, GRAY, (0, 1, 1, 2)); wall(im, (1, 4)); glass(im, GLASS, 0, W - 1)
put(im, tile(*DOOR_W), 2, 5); cross(im); B['hospital'] = im

im = canvas(); roof(im, TAN, (3, 4, 4, 5)); wall(im, (9, 4)); glass(im, GLASS, 0, 2)
put(im, tile(*WIN), 3, 4); put(im, tile(*DOOR_OO), 3, 5)
put(im, tile(*WIN), 4, 4); put(im, tile(*WIN), 4, 5); B['convenience'] = im

im = canvas(); roof(im, ORANGE, (4, 5, 6, 7)); wall(im, (1, 4))
for x in (1, 3): put(im, tile(*WIN), x, 4); put(im, tile(*WIN), x, 5)
put(im, tile(*DOOR_O), 2, 5); B['home'] = im


def halo(spr, colors):
    a = spr.getchannel('A').point(lambda v: 255 if v > 0 else 0)
    out = Image.new('RGBA', spr.size)
    for i in range(len(colors), 0, -1):  # outermost ring first
        mask = a.filter(ImageFilter.MaxFilter(2 * i + 1))
        out.paste(Image.new('RGBA', spr.size, colors[i - 1]), (0, 0), mask)
    out.paste(Image.new('RGBA', spr.size), (0, 0), a)  # keep only the ring, not the building area
    return out


HOVER = [(255, 255, 255, 255), (221, 196, 255, 255), (147, 51, 234, 255)]
ACTIVE = [(254, 240, 138, 255), (251, 191, 36, 255), (249, 115, 22, 255)]
for name, spr in B.items():
    spr.save(f'public/assets/buildings/{name}.png')
    halo(spr, HOVER).save(f'public/assets/buildings/{name}-hover.png')
    halo(spr, ACTIVE).save(f'public/assets/buildings/{name}-active.png')
print('buildings', B['school'].size)
