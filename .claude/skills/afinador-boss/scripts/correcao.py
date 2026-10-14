"""Correção do Afinador Boss: escolhe a nota certa de cada nota cantada e refaz a voz.

A nota certa sai de um placar (quanto menor, melhor) que soma:
- distância até o que foi cantado (erro pequeno é comum, erro grande é raro mas acontece);
- nota fora da escala do trecho custa caro;
- nota do acorde daquele momento ganha bônus (mais em nota longa e na batida);
- melodia guia (a original), quando tem;
- o que o próprio cantor fez nas repetições da mesma frase;
- o desenho da melodia: se ele subiu, a nota certa fica acima da anterior.
Depois o caminho mais provável é escolhido frase a frase (Viterbi)."""
import math
import numpy as np
import librosa
from scipy.ndimage import median_filter, maximum_filter1d, minimum_filter1d

from analise import QUADRO, bloco_no_tempo, frases, nova_nota

MODOS = {
    # peso da guia por semitom de diferença, e se respeita improviso
    'so-afinar': {'guia': 0.0, 'improviso': True},
    'equilibrado': {'guia': 6.0, 'improviso': True},
    'fiel': {'guia': 12.0, 'improviso': False},
}


def custo_distancia(d, sigma=0.3, cauda=1.0, p_grande=0.1):
    """Quanto custa supor que o cantor errou `d` semitons: mistura de erro
    pequeno (comum) com erro grande (raro, cauda longa)."""
    def mistura(x):
        pequeno = (1 - p_grande) * math.exp(-x * x / (2 * sigma * sigma)) / (sigma * math.sqrt(2 * math.pi))
        grande = p_grande * 0.5 / cauda * math.exp(-abs(x) / cauda)
        return pequeno + grande
    return -math.log(mistura(d)) + math.log(mistura(0.0))


# ---------------------------------------------------------------- repetições

