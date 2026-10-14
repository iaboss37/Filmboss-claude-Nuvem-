"""Análise do Afinador Boss: afinação da voz quadro a quadro, notas cantadas,
e no instrumental o tom de referência (A=440 ou não), batidas, acordes e escala."""
import numpy as np
import librosa
from scipy.ndimage import median_filter, convolve1d

QUADRO = 0.01  # 10 ms por quadro de afinação da voz

NOMES = ['dó', 'dó#', 'ré', 'ré#', 'mi', 'fá', 'fá#', 'sol', 'sol#', 'lá', 'lá#', 'si']
NOMES_TOM = ['dó', 'ré bemol', 'ré', 'mi bemol', 'mi', 'fá', 'fá sustenido', 'sol', 'lá bemol', 'lá', 'si bemol', 'si']
CIFRA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

ESCALAS = {
    'maior': [0, 2, 4, 5, 7, 9, 11],
    'menor': [0, 2, 3, 5, 7, 8, 10],
    'menor harmônica': [0, 2, 3, 5, 7, 8, 11],
    'menor melódica': [0, 2, 3, 5, 7, 9, 11],
    'dórica': [0, 2, 3, 5, 7, 9, 10],
    'mixolídia': [0, 2, 4, 5, 7, 9, 10],
    'lídia': [0, 2, 4, 6, 7, 9, 11],
    'frígia': [0, 1, 3, 5, 7, 8, 10],
    'pentatônica maior': [0, 2, 4, 7, 9],
    'pentatônica menor': [0, 3, 5, 7, 10],
    'blues': [0, 3, 5, 6, 7, 10],
}

# acordes: nome do tipo, intervalos, peso extra (acorde de 4 notas só ganha se a nota estiver lá)
ACORDES = [
    ('', [0, 4, 7], 0.0),
    ('m', [0, 3, 7], 0.0),
    ('7', [0, 4, 7, 10], 0.03),
    ('m7', [0, 3, 7, 10], 0.03),
    ('7M', [0, 4, 7, 11], 0.03),
    ('sus4', [0, 5, 7], 0.07),
    ('sus2', [0, 2, 7], 0.07),
    ('°', [0, 3, 6], 0.07),
]


def nome_nota(midi):
    m = int(round(midi))
    return f"{NOMES[m % 12]}{m // 12 - 1}"


# ---------------------------------------------------------------- voz

def medir_afinacao(y, sr, aparelho=None):
    """Afinação da voz em notas MIDI (float) a cada 10 ms; NaN onde não tem voz."""
    import torch
    import torchcrepe
    y16 = librosa.resample(y, orig_sr=sr, target_sr=16000)
    if aparelho is None:
        aparelho = 'mps' if torch.backends.mps.is_available() else 'cpu'
    audio = torch.tensor(y16, dtype=torch.float32)[None]
    f0, per = torchcrepe.predict(audio, 16000, hop_length=160, fmin=60, fmax=1100,
                                 model='full', return_periodicity=True,
                                 batch_size=512, device=aparelho)
    per = torchcrepe.filter.median(per, 3)
    f0 = f0[0].cpu().numpy()
    per = per[0].cpu().numpy()
    rms = librosa.feature.rms(y=y16, frame_length=1024, hop_length=160)[0]
    n = min(len(f0), len(rms))
    f0, per, rms = f0[:n], per[:n], rms[:n]
    db = 20 * np.log10(rms + 1e-9)
    com_voz = (per > 0.45) & (db > np.percentile(db, 99) - 42)
    midi = 69 + 12 * np.log2(np.maximum(f0, 1.0) / 440.0)
    midi[~com_voz] = np.nan
    return _tapar_buracos(midi, 3)


def _tapar_buracos(midi, maximo):
    """Liga trechos de voz separados por buracos de até `maximo` quadros."""
    m = midi.copy()
    tem = ~np.isnan(m)
    i, n = 0, len(m)
    while i < n:
        if tem[i]:
            i += 1
            continue
        j = i
        while j < n and not tem[j]:
            j += 1
        if 0 < i and j < n and (j - i) <= maximo:
            m[i:j] = np.linspace(m[i - 1], m[j], j - i + 2)[1:-1]
        i = j
    return m


