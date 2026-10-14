"""Medidas que completam os 10 pontos (chamadas pelo analisar.py).

composicao   margem segura, grade, hierarquia dos tamanhos, espaço vazio, onde mora o conteúdo
cor_luz      contraste, saturação, grão, vinheta, proporção por papel (fundo, texto, destaque)
transicoes   tipo e duração de cada passagem de plano (corte seco, dissolve, chicote, flash, cortina)
ritmo_planos entrada, permanência e saída de cada plano; gancho dos 2 primeiros segundos
escada       atraso entre elementos (a "escada") e direção em que ela anda
camera       profundidade (paralaxe) nos movimentos de câmera
texto_entrada como o texto entra (letra por letra, palavra por palavra, linha por linha, inteiro) e entrelinha
camadas      som separado em voz, trilha e efeitos (BandIt Plus), volume de cada camada, efeitos x visual
tecnico      taxa de bits, cor, áudio
"""
import json, math, os, shutil, subprocess, tempfile
import numpy as np, cv2

FF = shutil.which("ffmpeg") or os.path.expanduser("~/.cargo/bin/ffmpeg")
FP = shutil.which("ffprobe") or os.path.expanduser("~/.cargo/bin/ffprobe")
MSST = os.path.expanduser("~/FilmbossTools/msst")
SFX_PY = os.path.expanduser("~/FilmbossTools/sfx-venv/bin/python")


def _todos_textos(T):
    return [t for lst in (T.get("por_plano") or {}).values() for q in lst for t in q["textos"] if t["c"] >= 0.5 and len(t["t"].strip()) > 1]


def _hex(rgb):
    return "#%02X%02X%02X" % tuple(int(v) for v in rgb)


