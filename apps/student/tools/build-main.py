"""Builds the main screen's pixel art: the living-room backdrop, the news rack and the persona sprites.

Run from apps/student:  python3 tools/build-main.py   (needs Pillow)

Everything is drawn at 1/5 size ("art px") and scaled x5 with nearest-neighbour, so one art pixel is
5x5 stage px everywhere and the scene reads as one piece. The personas are Kenney RPG Urban characters
(16 px tiles, assets-src/kenney/, CC0); the room, couch and rack are drawn here with plain rects.

  public/assets/main/room.png    360x640 stage backdrop: wall, window, Charminar picture, floor, rug, couch
  public/assets/main/rack.png    newspaper rack (the Paisa Times hotspot), 80x110
  public/assets/main/<id>.png    persona on the couch: 2 frames side by side (A, then B = breathe), 80x95 each

Positions must match src/features/main/main.css: the character frame sits at art (CHAR_X, CHAR_Y), i.e.
stage (CHAR_X*5, CHAR_Y*5), and its lap rows land on the couch cushion.
"""
import os
from PIL import Image, ImageDraw

S = 5                                    # art px -> stage px
W, H = 72, 128                           # stage 360x640
WALL_Y1 = 55                             # wall 0..55, floor 55..128
COUCH = (4, 38, 42, 62)                  # x0, y0, x1, y1 (art px)
CHAR_X, CHAR_Y = 15, 38                  # top-left of the 16x19 persona frame: lap on the cushion
OUT = 'public/assets/main'

OUTLINE = (74, 42, 34, 255)
WALL, WALL_DOT, WALL_DARK = (240, 205, 160, 255), (226, 186, 140, 255), (200, 156, 112, 255)
CORNICE, SKIRT, SKIRT_TOP = (214, 168, 122, 255), (150, 92, 60, 255), (184, 120, 80, 255)
PLANK, PLANK_ALT, SEAM = (186, 120, 76, 255), (174, 110, 70, 255), (130, 80, 52, 255)
COUCH_HI, COUCH_MID, COUCH_LO = (206, 88, 82, 255), (178, 64, 64, 255), (136, 44, 50, 255)
WOOD_HI, WOOD, WOOD_LO = (196, 134, 82, 255), (160, 100, 62, 255), (112, 66, 44, 255)
PAPER, PAPER_LO, INK, MAST = (246, 240, 226, 255), (214, 206, 190, 255), (150, 144, 138, 255), (214, 64, 56, 255)
PAPER_EDGE = (140, 110, 92, 255)
SKY, SKY_HI, CLOUD = (126, 196, 232, 255), (168, 220, 244, 255), (250, 250, 250, 255)
CURTAIN, CURTAIN_LO = (244, 170, 52, 255), (210, 132, 36, 255)        # marigold
STONE, STONE_LO = (236, 206, 150, 255), (196, 160, 106, 255)
RUG, RUG_HI, RUG_EDGE = (150, 52, 70, 255), (232, 176, 64, 255), (104, 34, 50, 255)


def canvas(w, h):
    im = Image.new('RGBA', (w, h))
    return im, ImageDraw.Draw(im)


def rect(d, x0, y0, x1, y1, c):
    """Fill the half-open box [x0, x1) x [y0, y1)."""
    if x1 > x0 and y1 > y0:
        d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=c)


def box(d, x0, y0, x1, y1, fill, outline=OUTLINE):
    rect(d, x0, y0, x1, y1, outline)
    rect(d, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)