def segmentar_notas(midi, dur_min=0.06):
    """Divide a afinação em notas. Usa a curva suavizada (ignora vibrato) e só
    abre nota nova quando a voz sai mais de 0,75 semitom da nota atual."""
    notas = []
    tem = ~np.isnan(midi)
    i, n = 0, len(midi)
    while i < n:
        if not tem[i]:
            i += 1
            continue
        j = i
        while j < n and tem[j]:
            j += 1
        if (j - i) * QUADRO >= dur_min:
            notas += _dividir_regiao(midi, i, j, dur_min)
        i = j
    for k, nt in enumerate(notas):
        nt['id'] = k
    return notas


def _dividir_regiao(midi, a, b, dur_min):
    p = midi[a:b]
    suave = median_filter(p, size=min(15, len(p) | 1), mode='nearest')
    pedacos = []
    ini = 0
    atual = round(suave[0])
    for t in range(1, len(p)):
        if abs(suave[t] - atual) > 0.75:
            pedacos.append([ini, t])
            ini = t
            atual = round(suave[t])
    pedacos.append([ini, len(p)])
    # junta pedaço curto (deslize, ataque) com o vizinho de afinação mais parecida
    minimo = int(round(dur_min / QUADRO))
    mudou = True
    while mudou and len(pedacos) > 1:
        mudou = False
        for k, (x, y) in enumerate(pedacos):
            if y - x >= minimo:
                continue
            med = np.median(p[x:y])
            viz = []
            if k > 0:
                viz.append((abs(np.median(p[pedacos[k - 1][0]:pedacos[k - 1][1]]) - med), k - 1))
            if k < len(pedacos) - 1:
                viz.append((abs(np.median(p[pedacos[k + 1][0]:pedacos[k + 1][1]]) - med), k + 1))
            _, alvo = min(viz)
            lo, hi = min(k, alvo), max(k, alvo)
            pedacos[lo:hi + 1] = [[pedacos[lo][0], pedacos[hi][1]]]
            mudou = True
            break
    return [nova_nota(midi, a + x, a + y) for x, y in pedacos if (y - x) >= minimo]


def nova_nota(midi, ini, fim):
    """Nota cantada entre os quadros ini e fim: centro (miolo, sem ataque e
    soltura) e tremor (o quanto oscila fora do vibrato lento)."""
    seg = midi[ini:fim]
    seg = seg[~np.isnan(seg)] if np.isnan(seg).any() else seg
    corte = int(len(seg) * 0.2) if len(seg) * QUADRO > 0.15 else 0
    meio = seg[corte:len(seg) - corte] if corte else seg
    lento = median_filter(seg, size=min(13, len(seg) | 1), mode='nearest')
    return {
        'ini': ini, 'fim': fim,
        't0': ini * QUADRO, 't1': fim * QUADRO,
        'dur': (fim - ini) * QUADRO,
        'centro': float(np.median(meio)),
        'tremor': float(np.std(seg - lento)),
    }


def frases(notas, pausa=0.35):
    """Agrupa as notas em frases (pausa maior que `pausa` segundos separa)."""
    grupos, atual = [], []
    for nt in notas:
        if atual and nt['t0'] - atual[-1]['t1'] > pausa:
            grupos.append(atual)
            atual = []
        atual.append(nt)
    if atual:
        grupos.append(atual)
    return grupos


# ---------------------------------------------------------------- instrumental

