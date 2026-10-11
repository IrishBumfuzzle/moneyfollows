"""Hand-drawn pixel buildings for the map (Home, School, Hospital, Bank), in the Kenney RPG Urban
Kit's palette so they sit in the same town. Each draws on a transparent 88x104 canvas (80x96 plus
4 px padding, like the tile-built Shop in build-sprites.py), with its own silhouette."""
from PIL import Image, ImageDraw

PAD = 4
OUT = (66, 52, 70, 255)                                        # outline, the kit's dark plum
CREAM, CREAM_2, CREAM_3 = (236, 232, 214, 255), (214, 212, 175, 255), (179, 155, 125, 255)
TAN, TAN_2 = (198, 188, 159, 255), (179, 155, 125, 255)
RED, RED_2, RED_3 = (194, 80, 77, 255), (165, 66, 64, 255), (125, 50, 52, 255)
GLASS, GLASS_2 = (205, 229, 242, 255), (160, 190, 215, 255)
GREY, GREY_2, GREY_3 = (190, 184, 205, 255), (170, 168, 189, 255), (137, 140, 166, 255)
WHITE = (250, 250, 246, 255)
NAVY, NAVY_2 = (64, 86, 150, 255), (46, 62, 112, 255)
GOLD, GOLD_2 = (242, 194, 48, 255), (201, 138, 27, 255)
GREEN, GREEN_2 = (61, 168, 92, 255), (40, 120, 70, 255)
WOOD, WOOD_2 = (197, 118, 82, 255), (150, 84, 60, 255)


def canvas():
    return Image.new('RGBA', (80 + 2 * PAD, 96 + 2 * PAD))


def box(d, x0, y0, x1, y1, fill, out=OUT):
    """A filled rectangle with a 1 px outline; coordinates are inclusive, in building px."""
    d.rectangle([x0 + PAD, y0 + PAD, x1 + PAD, y1 + PAD], fill=fill, outline=out)


def rect(d, x0, y0, x1, y1, fill):
    d.rectangle([x0 + PAD, y0 + PAD, x1 + PAD, y1 + PAD], fill=fill)


def window(d, x, y, w=8, h=10, frame=CREAM, sill=True):
    box(d, x, y, x + w - 1, y + h - 1, GLASS)
    rect(d, x + 1, y + 1, x + w - 2, y + 2, WHITE)                      # sky glint
    rect(d, x + w // 2, y + 1, x + w // 2, y + h - 2, frame)           # mullion
    rect(d, x + 1, y + h - 3, x + w - 2, y + h - 2, GLASS_2)
    if sill:
        rect(d, x - 1, y + h, x + w, y + h, OUT)


def door(d, x, y, w, h, color=GLASS):
    box(d, x, y, x + w - 1, y + h - 1, color)
    rect(d, x + w // 2, y + 1, x + w // 2, y + h - 2, OUT)
    rect(d, x + 1, y + 1, x + w - 2, y + 3, WHITE if color == GLASS else WOOD_2)


def poly(d, pts, fill, out=OUT):
    d.polygon([(x + PAD, y + PAD) for x, y in pts], fill=fill, outline=out)


def school():
    """A Japanese school: a long two-storey block with a central clock tower and a glass entrance."""
    im = canvas(); d = ImageDraw.Draw(im)
    # wings
    box(d, 0, 34, 79, 95, CREAM)
    rect(d, 1, 35, 78, 38, GREY)                     # roof parapet
    rect(d, 1, 39, 78, 39, GREY_3)
    rect(d, 1, 62, 78, 63, GREY_2)                   # floor band between the storeys
    for y in (44, 68):
        for x in (4, 16, 56, 68):                     # clear of the tower (x 28..51)
            window(d, x, y, 8, 12, sill=False)
            rect(d, x - 1, y + 12, x + 8, y + 12, GREY_3)
    # the tower
    box(d, 28, 8, 51, 60, WHITE)
    rect(d, 29, 9, 50, 12, GREY)                      # tower parapet
    rect(d, 29, 13, 50, 13, GREY_3)
    box(d, 31, 0, 48, 8, GREY)                       # little roof house on top
    rect(d, 32, 1, 47, 2, GREY_2)
    # the clock
    cx, cy = 39 + PAD, 26 + PAD
    d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=OUT)
    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=WHITE)
    for dx, dy in ((0, -7), (7, 0), (0, 7), (-7, 0)):
        im.putpixel((cx + dx, cy + dy), OUT)
    d.line([cx, cy, cx, cy - 6], fill=OUT); d.line([cx, cy, cx + 4, cy + 1], fill=RED_3)
    im.putpixel((cx, cy), RED)
    # banner window under the clock, entrance canopy and glass doors
    window(d, 33, 40, 14, 10, sill=False)
    box(d, 24, 72, 55, 75, GREY)
    door(d, 30, 76, 20, 20)
    # hedges by the entrance
    for x in (1, 59):
        box(d, x, 88, x + 19, 95, GREEN)
        rect(d, x + 1, 89, x + 18, 90, (90, 196, 120, 255))
    return im


