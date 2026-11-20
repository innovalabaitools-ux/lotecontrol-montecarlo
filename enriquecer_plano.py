"""Agrega a plano-montecarlo.json: precios de la lista oficial, ubicación (esquinero,
intermedio, doble frente, comercial), estado vendido (todo punto de color del plano)
y sectores para la navegación 3D.

Uso: python enriquecer_plano.py plano-montecarlo.json precios.json
"""
import json, sys, math
import numpy as np

plano_f, precios_f = sys.argv[1], sys.argv[2]
pl = json.load(open(plano_f, encoding="utf-8"))
pr = json.load(open(precios_f, encoding="utf-8"))
idx = {(mz, r["n"]): r for mz, rs in pr.items() for r in rs}

con_precio = 0
for l in pl["lotes"]:
    r = idx.get((l["mz"], l["n"]))
    l["v"] = 1 if l.get("d") else 0          # cualquier punto de color = vendido
    l.pop("d", None)
    if r:
        l["pr"] = r["precio"]; con_precio += 1
        u = r["ub"].strip().lower()
        l["u"] = "esquinero" if "esquin" in u else "doble frente" if "doble" in u else "intermedio"
        if r["tag"].upper().startswith("COMERCIAL"): l["c"] = 1
print("lotes con precio", con_precio, "de", len(pl["lotes"]), "vendidos", sum(l["v"] for l in pl["lotes"]))

# centro de cada manzana (promedio de centros de sus lotes)
cent = {}
for l in pl["lotes"]:
    xs = [p[0] for p in l["p"]]; ys = [p[1] for p in l["p"]]
    cent.setdefault(l["mz"], []).append((sum(xs) / len(xs), sum(ys) / len(ys)))
mzs = sorted(cent, key=lambda m: (len(m), m))
C = np.array([np.mean(cent[m], axis=0) for m in mzs])

# k-means determinista con 6 sectores
K = 6
rng = np.random.default_rng(7)
best = None
for t in range(30):
    c = C[rng.choice(len(C), K, replace=False)]
    for _ in range(60):
        lab = np.argmin(((C[:, None, :] - c[None]) ** 2).sum(-1), 1)
        nc = np.array([C[lab == k].mean(0) if (lab == k).any() else c[k] for k in range(K)])
        if np.allclose(nc, c): break
        c = nc
    sse = ((C - c[lab]) ** 2).sum()
    if best is None or sse < best[0]: best = (sse, lab.copy(), c.copy())
_, lab, cen = best
# nombrar por posición respecto al centro del proyecto
mid = C.mean(0)
def nombre(pt):
    dx, dy = pt[0] - mid[0], pt[1] - mid[1]
    ang = math.degrees(math.atan2(-dy, dx)) % 360   # 0 = este, 90 = norte
    dirs = ["Oriente", "Nororiente", "Norte", "Noroccidente", "Occidente", "Suroccidente", "Sur", "Suroriente"]
    if math.hypot(dx, dy) < 120: return "Central"
    return dirs[int(((ang + 22.5) % 360) // 45)]
names = {}
used = {}
order = sorted(range(K), key=lambda k: (cen[k][1], cen[k][0]))
for k in order:
    n = nombre(cen[k]); used[n] = used.get(n, 0) + 1
    names[k] = n if used[n] == 1 else f"{n} {used[n]}"
sec_of = {m: int(lab[i]) for i, m in enumerate(mzs)}
pl["sectores"] = []
for k in order:
    ms = [m for m in mzs if sec_of[m] == k]
    pts = [p for l in pl["lotes"] if l["mz"] in ms for p in l["p"]]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    pl["sectores"].append({"id": k, "nombre": "Sector " + names[k], "manzanas": ms,
                           "bbox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]})
    print("Sector", names[k], len(ms), "manzanas")
for l in pl["lotes"]: l["s"] = sec_of[l["mz"]]
json.dump(pl, open(plano_f, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