def analisar_instrumental(y, sr, notas_voz=None):
    """Tom de referência, batidas, acordes por batida e escala por trecho."""
    if sr != 22050:
        y = librosa.resample(y, orig_sr=sr, target_sr=22050)
        sr = 22050
    hop = 512
    afinacao = float(librosa.estimate_tuning(y=y, sr=sr))  # fração de semitom
    yh = librosa.effects.harmonic(y, margin=3)
    croma = librosa.feature.chroma_cqt(y=yh, sr=sr, hop_length=hop, tuning=afinacao)
    energia = librosa.feature.rms(y=yh, hop_length=hop)[0]
    n = min(croma.shape[1], len(energia))
    croma, energia = croma[:, :n], energia[:n]

    _, batidas = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units='frames')
    batidas = np.asarray(batidas, dtype=int)
    batidas = batidas[batidas < n]
    if len(batidas) < 4:  # sem pulso claro: grade de meio segundo
        batidas = np.arange(0, n, int(0.5 * sr / hop))
    tempos = librosa.frames_to_time(batidas, sr=sr, hop_length=hop)
    bpm = float(60.0 / np.median(np.diff(tempos))) if len(tempos) > 1 else 0.0
    limites = np.concatenate([[0], batidas, [n]])
    limites = np.unique(limites)
    croma_b = np.stack([np.median(croma[:, a:b], axis=1) if b > a else np.zeros(12)
                        for a, b in zip(limites[:-1], limites[1:])], axis=1)
    energia_b = np.array([energia[a:b].mean() if b > a else 0.0
                          for a, b in zip(limites[:-1], limites[1:])])
    t_ini = librosa.frames_to_time(limites[:-1], sr=sr, hop_length=hop)
    t_fim = librosa.frames_to_time(limites[1:], sr=sr, hop_length=hop)

    acordes = _acordes(croma_b, energia_b)

    # perfil de notas por batida: instrumental + notas cantadas
    perfil_b = croma_b / (croma_b.sum(axis=0, keepdims=True) + 1e-9)
    perfil_b *= (energia_b > 0.05 * energia_b.max())[None]
    if notas_voz:
        voz_b = np.zeros_like(perfil_b)
        for nt in notas_voz:
            pc = int(round(nt['centro'] - afinacao)) % 12
            k = np.searchsorted(t_ini, nt['t0'], side='right') - 1
            k2 = np.searchsorted(t_ini, nt['t1'], side='right') - 1
            for kk in range(max(k, 0), max(k2, 0) + 1):
                voz_b[pc, kk] += 1.0
        voz_b /= (voz_b.sum(axis=0, keepdims=True) + 1e-9)
        perfil_b = perfil_b + 0.5 * voz_b
    raizes_b = np.zeros_like(perfil_b)
    for k, ac in enumerate(acordes):
        if ac:
            raizes_b[ac['raiz'], k] += 1.0
            if 4 in [(x - ac['raiz']) % 12 for x in ac['notas']]:
                raizes_b[(ac['raiz'] + 5) % 12, k] += 0.7  # acorde maior aponta a tônica uma quinta abaixo
    escalas = _escalas(perfil_b, raizes_b)

    return {
        'afinacao': afinacao,
        'bpm': bpm,
        'batidas': [float(t) for t in tempos],
        'blocos': [{'t0': float(a), 't1': float(b), 'acorde': ac, 'escala': es}
                   for a, b, ac, es in zip(t_ini, t_fim, acordes, escalas)],
    }


def _acordes(croma_b, energia_b, troca=0.12):
    """Acorde de cada batida: modelo por gabarito + caminho mais provável
    (trocar de acorde custa um pouco, então ele não fica pulando)."""
    estados = [None]  # sem acorde
    gabaritos = [np.zeros(12)]
    extras = [0.0]
    for raiz in range(12):
        for tipo, iv, extra in ACORDES:
            g = np.zeros(12)
            for k in iv:
                g[(raiz + k) % 12] = 1.0
            g[raiz] += 0.3
            estados.append((raiz, tipo, [(raiz + k) % 12 for k in iv]))
            gabaritos.append(g / np.linalg.norm(g))
            extras.append(extra)
    G = np.stack(gabaritos)
    C = croma_b / (np.linalg.norm(croma_b, axis=0, keepdims=True) + 1e-9)
    nota = G @ C - np.array(extras)[:, None]
    silencio = energia_b < 0.04 * (energia_b.max() + 1e-9)
    nota[0] = np.where(silencio, 1.0, 0.35)
    S, T = nota.shape
    acum = nota[:, 0].copy()
    volta = np.zeros((S, T), dtype=int)
    for t in range(1, T):
        melhor = acum.argmax()
        ficar = acum
        mudar = acum[melhor] - troca
        escolha = np.where(ficar >= mudar, np.arange(S), melhor)
        acum = np.maximum(ficar, mudar) + nota[:, t]
        volta[:, t] = escolha
    caminho = [int(acum.argmax())]
    for t in range(T - 1, 0, -1):
        caminho.append(volta[caminho[-1], t])
    caminho.reverse()
    saida = []
    for s in caminho:
        e = estados[s]
        if e is None:
            saida.append(None)
        else:
            raiz, tipo, notas = e
            saida.append({'nome': CIFRA[raiz] + tipo, 'raiz': raiz, 'notas': notas})
    return saida


