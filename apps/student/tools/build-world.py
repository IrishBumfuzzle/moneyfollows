"""Builds the 32px backdrop (scenery only; the buildings come from build-sprites.py) from the schwarnhild
"Basic tileset and asset pack 32x32" (sources in assets-src/schwarnhild, git-ignored: the licence
forbids redistributing the raw assets).
Run from apps/student:  python3 tools/build-world.py   (needs Pillow, numpy, scipy)
World size / stage origin / building positions must match src/screens/LocationScreen.tsx."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

SRC = 'assets-src/schwarnhild/'
WW, WH = 1920, 1280                     # world, px
SX, SY, SOFF = 0.3056, 0.5, 20          # map.png sketch (1152x720) -> stage px
SW, SH = 352, 380                       # stage (play area), px
OX, OY = (WW - SW) // 2, (WH - SH) // 2
rng = np.random.default_rng(5)
open_ = lambda n: Image.open(SRC + n).convert('RGBA')
sheet = open_('assets-spritesheet-standard.png')
terrain, water_t = open_('tiles-terrain-32x32.png'), open_('tiles-water.png')
def seamless(im):
    """The sheet's most uniform, fully opaque 32x32 tile (so repeating it leaves no grid)."""
    a = np.array(im).astype(int); best = None
    for r in range(im.height // 32):
        for c in range(im.width // 32):
            t = a[r * 32:(r + 1) * 32, c * 32:(c + 1) * 32]
            if (t[:, :, 3] < 255).any(): continue
            score = np.abs(t[:, :, :3] - np.median(t[:, :, :3].reshape(-1, 3), axis=0)).sum() + np.abs(t[0] - t[-1]).sum() + np.abs(t[:, 0] - t[:, -1]).sum()
            if best is None or score < best[0]: best = (score, r, c)
    return im.crop((best[2] * 32, best[1] * 32, best[2] * 32 + 32, best[1] * 32 + 32))
shade_tile = {k: seamless(open_(f'tiles-grass {k}-32x32.png')) for k in ('medium', 'light', 'dark', 'lightest')}
spr = lambda x, y, w, h: sheet.crop((x, y, x + w, y + h))
tile = lambda im, c, r: im.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))


def fnoise(sigma, seed_off=0):
    n = ndi.gaussian_filter(rng.random((WH, WW)), sigma)
    return (n - n.min()) / (n.max() - n.min())


def ragged(mask, amp=0.35, sigma=7, grain=3):
    """Organic edges: blur a boolean mask and perturb the threshold with noise."""
    f = ndi.gaussian_filter(mask.astype(float), sigma)
    n = ndi.gaussian_filter(rng.random(mask.shape), grain); n = (n - n.mean()) / (n.std() + 1e-6)
    return (f + n * amp * 0.25 > 0.5) & ndi.binary_dilation(mask, iterations=int(sigma * 2))  # no stray blobs far from the shape


