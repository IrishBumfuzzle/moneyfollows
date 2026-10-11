"""Builds the map backdrop, public/assets/world.png (1920x1280), from the Kenney RPG Urban Kit (CC0),
the same kit as the buildings (tools/build-sprites.py), so the town and the buildings match.
Run from apps/student:  python3 tools/build-world.py   (needs Pillow)

A 16px tile grid (120 x 80 tiles). Streets run every 11 rows and every 26 columns; each block between
them has a sidewalk ring and is a park, a plaza or a car park. The play area (STAGE, 352x380 px, centred
in the world) is two blocks: five building lots in two rows facing the main streets, with a small park
and fountain between the Bank and the Hospital. Building positions are printed at the end and must
match LOCATIONS in src/screens/LocationScreen.tsx."""
import random
from PIL import Image, ImageDraw, ImageOps

T = 16
COLS, ROWS = 120, 80
WW, WH = COLS * T, ROWS * T
SW, SH = 352, 380
OX, OY = (WW - SW) // 2, (WH - SH) // 2          # stage origin in world px (784, 450)
rng = random.Random(7)

sheet = Image.open('assets-src/kenney/tilemap_packed.png').convert('RGBA')
tile = lambda c, r: sheet.crop((c * T, r * T, (c + 1) * T, (r + 1) * T))
world = Image.new('RGBA', (WW, WH))


def put(img, col, row):
    world.alpha_composite(img, (col * T, row * T))


def sprite(parts, col, row):
    """parts: [(dc, dr, sheet_col, sheet_row)] placed relative to (col, row)."""
    for dc, dr, c, r in parts:
        put(tile(c, r), col + dc, row + dr)


# ---- tiles ------------------------------------------------------------------------------------
ASPHALT = tile(1, 15)
ZEBRA_H = [tile(0, 15), tile(0, 16), tile(0, 17)]               # stripes for a horizontal street
ZEBRA_V = [t.rotate(90) for t in ZEBRA_H]                       # and for a vertical one
LANE = tuple(tile(1, 16).getpixel((8, 8)))                      # the kit's lane-marking colour


def nine(c0, r0):
    """A 3x3 nine-slice at sheet (c0, r0): returns pick(is_top, is_bottom, is_left, is_right)."""
    def pick(top, bottom, left, right):
        return tile(c0 + (0 if left else 2 if right else 1), r0 + (0 if top else 2 if bottom else 1))
    return pick


PAVING = nine(8, 0)        # light grey sidewalk, curb on the outer edges
GRASS = nine(0, 0)         # grass bed with a sand border
WATER = nine(8, 6)         # fountain basin

TREE_TALL = [(0, 0, 16, 8), (0, 1, 16, 9)]
TREE_ROUND = [(0, 0, 17, 8), (0, 1, 17, 9)]
TREE_SMALL = [(0, 0, 21, 10)]
BUSH = [(0, 0, 22, 10)]
SHRUB = [(0, 0, 22, 9)]
LAMP = [(0, 0, 3, 6), (0, 1, 3, 7)]
BENCH = [(0, 0, 0, 10)]
BIN = [(0, 0, 9, 10)]
CAR_DOWN = [[(0, 0, 17, 14), (0, 1, 17, 15)], [(0, 0, 17, 16), (0, 1, 17, 17)], [(0, 0, 20, 14), (0, 1, 20, 15)]]
PARK_BAY = tile(2, 16)

# ---- street grid --------------------------------------------------------------------------------
ROAD_ROWS = [3, 14, 25, 36, 47, 58, 69]       # each street is 3 tiles: lane, centre line, lane
ROAD_COLS = [20, 46, 72, 98]
on_hroad = lambda r: any(s <= r < s + 3 for s in ROAD_ROWS)
on_vroad = lambda c: any(s <= c < s + 3 for s in ROAD_COLS)

for r in range(ROWS):
    for c in range(COLS):
        if on_hroad(r) or on_vroad(c):
            put(ASPHALT, c, r)

