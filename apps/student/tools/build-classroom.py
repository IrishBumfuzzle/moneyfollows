"""Builds the classroom backdrop and the Kenney UI pieces used by the classroom quiz.

Run from apps/student:  python3 tools/build-classroom.py   (needs Pillow)

  public/assets/classroom.png  360x640 stage: room in the centre, black bars left and right.
                               Cool School tileset by NettySvit (CC0), assets-src/coolschool/.
  public/assets/ui/*.png       9-slice panels/buttons/pips cut from Kenney UI Pack Pixel
                               Adventure (CC0), assets-src/kenney-ui/.

Stage layout must match STAGE / BOARD in src/features/classroom/ClassroomScreen.tsx:
board inner area x 52..308, y 48..188 (the question is written there in chalk).
"""
import os
import random
from PIL import Image

W, H = 360, 640
ROOM_X0, ROOM_X1 = 28, 332          # 8 px border + 6 tiles of 48 + 8 px border
WALL_Y1 = 200                       # wall face 8..200, floor 200..632
BORDER = 8
T = 48

cs = Image.open('assets-src/coolschool/CoolSchool_tileset.png').convert('RGBA')
small = Image.open('assets-src/kenney-ui/small_packed.png').convert('RGBA')
large = Image.open('assets-src/kenney-ui/large_packed.png').convert('RGBA')


def sprite(x0, y0, x1, y1):
    """Crop a sheet rectangle and trim it to its opaque pixels."""
    im = cs.crop((x0, y0, x1, y1))
    return im.crop(im.getbbox())


# --- sheet regions (pixels in CoolSchool_tileset.png) ---
FLOOR = cs.crop((96, 0, 144, 48))
WALL_FACE = cs.crop((24, 144, 72, 240))            # one 48 px period: scalloped top, pattern, baseboard
EDGE_LIGHT, EDGE_DARK = (229, 255, 249, 255), (121, 160, 160, 255)
BOARD = cs.crop((110, 114, 226, 168))               # framed picture; we reuse its 5 px frame
TEACHER_DESK = sprite(48, 240, 144, 312)
STUDENT_DESK = sprite(0, 240, 48, 312)
STUDENT_CHAIR = sprite(48, 432, 96, 480)            # seen from behind (facing the board)
TEACHER_CHAIR = sprite(0, 432, 48, 480)
BOOKSHELF = sprite(240, 48, 288, 144)
CABINET = sprite(288, 240, 336, 312)
GLOBE = sprite(288, 432, 336, 480)
ITEMS = [sprite(48, 528, 96, 576), sprite(144, 528, 192, 576), sprite(96, 480, 144, 528),
         sprite(0, 528, 48, 576), sprite(192, 528, 240, 576)]
LAPTOP = sprite(96, 480, 144, 528)


def tile_fill(dst, src, box):
    x0, y0, x1, y1 = box
    for y in range(y0, y1, src.height):
        for x in range(x0, x1, src.width):
            piece = src.crop((0, 0, min(src.width, x1 - x), min(src.height, y1 - y)))
            dst.alpha_composite(piece, (x, y))


def nine_slice(src, w, h, s):
    """Stretch a framed sprite to w x h, keeping s-px corners and edges crisp."""
    out = Image.new('RGBA', (w, h))
    sw, sh = src.size
    cols = [(0, s, 0, s), (s, sw - s, s, w - s), (sw - s, sw, w - s, w)]
    rows = [(0, s, 0, s), (s, sh - s, s, h - s), (sh - s, sh, h - s, h)]
    for sx0, sx1, dx0, dx1 in cols:
        for sy0, sy1, dy0, dy1 in rows:
            part = src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST)
            out.alpha_composite(part, (dx0, dy0))
    return out


