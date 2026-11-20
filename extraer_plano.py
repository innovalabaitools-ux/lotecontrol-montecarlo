import sys, json, re, pymupdf
from collections import Counter, defaultdict
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree

src, outdir = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src); p = doc[0]
M = p.rotation_matrix
T = lambda pt: (pymupdf.Point(pt) * M)
col = lambda d, k: tuple(round(c, 2) for c in (d.get(k) or ()))

def bez(p0, p1, p2, p3, n=8):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        x = u**3*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t**3*p3.x
        y = u**3*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t**3*p3.y
        out.append((x, y))
    return out

dr = p.get_drawings()
lines = []; roads = []; dots = []
for d in dr:
    c = col(d, "color"); f = col(d, "fill")
    if d["type"] in ("s", "fs") and (d.get("width") or 0) >= 5.5 and c in ((0.9, 0.11, 0.11), (0.0, 0.67, 0.8)):
        for it in d["items"]:
            q = T(it[1]); dots.append((q.x, q.y, "rojo" if c[0] > .5 else "azul"))
        continue
    if f == (0.58, 0.58, 0.6) and d["type"] in ("f", "fs"):
        pts = []
        for it in d["items"]:
            if it[0] == "l": pts += [tuple(T(it[1])), tuple(T(it[2]))]
            elif it[0] == "c": pts += bez(T(it[1]), T(it[2]), T(it[3]), T(it[4]))
            elif it[0] == "re": r = it[1] * M; pts += [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
            elif it[0] == "qu": q = it[1]; pts += [tuple(T(q.ul)), tuple(T(q.ur)), tuple(T(q.lr)), tuple(T(q.ll))]
        if len(pts) >= 3: roads.append(pts)
    if c == (0.0, 0.0, 0.0):
        for it in d["items"]:
            if it[0] == "l": lines.append([tuple(T(it[1])), tuple(T(it[2]))])
            elif it[0] == "c": lines.append(bez(T(it[1]), T(it[2]), T(it[3]), T(it[4])))
            elif it[0] == "re":
                r = it[1] * M; lines.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)])
            elif it[0] == "qu":
                q = it[1]; pts = [tuple(T(q.ul)), tuple(T(q.ur)), tuple(T(q.lr)), tuple(T(q.ll))]; lines.append(pts + [pts[0]])
print("black lines", len(lines), "road fills", len(roads), "dots", len(dots), Counter(d[2] for d in dots))

geoms = [LineString(l) for l in lines if len(l) >= 2 and LineString(l).length > 0]
merged = unary_union(geoms)
faces = list(polygonize(merged))
print("faces", len(faces))

