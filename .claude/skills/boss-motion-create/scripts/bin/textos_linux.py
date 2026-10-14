#!/usr/bin/env python3
"""OCR com caixa no Linux (Tesseract), no lugar do textos do Mac (Vision). Uso: textos_linux.py <imagem1> [imagem2 ...]
Saída igual à do textos: uma linha JSON por imagem {"img":..., "w":..., "h":..., "textos":[{"t":texto,"c":confiança,"x":..,"y":..,"w":..,"h":..}]}
x, y, w, h normalizados de 0 a 1 com origem no canto de CIMA à esquerda; uma entrada por linha de texto; confiança de 0 a 1.
Lê cada imagem como está e invertida (texto claro em fundo escuro, comum em motion) e fica com a leitura de mais confiança.
Só usa a biblioteca padrão do python e o programa tesseract (apt install tesseract-ocr tesseract-ocr-por).
"""
import json, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

AMBIENTE = {**os.environ, "OMP_THREAD_LIMIT": "1"}   # um núcleo por imagem; as imagens rodam em paralelo


def idiomas():
    r = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, env=AMBIENTE)
    tem = set(r.stdout.split())
    return "+".join(l for l in ("por", "eng") if l in tem) or "eng"


def tsv(img, lang):
    r = subprocess.run(["tesseract", img, "stdout", "-l", lang, "--psm", "11", "tsv"], capture_output=True, text=True, env=AMBIENTE)
    W = H = 0
    linhas = {}
    for ln in r.stdout.splitlines()[1:]:
        c = ln.split("\t")
        if len(c) < 12: continue
        nivel, bloco, par, linha = int(c[0]), c[2], c[3], c[4]
        x, y, w, h, conf, txt = int(c[6]), int(c[7]), int(c[8]), int(c[9]), float(c[10]), c[11].strip()
        if nivel == 1: W, H = w, h
        if nivel != 5 or not txt or conf < 0: continue
        linhas.setdefault((bloco, par, linha), []).append((x, y, w, h, conf, txt))
    return W, H, linhas


def ler(img, lang, inverter):
    if not inverter: return tsv(img, lang)
    with tempfile.TemporaryDirectory(prefix="ocr_") as tmp:
        inv = os.path.join(tmp, "inv.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", img, "-vf", "negate,format=gray", inv])
        return tsv(inv, lang) if os.path.exists(inv) else (0, 0, {})


def textos(W, H, linhas):
    out = []
    for ps in linhas.values():
        x0 = min(p[0] for p in ps); y0 = min(p[1] for p in ps)
        x1 = max(p[0] + p[2] for p in ps); y1 = max(p[1] + p[3] for p in ps)
        conf = sum(p[4] for p in ps) / len(ps) / 100
        out.append({"t": " ".join(p[5] for p in ps), "c": round(conf, 2),
                    "x": x0 / W, "y": y0 / H, "w": (x1 - x0) / W, "h": (y1 - y0) / H})
    return out


def uma(img, lang):
    melhor = None
    for inverter in (False, True):
        W, H, linhas = ler(img, lang, inverter)
        if not W: continue
        ts = textos(W, H, linhas)
        nota = sum(t["c"] * len(t["t"]) for t in ts if t["c"] >= 0.5)
        if melhor is None or nota > melhor[0]: melhor = (nota, W, H, ts)
    _, W, H, ts = melhor or (0, 0, 0, [])
    return {"img": img, "w": W, "h": H, "textos": ts}


def main():
    imgs = sys.argv[1:]
    if not imgs: sys.exit(__doc__)
    try:
        lang = idiomas()
    except FileNotFoundError:
        sys.exit("falta o tesseract (apt install tesseract-ocr tesseract-ocr-por)")
    with ThreadPoolExecutor(os.cpu_count() or 4) as pool:
        for d in pool.map(lambda i: uma(i, lang), imgs):
            print(json.dumps(d, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
