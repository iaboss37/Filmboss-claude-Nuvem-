"""Achar a fonte de um texto da referência (ou a substituta livre mais parecida).

  python fonte.py recortar <video> <segundo> <x> <y> <w> <h> <saida.png>
      recorta o texto na resolução original (x, y, w, h de 0 a 1, como no textos.json da análise)
  python fonte.py comparar <recorte.png> "TEXTO DO RECORTE" "Familia 1" "Familia 2" ... [--saida folha.jpg]
      baixa cada família do Google Fonts ou do Fontshare ("fontshare:Nome" força o Fontshare; licenças livres,
      guardadas em ~/.boss-motion/fontes), desenha o mesmo texto
      em todos os pesos e compara o desenho das letras com o recorte. Mostra o ranking e grava uma folha lado a lado.
Também aceita arquivos .ttf/.otf no lugar do nome da família.
"""
import os, re, sys, json, subprocess, shutil, urllib.request
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

CACHE = os.path.expanduser("~/.boss-motion/fontes")
FF = shutil.which("ffmpeg") or os.path.expanduser("~/.cargo/bin/ffmpeg")


def recortar(video, seg, x, y, w, h, saida):
    tmp = saida + ".full.png"
    subprocess.run([FF, "-v", "error", "-y", "-ss", str(seg), "-i", video, "-frames:v", "1", tmp], check=True)
    im = cv2.imread(tmp); H, W = im.shape[:2]
    m = 0.15
    x0, y0 = int(max(0, (x - w * m) * W)), int(max(0, (y - h * m) * H)); x1, y1 = int(min(W, (x + w * (1 + m)) * W)), int(min(H, (y + h * (1 + m)) * H))
    cv2.imwrite(saida, im[y0:y1, x0:x1]); os.remove(tmp)
    print(saida, im[y0:y1, x0:x1].shape)


PESOS = {"thin": 100, "hairline": 100, "extralight": 200, "ultralight": 200, "light": 300, "regular": 400, "book": 400, "normal": 400,
         "medium": 500, "semibold": 600, "demibold": 600, "bold": 700, "extrabold": 800, "ultrabold": 800, "black": 900, "heavy": 900}


def _cache(pasta):
    """Um arquivo por peso (prefere .ttf quando há .ttf e .otf)."""
    por = {}
    for f in sorted(os.listdir(pasta)):
        m = re.match(r"(\d+)_.*\.(ttf|otf)$", f)
        if m and (int(m.group(1)) not in por or f.endswith(".ttf")): por[int(m.group(1))] = os.path.join(pasta, f)
    return sorted(por.items())


def _fontshare(familia, pasta):
    """Fontshare (Indian Type Foundry, licença ITF FFL: uso comercial livre). Baixa o zip e guarda os pesos estáticos."""
    import zipfile, io
    slug = re.sub(r"[^a-z0-9]+", "-", familia.lower()).strip("-")
    z = subprocess.run(["curl", "-s", "-f", "-L", "-A", "curl/8", f"https://api.fontshare.com/v2/fonts/download/{slug}"], capture_output=True).stdout
    if not z: return []
    out = []
    try:
        zf = zipfile.ZipFile(io.BytesIO(z))
    except zipfile.BadZipFile:
        return []
    for n in zf.namelist():
        base = os.path.basename(n)
        if not base.lower().endswith((".ttf", ".otf")) or "variable" in base.lower() or "italic" in base.lower(): continue
        estilo = re.sub(r"[^a-z]", "", base.rsplit("-", 1)[-1].rsplit(".", 1)[0].lower())
        peso = PESOS.get(estilo)
        if not peso: continue
        arq = os.path.join(pasta, f"{peso}_{slug}{os.path.splitext(base)[1].lower()}")
        if not os.path.exists(arq):
            open(arq, "wb").write(zf.read(n))
    return _cache(pasta)


def baixar(familia):
    """Baixa os pesos estáticos (100 a 900) de uma família do Google Fonts ou, se não achar lá, do Fontshare.
    "fontshare:Nome" vai direto ao Fontshare. Devolve [(peso, arquivo)]."""
    if os.path.isfile(familia): return [(0, familia)]
    so_fs = familia.lower().startswith("fontshare:")
    if so_fs: familia = familia.split(":", 1)[1].strip()
    pasta = os.path.join(CACHE, re.sub(r"\W+", "_", familia)); os.makedirs(pasta, exist_ok=True)
    feitos = _cache(pasta)
    if feitos: return feitos
    out = []
    if not so_fs:
        slug = re.sub(r"\W+", "", familia)
        for peso in range(100, 1000, 100):
            url = "https://fonts.googleapis.com/css2?family=" + familia.replace(" ", "+") + f":wght@{peso}"
            css = subprocess.run(["curl", "-s", "-f", "-A", "curl/8", url], capture_output=True, text=True).stdout
            if not css: continue
            m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
            if not m: continue
            arq = os.path.join(pasta, f"{peso}_{slug}.ttf")
            subprocess.run(["curl", "-s", "-f", "-o", arq, m.group(1)])
            if os.path.exists(arq) and os.path.getsize(arq) > 1000: out.append((peso, arq))
        if out: open(os.path.join(pasta, "origem.txt"), "w").write("google")
    if not out:
        out = _fontshare(familia, pasta)
        if out: open(os.path.join(pasta, "origem.txt"), "w").write("fontshare")
    if not out: print("não achei no Google Fonts nem no Fontshare:", familia)
    return out


