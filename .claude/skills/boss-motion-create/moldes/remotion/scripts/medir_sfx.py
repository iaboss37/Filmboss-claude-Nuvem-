"""Mede o ataque de cada efeito de public/sfx e grava src/estilo/sfx.json (usado pelo <Efeito>).
Ataque = primeiro ponto em que o envelope (5 ms) chega a 50% do pico. Rode depois de copiar um efeito novo:
  python scripts/medir_sfx.py
"""
import json, os, subprocess
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O = os.path.join(RAIZ, 'public', 'sfx')
out = {}
for f in sorted(os.listdir(O)):
    if not f.endswith(('.wav', '.mp3')) or f.startswith('._'):
        continue
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(O, f), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
                         capture_output=True).stdout
    a = np.abs(np.frombuffer(raw, np.float32))
    if not len(a):
        print('sem áudio (pulado):', f)
        continue
    env = np.convolve(a, np.ones(240) / 240, mode='same')
    i = int(np.argmax(env >= 0.5 * env.max()))
    out[os.path.splitext(f)[0]] = dict(arquivo=f, duracao=round(len(a) / 48000, 3), ataque=round(i / 48000, 3),
                                       pico_db=round(float(20 * np.log10(a.max() + 1e-9)), 1))
with open(os.path.join(RAIZ, 'src', 'estilo', 'sfx.json'), 'w') as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)
print('ok', len(out), 'efeitos')
