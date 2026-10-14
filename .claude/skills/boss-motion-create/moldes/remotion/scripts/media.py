"""Média das amostras do motion blur em ponto flutuante, fora do navegador (sem os degraus de cor do 8 bits).

O Chrome renderiza cada subquadro como PNG; aqui a média sai em float32 com alfa pré-multiplicado, e a conversão
para vídeo (BT.709, faixa limitada, com pontilhado de 1 nível) é feita em numpy:
  MP4   H.264 4:2:0 8 bits (alta qualidade), sobre a cor de fundo quando a peça é transparente
  MOV   ProRes 4444 com alfa (yuva444p10), alfa direto (Straight no Resolve)

Modos:
  media.py png <saida.png> [--transparente] <amostra1.png> <amostra2.png> ...     um quadro só (quadros.mjs --mb)
  media.py servidor                                                                 usado pelo final.mjs (JSON por linha)
"""
import json, multiprocessing, os, shutil, subprocess, sys
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np


def ler(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise RuntimeError(f'amostra ilegível: {p}')
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR)
    escala = 65535.0 if im.dtype == np.uint16 else 255.0
    bgr = im[..., :3].astype(np.float32) / escala
    a = im[..., 3].astype(np.float32) / escala if im.shape[2] == 4 else np.ones(im.shape[:2], np.float32)
    return bgr, a


def media(caminhos):
    """Média com alfa pré-multiplicado. Devolve (rgb pré-multiplicado, alfa), float32 de 0 a 1."""
    soma_c = None
    soma_a = None
    for p in caminhos:
        bgr, a = ler(p)
        if soma_c is None:
            soma_c = np.zeros(bgr.shape, np.float32)
            soma_a = np.zeros(a.shape, np.float32)
        soma_c += bgr * a[..., None]
        soma_a += a
    n = float(len(caminhos))
    rgb = (soma_c / n)[..., ::-1]
    return np.ascontiguousarray(rgb), soma_a / n


def _ruido(rng, forma):
    return rng.random(forma, np.float32) - rng.random(forma, np.float32)   # triangular, 1 nível


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def para_mp4(rgb_pm, A, fundo):
    """H.264: yuv420p 8 bits, BT.709 faixa limitada, composto sobre 'fundo'."""
    rgb = rgb_pm + fundo[None, None, :] * (1.0 - A)[..., None]
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    Cb = (B - Y) / 1.8556
    Cr = (R - Y) / 1.5748
    h, w = Y.shape
    Cb2 = Cb.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
    Cr2 = Cr.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
    rng = np.random.default_rng()
    q = lambda x, d, e: np.clip(np.rint(d + e * x + 0.5 * _ruido(rng, x.shape)), 0, 255).astype(np.uint8)
    return q(Y, 16, 219).tobytes() + q(Cb2, 128, 224).tobytes() + q(Cr2, 128, 224).tobytes()


def para_mov(rgb_pm, A):
    """ProRes 4444: yuva444p10 planar, cor direta (não pré-multiplicada), BT.709 faixa limitada."""
    rgb = rgb_pm / np.maximum(A, 1e-6)[..., None]
    rgb[A < 1e-6] = 0
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    rng = np.random.default_rng()
    q = lambda x, d, e: np.clip(np.rint(d + e * x + 0.5 * _ruido(rng, x.shape)), 0, 1023).astype(np.uint16)
    planos = [q(Y, 64, 876), q((B - Y) / 1.8556, 512, 896), q((R - Y) / 1.5748, 512, 896),
              np.clip(np.rint(A * 1023), 0, 1023).astype(np.uint16)]
    return b''.join(p.tobytes() for p in planos)


def trabalho(caminhos, quer_mp4, quer_mov, fundo):
    rgb, A = media(caminhos)
    return (para_mp4(rgb, A, fundo) if quer_mp4 else None), (para_mov(rgb, A) if quer_mov else None)


TAGS = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']


