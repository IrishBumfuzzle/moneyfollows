"""Builds the two building icon sets, each as a strip and as separate sprites.
Run from apps/student after tools/build-sprites.py:  python3 tools/build-icon-sets.py   (needs Pillow)

  set1  the flat (front-on) pixel set for all five, the Shop included (building_art.py)
  set2  the 3D set in the Kenney kit's view: the kit's own Shop, the other four redrawn
        (building_art_3d.py)

Strips: public/assets/buildings/set1.png and set2.png, five 88x104 sprites left to right in map order
(home, school, convenience, bank, hospital). Sprites: public/assets/buildings/set1/<id>.png, set2/<id>.png
(the same size and names as the map's sprites, so either set can be dropped in)."""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from building_art import FLAT
from building_art_3d import ART_3D

ORDER = ['home', 'school', 'convenience', 'bank', 'hospital']
OUT = 'public/assets/buildings'
kit_shop = Image.open(f'{OUT}/convenience.png').convert('RGBA')   # the tile-built Shop (build-sprites.py)
SETS = {
    'set1': {k: FLAT[k]() for k in ORDER},
    'set2': {**{k: f() for k, f in ART_3D.items()}, 'convenience': kit_shop},
}
for name, art in SETS.items():
    os.makedirs(f'{OUT}/{name}', exist_ok=True)
    w, h = art['home'].size
    strip = Image.new('RGBA', (w * len(ORDER), h))
    for i, k in enumerate(ORDER):
        assert art[k].size == (w, h), (name, k, art[k].size)
        art[k].save(f'{OUT}/{name}/{k}.png')
        strip.alpha_composite(art[k], (i * w, 0))
    strip.save(f'{OUT}/{name}.png')
    print(name, strip.size)