def _escalas(perfil_b, raizes_b, raio=12, troca=1.0):
    """Escala de cada batida: soma das notas dentro da escala, menos um custo
    por nota que a escala tem (pentatônica só ganha se as outras duas faltarem),
    com troca cara para só mudar de escala quando o trecho todo pede."""
    T = perfil_b.shape[1]
    k = np.ones(2 * raio + 1)
    suave = convolve1d(perfil_b, k, axis=1, mode='constant')  # mesmo tamanho, até em trecho curto
    suave /= (suave.sum(axis=0, keepdims=True) + 1e-9)
    raiz_suave = convolve1d(raizes_b, np.ones(8 * raio + 1), axis=1, mode='constant')
    raiz_suave /= (raiz_suave.sum(axis=0, keepdims=True) + 1e-9)
    estados, notas = [], []
    for raiz in range(12):
        for nome, iv in ESCALAS.items():
            m = np.zeros(12)
            for x in iv:
                m[(raiz + x) % 12] = 1
            estados.append((raiz, nome, sorted((raiz + x) % 12 for x in iv)))
            notas.append(m)
    M = np.stack(notas)
    tamanho = M.sum(axis=1)
    # tônica: mesma coleção de notas, ganha a raiz do acorde que mais aparece no trecho
    raizes = np.array([e[0] for e in estados])
    tonica = 0.06 * raiz_suave[raizes]
    # preferência leve pelas escalas mais comuns no nome
    comum = np.array([0.03 if e[1] in ('maior', 'menor') else 0.015 if e[1] == 'menor harmônica' else 0.0
                      for e in estados])
    nota = M @ suave - 0.33 * (tamanho / 12)[:, None] + tonica + comum[:, None]
    S = len(estados)
    acum = nota[:, 0].copy()
    volta = np.zeros((S, T), dtype=int)
    for t in range(1, T):
        melhor = acum.argmax()
        mudar = acum[melhor] - troca
        volta[:, t] = np.where(acum >= mudar, np.arange(S), melhor)
        acum = np.maximum(acum, mudar) + nota[:, t]
    caminho = [int(acum.argmax())]
    for t in range(T - 1, 0, -1):
        caminho.append(volta[caminho[-1], t])
    caminho.reverse()
    return [{'nome': f"{NOMES_TOM[estados[s][0]]} {estados[s][1]}", 'raiz': estados[s][0],
             'tipo': estados[s][1], 'notas': estados[s][2]} for s in caminho]


def bloco_no_tempo(inst, t):
    """Índice do bloco (batida) que contém o tempo t."""
    blocos = inst['blocos']
    lo, hi = 0, len(blocos) - 1
    while lo < hi:
        meio = (lo + hi + 1) // 2
        if blocos[meio]['t0'] <= t:
            lo = meio
        else:
            hi = meio - 1
    return lo


def resumo_escalas(inst):
    """Trechos contínuos com a mesma escala, para o relatório."""
    trechos = []
    for b in inst['blocos']:
        nome = b['escala']['nome']
        if trechos and trechos[-1]['escala'] == nome:
            trechos[-1]['t1'] = b['t1']
        else:
            trechos.append({'escala': nome, 't0': b['t0'], 't1': b['t1']})
    return trechos
