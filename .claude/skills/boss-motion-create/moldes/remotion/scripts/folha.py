"""Folha de storyboard: os quadros em grade, com o número do quadro e o tempo embaixo de cada um.

Uso: folha.py <saida.png> <Id> <q>=<arquivo.png> [<q>=<arquivo.png> ...]   (chamado por quadros.mjs --folha)
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = os.path.join(os.path.dirname(AQUI), 'public', 'fonts')
TANKER = None  # rótulo com a fonte padrão do OpenCV
try:
    FPS = json.load(open(os.path.join(os.path.dirname(AQUI), 'src', 'estilo', 'estilo.json')))['fps']
except Exception:
    FPS = 24
BREU, ALVA, AMARELO, CINZA = (14, 13, 18), (247, 240, 227), (255, 209, 46), (150, 146, 140)


def fonte(caminho, tam, peso=None):
    try:
        f = ImageFont.truetype(caminho, tam)
        if peso:
            try:
                f.set_variation_by_axes([peso])
            except Exception:
                pass
        return f
    except Exception:
        try:
            return ImageFont.load_default(size=tam)
        except TypeError:
            return ImageFont.load_default()


def main():
    saida, nome = sys.argv[1], sys.argv[2]
    itens = []
    for a in sys.argv[3:]:
        q, arq = a.split('=', 1)
        itens.append((int(q), arq))
    cols = 4 if len(itens) > 6 else 3 if len(itens) > 2 else len(itens)
    tw, th = 640, 360
    gx, gy, m, topo, rot = 28, 28, 64, 170, 64
    linhas = (len(itens) + cols - 1) // cols
    W = m * 2 + cols * tw + (cols - 1) * gx
    H = topo + linhas * (th + rot) + (linhas - 1) * gy + m
    folha = Image.new('RGB', (W, H), BREU)
    d = ImageDraw.Draw(folha)
    d.text((m, 50), nome.upper(), font=fonte(TANKER, 84), fill=ALVA)
    dur = max(q for q, _ in itens) if itens else 0
    d.text((m + d.textlength(nome.upper(), font=fonte(TANKER, 84)) + 28, 84),
           f'{len(itens)} quadros a {FPS} qps', font=fonte(os.path.join(FONTES, 'GeistMono-VF.ttf'), 26), fill=CINZA)
    fm = fonte(os.path.join(FONTES, 'GeistMono-VF.ttf'), 28)
    for i, (q, arq) in enumerate(itens):
        c, l = i % cols, i // cols
        x = m + c * (tw + gx)
        y = topo + l * (th + rot + gy)
        im = Image.open(arq).convert('RGBA')
        fundo = Image.new('RGBA', im.size, (122, 122, 122, 255))
        fundo.alpha_composite(im)
        folha.paste(fundo.convert('RGB').resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x, y + th + 14), f'q{q:02d}', font=fm, fill=AMARELO)
        d.text((x + 90, y + th + 14), f'{q / FPS:.2f} s'.replace('.', ','), font=fm, fill=CINZA)
    folha.save(saida)


if __name__ == '__main__':
    main()
