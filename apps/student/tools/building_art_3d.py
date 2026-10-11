"""The 3D set (Kenney RPG Urban Kit view: the roof seen from above, the front wall below) for Home,
School, Bank and Hospital, keeping each one's shape and landmark from the flat set
(building_art.py). The Shop in this set is the kit's own tile-built block (build-sprites.py)."""
from PIL import ImageDraw
from building_art import (CREAM, CREAM_2, CREAM_3, GLASS, GOLD, GOLD_2, GREEN, GREY, GREY_2, GREY_3, NAVY,
                          NAVY_2, OUT, PAD, RED, RED_2, RED_3, TAN, TAN_2, WHITE, WOOD, box, canvas, door,
                          poly, rect, window)

NAVY_3 = (96, 120, 186, 255)
ROOF_LIGHT = (214, 210, 226, 255)


def flat_roof(d, x0, y0, x1, y1, fill=GREY_2, light=ROOF_LIGHT):
    """A flat roof seen from above: a parapet rim, a lit back edge and a couple of vents."""
    box(d, x0, y0, x1, y1, fill)
    rect(d, x0 + 1, y0 + 1, x1 - 1, y0 + 2, light)
    rect(d, x0 + 1, y1 - 1, x1 - 1, y1 - 1, GREY_3)
    rect(d, x0 + 2, y0 + 3, x0 + 2, y1 - 2, light)


def home():
    im = canvas(); d = ImageDraw.Draw(im)
    # chimney on the back slope: its top face, then its front
    box(d, 54, 4, 62, 8, (214, 120, 110, 255)); box(d, 54, 8, 62, 24, RED_2)
    # the gable roof from above: a short, lit back slope, the ridge, a long front slope; it overhangs the walls
    poly(d, [(2, 22), (77, 22), (73, 12), (6, 12)], RED)
    for y in (15, 18):
        rect(d, 7, y, 72, y, RED_2)
    box(d, 2, 22, 77, 24, CREAM_2)                        # ridge cap
    poly(d, [(2, 25), (77, 25), (79, 58), (0, 58)], RED_2)
    for y in range(30, 58, 5):
        rect(d, 2, y, 77, y, RED_3)
    box(d, 54, 22, 62, 24, RED_2)                         # chimney foot on the ridge
    # front wall
    box(d, 6, 59, 73, 95, TAN)
    for y in range(63, 95, 5):
        rect(d, 7, y, 72, y, TAN_2)
    for x in (12, 56):
        window(d, x, 64, 12, 12, sill=True)
        box(d, x - 4, 64, x - 1, 75, NAVY); box(d, x + 12, 64, x + 15, 75, NAVY)
        box(d, x, 79, x + 11, 81, GREEN)
    poly(d, [(29, 66), (40, 60), (51, 66)], RED)          # porch roof
    door(d, 33, 68, 14, 26, WOOD)
    im.putpixel((44 + PAD, 82 + PAD), GOLD)
    box(d, 30, 94, 49, 95, GREY_2)
    return im


def school():
    im = canvas(); d = ImageDraw.Draw(im)
    flat_roof(d, 0, 30, 79, 62)                           # the wings' roof
    for x in (8, 64):
        box(d, x, 40, x + 7, 46, GREY_3)                  # rooftop vents
    # front wall of the wings: one row of windows and a band
    box(d, 0, 63, 79, 95, CREAM)
    rect(d, 1, 64, 78, 65, GREY)
    for x in (4, 15, 56, 67):
        window(d, x, 69, 8, 11, sill=False)
        rect(d, x - 1, 80, x + 8, 80, GREY_3)
    box(d, 1, 87, 20, 95, GREEN); box(d, 59, 87, 78, 95, GREEN)
    # the tower rises above the roof: its own roof from above, then its front face with the clock
    flat_roof(d, 27, 0, 52, 10, GREY, (236, 232, 246, 255))
    box(d, 27, 11, 52, 95, WHITE)
    rect(d, 28, 12, 51, 13, GREY)
    cx, cy = 39 + PAD, 26 + PAD
    d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=OUT)
    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=WHITE)
    for dx, dy in ((0, -7), (7, 0), (0, 7), (-7, 0)):
        im.putpixel((cx + dx, cy + dy), OUT)
    d.line([cx, cy, cx, cy - 6], fill=OUT); d.line([cx, cy, cx + 4, cy + 1], fill=RED_3)
    im.putpixel((cx, cy), RED)
    window(d, 33, 42, 14, 10, sill=False)
    window(d, 33, 56, 14, 8, sill=False)
    box(d, 24, 71, 55, 74, GREY)                          # entrance canopy
    door(d, 30, 75, 20, 21)
    return im