def chalkboard(w, h):
    """Wooden frame from the tileset's picture frame, dark green slate inside, chalk smudges."""
    frame = BOARD.crop((0, 0, BOARD.width, BOARD.height))
    # Take a clean 1 px column/row of the frame and rebuild it at the new size.
    board = nine_slice(frame, w, h, 6)
    rng = random.Random(7)
    slate, smudge, dust = (38, 78, 62, 255), (48, 92, 74, 255), (70, 112, 94, 255)
    for y in range(5, h - 5):
        for x in range(5, w - 5):
            board.putpixel((x, y), slate)
    for _ in range(14):                              # half-erased chalk strokes
        cx, cy, ln = rng.randrange(12, w - 40), rng.randrange(10, h - 16), rng.randrange(16, 40)
        for i in range(ln):
            for t in range(2):
                board.putpixel((min(w - 6, cx + i), min(h - 7, cy + t + (i // 9))), smudge)
    for x in range(8, w - 8):                         # dust along the bottom
        if rng.random() < 0.35:
            board.putpixel((x, h - 7), dust)
    return board


def build_room():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    inner = (ROOM_X0 + BORDER, BORDER, ROOM_X1 - BORDER, H - BORDER)

    # Floor, then the wall face over the top part.
    tile_fill(im, FLOOR, (inner[0], WALL_Y1, inner[2], inner[3]))
    top, mid, base = WALL_FACE.crop((0, 0, 48, 24)), WALL_FACE.crop((0, 24, 48, 72)), WALL_FACE.crop((0, 72, 48, 96))
    tile_fill(im, top, (inner[0], BORDER, inner[2], BORDER + 24))
    tile_fill(im, mid, (inner[0], BORDER + 24, inner[2], WALL_Y1 - 24))
    tile_fill(im, base, (inner[0], WALL_Y1 - 24, inner[2], WALL_Y1))

    # Shadow under the wall, like the cover art.
    for y in range(WALL_Y1, WALL_Y1 + 4):
        for x in range(inner[0], inner[2]):
            r, g, b, a = im.getpixel((x, y))
            im.putpixel((x, y), (int(r * .82), int(g * .82), int(b * .82), a))

    # Light wall-top border round the room, with a door gap at the bottom.
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                im.putpixel((x, y), c)
    rect(ROOM_X0, 0, ROOM_X1, BORDER, EDGE_LIGHT)
    rect(ROOM_X0, 0, ROOM_X0 + BORDER, H, EDGE_LIGHT)
    rect(ROOM_X1 - BORDER, 0, ROOM_X1, H, EDGE_LIGHT)
    rect(ROOM_X0, H - BORDER, ROOM_X1, H, EDGE_LIGHT)
    for x0, x1 in ((ROOM_X0, ROOM_X0 + 1), (ROOM_X1 - 1, ROOM_X1), (ROOM_X0 + BORDER - 1, ROOM_X0 + BORDER),
                   (ROOM_X1 - BORDER, ROOM_X1 - BORDER + 1)):
        rect(x0, 0, x1, H, EDGE_DARK)
    rect(ROOM_X0, 0, ROOM_X1, 1, EDGE_DARK)
    rect(ROOM_X0 + BORDER, BORDER - 1, ROOM_X1 - BORDER, BORDER, EDGE_DARK)
    rect(ROOM_X0, H - 1, ROOM_X1, H, EDGE_DARK)
    rect(ROOM_X0 + BORDER, H - BORDER, ROOM_X1 - BORDER, H - BORDER + 1, EDGE_DARK)
    door = (156, 204)
    tile_fill(im, FLOOR, (door[0], H - BORDER, door[1], H))
    rect(door[0] - 1, H - BORDER, door[0], H, EDGE_DARK)
    rect(door[1], H - BORDER, door[1] + 1, H, EDGE_DARK)

    # Chalkboard on the front wall: 272 x 156 at (44, 40); inner slate 52..308 x 48..188.
    im.alpha_composite(chalkboard(272, 156), (44, 40))

    def put(spr, x, y):
        im.alpha_composite(spr, (x, y))

    # Teacher's corner, then two rows of three student desks facing the board.
    put(BOOKSHELF, 38, WALL_Y1 - 40)
    put(CABINET, ROOM_X1 - BORDER - CABINET.width - 2, WALL_Y1 - 18)
    put(TEACHER_CHAIR, 180 - TEACHER_CHAIR.width // 2, 214)
    put(TEACHER_DESK, 180 - TEACHER_DESK.width // 2, 236)
    put(LAPTOP, 194, 226)
    for row, y in enumerate((356, 476)):
        for col, cx in enumerate((84, 180, 276)):
            put(STUDENT_DESK, cx - STUDENT_DESK.width // 2, y)
            put(STUDENT_CHAIR, cx - STUDENT_CHAIR.width // 2, y + STUDENT_DESK.height - 22)
            item = ITEMS[(row * 3 + col) % len(ITEMS)]
            if (row + col) % 2 == 0:
                put(item, cx - item.width // 2, y - 6)
    put(GLOBE, ROOM_X1 - BORDER - GLOBE.width - 4, H - BORDER - GLOBE.height - 6)
    return im


def ui():
    """Kenney tiles cut to their opaque box, saved 1:1. CSS 9-slices them with border-image."""
    s = lambda c, r: small.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
    l = lambda c, r, w=1: large.crop((c * 32, r * 32, (c + w) * 32, r * 32 + 32))
    trim = lambda im: im.crop(im.getbbox())
    pieces = {
        'panel': l(0, 0),                 # cream parchment, brown frame
        'panel-dark': l(1, 0),            # brown wood
        'button': trim(s(3, 2)),          # cream answer button
        'button-disabled': trim(s(3, 1)),
        'button-primary': trim(s(3, 3)),  # blue
        'button-correct': trim(s(5, 3)),  # green
        'button-wrong': trim(s(1, 3)),    # red
        'banner': trim(l(4, 3, 3)),       # red ribbon
        'pip-todo': trim(s(0, 1)),
        'pip-now': trim(s(1, 2)),
        'pip-right': trim(s(5, 3)),
        'pip-wrong': trim(s(1, 3)),
        'round': trim(s(0, 2)),           # round cream button (back)
    }
    os.makedirs('public/assets/ui', exist_ok=True)
    for name, im in pieces.items():
        im.save(f'public/assets/ui/{name}.png')
        print(f'ui/{name}.png', im.size)


if __name__ == '__main__':
    build_room().convert('RGB').save('public/assets/classroom.png', optimize=True)
    print('classroom.png', (W, H))
    ui()