d = ImageDraw.Draw(world)
for s in ROAD_ROWS:                            # dashed centre lines, broken at junctions
    y = (s + 1) * T + 7
    for x in range(0, WW, 24):
        if not on_vroad(x // T) and not on_vroad((x + 11) // T):
            d.rectangle([x, y, x + 11, y + 1], fill=LANE)
for s in ROAD_COLS:
    x = (s + 1) * T + 7
    for y in range(0, WH, 24):
        if not on_hroad(y // T) and not on_hroad((y + 11) // T):
            d.rectangle([x, y, x + 1, y + 11], fill=LANE)
for rs in ROAD_ROWS:                           # zebra crossings on every side of every junction
    for cs in ROAD_COLS:
        for i in range(3):
            put(ZEBRA_H[i], cs - 1, rs + i)
            put(ZEBRA_H[i], cs + 3, rs + i)
            put(ZEBRA_V[i], cs + i, rs - 1)
            put(ZEBRA_V[i], cs + i, rs + 3)

# ---- blocks -------------------------------------------------------------------------------------
def spans(starts, size):
    edges = [-3] + starts + [size]
    return [(a + 3, b - 1) for a, b in zip(edges, edges[1:]) if b - 1 >= a + 3]


def ring(c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            if r in (r0, r1) or c in (c0, c1):
                put(PAVING(r == r0, r == r1, c == c0, c == c1), c, r)


def fill(pick, c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            put(pick(r == r0, r == r1, c == c0, c == c1), c, r)


def paving(c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            put(PAVING(False, False, False, False), c, r)


def park(c0, r0, c1, r1):
    fill(GRASS, c0, r0, c1, r1)
    taken = set()
    for _ in range((c1 - c0) * (r1 - r0) // 2):
        kind = rng.choice([TREE_TALL, TREE_ROUND, TREE_SMALL, BUSH, SHRUB, TREE_TALL, TREE_ROUND])
        w = max(p[0] for p in kind) + 1
        h = max(p[1] for p in kind) + 1
        if c1 - w < c0 + 1 or r1 - h < r0 + 1:
            continue
        c = rng.randint(c0 + 1, c1 - w)
        r = rng.randint(r0 + 1, r1 - h)
        cells = {(c + i, r + j) for i in range(-1, w + 1) for j in range(h)}
        if cells & taken:
            continue
        taken |= cells
        sprite(kind, c, r)


# Background buildings: plain, unlabelled houses and shops along the outer streets, built from the
# same roof, wall, window and door tiles as tools/build-sprites.py so the town reads as one place.
ROOFS = [((17, 18, 19), (0, 1, 2)), ((17, 18, 19), (4, 5, 6)), ((0, 1, 2), (3, 4, 5))]  # red, orange, tan
WALLS = [(1, 4), (9, 4)]
WIN, DOORS = (12, 13), [(13, 10), (14, 10), (15, 10)]


def mute(c0, r0, w, h):
    """Fades a background building toward the pavement colour, so the five places you can visit
    (drawn at full colour over the backdrop) always stand out from the scenery."""
    box = (c0 * T, r0 * T, (c0 + w) * T, (r0 + h) * T)
    part = world.crop(box)
    grey = ImageOps.grayscale(part).convert('RGBA')
    faded = Image.blend(Image.blend(part, grey, 0.55), Image.new('RGBA', part.size, (150, 146, 170, 255)), 0.25)
    world.paste(faded, box[:2])


def building(c0, r0, w):
    cols, rows = rng.choice(ROOFS)
    for y, rr in enumerate(rows):
        for x in range(w):
            put(tile(cols[0] if x == 0 else cols[2] if x == w - 1 else cols[1], rr), c0 + x, r0 + y)
    wall = rng.choice(WALLS)
    door = rng.randrange(1, w - 1)
    for y in (3, 4):
        for x in range(w):
            put(tile(*wall), c0 + x, r0 + y)
            put(tile(*(DOORS[rng.randrange(3)] if (x, y) == (door, 4) else WIN)), c0 + x, r0 + y)
    mute(c0, r0, w, 5)


def street(c0, r0, c1, r1):
    """A row of buildings facing the street below, with small lawns and trees between them."""
    fill(GRASS, c0, r0, c1, r1)
    c = c0
    while c <= c1:
        w = rng.choice([4, 5, 5, 6])
        if c + w - 1 > c1:
            break
        paving(c, r0, c + w - 1, r1)
        building(c, r0, w)
        c += w
        gap = rng.choice([1, 2, 2])
        if c + gap - 1 <= c1:
            sprite(rng.choice([TREE_TALL, TREE_ROUND]), c, r0 + 2)
            sprite(SHRUB, c, r1)
        c += gap


def car_park(c0, r0, c1, r1):
    paving(c0, r0, c1, r1)
    for c in range(c0 + 1, c1):
        for r in (r0 + 1, r1 - 2):
            put(PARK_BAY, c, r)
            put(PARK_BAY, c, r + 1)
            if rng.random() < 0.45:
                sprite(rng.choice(CAR_DOWN), c, r)


rows, cols = spans(ROAD_ROWS, ROWS), spans(ROAD_COLS, COLS)
STAGE_ROWS = {(28, 35), (39, 46)}                  # the two blocks the play area sits on
STAGE_COLS = (49, 71)
for (r0, r1) in rows:
    for (c0, c1) in cols:
        ring(c0, r0, c1, r1)
        if (r0, r1) in STAGE_ROWS and (c0, c1) == STAGE_COLS:
            continue
        ir0, ir1, ic0, ic1 = r0 + 1, r1 - 1, c0 + 1, c1 - 1
        if ir1 - ir0 < 3 or ic1 - ic0 < 3:
            paving(ic0, ir0, ic1, ir1)
            continue
        roll = rng.random()
        (street if roll < 0.6 else park if roll < 0.92 else car_park)(ic0, ir0, ic1, ir1)
        for c in range(c0 + 3, c1 - 1, 7):           # street lamps on the front sidewalk
            sprite(LAMP, c, r1 - 1)

# ---- the play area: two blocks of building lots ----------------------------------------------
# Block A: rows 29..34 inside a sidewalk ring at rows 28 and 35; block B: rows 40..45 (ring 39, 46).
# Columns 50..70 inside the ring at 49 and 71. Buildings are 5x6 tiles (80x96 px).
LOTS = {  # id: (col, row) of the building's top-left tile
    'home': (50, 29), 'school': (57, 29), 'convenience': (65, 29),
    'bank': (50, 40), 'hospital': (65, 40),
}
for top in (29, 40):
    paving(50, top, 70, top + 5)
# Lawns with trees between the top-row lots, and down the right side.
fill(GRASS, 55, 29, 56, 34); sprite(TREE_TALL, 55, 30); sprite(BUSH, 56, 33)
fill(GRASS, 62, 29, 64, 34); sprite(TREE_ROUND, 63, 30); sprite(BUSH, 62, 33)
fill(GRASS, 70, 29, 70, 34); sprite(SHRUB, 70, 31)
# The little park between the Bank and the Hospital: a fountain, trees and benches.
fill(GRASS, 55, 40, 64, 45)
fill(WATER, 58, 41, 61, 43)
sprite(TREE_TALL, 56, 40); sprite(TREE_TALL, 63, 40)
sprite(TREE_ROUND, 56, 43); sprite(TREE_ROUND, 63, 43)
sprite(BENCH, 58, 44); sprite(BENCH, 61, 44); sprite(BIN, 60, 44)
fill(GRASS, 70, 40, 70, 45); sprite(SHRUB, 70, 42)
# A couple of cars on the play area's side streets.
sprite(CAR_DOWN[0], 47, 31)
sprite(CAR_DOWN[1], 73, 42)

world.convert('RGB').save('public/assets/world.png')
print('world', world.size, 'stage origin', (OX, OY))
for k, (c, r) in LOTS.items():
    print(f"  {k}: x {c * T - OX}, y {r * T - OY}")