def bank():
    im = canvas(); d = ImageDraw.Draw(im)
    # the pitched roof from above: the ridge runs back from the pediment's tip; left slope lit
    poly(d, [(2, 44), (40, 24), (40, 2), (2, 22)], NAVY_3)
    poly(d, [(40, 24), (78, 44), (78, 22), (40, 2)], NAVY)
    d.line([(40 + PAD, 2 + PAD), (40 + PAD, 24 + PAD)], fill=NAVY_2)
    # the pediment's front face with the coin
    poly(d, [(2, 44), (40, 24), (78, 44)], CREAM)
    poly(d, [(9, 42), (40, 28), (71, 42)], NAVY_2, out=NAVY_2)
    cx, cy = 40 + PAD, 37 + PAD
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=OUT)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=GOLD)
    d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], outline=GOLD_2)
    box(d, 2, 44, 77, 50, CREAM)                          # entablature
    rect(d, 3, 48, 76, 49, CREAM_2)
    box(d, 6, 51, 73, 85, GREY_2)
    door(d, 32, 63, 16, 22, NAVY_2)
    for x in (8, 20, 52, 64):
        box(d, x, 51, x + 7, 85, WHITE)
        rect(d, x + 2, 53, x + 2, 83, CREAM_2); rect(d, x + 5, 53, x + 5, 83, CREAM_2)
        box(d, x - 1, 51, x + 8, 53, CREAM); box(d, x - 1, 83, x + 8, 85, CREAM)
    box(d, 2, 86, 77, 90, CREAM)                          # steps
    box(d, 0, 91, 79, 95, CREAM_2)
    rect(d, 1, 93, 78, 93, CREAM_3)
    return im


def hospital():
    im = canvas(); d = ImageDraw.Draw(im)
    flat_roof(d, 0, 28, 79, 60)                           # the wings' roof
    for x in (6, 64):
        box(d, x, 38, x + 9, 44, GREY_3)
    box(d, 0, 61, 79, 95, WHITE)                          # wings' front wall
    rect(d, 1, 62, 78, 63, GREY)
    for x in (4, 14, 58, 68):
        window(d, x, 67, 8, 11, sill=False)
    box(d, 2, 86, 18, 95, GREEN); box(d, 61, 86, 77, 95, GREEN)
    # the taller centre: a red cross painted on its roof, then its front face
    flat_roof(d, 23, 0, 56, 22, (236, 236, 240, 255), WHITE)
    rect(d, 36, 4, 43, 18, RED); rect(d, 29, 8, 50, 14, RED)
    rect(d, 36, 4, 37, 18, RED_2)
    box(d, 23, 23, 56, 95, WHITE)
    rect(d, 24, 24, 55, 25, GREY)
    box(d, 31, 29, 48, 40, (255, 236, 236, 255))          # the cross sign on the front
    rect(d, 38, 31, 41, 38, RED); rect(d, 34, 33, 45, 36, RED)
    window(d, 28, 45, 9, 10, sill=False); window(d, 42, 45, 9, 10, sill=False)
    box(d, 19, 69, 60, 72, RED)
    rect(d, 20, 70, 59, 70, RED_2)
    door(d, 28, 73, 24, 23)
    return im


ART_3D = {'home': home, 'school': school, 'bank': bank, 'hospital': hospital}