def bitmap(d, x, y, rows, palette):
    """Draw a string bitmap; '.' is transparent."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != '.':
                d.point((x + i, y + j), fill=palette[ch])


def up(im):
    return im.resize((im.width * S, im.height * S), Image.NEAREST)


# --- room ---------------------------------------------------------------------------------------

def wall(d):
    rect(d, 0, 0, W, WALL_Y1, WALL)
    for y in range(7, WALL_Y1 - 4, 5):                       # small diamond wallpaper
        for x in range((y // 5) % 2 * 3 + 1, W, 6):
            d.point((x, y), fill=WALL_DOT)
    rect(d, 0, 0, W, 3, CORNICE)
    rect(d, 0, 3, W, 4, WALL_DARK)
    rect(d, 0, WALL_Y1 - 4, W, WALL_Y1 - 3, SKIRT_TOP)        # skirting board
    rect(d, 0, WALL_Y1 - 3, W, WALL_Y1, SKIRT)


def floor(d):
    for i, y in enumerate(range(WALL_Y1, H, 4)):              # planks, joints staggered per row
        rect(d, 0, y, W, y + 4, PLANK if i % 2 else PLANK_ALT)
        rect(d, 0, y + 3, W, y + 4, SEAM)
        for x in range((i * 7) % 19, W, 19):
            rect(d, x, y, x + 1, y + 3, SEAM)
    rect(d, 0, WALL_Y1, W, WALL_Y1 + 1, SEAM)                 # shadow under the skirting


def window(d, x0, y0, w, h):
    box(d, x0, y0, x0 + w, y0 + h, (250, 244, 232, 255))      # frame
    rect(d, x0 + 2, y0 + 2, x0 + w - 2, y0 + h - 2, SKY)
    rect(d, x0 + 2, y0 + 2, x0 + w - 2, y0 + 6, SKY_HI)
    bitmap(d, x0 + 3, y0 + 4, ['.cc..', 'cccc.', '.cccc'], {'c': CLOUD})
    mx, my = x0 + w // 2, y0 + h // 2
    rect(d, mx, y0 + 1, mx + 1, y0 + h - 1, (250, 244, 232, 255))   # mullions
    rect(d, x0 + 1, my, x0 + w - 1, my + 1, (250, 244, 232, 255))
    rect(d, x0 - 2, y0 + h, x0 + w + 2, y0 + h + 2, WOOD)            # sill
    rect(d, x0 - 2, y0 + h + 1, x0 + w + 2, y0 + h + 2, WOOD_LO)
    for cx in (x0 - 3, x0 + w - 1):                                  # marigold curtains
        rect(d, cx, y0 - 2, cx + 4, y0 + h + 1, CURTAIN)
        rect(d, cx + 1, y0 - 2, cx + 2, y0 + h + 1, CURTAIN_LO)
    rect(d, x0 - 5, y0 - 3, x0 + w + 5, y0 - 2, WOOD_LO)            # rail


CHARMINAR = [
    '.d..........d.',
    'ddd........ddd',
    '.s..........s.',
    '.s..........s.',
    '.s..........s.',
    'dddddddddddddd',
    'ssssssssssssss',
    '.s.s.s..s.s.s.',
    'ssssssssssssss',
    'ssss......ssss',
    'sss........sss',
    'sss........sss',
    'gggggggggggggg',
]


def picture(d, x0, y0):
    """Framed picture of the Charminar, a Hyderabad landmark."""
    w, h = 18, 17
    box(d, x0, y0, x0 + w, y0 + h, SKY_HI, OUTLINE)
    rect(d, x0 + 1, y0 + 1, x0 + w - 1, y0 + 2, WOOD_HI)
    rect(d, x0 + 1, y0 + 2, x0 + 2, y0 + h - 1, WOOD_HI)
    rect(d, x0 + 1, y0 + h - 2, x0 + w - 1, y0 + h - 1, WOOD)
    rect(d, x0 + w - 2, y0 + 2, x0 + w - 1, y0 + h - 1, WOOD)
    bitmap(d, x0 + 2, y0 + 2, CHARMINAR, {'s': STONE, 'd': STONE_LO, 'g': (120, 176, 96, 255)})


def rug(d, x0, y0, x1, y1):
    box(d, x0, y0, x1, y1, RUG, RUG_EDGE)
    rect(d, x0 + 2, y0 + 2, x1 - 2, y0 + 3, RUG_HI)
    rect(d, x0 + 2, y1 - 3, x1 - 2, y1 - 2, RUG_HI)
    for x in range(x0 + 4, x1 - 4, 4):                         # dhurrie diamonds
        d.point((x, (y0 + y1) // 2), fill=RUG_HI)
        d.point((x + 2, (y0 + y1) // 2 - 2), fill=RUG_HI)
        d.point((x + 2, (y0 + y1) // 2 + 2), fill=RUG_HI)
    for x in range(x0 + 1, x1 - 1, 2):                         # fringe
        d.point((x, y0 - 1), fill=PAPER_LO)
        d.point((x, y1), fill=PAPER_LO)


def couch(d, x0, y0, x1, y1):
    """Front view: back cushions, two arms, a seat whose top the persona's lap rests on, short feet."""
    arm_w, back_y1, seat_y, front_y, feet_y = 5, y0 + 14, y0 + 13, y0 + 16, y1 - 3
    box(d, x0 + 2, y0, x1 - 2, back_y1, COUCH_MID)                       # back
    rect(d, x0 + 3, y0 + 1, x1 - 3, y0 + 2, COUCH_HI)
    mid = (x0 + x1) // 2
    rect(d, mid, y0 + 2, mid + 1, back_y1, COUCH_LO)                       # two back cushions
    box(d, x0 + arm_w - 1, seat_y, x1 - arm_w + 1, front_y + 1, COUCH_HI)  # seat top
    box(d, x0 + arm_w - 1, front_y, x1 - arm_w + 1, feet_y, COUCH_MID)     # seat front
    rect(d, x0 + arm_w, feet_y - 2, x1 - arm_w, feet_y - 1, COUCH_LO)
    rect(d, mid, seat_y + 1, mid + 1, feet_y - 1, COUCH_LO)
    for ax in (x0, x1 - arm_w):                                            # arms
        box(d, ax, y0 + 7, ax + arm_w, feet_y, COUCH_MID)
        rect(d, ax + 1, y0 + 8, ax + arm_w - 1, y0 + 9, COUCH_HI)
        rect(d, ax + 1, feet_y - 2, ax + arm_w - 1, feet_y - 1, COUCH_LO)
    for fx in (x0 + 2, x1 - 4):                                            # feet
        rect(d, fx, feet_y, fx + 2, y1, WOOD_LO)