def votos_repeticoes(midi, notas, ref, janela=3.0, limite=0.45, distancia_min=1.5, folga=5):
    """Para cada nota, pega os 3 s de melodia em volta dela e procura no resto da
    música os pontos onde esse trecho se repete. A comparação aceita até 100 ms
    de diferença de tempo (cantor nunca canta igualzinho duas vezes). Em cada
    repetição, acerta o tempo fino pelas notas vizinhas e lê a nota que o cantor
    cantou no mesmo lugar. Retorna {id_da_nota: {nota_inteira: peso}}."""
    passo = 2  # compara a cada 20 ms
    p = midi[::passo]
    n = len(p)
    meia = int(janela / (QUADRO * passo) / 2)
    tem = ~np.isnan(p)
    cheio = np.where(tem, p, 0.0)
    larg = 2 * folga + 1
    teto = maximum_filter1d(np.where(tem, p, -1e9), larg)
    piso = minimum_filter1d(np.where(tem, p, 1e9), larg)
    tem_perto = maximum_filter1d(tem.astype(np.uint8), larg).astype(bool)
    votos = {}
    for nt in notas:
        if nt['dur'] < 0.1:
            continue
        centro = (nt['ini'] + nt['fim']) // 2 // passo
        a, b = centro - meia, centro + meia
        if a < 0 or b > n:
            continue
        w, wt = p[a:b], tem[a:b].copy()
        n0, n1 = nt['ini'] // passo - a, nt['fim'] // passo - a
        wt[n0:n1] = False  # a própria nota não entra: ela pode ser o erro
        if wt.sum() < 0.3 * (b - a):
            continue
        L = b - a
        v_teto = np.lib.stride_tricks.sliding_window_view(teto, L)
        v_piso = np.lib.stride_tricks.sliding_window_view(piso, L)
        v_tem = np.lib.stride_tricks.sliding_window_view(tem_perto, L)
        d = np.minimum(np.maximum(0.0, np.maximum(v_piso - np.nan_to_num(w)[None], np.nan_to_num(w)[None] - v_teto)), 3.0)
        custo = (np.where(v_tem & wt[None], d, 1.0) * wt[None]).sum(1) / wt.sum()
        idx = np.arange(len(custo))
        custo[np.abs(idx - a) < distancia_min / (QUADRO * passo)] = 99.0
        escolhidos = []
        for k in np.argsort(custo):
            if custo[k] > limite or len(escolhidos) >= 6:
                break
            if all(abs(k - e) > 1.0 / (QUADRO * passo) for e in escolhidos):
                escolhidos.append(k)
        if not escolhidos:
            continue
        corte = max(1, (n1 - n0) // 5)
        m0, m1 = n0 + corte, max(n1 - corte, n0 + corte + 1)
        viz = np.zeros(L, dtype=bool)
        viz[max(0, n0 - 30):n0] = True
        viz[n1:min(L, n1 + 30)] = True
        viz &= wt
        for k in escolhidos:
            # tempo fino: só pelas notas vizinhas (a própria nota pode estar errada)
            melhor_s, melhor_c = 0, None
            for s in range(-folga, folga + 1):
                lo, hi = k + s, k + s + L
                if lo < 0 or hi > n:
                    continue
                ambos = viz & tem[lo:hi]
                if ambos.sum() < 5:
                    continue
                c_s = np.mean(np.minimum(np.abs(cheio[lo:hi][ambos] - w[ambos]), 3.0))
                if melhor_c is None or c_s < melhor_c:
                    melhor_s, melhor_c = s, c_s
            lo = k + melhor_s
            trecho = p[max(0, lo + m0):max(0, lo + m1)]
            trecho = trecho[~np.isnan(trecho)]
            if len(trecho) < max(2, 0.5 * (m1 - m0)):
                continue
            cb = float(np.median(trecho)) - ref
            kk = int(round(cb))
            peso = math.exp(-((cb - kk) ** 2) / (2 * 0.3 ** 2)) * (1.0 - custo[k] / (limite * 1.5))
            votos.setdefault(nt['id'], {})
            votos[nt['id']][kk] = votos[nt['id']].get(kk, 0.0) + peso
    return votos


# ---------------------------------------------------------------- guia

def notas_da_guia(notas_guia, ref, transpor=0):
    """Lista (t0, t1, nota inteira) da melodia guia, já na grade do instrumental."""
    return [(g['t0'], g['t1'], int(round(g['centro'] - ref)) + transpor) for g in notas_guia]


def guia_para_nota(nt, guia, folga=0.03, curta=0.12):
    """Nota da guia que cobre pelo menos metade do miolo da nota cantada (ou None).
    Nota curta (passagem) só segue a guia se a guia cobrir 80% dela."""
    corte = nt['dur'] * 0.2
    a, b = nt['t0'] + corte - folga, nt['t1'] - corte + folga
    cobre = {}
    for g0, g1, k in guia:
        sob = min(b, g1) - max(a, g0)
        if sob > 0:
            cobre[k] = cobre.get(k, 0.0) + sob
    if not cobre:
        return None
    k = max(cobre, key=cobre.get)
    minimo = 0.8 if nt['dur'] < curta else 0.5
    return k if cobre[k] >= minimo * (b - a) else None


def dividir_pela_guia(notas, guia, midi, minimo=0.08):
    """Se o cantor juntou duas notas da melodia numa só (passou direto de uma
    para a outra), corta a nota cantada onde a guia troca de nota."""
    saida = []
    for nt in notas:
        dentro = []
        for g0, g1, k in guia:
            sob = min(nt['t1'], g1) - max(nt['t0'], g0)
            if sob >= minimo:
                dentro.append((g0, g1, k))
        cortes = []
        for (a0, a1, ka), (b0, b1, kb) in zip(dentro, dentro[1:]):
            if ka != kb:
                t = (a1 + b0) / 2
                if nt['t0'] + minimo < t < nt['t1'] - minimo:
                    cortes.append(int(round(t / QUADRO)))
        if not cortes:
            saida.append(nt)
            continue
        bordas = [nt['ini']] + cortes + [nt['fim']]
        for x, y in zip(bordas, bordas[1:]):
            if y - x >= 3 and not np.isnan(midi[x:y]).all():
                saida.append(nova_nota(midi, x, y))
    for i, nt in enumerate(saida):
        nt['id'] = i
    return saida


def oitava_da_guia(notas, guia, ref):
    """Cantor uma oitava acima ou abaixo da guia (homem e mulher): acha o deslocamento."""
    difs = []
    for nt in notas:
        g = guia_para_nota(nt, guia)
        if g is not None:
            difs.append(nt['centro'] - ref - g)
    if not difs:
        return 0
    return int(12 * round(np.median(difs) / 12))


# ---------------------------------------------------------------- escolha das notas

def escolher_notas(notas, inst, votos=None, guia=None, modo='equilibrado'):
    cfg = MODOS[modo]
    ref = inst['afinacao']
    votos = votos or {}
    batidas = np.array(inst['batidas'])
    oitava = oitava_da_guia(notas, guia, ref) if guia else 0

    for nt in notas:
        c = nt['centro'] - ref
        b = inst['blocos'][bloco_no_tempo(inst, nt['t0'] + min(nt['dur'], 0.2) / 2)]
        escala = set(b['escala']['notas'])
        acorde = b['acorde']
        na_batida = len(batidas) and np.min(np.abs(batidas - nt['t0'])) < 0.08
        peso_acorde = min(1.0, nt['dur'] / 0.4) * (1.0 if na_batida else 0.6)

        evid = None  # nota que a guia ou as repetições apontam
        g = guia_para_nota(nt, guia) if guia else None
        if g is not None:
            g += oitava
            if nt['dur'] < 0.12 and abs(g - c) > 2.2:
                g = None  # passagem curta longe da guia: é a ponte entre duas notas
        if g is not None:
            evid = g
        v = votos.get(nt['id'])
        forca_voto, parte = 0.0, {}
        if v:
            total = sum(v.values())
            topo = max(v, key=v.get)
            # só vale com consenso forte: a maioria das repetições canta a mesma nota
            if v[topo] >= 1.0 and v[topo] / total >= 0.65:
                forca_voto = min(1.0, v[topo] / 1.5)
                parte = {k: w / total for k, w in v.items()}
                if evid is None:
                    evid = topo

        # improviso: saiu da melodia de propósito (longe da guia, mas cantado no
        # meio de uma nota da escala, sem tremer)
        improviso = False
        if cfg['improviso'] and evid is not None:
            kk = int(round(c))
            no_acorde = acorde is not None and kk % 12 in acorde['notas']
            if (abs(c - evid) >= 0.9 and abs(c - kk) <= 0.2 and (kk % 12 in escala or no_acorde)
                    and nt['tremor'] < 0.35 and nt['dur'] >= 0.12):
                improviso = True

        cand = set(range(int(math.floor(c)) - 3, int(math.ceil(c)) + 4))
        if evid is not None:
            cand.add(evid)
        custos = {}
        for k in sorted(cand):
            u = custo_distancia(abs(k - c))
            if k % 12 not in escala and not (acorde and k % 12 in acorde['notas']):
                u += 2.0  # nota do acorde do momento nunca é "fora"

            if acorde and k % 12 in acorde['notas']:
                u -= 0.6 * peso_acorde
                if k % 12 == acorde['raiz']:
                    u -= 0.1 * peso_acorde
            if not improviso:
                if g is not None and cfg['guia'] > 0:
                    u += cfg['guia'] * min(abs(k - g), 4)
                if parte:
                    u -= 5.0 * forca_voto * parte.get(k, 0.0)
            custos[k] = u
        nt['custos'] = custos
        nt['guia'] = g
        nt['votos'] = parte
        nt['improviso'] = improviso

    contorno = 0.0 if guia else 0.6  # com guia, o desenho da melodia vem dela
    for grupo in frases(notas):
        _viterbi(grupo, contorno)

    for nt in notas:
        c = nt['centro'] - ref
        nt['alvo'] = nt['escolha']
        nt['correcao'] = nt['alvo'] - c
        motivo = []
        if nt['improviso']:
            motivo.append('improviso mantido')
        elif nt['guia'] is not None and nt['alvo'] == nt['guia'] and int(round(c)) != nt['guia']:
            motivo.append('melodia guia')
        elif nt['votos'] and nt['alvo'] == max(nt['votos'], key=nt['votos'].get) and int(round(c)) != nt['alvo']:
            motivo.append('repetições')
        nt['motivo'] = ', '.join(motivo)
        nt['duvida'] = ((nt['margem'] < 1.0 and abs(nt['correcao']) >= 0.75)
                        or (abs(nt['correcao']) >= 2.5 and not nt['improviso']))
    return notas


def _viterbi(grupo, contorno=0.6):
    """Caminho de notas mais provável dentro de uma frase. Entre duas notas,
    só pesa a direção: se o cantor subiu, descer custa caro (e vice-versa)."""
    estados = [sorted(nt['custos']) for nt in grupo]
    ida = [{k: grupo[0]['custos'][k] for k in estados[0]}]
    volta = [{}]
    for i in range(1, len(grupo)):
        ds = grupo[i]['centro'] - grupo[i - 1]['centro']
        perto = grupo[i]['t0'] - grupo[i - 1]['t1'] < 0.25
        atual, origem = {}, {}
        for k in estados[i]:
            melhor, de = None, None
            for kp in estados[i - 1]:
                custo = ida[-1][kp] + (contorno * _transicao(ds, k - kp) if perto else 0.0)
                if melhor is None or custo < melhor:
                    melhor, de = custo, kp
            atual[k] = melhor + grupo[i]['custos'][k]
            origem[k] = de
        ida.append(atual)
        volta.append(origem)
    # caminho de volta, para a margem (quanto a 2ª melhor nota perde)
    tras = [{k: 0.0 for k in estados[-1]}]
    for i in range(len(grupo) - 1, 0, -1):
        ds = grupo[i]['centro'] - grupo[i - 1]['centro']
        perto = grupo[i]['t0'] - grupo[i - 1]['t1'] < 0.25
        prev = {}
        for kp in estados[i - 1]:
            prev[kp] = min(tras[0][k] + grupo[i]['custos'][k] + (contorno * _transicao(ds, k - kp) if perto else 0.0)
                           for k in estados[i])
        tras.insert(0, prev)
    k = min(ida[-1], key=ida[-1].get)
    for i in range(len(grupo) - 1, -1, -1):
        grupo[i]['escolha'] = k
        if i > 0:
            k = volta[i][k]
    for i, nt in enumerate(grupo):
        total = sorted(ida[i][k] + tras[i][k] for k in estados[i])
        nt['margem'] = total[1] - total[0] if len(total) > 1 else 99.0
        nt['alternativa'] = sorted(estados[i], key=lambda k: ida[i][k] + tras[i][k])[1]


def _transicao(ds, dt):
    """Custo de ir de uma nota para outra (multiplicado pelo peso do contorno)."""
    custo = 0.0
    if ds > 0.7 and dt <= 0:
        custo += 1.0
    elif ds < -0.7 and dt >= 0:
        custo += 1.0
    elif abs(ds) < 0.3 and dt != 0:
        custo += 0.5
    if abs(dt) > 7:
        custo += 0.15 * (abs(dt) - 7)
    return custo


# ---------------------------------------------------------------- curva e voz nova

def curva_de_correcao(midi, notas, ref, forca=1.0, deriva=0.3, robo=False):
    """Quantos semitons mexer em cada quadro. Corrige o centro da nota,
    tira uma parte da oscilação lenta e mantém o vibrato."""
    curva = np.zeros(len(midi))
    marca = np.zeros(len(midi), dtype=bool)
    for nt in notas:
        a, b = nt['ini'], nt['fim']
        p = midi[a:b]
        lento = median_filter(p, size=min(13, len(p) | 1), mode='nearest')
        if robo:
            curva[a:b] = (nt['alvo'] + ref) - p
        else:
            curva[a:b] = (nt['alvo'] + ref - nt['centro']) * forca - deriva * (lento - nt['centro'])
        marca[a:b] = True
    # entre notas próximas, a correção vai de uma para a outra sem degrau
    i, n = 0, len(curva)
    while i < n:
        if marca[i]:
            i += 1
            continue
        j = i
        while j < n and not marca[j]:
            j += 1
        if 0 < i and j < n and (j - i) <= 15:
            curva[i:j] = np.linspace(curva[i - 1], curva[j], j - i + 2)[1:-1]
        i = j
    if not robo:
        k = np.ones(3) / 3
        curva = np.convolve(curva, k, mode='same')
    return curva


def refazer_voz(y, sr, curva):
    """Muda a afinação com PSOLA do Praat: troca a nota sem mudar o timbre."""
    import parselmouth
    from parselmouth.praat import call
    som = parselmouth.Sound(y.astype(np.float64), sampling_frequency=sr)
    manip = call(som, "To Manipulation", 0.01, 60, 1100)
    tier = call(manip, "Extract pitch tier")
    n = int(call(tier, "Get number of points"))
    novo = call("Create PitchTier", "afinado", som.xmin, som.xmax)
    tempos_curva = np.arange(len(curva)) * QUADRO
    for i in range(1, n + 1):
        t = call(tier, "Get time from index", i)
        f = call(tier, "Get value at index", i)
        s = float(np.interp(t, tempos_curva, curva))
        call(novo, "Add point", t, f * 2 ** (s / 12))
    call([manip, novo], "Replace pitch tier")
    saida = call(manip, "Get resynthesis (overlap-add)")
    v = saida.values[0]
    out = np.zeros_like(y)
    m = min(len(v), len(y))
    out[:m] = v[:m]
    return out
