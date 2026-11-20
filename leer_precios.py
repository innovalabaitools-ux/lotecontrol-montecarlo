import sys, re, json, pymupdf
from collections import defaultdict, Counter
doc = pymupdf.open(sys.argv[1])
rows, labels = [], []
for pi, p in enumerate(doc):
    words = p.get_text("words")  # x0,y0,x1,y1,word,block,line,wn
    # header columns from first page approx: manzana <120, lote 120-235, ubic 235-325, area 325-400, precio >400
    lines = defaultdict(list)
    for w in words:
        yc = round((w[1] + w[3]) / 2 / 2.5)
        lines[(yc)].append(w)
    for yc in sorted(lines):
        ws = sorted(lines[yc], key=lambda w: w[0])
        cols = defaultdict(list)
        for w in ws:
            x = (w[0] + w[2]) / 2
            c = 'mz' if x < 120 else 'lote' if x < 237 else 'ub' if x < 325 else 'area' if x < 402 else 'precio'
            cols[c].append(w[4])
        lote = " ".join(cols['lote']); ub = " ".join(cols['ub']); area = " ".join(cols['area']); pr = "".join(cols['precio']).replace('$', '')
        if cols['mz'] and not cols['lote']:
            t = " ".join(cols['mz'])
            if t.upper() != 'MANZANA': labels.append((pi, (ws[0][1] + ws[0][3]) / 2, t))
            continue
        if cols['mz']:
            t = " ".join(cols['mz'])
            if t.upper() != 'MANZANA': labels.append((pi, (ws[0][1] + ws[0][3]) / 2, t))
        m = re.match(r"(\d+)\s*(.*)", lote)
        if not m or not re.search(r"\d", pr): continue
        rows.append({"page": pi, "y": (ws[0][1] + ws[0][3]) / 2, "n": int(m.group(1)), "tag": m.group(2).strip(), "ub": ub, "area": area, "precio": int(re.sub(r"\D", "", pr))})
print("rows", len(rows), "labels", len(labels))
# split into groups when lote number resets
groups = []
for r in rows:
    if not groups or r["n"] <= groups[-1][-1]["n"]: groups.append([r])
    else: groups[-1].append(r)
print("groups", len(groups))
print("labels seq", [l[2] for l in labels][:120])
# assign label: for each group, label whose (page,y) falls within the group's span
def key(pg, y): return pg * 10000 + y
out = {}
unl = []
for g in groups:
    a, b = key(g[0]["page"], g[0]["y"] - 8), key(g[-1]["page"], g[-1]["y"] + 8)
    ls = [l for l in labels if a <= key(l[0], l[1]) <= b]
    if len(ls) != 1:
        unl.append((len(ls), [l[2] for l in ls], g[0]["page"], len(g), g[0]["n"], g[-1]["n"]))
        name = ls[0][2] if ls else None
    else: name = ls[0][2]
    if name is None: continue
    name = name.strip()
    if name in out: print("DUP manzana", name)
    out[name] = [{"n": r["n"], "tag": r["tag"], "ub": r["ub"], "area": r["area"], "precio": r["precio"]} for r in g]
print("problem groups", unl[:30])
print("manzanas", len(out), sorted(out, key=lambda s: (len(s), s))[:200])
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