def room():
    im, d = canvas(W, H)
    wall(d)
    floor(d)
    window(d, 50, 10, 16, 18)
    picture(d, 14, 12)
    rug(d, 6, 67, 40, 79)
    rect(d, COUCH[0] + 1, COUCH[3] - 1, COUCH[2] - 1, COUCH[3] + 1, SEAM)  # shadow under the couch
    couch(d, *COUCH)
    return up(im)


# --- news rack ----------------------------------------------------------------------------------

def rack():
    """An open wooden rack (the wall shows through) with a folded paper on each of two shelves."""
    im, d = canvas(16, 22)
    for px in (0, 13):                                         # posts
        box(d, px, 1, px + 3, 22, WOOD)
    box(d, 0, 0, 16, 3, WOOD_HI)                               # top rail
    for ly in (12, 21):                                        # shelf ledges
        top = ly - 8
        box(d, 3, top, 13, ly, PAPER, PAPER_EDGE)
        rect(d, 4, top + 1, 12, top + 2, MAST)                 # masthead
        rect(d, 4, top + 3, 8, top + 5, PAPER_LO)              # photo
        for ty in (top + 3, top + 5):
            rect(d, 9, ty, 12, ty + 1, INK)                    # text lines
        rect(d, 4, ly - 2, 12, ly - 1, INK)
        box(d, 2, ly - 1, 14, min(ly + 1, 22), WOOD)           # ledge
    return up(im)


# --- personas -----------------------------------------------------------------------------------

sheet = Image.open('assets-src/kenney/tilemap_packed.png').convert('RGBA')
kenney = lambda col, row: sheet.crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))

# Warmer, browner skin for both (the sheet's are pale peach), and a darker eye for contrast.
SKIN = {
    (255, 201, 153): (214, 150, 104),
    (255, 200, 161): (220, 158, 112),
    (241, 176, 137): (186, 124, 84),
    (226, 151, 121): (172, 106, 74),
    (101, 65, 64): (58, 36, 34),
}
HAIR_DARK = (55, 55, 51)
RAVI_HAIR = {(197, 118, 82): (80, 80, 74), (220, 134, 82): (96, 96, 90)}
BROWN_OUTLINE = (141, 82, 67)


def recolour(im, mapping, rows=range(16)):
    im = im.copy()
    for y in rows:
        for x in range(im.width):
            r, g, b, a = im.getpixel((x, y))
            if a and (r, g, b) in mapping:
                im.putpixel((x, y), mapping[(r, g, b)] + (a,))
    return im


def seated(src, dy):
    """16x19 frame: head and torso (rows 0..13) shifted down by dy, the lap on the cushion
    (rows 14..15), then the shins and feet hanging over the seat front (rows 16..18)."""
    f, d = canvas(16, 19)
    out, dark, light = src.getpixel((4, 14)), src.getpixel((5, 14)), src.getpixel((6, 14))
    for x in range(3, 13):                                     # lap
        d.point((x, 14), fill=out if x in (3, 12) else light)
        d.point((x, 15), fill=out if x in (3, 7, 8, 12) else dark)
    f.alpha_composite(src.crop((0, 14, 16, 15)), (0, 16))      # shins
    f.alpha_composite(src.crop((0, 14, 16, 15)), (0, 17))
    f.alpha_composite(src.crop((0, 15, 16, 16)), (0, 18))      # feet
    f.alpha_composite(src.crop((0, 0, 16, 14)), (0, dy))
    return f


def persona(src):
    strip = Image.new('RGBA', (32, 19))
    strip.alpha_composite(seated(src, 0), (0, 0))
    strip.alpha_composite(seated(src, 1), (16, 0))             # breathe: upper body 1 art px lower
    return up(strip)


PERSONAS = {
    'sana': recolour(kenney(24, 15), SKIN),                    # dark hair, red hairband
    'ravi': recolour(recolour(recolour(kenney(24, 0), SKIN), RAVI_HAIR),
                     {BROWN_OUTLINE: HAIR_DARK}, rows=range(0, 10)),   # dark hair outline too
}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    room().convert('RGB').save(f'{OUT}/room.png', optimize=True)
    rack().save(f'{OUT}/rack.png', optimize=True)
    for pid, src in PERSONAS.items():
        persona(src).save(f'{OUT}/{pid}.png', optimize=True)
    for name in sorted(os.listdir(OUT)):
        print(f'main/{name}', Image.open(f'{OUT}/{name}').size)