def origem(familia):
    """De onde a família veio, com o link para baixar e a licença."""
    familia = familia.split(":", 1)[-1].strip() if familia.lower().startswith("fontshare:") else familia
    o = os.path.join(CACHE, re.sub(r"\W+", "_", familia), "origem.txt")
    fonte = open(o).read().strip() if os.path.exists(o) else "google"
    if fonte == "fontshare":
        slug = re.sub(r"[^a-z0-9]+", "-", familia.lower()).strip("-")
        return {"onde_baixar": f"https://www.fontshare.com/fonts/{slug}", "licenca": "Fontshare ITF Free Font License (uso comercial livre)"}
    return {"onde_baixar": "https://fonts.google.com/specimen/" + familia.replace(" ", "+"), "licenca": "Google Fonts (OFL ou Apache 2.0, uso livre)"}


def binarizar(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) if im.ndim == 3 else im
    _, b = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if (b > 0).mean() > 0.5: b = 255 - b                       # texto vira branco
    ys, xs = np.where(b > 0)
    if len(xs) == 0: return None
    return b[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def desenhar(arq, texto, altura):
    f = ImageFont.truetype(arq, altura)
    l, t, r, b = f.getbbox(texto)
    im = Image.new("L", (r - l + 20, b - t + 20), 0); ImageDraw.Draw(im).text((10 - l, 10 - t), texto, font=f, fill=255)
    return binarizar(np.array(im))


def nota(ref, cand):
    H = 120
    def norm(b): return cv2.resize(b, (max(1, int(b.shape[1] * H / b.shape[0])), H), interpolation=cv2.INTER_AREA)
    a, c = norm(ref), norm(cand)
    largura = c.shape[1] / a.shape[1]
    W = max(a.shape[1], c.shape[1])
    A = cv2.resize(a, (W, H)) > 127; C = cv2.resize(c, (W, H)) > 127
    iou = (A & C).sum() / max(1, (A | C).sum())
    tinta = abs(A.mean() - C.mean())
    return float(iou - 0.5 * abs(1 - largura) - tinta), float(iou), float(largura)


def comparar(recorte, texto, familias, saida):
    ref = binarizar(cv2.imread(recorte))
    res = []
    for fam in familias:
        for peso, arq in baixar(fam):
            try:
                c = desenhar(arq, texto, 160)
            except Exception:
                continue
            if c is None: continue
            n, iou, larg = nota(ref, c)
            res.append({"familia": fam, "peso": peso, "arquivo": arq, "nota": round(n, 3), "sobreposicao": round(iou, 3), "largura_rel": round(larg, 2), "_img": c})
    res.sort(key=lambda r: -r["nota"])
    tiles = []
    def t(img, rot):
        im = cv2.cvtColor(cv2.resize(img, (max(1, int(img.shape[1] * 80 / img.shape[0])), 80)), cv2.COLOR_GRAY2BGR)
        im = cv2.copyMakeBorder(im, 22, 6, 6, 6, cv2.BORDER_CONSTANT, value=(30, 30, 30))
        cv2.putText(im, rot, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1); return im
    tiles.append(t(ref, "REFERENCIA"))
    for r in res[:8]: tiles.append(t(r["_img"], f'{r["familia"]} {r["peso"]} nota {r["nota"]}'))
    W = max(x.shape[1] for x in tiles)
    cv2.imwrite(saida, np.vstack([cv2.copyMakeBorder(x, 0, 0, 0, W - x.shape[1], cv2.BORDER_CONSTANT, value=(30, 30, 30)) for x in tiles]))
    for r in res: r.pop("_img")
    # medidas que a substituta precisa bater: largura do texto por altura e quanto de tinta (peso visual)
    medidas = {"largura_por_altura": round(ref.shape[1] / ref.shape[0], 2), "tinta": round(float((ref > 127).mean()), 3)}
    json.dump({"texto": texto, "recorte": os.path.abspath(recorte), "medidas_referencia": medidas, "ranking": res[:20]},
              open(os.path.splitext(saida)[0] + ".json", "w"), ensure_ascii=False, indent=1)
    for r in res[:10]: print(json.dumps(r, ensure_ascii=False))
    print("folha:", saida, "| ranking:", os.path.splitext(saida)[0] + ".json")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == "recortar": recortar(a[1], float(a[2]), *map(float, a[3:7]), a[7])
    elif a[0] == "comparar":
        saida = "comparacao_fontes.jpg"
        if "--saida" in a: i = a.index("--saida"); saida = a[i + 1]; del a[i:i + 2]
        comparar(a[1], a[2], a[3:], saida)
    else: sys.exit(__doc__)
