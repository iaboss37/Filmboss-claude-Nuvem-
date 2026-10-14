"""Afinador Boss: afina a voz de quem canta em cima do instrumental.

Uso:
  venv/bin/python afinador.py --instrumental inst.wav --voz voz.wav --saida pasta
      [--guia musica_original.mp3]   melodia de referência (a música original inteira ou só a voz)
      [--guia-so-voz]                a guia já é só a voz (não precisa separar)
      [--modo equilibrado|fiel|so-afinar]
      [--forca 1.0] [--deriva 0.3] [--robo] [--sem-repeticoes]

Saída na pasta: voz afinada, mixagem de teste antes e depois, relatorio.json e notas.txt.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import librosa
import soundfile as sf

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import analise as A  # noqa: E402
import correcao as C  # noqa: E402


def separar(musica, pasta):
    """Separa voz e instrumental com o Demucs. Devolve (voz, instrumental)."""
    os.makedirs(pasta, exist_ok=True)
    nome = os.path.splitext(os.path.basename(musica))[0]
    voz = os.path.join(pasta, 'htdemucs', nome, 'vocals.wav')
    inst = os.path.join(pasta, 'htdemucs', nome, 'no_vocals.wav')
    if not os.path.exists(voz):
        import torch
        aparelho = 'mps' if torch.backends.mps.is_available() else 'cpu'
        subprocess.run([sys.executable, '-m', 'demucs', '--two-stems', 'vocals', '-n', 'htdemucs',
                        '-d', aparelho, '-o', pasta, musica], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return voz, inst


def afinacao_com_cache(caminho, y, sr, pasta):
    cache = os.path.join(pasta, '_cache_' + os.path.basename(caminho) + '.npy')
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(caminho):
        return np.load(cache)
    midi = A.medir_afinacao(y, sr)
    np.save(cache, midi)
    return midi


def alinhar_guia(inst_y, guia_inst_y, sr=22050):
    """Atraso (s) e transposição (semitons) da música guia em relação ao instrumental."""
    hop = 512
    a = librosa.onset.onset_strength(y=inst_y, sr=sr, hop_length=hop)
    b = librosa.onset.onset_strength(y=guia_inst_y, sr=sr, hop_length=hop)
    a = (a - a.mean()) / (a.std() + 1e-9)
    b = (b - b.mean()) / (b.std() + 1e-9)
    corr = np.correlate(np.pad(a, len(b)), b, mode='valid')
    atraso = (int(np.argmax(corr)) - len(b)) * hop / sr
    ca = librosa.feature.chroma_cqt(y=inst_y, sr=sr).mean(axis=1)
    cb = librosa.feature.chroma_cqt(y=guia_inst_y, sr=sr).mean(axis=1)
    melhores = [(float(np.dot(ca, np.roll(cb, s))), s) for s in range(-6, 6)]
    transp = max(melhores)[1]
    return atraso, transp


def afinar(instrumental, voz, saida, guia=None, guia_so_voz=False, modo='equilibrado',
           forca=1.0, deriva=0.3, robo=False, repeticoes=True, log=lambda m: print(m, flush=True)):
    os.makedirs(saida, exist_ok=True)
    yv, srv = librosa.load(voz, sr=None, mono=True)
    yi, _ = librosa.load(instrumental, sr=22050, mono=True)

    log('Medindo a afinação da voz')
    midi = afinacao_com_cache(voz, yv, srv, saida)
    notas = A.segmentar_notas(midi)

    log('Lendo tom, acordes e escala do instrumental')
    inst = A.analisar_instrumental(yi, 22050, notas)
    ref = inst['afinacao']

    guia_notas, info_guia = None, None
    if guia:
        log('Preparando a melodia guia')
        if guia_so_voz:
            g_voz, g_inst = guia, None
        else:
            g_voz, g_inst = separar(guia, os.path.join(saida, '_separacao'))
        gy, gsr = librosa.load(g_voz, sr=None, mono=True)
        atraso, transp = 0.0, 0
        if g_inst:
            giy, _ = librosa.load(g_inst, sr=22050, mono=True)
            atraso, transp = alinhar_guia(yi, giy)
        g_midi = afinacao_com_cache(g_voz, gy, gsr, saida)
        g_notas = A.segmentar_notas(g_midi)
        for g in g_notas:
            g['t0'] += atraso
            g['t1'] += atraso
        guia_notas = C.notas_da_guia(g_notas, ref, transp)
        info_guia = {'arquivo': guia, 'atraso_s': round(atraso, 3), 'transposicao': transp,
                     'notas': len(g_notas)}

    if guia_notas:
        notas = C.dividir_pela_guia(notas, guia_notas, midi)

    votos = {}
    if repeticoes:
        log('Procurando frases repetidas')
        votos = C.votos_repeticoes(midi, notas, ref)

    log('Escolhendo a nota certa de cada nota cantada')
    C.escolher_notas(notas, inst, votos=votos, guia=guia_notas, modo=modo)
    for nt in notas:  # ornamento muito curto: corrige pela metade
        nt['forca'] = forca if nt['dur'] >= 0.1 else forca * 0.5

    log('Refazendo a voz afinada')
    curva = C.curva_de_correcao(midi, notas, ref, forca=1.0, deriva=deriva, robo=robo)
    for nt in notas:
        if nt['forca'] != 1.0:
            curva[nt['ini']:nt['fim']] *= nt['forca']
    ys, sr_full = librosa.load(voz, sr=None, mono=True)
    afinada = C.refazer_voz(ys, sr_full, curva)

    base = os.path.splitext(os.path.basename(voz))[0]
    arq_voz = os.path.join(saida, f'{base} [afinada].wav')
    sf.write(arq_voz, afinada, sr_full, subtype='PCM_24')
    yi_full, _ = librosa.load(instrumental, sr=sr_full, mono=True)
    m = min(len(yi_full), len(afinada))
    for nome, v in (('depois', afinada), ('antes', ys)):
        mix = yi_full[:m] + v[:m]
        pico = np.max(np.abs(mix)) + 1e-9
        if pico > 0.98:
            mix = mix * 0.98 / pico
        sf.write(os.path.join(saida, f'Mix teste - {nome}.wav'), mix, sr_full, subtype='PCM_24')

    relatorio = montar_relatorio(notas, inst, info_guia, modo)
    with open(os.path.join(saida, 'relatorio.json'), 'w') as f:
        json.dump(relatorio, f, ensure_ascii=False, indent=1)
    with open(os.path.join(saida, 'notas.txt'), 'w') as f:
        f.write(texto_relatorio(relatorio))
    np.save(os.path.join(saida, '_curva.npy'), curva)
    import relatorio_html
    relatorio_html.gerar(saida, os.path.basename(arq_voz), midi, curva, embutir=True)
    return relatorio, notas, inst, midi


def montar_relatorio(notas, inst, info_guia, modo):
    ref = inst['afinacao']
    lista = []
    for nt in notas:
        lista.append({
            't0': round(nt['t0'], 2), 't1': round(nt['t1'], 2),
            'cantou': round(nt['centro'] - ref, 2), 'cantou_nome': A.nome_nota(nt['centro'] - ref),
            'alvo': nt['alvo'], 'alvo_nome': A.nome_nota(nt['alvo']),
            'mexeu': round(nt['correcao'], 2),
            'motivo': nt['motivo'], 'duvida': bool(nt['duvida']),
            'alternativa': nt['alternativa'], 'guia': nt['guia'],
        })
    return {
        'modo': modo,
        'afinacao_referencia_cents': round(ref * 100, 1),
        'bpm': round(inst['bpm'], 1),
        'escalas': [{'escala': e['escala'], 't0': round(e['t0'], 1), 't1': round(e['t1'], 1)}
                    for e in A.resumo_escalas(inst)],
        'acordes': _acordes_resumidos(inst),
        'escalas_notas': _escala_mais_comum(inst),
        'guia': info_guia,
        'notas': lista,
    }


def _escala_mais_comum(inst):
    conta = {}
    for b in inst['blocos']:
        k = tuple(b['escala']['notas'])
        conta[k] = conta.get(k, 0) + 1
    return list(max(conta, key=conta.get)) if conta else []


def _acordes_resumidos(inst):
    seq = []
    for b in inst['blocos']:
        nome = b['acorde']['nome'] if b['acorde'] else '-'
        if seq and seq[-1]['acorde'] == nome:
            seq[-1]['t1'] = round(b['t1'], 2)
        else:
            seq.append({'acorde': nome, 't0': round(b['t0'], 2), 't1': round(b['t1'], 2)})
    return seq


def _mmss(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def texto_relatorio(r):
    linhas = [f"Modo: {r['modo']}",
              f"Afinação de referência do instrumental: {r['afinacao_referencia_cents']:+} cents de A=440",
              f"Andamento: {r['bpm']} BPM"]
    for e in r['escalas']:
        linhas.append(f"Escala: {e['escala']} ({_mmss(e['t0'])} a {_mmss(e['t1'])})")
    if r['guia']:
        g = r['guia']
        linhas.append(f"Guia: {os.path.basename(g['arquivo'])}, atraso {g['atraso_s']} s, transposição {g['transposicao']}")
    n = r['notas']
    mexidas = [x for x in n if abs(x['mexeu']) >= 0.1]
    grandes = [x for x in n if abs(x['mexeu']) >= 0.75]
    linhas.append(f"\n{len(n)} notas cantadas, {len(mexidas)} corrigidas, {len(grandes)} com correção grande (3/4 de tom ou mais).")
    linhas.append("\nCorreções grandes, improvisos e dúvidas:")
    for x in n:
        if abs(x['mexeu']) >= 0.75 or x['motivo'] or x['duvida']:
            extra = []
            if x['motivo']:
                extra.append(x['motivo'])
            if x['duvida']:
                extra.append(f"DÚVIDA, outra opção: {A.nome_nota(x['alternativa'])}")
            fora = round((x['cantou'] - round(x['cantou'])) * 100)
            linhas.append(f"  {_mmss(x['t0'])}  cantou {x['cantou_nome']} ({fora:+d} cents)  →  {x['alvo_nome']}"
                          f"  ({x['mexeu']:+.2f} semitom)  {'; '.join(extra)}")
    return '\n'.join(linhas) + '\n'


def main():
    ap = argparse.ArgumentParser(description='Afinador Boss')
    ap.add_argument('--instrumental')
    ap.add_argument('--voz')
    ap.add_argument('--mixagem', help='voz e instrumental juntos num arquivo só: separa antes de afinar')
    ap.add_argument('--saida', required=True)
    ap.add_argument('--guia')
    ap.add_argument('--guia-so-voz', action='store_true')
    ap.add_argument('--modo', default='equilibrado', choices=list(C.MODOS))
    ap.add_argument('--forca', type=float, default=1.0)
    ap.add_argument('--deriva', type=float, default=0.3)
    ap.add_argument('--robo', action='store_true')
    ap.add_argument('--sem-repeticoes', action='store_true')
    a = ap.parse_args()
    if a.mixagem:
        print('Separando voz e instrumental da mixagem', flush=True)
        a.voz, a.instrumental = separar(a.mixagem, os.path.join(a.saida, '_separacao'))
    if not (a.voz and a.instrumental):
        ap.error('passe --voz e --instrumental, ou --mixagem')
    r, *_ = afinar(a.instrumental, a.voz, a.saida, guia=a.guia, guia_so_voz=a.guia_so_voz,
                   modo=a.modo, forca=a.forca, deriva=a.deriva, robo=a.robo,
                   repeticoes=not a.sem_repeticoes)
    print(texto_relatorio(r))


if __name__ == '__main__':
    main()
