"""Saca del logo (imagen sobre fondo negro) dos piezas con fondo transparente:
logo-montecarlo-cm.png (monograma) y logo-montecarlo.png (logo completo).
Uso: python preparar_logo.py imagen_logo carpeta_salida
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32)
mx = a.max(axis=2)
# el fondo es negro texturizado (~15-50); el metal dorado y gris queda por encima
alpha = np.clip((mx - 48) / 55.0, 0, 1)
# des-multiplicar el negro del fondo para que los bordes no queden sucios
rgb = np.where(alpha[..., None] > 0.02, np.clip(a / np.maximum(alpha[..., None], 0.35), 0, 255), 0)
rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
full = Image.fromarray(rgba, "RGBA")

def crop_auto(img, box, pad=6):
    sub = img.crop(box)
    al = np.asarray(sub)[..., 3]
    ys, xs = np.nonzero(al > 40)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    return sub.crop((max(0, x0 - pad), max(0, y0 - pad), min(sub.width, x1 + pad), min(sub.height, y1 + pad)))

def up(img, k=3):
    big = img.resize((img.width * k, img.height * k), Image.LANCZOS)
    r, g, b, al = big.split()
    rgb = Image.merge("RGB", (r, g, b)).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    return Image.merge("RGBA", (*rgb.split(), al))

cm = up(crop_auto(full, (225, 10, 590, 362)))
logo = up(crop_auto(full, (70, 10, 745, 590)), 2)
# tamaños de uso en la app (livianos)
cm = cm.resize((360, round(360 * cm.height / cm.width)), Image.LANCZOS)
logo = logo.resize((900, round(900 * logo.height / logo.width)), Image.LANCZOS)
cm.save(out + "/logo-montecarlo-cm.png", optimize=True)
logo.save(out + "/logo-montecarlo.png", optimize=True)
# vista previa sobre fondo claro y oscuro para revisar bordes
for name, img in (("cm", cm), ("logo", logo)):
    prev = Image.new("RGBA", (img.width * 2 + 30, img.height + 20), (20, 18, 16, 255))
    light = Image.new("RGBA", (img.width, img.height), (244, 239, 230, 255))
    prev.paste(img, (10, 10), img)
    prev.paste(light, (img.width + 20, 10)); prev.paste(img, (img.width + 20, 10), img)
    prev.convert("RGB").resize((prev.width // 3, prev.height // 3)).save(out + f"/_preview_{name}.jpg")
print(cm.size, logo.size)