def codificador_mp4(saida, w, h, fps):
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{w}x{h}', '-r', str(fps), *TAGS,
                             '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-tune', 'animation', '-profile:v', 'high',
                             '-pix_fmt', 'yuv420p', *TAGS, '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
                             '-movflags', '+faststart', saida], stdin=subprocess.PIPE)


def codificador_mov(saida, w, h, fps):
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuva444p10le', '-s', f'{w}x{h}', '-r', str(fps), *TAGS,
                             '-i', '-', '-vf', 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
                             '-c:v', 'prores_ks', '-profile:v', '4444', '-alpha_bits', '16', '-vendor', 'apl0', *TAGS, saida],
                            stdin=subprocess.PIPE)


def servidor():
    """Protocolo (uma linha JSON por mensagem, na ordem):
       {"inicio": {"w", "h", "fps", "mp4": caminho|null, "mov": caminho|null, "fundo": "#RRGGBB"}}
       {"bloco": k, "quadros": [[q, [png, ...]], ...], "apagar": [pasta, ...]}   -> responde {"ok": k}
       {"fim": true}                                                              -> responde {"fim": true}"""
    enc_mp4 = enc_mov = None
    fundo = np.zeros(3, np.float32)
    quer_mp4 = quer_mov = False
    # spawn (o padrão do Mac): no Linux o fork copiaria a entrada do ffmpeg para os ajudantes e ele nunca veria o fim
    with ProcessPoolExecutor(4, mp_context=multiprocessing.get_context('spawn')) as pool:
        for linha in sys.stdin:
            if not linha.strip():
                continue
            m = json.loads(linha)
            if 'inicio' in m:
                c = m['inicio']
                quer_mp4, quer_mov = bool(c.get('mp4')), bool(c.get('mov'))
                fundo = hex_rgb(c.get('fundo') or '#7A7A7A')
                if quer_mp4:
                    enc_mp4 = codificador_mp4(c['mp4'], c['w'], c['h'], c['fps'])
                if quer_mov:
                    enc_mov = codificador_mov(c['mov'], c['w'], c['h'], c['fps'])
            elif 'bloco' in m:
                lista = m['quadros']
                for i in range(0, len(lista), 12):     # de 12 em 12 para não segurar o bloco inteiro na memória
                    tarefas = [pool.submit(trabalho, arqs, quer_mp4, quer_mov, fundo) for _, arqs in lista[i:i + 12]]
                    for t in tarefas:
                        a, b = t.result()
                        if enc_mp4:
                            enc_mp4.stdin.write(a)
                        if enc_mov:
                            enc_mov.stdin.write(b)
                for p in m.get('apagar', []):
                    shutil.rmtree(p, ignore_errors=True)
                print(json.dumps({'ok': m['bloco']}), flush=True)
            elif 'fim' in m:
                for e in (enc_mp4, enc_mov):
                    if e:
                        e.stdin.close()
                        e.wait()
                print(json.dumps({'fim': True}), flush=True)
                return


def um_png(saida, caminhos, transparente):
    rgb, A = media(caminhos)
    rng = np.random.default_rng()
    if transparente:
        cor = rgb / np.maximum(A, 1e-6)[..., None]
        cor[A < 1e-6] = 0
        img = np.dstack([cor, A])
        img = np.clip(np.rint(img * 255 + 0.5 * _ruido(rng, img.shape)), 0, 255).astype(np.uint8)
        cv2.imwrite(saida, cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA))
    else:
        img = np.clip(np.rint(rgb * 255 + 0.5 * _ruido(rng, rgb.shape)), 0, 255).astype(np.uint8)
        cv2.imwrite(saida, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))


if __name__ == '__main__':
    if sys.argv[1] == 'servidor':
        servidor()
    elif sys.argv[1] == 'png':
        resto = sys.argv[3:]
        transp = '--transparente' in resto
        um_png(sys.argv[2], [r for r in resto if r != '--transparente'], transp)
    else:
        sys.exit(__doc__)