def ellipse(cx, cy, rx, ry):
    yy, xx = np.ogrid[:WH, :WW]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def tiled(im):
    return np.array(Image.fromarray(np.tile(np.array(im), (WH // 32 + 1, WW // 32 + 1, 1))).crop((0, 0, WW, WH)))


def paint(canvas, mask, texture):
    canvas[mask] = texture[mask]


def border(mask, w):
    return ndi.binary_dilation(mask, iterations=w) & ~mask


# ------------------------------------------------------------------------------------ layout (from the sketch map.png)
sk = lambda x, y: (OX + x * SX, OY + y * SY + SOFF)
def spline(pts, n=10):
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (np.array(q, float) for q in P[i - 1:i + 3])
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(P[-2], float)); return out
NE = [(1140, 175)] + [(x, 170 + 45 * math.sin(x / 190)) for x in range(1300, 3900, 150)]
SE_BRANCH = [(625, 350), (640, 400), (690, 460), (760, 510), (820, 560), (880, 630), (910, 700), (915, 720), (935, 800), (905, 900), (935, 1000), (965, 1100), (940, 1200), (970, 1300), (950, 1400), (975, 1500), (955, 1700)]
STUBS = [[(520, 372), (520, 332)], [(1010, 268), (1012, 230)], [(870, 625), (930, 650), (1000, 655)]]
JUNCTION = [(85, 420), (100, 390), (150, 370), (210, 375), (300, 355), (400, 358), (480, 380), (560, 365), (625, 350), (700, 315), (780, 285), (860, 282), (930, 290), (1010, 265), (1080, 220), (1140, 175)]
BUILD = {'house': (119, 80), 'school': (91, 214), 'store': (269, 26), 'hospital': (275, 236)}   # 80x96 sprites (tools/build-sprites.py), top-left in stage px
HILL, POND = (58, 92), (70, 172)


# ------------------------------------------------------------------------------------ ground
world = tiled(shade_tile['medium'])
for key, thr, sigma in (('dark', 0.64, 40), ('lightest', 0.76, 30)):
    paint(world, ragged(fnoise(sigma) > thr, 0.5, 5, 2), tiled(shade_tile[key]))
# lighter meadow (bottom-left in the sketch), where the school stands
meadow = Image.new('L', (WW, WH), 0)
ImageDraw.Draw(meadow).polygon([sk(x, y) for x, y in [(-6000, 285), (0, 285), (40, 300), (180, 340), (320, 370), (480, 480), (600, 590), (740, 660), (900, 720), (1400, 780), (1500, 1800), (-6000, 1800)]], fill=255)
mm = ragged(np.array(meadow) > 0, 0.7, 6, 3)
paint(world, mm, tiled(shade_tile['light']))
paint(world, mm & (fnoise(10) > 0.62), tiled(shade_tile['lightest']))
def keyed(t):
    a = np.array(t); a[(a[:, :, :3] == (40, 154, 54)).all(axis=2), 3] = 0   # the sheet tiles are opaque: drop the base green
    return Image.fromarray(a)
tuft = [keyed(tile(open_('tiles-grass medium-32x32.png'), c, r)) for c in range(9, 14) for r in (0, 1)]
wim = Image.fromarray(world)
for _ in range(700):
    wim.alpha_composite(tuft[rng.integers(len(tuft))], (int(rng.integers(0, WW - 32)), int(rng.integers(0, WH - 32))))
world = np.array(wim)
occupied = np.zeros((WH, WW), bool)

# ------------------------------------------------------------------------------------ dirt road
path = Image.new('L', (WW, WH), 0); d = ImageDraw.Draw(path)
trail = [(429, 600), (390, 612), (330, 622), (283, 610), (270, 570), (240, 545), (180, 510), (130, 490), (95, 445)] + JUNCTION[:] + NE
for pts in (trail, SE_BRANCH, *STUBS):
    d.line([tuple(map(float, sk(*q))) for q in spline(pts)], fill=255, width=26, joint='curve')
pm = ragged(np.array(path) > 0, 0.6, 5, 2)
dirt = tiled(tile(terrain, 0, 9))
paint(world, border(pm, 3), np.full_like(world, (96, 74, 52, 255)))
paint(world, pm, dirt)
paint(world, pm & ~ndi.binary_erosion(pm, iterations=2), np.full_like(world, (176, 150, 112, 255)))
occupied |= ndi.binary_dilation(pm, iterations=5)


# ------------------------------------------------------------------------------------ ponds
water = tiled(tile(water_t, 1, 3))
def pond(cx_, cy_, rx, ry, sigma=9):
    m = ragged(ellipse(cx_, cy_, rx, ry) | ellipse(cx_ + rx * .35, cy_ - ry * .3, rx * .6, ry * .7), 0.8, sigma, 4) & ~occupied
    paint(world, border(m, 3), np.full_like(world, (24, 70, 84, 255)))
    paint(world, m, water)
    paint(world, m & ~ndi.binary_erosion(m, iterations=3), np.full_like(world, (176, 238, 224, 255)))
    occupied[:] |= ndi.binary_dilation(m, iterations=6)
    return m
px, py = OX + POND[0], OY + POND[1] + 0
pond(px, py, 34, 15, 4)
for p in [(330, 250, 150, 90), (1620, 190, 170, 100), (1500, 1060, 190, 110), (280, 1070, 150, 90), (1180, 1150, 140, 70), (1100, 130, 120, 66)]: pond(*p)


# ------------------------------------------------------------------------------------ hill (two tiers)
def plateau(cx_, cy_, rx, ry, cliff, top_shade, sigma=4):
    top = ragged(ellipse(cx_, cy_, rx, ry) | ellipse(cx_ - rx * .5, cy_ + 3, rx * .55, ry * .8) | ellipse(cx_ + rx * .5, cy_ + 3, rx * .55, ry * .8), 0.5, sigma, 3)
    shifted = np.zeros_like(top); shifted[cliff:] = top[:-cliff]
    face = (shifted | ndi.binary_dilation(top, iterations=2)) & ~top
    stone = tiled(tile(terrain, 0, 4))
    paint(world, border(face, 3), np.full_like(world, (54, 40, 32, 255)))
    paint(world, face, (stone * np.array([0.98, 0.95, 0.9, 1.0])).astype(np.uint8))
    foot = face & ~ndi.binary_erosion(face, iterations=7)
    world[foot] = (world[foot] * np.array([0.78, 0.76, 0.76, 1.0])).astype(np.uint8)
    paint(world, border(top, 2), np.full_like(world, (46, 96, 38, 255)))
    paint(world, top, tiled(shade_tile[top_shade]))
    paint(world, top & ~ndi.binary_erosion(top, iterations=2), np.full_like(world, (168, 226, 90, 255)))
    occupied[:] |= ndi.binary_dilation(top | face, iterations=6)
hx, hy = OX + HILL[0], OY + HILL[1]
plateau(hx, hy + 6, 56, 22, 30, 'light')
plateau(hx + 4, hy - 14, 32, 12, 22, 'lightest')
wim = Image.fromarray(world); wim.alpha_composite(open_('ladder-grass.png'), (hx - 33, hy + 6 + 22 + 6)); world = np.array(wim)

# ------------------------------------------------------------------------------------ props
def place(img, x, y):
    global wim
    wim.alpha_composite(img, (int(x - img.width / 2), int(y - img.height)))

TREES = [spr(211, 3, 52, 92), spr(270, 3, 61, 93), spr(342, 3, 80, 125)]
BUSH = [spr(9, 8, 62, 51), spr(9, 68, 62, 51), spr(17, 249, 45, 41), spr(208, 151, 32, 32), spr(246, 151, 32, 32), spr(208, 106, 70, 32)]
FLOW = [spr(107, 107, 34, 58), spr(157, 106, 32, 58), spr(158, 173, 31, 46), spr(158, 226, 31, 46), spr(158, 281, 31, 46), spr(158, 335, 31, 46), spr(106, 278, 34, 47), spr(106, 332, 34, 47)]
ROCK = [spr(580, 279, 40, 32), spr(581, 329, 40, 31), spr(635, 281, 37, 25), spr(637, 325, 32, 34), spr(687, 282, 35, 25)]
MISC = [spr(289, 152, 40, 28), spr(380, 138, 26, 32)]
wim = Image.fromarray(world)

# keep scatter off the buildings, their labels and the stage's hand-placed bits
for (bx, by) in BUILD.values():
    occupied[OY + by - 8: OY + by + 96 + 30, OX + bx - 14: OX + bx + 80 + 14] = True

def scatter(items, count, forest_bias, clearing, footprint, y0=40):
    tries = 0
    while count > 0 and tries < count * 40:
        tries += 1
        x, y = int(rng.integers(20, WW - 20)), int(rng.integers(y0, WH - 6))
        if rng.random() > fnoise_cache[forest_bias][y, x]: continue
        if clearing and math.hypot((x - (OX + SW / 2)) / clearing[0], (y - (OY + SH / 2 + 10)) / clearing[1]) < 1: continue
        fw, fh = footprint
        if occupied[max(0, y - fh): y, max(0, x - fw // 2): x + fw // 2].any(): continue
        place(items[int(rng.integers(len(items)))], x, y)
        occupied[max(0, y - fh): y, max(0, x - fw // 2): x + fw // 2] = True
        count -= 1
fnoise_cache = {'forest': fnoise(55) ** 1.4, 'any': np.full((WH, WW), 0.9), 'meadow': fnoise(30)}
ex, ey = np.meshgrid(np.minimum(np.arange(WW), WW - np.arange(WW)), np.minimum(np.arange(WH), WH - np.arange(WH)))
fnoise_cache['forest'] = np.clip(fnoise_cache['forest'] + np.clip(1 - np.minimum(ex, ey) / 220, 0, 1) * .8, 0, 1)
scatter(TREES, 190, 'forest', (250, 290), (34, 24))
scatter(BUSH, 90, 'meadow', (150, 200), (28, 14))
scatter(FLOW, 260, 'meadow', (120, 170), (20, 12))
scatter(ROCK, 26, 'any', (150, 200), (26, 12))
scatter(MISC, 10, 'meadow', (150, 200), (20, 10))

# hand-placed stage dressing: hill top, pond rocks, bushes and flowers around the buildings
for (x, y, i) in [(hx + 44, hy + 4, 3), (hx - 40, hy + 2, 4), (hx + 4, hy - 20, 3)]: place(BUSH[i], x, y)
for (x, y, i) in [(OX + 4, OY + 184, 0), (OX + 100, OY + 182, 1), (OX + 214, OY + 118, 2), (OX + 346, OY + 200, 0), (OX + 206, OY + 232, 3), (OX + 50, OY + 330, 1), (OX + 250, OY + 360, 2)]:
    place(FLOW[i], x, y)
for (x, y) in [(OX + 22, OY + 184), (OX + 112, OY + 186)]: place(ROCK[4], x, y)
for (x, y, i) in [(OX + 4, OY + 262, 4), (OX + 230, OY + 24, 3), (OX + 330, OY + 190, 4), (OX + 190, OY + 370, 3)]: place(BUSH[i], x, y)
for (x, y) in [(OX + 20, OY + 340), (OX + 12, OY + 40)]: place(TREES[0], x, y)

os.makedirs('public/assets/buildings', exist_ok=True)
wim.convert('RGB').save('public/assets/world.png')
print('POS', {k: v for k, v in POS.items()}) if False else None
print('world', wim.size)