# text
td = p.get_text("dict")
nums, areas, mzs = [], [], []
for b in td["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            t = s["text"].strip()
            if not t: continue
            r = pymupdf.Rect(s["bbox"]) * M
            c = Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
            if s["color"] == 0xff0000 and re.fullmatch(r"\d+", t): nums.append((int(t), c))
            elif s["color"] == 0xff00ff and re.fullmatch(r"\d+", t): mzs.append((t, c, round(s["size"], 1)))
            elif s["color"] == 0 and "m2" in t:
                m = re.search(r"(\d+[.,]?\d*)\s*m2", t.replace(" ", ""))
                if m: areas.append((float(m.group(1).replace(".", "").replace(",", ".")) if "," in m.group(1) else float(m.group(1)), c))
print("nums", len(nums), "areas", len(areas), "mz labels", len(mzs))

tree = STRtree(faces)
def face_of(pt):
    for i in tree.query(pt):
        if faces[i].contains(pt): return int(i)
    return None

face_nums = defaultdict(list)
miss = 0
for n, c in nums:
    fi = face_of(c)
    if fi is None: miss += 1
    else: face_nums[fi].append((n, c))
print("nums without face", miss, "faces with >1 num", sum(1 for v in face_nums.values() if len(v) > 1))

lots = []
for fi, v in face_nums.items():
    if len(v) != 1: continue
    lots.append({"face": fi, "num": v[0][0], "c": v[0][1]})
# raster flood-fill fallback for numbers whose lines don't close
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import MultiPoint
placed = {id(L["c"]) for L in lots}
missing = [(n, c) for n, c in nums if face_of(c) is None or len(face_nums.get(face_of(c), [])) != 1]
SC = 4
W_, H_ = int(p.rect.width * SC), int(p.rect.height * SC)
im = Image.new("L", (W_, H_), 255); g = ImageDraw.Draw(im)
for l in lines:
    g.line([(x * SC, y * SC) for x, y in l], fill=0, width=3)
base = np.array(im)
from scipy import ndimage
LAB, _nl = ndimage.label(base > 0)
OBJ = ndimage.find_objects(LAB)
med = sorted(faces[L["face"]].area for L in lots)[len(lots) // 2]
added = 0; why = Counter()
for n, c in missing:
    x, y = int(c.x * SC), int(c.y * SC)
    if base[y, x] == 0:
        # nudge off the line
        ok = False
        for dx, dy in ((4,0),(-4,0),(0,4),(0,-4),(8,0),(-8,0),(0,8),(0,-8)):
            if base[y+dy, x+dx] != 0: x, y = x+dx, y+dy; ok = True; break
        if not ok: why["online"] += 1; continue
    lid = LAB[y, x]
    if lid == 0: why["empty"] += 1; continue
    sl = OBJ[lid - 1]
    sub = LAB[sl] == lid
    ys, xs = np.nonzero(sub); ys = ys + sl[0].start; xs = xs + sl[1].start
    if len(xs) == 0: why["empty"] += 1; continue
    if len(xs) > med * SC * SC * 6: why["leak"] += 1; continue
    hull = MultiPoint(list(zip(xs / SC, ys / SC))[::7] + [(xs.min()/SC, ys[xs.argmin()]/SC), (xs.max()/SC, ys[xs.argmax()]/SC), (xs[ys.argmin()]/SC, ys.min()/SC), (xs[ys.argmax()]/SC, ys.max()/SC)]).convex_hull.buffer(0.35)
    faces.append(hull); lots.append({"face": len(faces) - 1, "num": n, "c": c}); added += 1
print("flood-filled lots added", added, "of", len(missing), why, "median face", round(med, 1))
for n, c in missing[:6]: print("  miss", n, round(c.x, 1), round(c.y, 1))
tree = STRtree(faces)
lot_polys = [faces[L["face"]] for L in lots]
ltree = STRtree(lot_polys)
def lot_of(pt, tol=1.5):
    best = None
    for i in ltree.query(pt.buffer(tol)):
        dd = lot_polys[i].distance(pt)
        if dd <= tol and (best is None or dd < best[0]): best = (dd, int(i))
    return best[1] if best else None
for L in lots: L["area"] = None; L["dot"] = None
for a, c in areas:
    i = lot_of(c, 0.5)
    if i is not None and lots[i]["area"] is None: lots[i]["area"] = a
for x, y, k in dots:
    i = lot_of(Point(x, y), 2.0)
    if i is not None: lots[i]["dot"] = k

# blocks: connected components of lot faces
lotpolys = [faces[L["face"]].buffer(0.6) for L in lots]
blocks = unary_union(lotpolys)
blocks = list(blocks.geoms) if hasattr(blocks, "geoms") else [blocks]
print("blocks", len(blocks))
btree = STRtree(blocks)
for i, L in enumerate(lots):
    c = faces[L["face"]].representative_point()
    L["block"] = next(int(j) for j in btree.query(c) if blocks[j].contains(c))
# manzana label -> nearest block (labels sit inside or next to block)
blk_labels = defaultdict(list)
for t, c, sz in mzs:
    dists = sorted((blocks[j].distance(c), j) for j in range(len(blocks)))
    blk_labels[dists[0][1]].append((t, c, dists[0][0]))
unl = [j for j in range(len(blocks)) if j not in blk_labels]
grp = {j: j for j in unl}
def fnd(a):
    while grp[a] != a: a = grp[a]
    return a
for a in unl:
    for b in unl:
        pass
roots = sorted({fnd(j) for j in unl}, key=lambda r: (round(blocks[r].centroid.y / 100), blocks[r].centroid.x))
for j in unl:
    name = "SN" + str(roots.index(fnd(j)) + 1)
    blk_labels[j].append((name, blocks[j].centroid, 0))
    print("unlabeled block ->", name, "lots", sum(1 for L in lots if L.get("block") == j), "at", round(blocks[j].centroid.x), round(blocks[j].centroid.y))
for L in lots:
    labs = blk_labels.get(L["block"], [])
    if not labs:
        L["mz"] = None; continue
    if len(labs) == 1: L["mz"] = labs[0][0]
    else: L["mz"] = min(labs, key=lambda x: x[1].distance(faces[L["face"]].centroid))[0]
# report
nomz = [L for L in lots if L["mz"] is None]
print("lots", len(lots), "without mz", len(nomz))
bymz = defaultdict(list)
for L in lots: bymz[L["mz"]].append(L["num"])
dups = {k: [n for n, c in Counter(v).items() if c > 1] for k, v in bymz.items()}
dups = {k: v for k, v in dups.items() if v}
print("manzanas", len(bymz), "with duplicate numbers", len(dups), list(dups.items())[:15])
print("multi-label blocks", {j: [l[0] for l in v] for j, v in blk_labels.items() if len(v) > 1})
print("dots on lots", Counter(L["dot"] for L in lots))

# bounding box of content
allb = unary_union([faces[L["face"]] for L in lots]).bounds
print("bounds", allb)
x0, y0 = allb[0] - 60, allb[1] - 60
def ring(poly, tol=0.15):
    poly = poly.simplify(tol)
    return [[round(x - x0, 1), round(y - y0, 1)] for x, y in list(poly.exterior.coords)[:-1]]
out = {"w": round(allb[2] - allb[0] + 120, 1), "h": round(allb[3] - allb[1] + 120, 1), "lotes": [], "manzanas": [], "vias": []}
for L in sorted(lots, key=lambda L: (str(L["mz"]).zfill(4), L["num"])):
    out["lotes"].append({"mz": L["mz"], "n": L["num"], "a": L["area"], "d": L["dot"], "p": ring(faces[L["face"]])})
for t, c, sz in mzs:
    out["manzanas"].append({"t": t, "x": round(c.x - x0, 1), "y": round(c.y - y0, 1)})
# roads: union of road fills, simplified
lu = unary_union([faces[L["face"]].buffer(0.3) for L in lots])
ru = lu.buffer(14, join_style=1).buffer(-9, join_style=1).difference(lu.buffer(-0.2)).simplify(0.5)
ru = ru.buffer(0)
rgeoms = list(ru.geoms) if hasattr(ru, "geoms") else [ru]
for g in rgeoms:
    rings = [[[round(x - x0, 1), round(y - y0, 1)] for x, y in list(g.exterior.coords)[:-1]]]
    for h in g.interiors: rings.append([[round(x - x0, 1), round(y - y0, 1)] for x, y in list(h.coords)[:-1]])
    out["vias"].append(rings)
json.dump(out, open(outdir + "/plano-montecarlo.json", "w", encoding="utf-8"), separators=(",", ":"))
import os; print("json KB", os.path.getsize(outdir + "/plano-montecarlo.json") // 1024)