# ------------------------------------------------------------------ composição
def composicao(F, P, T):
    out = {}
    tx = _todos_textos(T)
    if tx:
        bordas = [min(t["x"], 1 - t["x"] - t["w"]) for t in tx] + [min(t["y"], 1 - t["y"] - t["h"]) for t in tx]
        out["margem_texto_min_pct"] = round(100 * float(np.percentile([max(0, b) for b in bordas], 5)), 1)
        out["margem_lateral_pct"] = round(100 * float(np.percentile([max(0, min(t["x"], 1 - t["x"] - t["w"])) for t in tx], 10)), 1)
        # grade: posições da borda esquerda que se repetem (texto alinhado pela esquerda)
        esq = np.round(np.array([t["x"] for t in tx]) / 0.02) * 0.02
        vals, cont = np.unique(esq, return_counts=True)
        out["colunas_esquerda_pct"] = [round(100 * float(v)) for v, c in sorted(zip(vals, cont), key=lambda t: -t[1]) if c >= max(3, 0.12 * len(tx))][:4]
        # faixas de altura em que o texto mora (topo, meio, base)
        cy = np.array([t["y"] + t["h"] / 2 for t in tx])
        out["texto_vertical"] = {"topo": round(float((cy < 0.33).mean()), 2), "meio": round(float(((cy >= 0.33) & (cy <= 0.66)).mean()), 2), "base": round(float((cy > 0.66).mean()), 2)}
        # hierarquia: níveis de tamanho (agrupados a 15%) e proporção entre eles
        hs = sorted(t["altura_pct"] for t in tx if t["altura_pct"] >= 0.8)
        niveis = []
        for h in hs:
            if niveis and h <= niveis[-1][-1] * 1.15: niveis[-1].append(h)
            else: niveis.append([h])
        lv = [round(float(np.median(n)), 1) for n in niveis if len(n) >= 2] or [round(float(np.median(n)), 1) for n in niveis]
        out["niveis_texto_pct"] = lv
        out["proporcao_entre_niveis"] = [round(lv[i + 1] / lv[i], 2) for i in range(len(lv) - 1)]
    # espaço vazio e onde mora o conteúdo (bordas detectadas), em quadros do meio de cada plano
    vaz, caixas = [], []
    for p in P:
        g = cv2.cvtColor(F[p["ini"] + p["quadros"] // 2], cv2.COLOR_RGB2GRAY)
        ed = cv2.Canny(g, 60, 160)
        H, W = ed.shape; gh, gw = H // 9, W // 16
        cel = ed[:gh * 9, :gw * 16].reshape(9, gh, 16, gw).mean(axis=(1, 3))
        vaz.append(float((cel < 2).mean()))
        ys, xs = np.nonzero(ed)
        if len(xs) > 50:
            caixas.append([np.percentile(xs, 2) / W, np.percentile(ys, 2) / H, np.percentile(xs, 98) / W, np.percentile(ys, 98) / H])
    out["espaco_vazio_frac"] = round(float(np.median(vaz)), 2) if vaz else None
    if caixas:
        c = np.median(np.array(caixas), axis=0)
        out["conteudo_caixa_pct"] = [round(100 * float(v)) for v in c]   # x0, y0, x1, y1 do que tem desenho
    return out


# ------------------------------------------------------------------ cor e luz
def cor_luz(video, F, P, info, de, paleta):
    out = {}
    L = []
    for p in P:
        f = F[p["ini"] + p["quadros"] // 2]
        lab = cv2.cvtColor(f, cv2.COLOR_RGB2LAB)
        L.append(lab[..., 0].astype(float) * 100 / 255)
    Ls = np.concatenate([l.ravel() for l in L])
    out["luz_p5_p95"] = [round(float(np.percentile(Ls, 5)), 1), round(float(np.percentile(Ls, 95)), 1)]
    out["contraste"] = round(float(np.percentile(Ls, 95) - np.percentile(Ls, 5)), 1)
    hsv = np.concatenate([cv2.cvtColor(F[p["ini"] + p["quadros"] // 2], cv2.COLOR_RGB2HSV).reshape(-1, 3) for p in P])
    out["saturacao_media"] = round(float(hsv[:, 1].mean()) / 255, 2)
    # vinheta: luz dos cantos / luz do centro (1 = sem vinheta)
    vin = []
    for l in L:
        H, W = l.shape; a, b = H // 8, W // 8
        cantos = np.mean([l[:a, :b].mean(), l[:a, -b:].mean(), l[-a:, :b].mean(), l[-a:, -b:].mean()])
        centro = l[H // 3:2 * H // 3, W // 3:2 * W // 3].mean()
        if centro > 8: vin.append(cantos / centro)
    out["vinheta_cantos_sobre_centro"] = round(float(np.median(vin)), 2) if vin else None
    # grão: ruído fino em regiões lisas, medido na resolução original (6 quadros)
    tmp = tempfile.mkdtemp(prefix="grao_")
    graos = []
    for k, p in enumerate(P[:: max(1, len(P) // 6)][:6]):
        a = os.path.join(tmp, f"{k}.png")
        subprocess.run([FF, "-v", "error", "-y", "-ss", str(de + (p["ini"] + p["quadros"] / 2) / info["fps"]), "-i", video, "-frames:v", "1", a])
        im = cv2.imread(a, cv2.IMREAD_GRAYSCALE)
        if im is None: continue
        im = im.astype(np.float32)
        res = im - cv2.GaussianBlur(im, (0, 0), 1.2)
        gx = cv2.Sobel(cv2.GaussianBlur(im, (0, 0), 3), cv2.CV_32F, 1, 0); gy = cv2.Sobel(cv2.GaussianBlur(im, (0, 0), 3), cv2.CV_32F, 0, 1)
        liso = np.hypot(gx, gy) < 6
        if liso.mean() > 0.05: graos.append(float(res[liso].std()))
    shutil.rmtree(tmp, ignore_errors=True)
    if graos:
        g = float(np.median(graos))
        out["grao"] = round(g, 2)
        out["grao_nota"] = "sem grão (imagem limpa)" if g < 0.8 else "grão leve" if g < 2 else "grão visível" if g < 4 else "grão forte"
    # proporção por papel: pixels mais perto do fundo, do texto (mais contraste) e do destaque (mais saturada)
    try:
        geral = paleta["geral"]; fundo = paleta["fundo_provavel"]
        def lab_hex(h):
            h = h.lstrip("#"); return cv2.cvtColor(np.uint8([[[int(h[i:i + 2], 16) for i in (0, 2, 4)]]]), cv2.COLOR_RGB2LAB)[0, 0].astype(float)
        lf = lab_hex(fundo)
        dist = lambda h: float(np.linalg.norm(lab_hex(h) - lf))
        papel = {"fundo": 0.0, "neutros": 0.0, "texto": 0.0, "destaque": 0.0}
        for c in geral:
            h = c["hex"]; hs = cv2.cvtColor(np.uint8([[[int(h[i:i + 2], 16) for i in (1, 3, 5)]]]), cv2.COLOR_RGB2HSV)[0, 0]
            if dist(h) < 12: papel["fundo"] += c["prop"]
            elif hs[1] > 90 and hs[2] > 60: papel["destaque"] += c["prop"]
            elif dist(h) > 60: papel["texto"] += c["prop"]
            else: papel["neutros"] += c["prop"]
        out["proporcao_por_papel"] = {k: round(v, 2) for k, v in papel.items()}
    except Exception:
        pass
    return out


# ------------------------------------------------------------------ transições
def transicoes(M, P, fps):
    dif = np.array([m["dif"] for m in M]); luz = np.array([m["luz"] for m in M]); mov = np.array([m["mov"] for m in M])
    base = float(np.median(dif[dif > 0])) if (dif > 0).any() else 1.0
    out = []
    for p in P[1:]:
        c = p["ini"]
        # janela ativa em volta do corte: quadros com diferença bem acima do normal
        a = c
        while a - 1 > max(0, c - 12) and dif[a - 1] > max(3 * base, 4): a -= 1
        b = c
        while b + 1 < min(len(M), c + 12) and dif[b + 1] > max(3 * base, 4): b += 1
        dur = b - a + 1
        janela = slice(max(0, a - 1), min(len(M), b + 2))
        lz = luz[janela]
        ev = M[max(0, c - 4):min(len(M), c + 4)]
        dirx = np.mean([m["dx"] for m in ev]); diry = np.mean([m["dy"] for m in ev]); zm = np.mean([m["zoom"] for m in ev])
        rapido = mov[max(0, c - 4):c + 4].max() > 0.02
        if lz.max() > 0.9 and lz.max() - max(lz[0], lz[-1]) > 0.12: tipo = "flash branco"
        elif lz.min() < 0.08 and min(lz[0], lz[-1]) - lz.min() > 0.12: tipo = "passa pelo preto"
        elif rapido and abs(zm) > max(abs(dirx), abs(diry)): tipo = "zoom rápido (empurra)"
        elif rapido: tipo = "chicote (whip) para " + ("a esquerda" if dirx < 0 else "a direita") if abs(dirx) >= abs(diry) else "chicote (whip) para " + ("cima" if diry < 0 else "baixo")
        elif dur >= 4: tipo = "dissolve ou mistura"
        elif dur >= 2: tipo = "cortina ou máscara curta"
        else: tipo = "corte seco"
        out.append({"quadro": c, "s": round(c / fps, 3), "tipo": tipo, "quadros": dur})
    tipos = {}
    for t in out: tipos[t["tipo"]] = tipos.get(t["tipo"], 0) + 1
    return {"lista": out, "tipos": tipos}


# ------------------------------------------------------------------ ritmo por plano
def ritmo_planos(M, P, MV, fps):
    out = []
    for p in P:
        ms = [m for m in MV if m["plano"] == p["n"]]
        mov = np.array([M[q]["mov"] for q in range(p["ini"], p["fim"])])
        parado = int((mov < 0.0015).sum())
        entrada = ms[0] if ms and ms[0]["ini"] - p["ini"] <= 3 else None
        saida = ms[-1] if ms and p["fim"] - ms[-1]["fim"] <= 2 else None
        out.append({"plano": p["n"], "entrada_q": entrada["quadros"] if entrada else 0, "entrada_tipo": entrada["tipo"] if entrada else "já começa montado",
                    "saida_q": saida["quadros"] if saida else 0, "saida_tipo": saida["tipo"] if saida else "sai no corte",
                    "parado_q": parado, "movimentos": len(ms), "primeiro_evento_q": (ms[0]["ini"] - p["ini"]) if ms else None})
    # gancho: os 2 primeiros segundos
    g = int(2 * fps)
    E = np.array([m["mov"] for m in M])
    gancho = {"cortes_2s": sum(1 for p in P[1:] if p["ini"] < g), "movimentos_2s": sum(1 for m in MV if m["ini"] < g),
              "energia_2s_sobre_media": round(float(E[:g].mean() / (E.mean() + 1e-9)), 2) if len(E) > g else None,
              "primeiro_evento_q": min([m["ini"] for m in MV] + [p["ini"] for p in P[1:]] or [None])}
    return {"por_plano": out, "gancho": gancho}


# ------------------------------------------------------------------ escada (atraso entre elementos)
def escada(M, MV, fps):
    res = []
    for m in MV:
        if m["quadros"] < 4: continue
        C = np.array([M[q]["cel"] for q in range(max(1, m["ini"] - 2), min(len(M), m["fim"] + 2))])
        if C.size == 0: continue
        pico = C.max(axis=0)
        ativas = [i for i in range(16) if pico[i] > 0.35 * pico.max() and pico[i] > 0.002]
        if len(ativas) < 3: continue
        inicio = {i: int(np.argmax(C[:, i] > 0.4 * pico[i])) for i in ativas}
        tempos = sorted(set(inicio.values()))
        if len(tempos) < 3 or tempos[-1] - tempos[0] < 2: continue
        passo = float(np.median(np.diff(tempos)))
        xs = np.array([i % 4 for i in ativas]); ys = np.array([i // 4 for i in ativas]); ts = np.array([inicio[i] for i in ativas])
        cx = np.corrcoef(xs, ts)[0, 1] if xs.std() > 0 and ts.std() > 0 else 0
        cy = np.corrcoef(ys, ts)[0, 1] if ys.std() > 0 and ts.std() > 0 else 0
        if max(abs(cx), abs(cy)) < 0.4: dirn = "sem direção (vários pontos)"
        elif abs(cx) >= abs(cy): dirn = "da esquerda para a direita" if cx > 0 else "da direita para a esquerda"
        else: dirn = "de cima para baixo" if cy > 0 else "de baixo para cima"
        res.append({"movimento_ini": m["ini"], "passo_q": round(passo, 1), "espalhamento_q": tempos[-1] - tempos[0], "direcao": dirn, "regioes": len(ativas)})
    if not res: return {"tem_escada": False, "nota": "elementos entram juntos (sem atraso medido entre regiões)"}
    passos = [r["passo_q"] for r in res]
    dirs = {}
    for r in res: dirs[r["direcao"]] = dirs.get(r["direcao"], 0) + 1
    return {"tem_escada": True, "passo_mediano_q": round(float(np.median(passos)), 1), "ocorrencias": len(res), "direcoes": dirs, "lista": res[:30]}


# ------------------------------------------------------------------ câmera (profundidade)
def camera(M, MV):
    par = []
    for m in MV:
        if m["dominante"] != "deslize": continue
        Dx = np.array([M[q]["cel_dx"] for q in range(m["ini"], m["fim"])]).sum(axis=0)
        ativos = Dx[np.abs(Dx) > 0.15 * np.abs(Dx).max()] if np.abs(Dx).max() > 0 else []
        if len(ativos) >= 4: par.append(float(np.std(ativos) / (np.abs(np.mean(ativos)) + 1e-9)))
    zl = [m for m in MV if m["dominante"] == "zoom"]
    out = {"movimentos_de_zoom": len(zl), "movimentos_de_deslize": sum(1 for m in MV if m["dominante"] == "deslize"),
           "movimentos_de_giro": sum(1 for m in MV if m["dominante"] == "giro")}
    if par:
        v = float(np.median(par)); out["paralaxe"] = round(v, 2)
        out["profundidade"] = "plana (tudo anda junto)" if v < 0.35 else "camadas com paralaxe leve" if v < 0.8 else "camadas com paralaxe forte (3D ou 2,5D)"
    return out


# ------------------------------------------------------------------ como o texto entra
def texto_entrada(video, P, T, fps, de, textos_bin):
    if not os.path.exists(textos_bin): return {"erro": "leitor de texto não instalado"}
    tmp = tempfile.mkdtemp(prefix="txtin_")
    res = []
    try:
        for p in P:
            if not any(q["textos"] for q in (T.get("por_plano") or {}).get(str(p["n"]), T.get("por_plano", {}).get(p["n"], []))): continue
            n = min(p["quadros"], 36)
            pasta = os.path.join(tmp, str(p["n"])); os.makedirs(pasta)
            subprocess.run([FF, "-v", "error", "-y", "-ss", str(de + p["ini"] / fps), "-i", video, "-frames:v", str(n), "-vf", "scale=1280:-2",
                            os.path.join(pasta, "%04d.png")])
            arqs = sorted(os.path.join(pasta, f) for f in os.listdir(pasta))
            if not arqs: continue
            r = subprocess.run([textos_bin] + arqs, capture_output=True, text=True).stdout
            seq = {}
            for ln in r.strip().splitlines():
                d = json.loads(ln); k = arqs.index(d["img"])
                ts = [t for t in d["textos"] if t["c"] >= 0.5]
                seq[k] = {"chars": sum(len(t["t"].replace(" ", "")) for t in ts), "palavras": sum(len(t["t"].split()) for t in ts), "linhas": len(ts),
                          "boxes": [(round(t["x"], 3), round(t["y"], 3), round(t["w"], 3), round(t["h"], 3)) for t in ts]}
            if not seq: continue
            ks = sorted(seq); ch = [seq[k]["chars"] for k in ks]; pw = [seq[k]["palavras"] for k in ks]; li = [seq[k]["linhas"] for k in ks]
            final = max(ch)
            if final < 3: continue
            # primeiro quadro com texto e quantos degraus até completar
            prim = next(i for i, c in enumerate(ch) if c > 0)
            comp = next(i for i, c in enumerate(ch) if c >= 0.95 * final)
            degraus_ch = len(set(c for c in ch[prim:comp + 1] if c > 0))
            degraus_pw = len(set(c for c in pw[prim:comp + 1] if c > 0))
            degraus_li = len(set(c for c in li[prim:comp + 1] if c > 0))
            if comp - prim <= 1: modo = "entra inteiro"
            elif degraus_li >= 2 and degraus_pw <= degraus_li + 1: modo = "linha por linha"
            elif degraus_ch >= 4 and degraus_ch > degraus_pw + 1: modo = "letra por letra (digitado)"
            elif degraus_pw >= 2: modo = "palavra por palavra"
            else: modo = "entra inteiro"
            item = {"plano": p["n"], "modo": modo, "quadros_ate_completar": comp - prim, "comeca_q": prim}
            if degraus_pw >= 2 and comp > prim: item["quadros_por_palavra"] = round((comp - prim) / max(1, degraus_pw - 1), 1)
            # entrelinha: duas caixas uma embaixo da outra no quadro completo
            bx = sorted(seq[ks[comp]]["boxes"], key=lambda b: b[1])
            gaps = [(b2[1] - (b1[1] + b1[3])) / b1[3] for b1, b2 in zip(bx, bx[1:])
                    if abs((b1[0] + b1[2] / 2) - (b2[0] + b2[2] / 2)) < 0.15 or abs(b1[0] - b2[0]) < 0.03]
            gaps = [g for g in gaps if -0.3 < g < 1.5]
            if gaps: item["entrelinha"] = round(float(np.median(gaps)), 2)
            res.append(item)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    modos = {}
    for r in res: modos[r["modo"]] = modos.get(r["modo"], 0) + 1
    el = [r["entrelinha"] for r in res if "entrelinha" in r]
    return {"por_plano": res, "modos": modos, "entrelinha_mediana": round(float(np.median(el)), 2) if el else None}


# ------------------------------------------------------------------ som em camadas
def camadas(saida, fps, P, MV, de, ate, video):
    """Separa voz, trilha e efeitos com o BandIt Plus (o mesmo das SFX do Instagram). Só roda se estiver instalado."""
    ck = os.path.join(MSST, "pretrained", "model_bandit_plus_dnr_sdr_11.47.chpt")
    if not (os.path.exists(ck) and os.path.exists(SFX_PY)): return {"separado": False, "nota": "separador de faixas não instalado"}
    import librosa
    tmp = tempfile.mkdtemp(prefix="camadas_")
    ent = os.path.join(tmp, "ent"); os.makedirs(ent)
    wav = os.path.join(ent, "som.wav")
    subprocess.run([FF, "-v", "error", "-y", "-ss", str(de)] + (["-t", str(ate - de)] if ate else []) + ["-i", video, "-vn", "-ac", "2", "-ar", "44100", wav])
    sep = os.path.join(saida, "camadas"); os.makedirs(sep, exist_ok=True)
    r = subprocess.run([SFX_PY, "inference_mps.py", "--model_type", "bandit", "--config_path", "pretrained/config_dnr_bandit_bsrnn_multi_mus64.yaml",
                        "--start_check_point", ck, "--input_folder", ent, "--store_dir", tmp], cwd=MSST, capture_output=True, text=True)
    achados = {}
    for dp, _, fs in os.walk(tmp):
        for f in fs:
            if f.endswith(".wav") and f != "som.wav":
                nome = "voz" if "speech" in f or "dialog" in f else "trilha" if "music" in f else "efeitos" if ("effect" in f or "sfx" in f) else None
                if nome: shutil.move(os.path.join(dp, f), os.path.join(sep, nome + ".wav")); achados[nome] = os.path.join(sep, nome + ".wav")
    shutil.rmtree(tmp, ignore_errors=True)
    if not achados: return {"separado": False, "nota": "separação falhou: " + r.stderr[-300:]}
    return medir_camadas(achados, sep, fps, P, MV)


def medir_camadas(achados, sep, fps, P, MV):
    import librosa
    out = {"separado": True, "pasta": sep}
    rms_tot = {}
    for nome, arq in achados.items():
        y, sr = librosa.load(arq, sr=22050, mono=True)
        rms = librosa.feature.rms(y=y)[0]; rms_tot[nome] = float(np.mean(rms ** 2))
        out[nome] = {"volume_medio_db": round(float(20 * np.log10(np.sqrt(np.mean(rms ** 2)) + 1e-9)), 1), "pico_db": round(float(20 * np.log10(np.abs(y).max() + 1e-9)), 1)}
        if nome == "trilha":
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr); out[nome]["bpm"] = round(float(np.atleast_1d(tempo)[0]), 1)
        if nome == "efeitos":
            oenv = librosa.onset.onset_strength(y=y, sr=sr)
            fr = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, units="frames")
            # só os ataques de verdade: força acima de 25% do maior e som acima de -45 dB naquele ponto
            rmsdb = 20 * np.log10(rms + 1e-9)
            bons = [f for f in fr if oenv[f] > 0.25 * oenv.max() and rmsdb[min(len(rmsdb) - 1, f + 2)] > -45]
            ini = librosa.onset.onset_backtrack(np.array(bons, int), oenv) if bons else []
            fortes = [float(t) for t in librosa.frames_to_time(ini, sr=sr)]
            out[nome]["n_efeitos"] = len(fortes); out[nome]["efeitos_s"] = [round(t, 3) for t in fortes]
            def perto(t, lista):
                if not lista: return None
                d = [(x - t) * fps for x in lista]; i = int(np.argmin(np.abs(d))); return round(d[i], 1)
            cortes = [p["ini_s"] for p in P[1:]]
            em_corte = [perto(c, fortes) for c in cortes]; em_mov = [perto(m["ini_s"], fortes) for m in MV]
            ok_c = [x for x in em_corte if x is not None and abs(x) <= 8]; ok_m = [x for x in em_mov if x is not None and abs(x) <= 8]
            out[nome]["cortes_com_efeito_frac"] = round(len(ok_c) / len(cortes), 2) if cortes else None
            out[nome]["efeito_menos_corte_q"] = round(float(np.median(ok_c)), 1) if ok_c else None
            out[nome]["movimentos_com_efeito_frac"] = round(len(ok_m) / len(MV), 2) if MV else None
            out[nome]["efeito_menos_movimento_q"] = round(float(np.median(ok_m)), 1) if ok_m else None
    tot = sum(rms_tot.values()) or 1
    out["proporcao_energia"] = {k: round(v / tot, 2) for k, v in rms_tot.items()}
    return out


# ------------------------------------------------------------------ técnico
def tecnico(video):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=bit_rate:stream=codec_type,codec_name,bit_rate,pix_fmt,color_transfer,color_primaries,sample_rate,channels",
                        "-of", "json", video], capture_output=True, text=True)
    try: d = json.loads(r.stdout)
    except Exception: return {}
    out = {"taxa_total_mbps": round(int(d["format"].get("bit_rate", 0)) / 1e6, 1)}
    for s in d.get("streams", []):
        if s.get("codec_type") == "video":
            out.update({"video_mbps": round(int(s.get("bit_rate", 0) or 0) / 1e6, 1), "pix_fmt": s.get("pix_fmt"),
                        "cor": f'{s.get("color_primaries", "?")}/{s.get("color_transfer", "?")}'})
        if s.get("codec_type") == "audio":
            out.update({"audio": f'{s.get("codec_name")} {s.get("sample_rate")} Hz {s.get("channels")} canais', "audio_kbps": round(int(s.get("bit_rate", 0) or 0) / 1e3)})
    return out
