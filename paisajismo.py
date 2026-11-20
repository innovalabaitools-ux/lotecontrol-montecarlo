"""Agrega paisajismo al plano: contorno del condominio (sitio), zonas verdes y árboles.
Uso: python paisajismo.py plano-montecarlo.json
"""
import json, sys, random
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep

f = sys.argv[1]
pl = json.load(open(f, encoding="utf-8"))
lots = unary_union([Polygon(l["p"]).buffer(0) for l in pl["lotes"]])
roads = []
for rs in pl["vias"]:
    try: roads.append(Polygon(rs[0], rs[1:]).buffer(0))
    except Exception: pass
roads = unary_union(roads)
built = unary_union([lots, roads])
sitio = built.buffer(22, join_style=1).buffer(-14, join_style=1).simplify(1.2)
if sitio.geom_type == "MultiPolygon": sitio = max(sitio.geoms, key=lambda g: g.area)
verde = sitio.difference(built.buffer(1.5)).buffer(-0.5)
rings = lambda g: [[round(x, 1), round(y, 1)] for x, y in list(g.exterior.coords)[:-1]]
pl["sitio"] = rings(sitio)
gv = list(verde.geoms) if hasattr(verde, "geoms") else [verde]
pl["verdes"] = [rings(g.simplify(0.8)) for g in gv if g.area > 80]

random.seed(11)
trees = []
pv = prep(verde.buffer(-2.5))
minx, miny, maxx, maxy = sitio.bounds
step = 9.0
y = miny
while y < maxy:
    x = minx
    while x < maxx:
        px, py = x + random.uniform(-3.5, 3.5), y + random.uniform(-3.5, 3.5)
        if pv.contains(Point(px, py)): trees.append([round(px, 1), round(py, 1), round(random.uniform(0.75, 1.35), 2)])
        x += step
    y += step
# franja de bosque alrededor del condominio
belt = prep(sitio.buffer(70).difference(sitio.buffer(6)))
y = miny - 70
while y < maxy + 70:
    x = minx - 70
    while x < maxx + 70:
        px, py = x + random.uniform(-5, 5), y + random.uniform(-5, 5)
        if belt.contains(Point(px, py)) and random.random() < 0.8: trees.append([round(px, 1), round(py, 1), round(random.uniform(0.9, 1.6), 2)])
        x += 13
    y += 13
pl["arboles"] = trees
json.dump(pl, open(f, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print("verdes", len(pl["verdes"]), "arboles", len(trees))