def home():
    """A family home: a pitched gable roof with a chimney, an attic window, shutters and a door."""
    im = canvas(); d = ImageDraw.Draw(im)
    box(d, 58, 6, 66, 26, RED_2)                     # chimney (behind the roof)
    rect(d, 57, 6, 67, 8, RED_3)
    box(d, 8, 44, 71, 95, TAN)                        # house body
    for y in range(48, 95, 6):
        rect(d, 9, y, 70, y, TAN_2)                   # siding lines
    poly(d, [(14, 44), (40, 18), (66, 44)], CREAM)    # gable wall
    poly(d, [(2, 46), (40, 8), (78, 46), (70, 46), (40, 16), (10, 46)], RED)   # the two roof slopes
    for i in range(0, 30, 6):                          # tile courses on the slopes
        d.line([(10 + i + PAD, 46 - i + PAD - 2), (14 + i + PAD, 42 - i + PAD - 2)], fill=RED_2)
        d.line([(70 - i + PAD, 46 - i + PAD - 2), (66 - i + PAD, 42 - i + PAD - 2)], fill=RED_2)
    # round attic window
    cx, cy = 40 + PAD, 33 + PAD
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=OUT)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=GLASS)
    d.line([cx - 4, cy, cx + 4, cy], fill=CREAM); d.line([cx, cy - 4, cx, cy + 4], fill=CREAM)
    # windows with shutters
    for x in (14, 52):
        window(d, x, 54, 14, 14, sill=True)
        box(d, x - 5, 54, x - 2, 67, NAVY)
        box(d, x + 15, 54, x + 18, 67, NAVY)
        box(d, x, 72, x + 13, 75, GREEN)              # flower box
        for fx in range(x + 1, x + 13, 3):
            im.putpixel((fx + PAD, 72 + PAD), (240, 120, 150, 255))
    # door with a little roof and step
    poly(d, [(30, 68), (40, 62), (50, 68)], RED_2)
    door(d, 33, 70, 14, 24, WOOD)
    im.putpixel((44 + PAD, 82 + PAD), GOLD)
    box(d, 30, 94, 49, 95, GREY_2)
    return im


def bank():
    """A classical bank: a navy pediment with a gold coin, white columns and wide steps."""
    im = canvas(); d = ImageDraw.Draw(im)
    poly(d, [(2, 34), (40, 4), (78, 34)], NAVY)         # pediment
    poly(d, [(10, 31), (40, 9), (70, 31)], NAVY_2, out=NAVY_2)
    cx, cy = 40 + PAD, 23 + PAD                          # the gold coin
    d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=OUT)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=GOLD)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], outline=GOLD_2)
    im.putpixel((cx - 2, cy - 3), WHITE)
    box(d, 2, 34, 77, 41, CREAM)                         # entablature
    rect(d, 3, 39, 76, 40, CREAM_2)
    box(d, 6, 42, 73, 83, GREY_2)                        # the hall behind the columns
    door(d, 32, 58, 16, 25, NAVY_2)
    rect(d, 33, 59, 46, 61, NAVY)
    for x in (8, 20, 52, 64):                            # columns
        box(d, x, 42, x + 7, 83, WHITE)
        rect(d, x + 2, 44, x + 2, 81, CREAM_2)
        rect(d, x + 5, 44, x + 5, 81, CREAM_2)
        box(d, x - 1, 42, x + 8, 44, CREAM)
        box(d, x - 1, 81, x + 8, 83, CREAM)
    box(d, 2, 84, 77, 88, CREAM)                         # steps, widening downwards
    box(d, 0, 89, 79, 95, CREAM_2)
    rect(d, 1, 91, 78, 91, CREAM_3)
    return im


def hospital():
    """A hospital: a white block with a taller centre carrying the red cross, and lower wings."""
    im = canvas(); d = ImageDraw.Draw(im)
    box(d, 0, 30, 79, 95, WHITE)                          # wings
    rect(d, 1, 31, 78, 34, GREY)
    rect(d, 1, 35, 78, 35, GREY_3)
    for y in (42, 62):
        for x in (4, 14, 58, 68):
            window(d, x, y, 8, 11, sill=False)
    box(d, 24, 0, 55, 95, WHITE)                          # the taller centre
    rect(d, 25, 1, 54, 4, GREY)
    rect(d, 25, 5, 54, 5, GREY_3)
    box(d, 29, 9, 50, 30, (255, 236, 236, 255))           # the cross sign
    rect(d, 37, 12, 42, 27, RED); rect(d, 32, 17, 47, 22, RED)
    rect(d, 37, 12, 38, 27, RED_2)
    for y in (36, 52):
        window(d, 29, y, 9, 11, sill=False); window(d, 42, y, 9, 11, sill=False)
    box(d, 20, 70, 59, 73, RED)                           # entrance canopy
    rect(d, 21, 71, 58, 71, RED_2)
    door(d, 28, 74, 24, 22)
    box(d, 2, 86, 18, 95, GREEN); box(d, 61, 86, 77, 95, GREEN)
    return im


ART = {'school': school, 'home': home, 'bank': bank, 'hospital': hospital}
