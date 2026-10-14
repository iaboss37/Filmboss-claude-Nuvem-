"""Análise forense de um vídeo de motion graphics (parte medida por máquina).

Uso:  python analisar.py <video> <pasta_saida> [--de 0] [--ate SEG] [--sem-camadas]
(--sem-camadas: não separa voz, trilha e efeitos; a separação leva uns segundos por segundo de vídeo)
Gera na pasta de saída:
  info.json         formato, resolução, quadros por segundo, duração, som
  metricas.json     por quadro: luz, diferença, fluxo (movimento, direção, zoom, giro), nitidez, repetido
  planos.json       cortes de plano (quadro e segundo) e duração de cada plano
  movimentos.json   cada movimento: início, fim, duração, pico, curva cúbica medida, tipo, se passa do ponto
  paleta.json       paleta geral e por plano (hex e proporção), cor de fundo
  textos.json       textos lidos na tela (posição, tamanho em % da altura), por plano
  audio.json        ritmo (BPM), batidas, ataques de som, alinhamento de cortes e movimentos com som
  folhas/           storyboard.jpg, plano_NN.jpg, energia.png
  extras.json       composição, cor e luz, transições, ritmo por plano, escada, câmera, entrada do texto, som em camadas, técnico
  camadas/          voz.wav, trilha.wav, efeitos.wav (quando o separador está instalado)
  analise.json      tudo junto + resumo (o que a skill usa para escrever a ficha)
A parte que depende do olho (tipografia, composição, formas, narrativa) é escrita pelo Claude olhando as folhas.
"""
import json, os, subprocess, sys, shutil, math, tempfile
import numpy as np, cv2

AQUI = os.path.dirname(os.path.abspath(__file__))
FF = shutil.which("ffmpeg") or os.path.expanduser("~/.cargo/bin/ffmpeg")
FP = shutil.which("ffprobe") or os.path.expanduser("~/.cargo/bin/ffprobe")
# leitor de texto: Vision no Mac (bin/textos, compilado pelo instalar.sh); Tesseract no Linux (bin/textos_linux.py)
TEXTOS = os.path.join(AQUI, "..", "bin", "textos") if sys.platform == "darwin" else \
    (os.path.join(AQUI, "..", "bin", "textos_linux.py") if shutil.which("tesseract") else "")


def args():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)
    op = {"de": 0.0, "ate": None, "sem-camadas": False}
    if "--sem-camadas" in a: a.remove("--sem-camadas"); op["sem-camadas"] = True
    for k in ("de", "ate"):
        if f"--{k}" in a:
            i = a.index(f"--{k}"); op[k] = float(a[i + 1]); del a[i:i + 2]
    return a[0], a[1], op


def info_video(v):
    j = json.loads(subprocess.run([FP, "-v", "error", "-show_streams", "-show_format", "-of", "json", v], capture_output=True, text=True).stdout)
    vs = next(s for s in j["streams"] if s["codec_type"] == "video")
    num, den = map(int, vs["r_frame_rate"].split("/"))
    fps = num / den
    return {"arquivo": os.path.abspath(v), "largura": vs["width"], "altura": vs["height"], "fps": round(fps, 3),
            "duracao": float(j["format"]["duration"]), "codec": vs["codec_name"],
            "tem_som": any(s["codec_type"] == "audio" for s in j["streams"]),
            "proporcao": f'{vs["width"] / math.gcd(vs["width"], vs["height"])}:{vs["height"] / math.gcd(vs["width"], vs["height"])}'.replace(".0", "")}


def quadros(v, w, h, de, ate):
    """Lê o vídeo inteiro em w x h (RGB) pelo ffmpeg."""
    cmd = [FF, "-v", "error", "-ss", str(de)] + (["-t", str(ate - de)] if ate else []) + ["-i", v, "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def metricas(F):
    n = len(F)
    hsv_prev = gray_prev = None
    out = []
    H, W = F.shape[1:3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rx, ry = xx - W / 2, yy - H / 2
    rn = np.sqrt(rx ** 2 + ry ** 2) + 1e-6
    for i in range(n):
        rgb = F[i]
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        hist = cv2.calcHist([hsv], [0, 1, 2], None, [16, 4, 4], [0, 180, 0, 256, 0, 256]); cv2.normalize(hist, hist)
        m = {"q": i, "luz": round(float(gray.mean()) / 255, 4), "nitidez": round(float(cv2.Laplacian(gray, cv2.CV_32F).var()), 1)}
        if gray_prev is not None:
            dif = float(np.abs(gray.astype(np.int16) - gray_prev).mean())
            m["dif"] = round(dif, 3)
            m["hist"] = round(float(cv2.compareHist(hsv_prev, hist, cv2.HISTCMP_BHATTACHARYYA)), 4)
            m["repetido"] = dif < 0.15
            if dif >= 0.15:
                fl = cv2.calcOpticalFlowFarneback(gray_prev, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
                mag = np.sqrt(fl[..., 0] ** 2 + fl[..., 1] ** 2)
                m["mov"] = round(float(mag.mean()) / W, 5)                       # fração da largura por quadro
                m["dx"] = round(float(np.median(fl[..., 0])) / W, 5)
                m["dy"] = round(float(np.median(fl[..., 1])) / W, 5)
                m["zoom"] = round(float(((fl[..., 0] * rx + fl[..., 1] * ry) / rn).mean()) / W, 5)
                m["giro"] = round(float(((fl[..., 1] * rx - fl[..., 0] * ry) / rn).mean()) / W, 5)
                m["area_mov"] = round(float((mag > 0.6).mean()), 3)            # quanto da tela mexe
                # movimento por célula de uma grade 4 x 4 (atraso entre elementos e profundidade da câmera)
                hh, ww = H // 4, W // 4
                m["cel"] = [round(float(mag[r * hh:(r + 1) * hh, c * ww:(c + 1) * ww].mean()) / W, 5) for r in range(4) for c in range(4)]
                m["cel_dx"] = [round(float(np.median(fl[r * hh:(r + 1) * hh, c * ww:(c + 1) * ww, 0])) / W, 5) for r in range(4) for c in range(4)]
            else:
                m.update({"mov": 0.0, "dx": 0.0, "dy": 0.0, "zoom": 0.0, "giro": 0.0, "area_mov": 0.0, "cel": [0.0] * 16, "cel_dx": [0.0] * 16})
        else:
            m.update({"dif": 0.0, "hist": 0.0, "repetido": False, "mov": 0.0, "dx": 0.0, "dy": 0.0, "zoom": 0.0, "giro": 0.0, "area_mov": 0.0,
                      "cel": [0.0] * 16, "cel_dx": [0.0] * 16})
        out.append(m)
        gray_prev, hsv_prev = gray.astype(np.int16), hist
    return out


def planos(M, fps):
    dif = np.array([m["dif"] for m in M]); hi = np.array([m["hist"] for m in M])
    med = np.median(dif[dif > 0]) if (dif > 0).any() else 1.0
    cortes = [0]
    for i in range(1, len(M)):
        corte = (hi[i] > 0.42 and dif[i] > max(12, 3 * med)) or dif[i] > max(40, 8 * med)
        if corte and i - cortes[-1] >= 3:
            cortes.append(i)
    cortes.append(len(M))
    P = []
    for k, (a, b) in enumerate(zip(cortes, cortes[1:])):
        P.append({"n": k + 1, "ini": a, "fim": b, "quadros": b - a, "ini_s": round(a / fps, 3), "dur_s": round((b - a) / fps, 3)})
    return P


# ------------------------------------------------------------------ curva cúbica (cubic-bezier do CSS)
def bez(t, p1, p2):
    return 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3


def curva_y(x, x1, y1, x2, y2):
    t = np.linspace(0, 1, 200)
    bx = bez(t, x1, x2); by = bez(t, y1, y2)
    return np.interp(x, bx, by)


def ajustar_curva(perfil):
    """perfil: deslocamento acumulado normalizado 0..1 ao longo do tempo 0..1. Devolve (x1,y1,x2,y2), erro."""
    from scipy.optimize import least_squares
    x = np.linspace(0, 1, len(perfil))
    def res(p):
        x1, y1, x2, y2 = p
        return curva_y(x, x1, y1, x2, y2) - perfil
    melhor = None
    for ini in ([0.25, 0.1, 0.25, 1.0], [0.16, 1, 0.3, 1], [0.65, 0, 0.35, 1], [0.7, 0, 0.84, 0], [0.34, 1.6, 0.64, 1]):
        r = least_squares(res, ini, bounds=([0, -1, 0, -1], [1, 2.5, 1, 2.5]))
        if melhor is None or r.cost < melhor.cost: melhor = r
    return [round(float(v), 3) for v in melhor.x], round(float(np.sqrt(np.mean(melhor.fun ** 2))), 4)


def tipo_curva(c):
    x1, y1, x2, y2 = c
    if y1 > 1.05 or y2 > 1.05: return "passa do ponto e volta (pop)"
    if abs(x1 - y1) < 0.08 and abs(x2 - y2) < 0.08: return "linear"
    if y1 > x1 + 0.25 and y2 >= x2: return "sai rápido e freia (chegada)"
    if y1 < x1 - 0.1 and y2 < x2 - 0.1: return "começa devagar e acelera (saída)"
    return "acelera e freia suave (troca)"


def movimentos(M, P, fps):
    E = np.array([m["mov"] for m in M])
    out = []
    for p in P:
        e = E[p["ini"] + 1:p["fim"]]
        if len(e) < 3: continue
        es = np.convolve(e, np.ones(3) / 3, mode="same")
        lim = max(0.0012, 0.22 * es.max())
        ativo = es > lim
        i = 0
        while i < len(ativo):
            if not ativo[i]: i += 1; continue
            j = i
            while j < len(ativo) and ativo[j]: j += 1
            a, b = p["ini"] + 1 + i, p["ini"] + 1 + j
            if b - a >= 3:
                seg = E[a:b]
                dx = np.array([M[q]["dx"] for q in range(a, b)]); dy = np.array([M[q]["dy"] for q in range(a, b)])
                z = np.array([M[q]["zoom"] for q in range(a, b)]); g = np.array([M[q]["giro"] for q in range(a, b)])
                acum = np.concatenate([[0], np.cumsum(seg)]); perfil = acum / acum[-1]
                curva, erro = ajustar_curva(perfil)
                # direção principal e se volta no fim (passa do ponto)
                vx, vy = dx.sum(), dy.sum()
                proj = (dx * vx + dy * vy) / (math.hypot(vx, vy) + 1e-9)
                volta = bool(len(proj) > 4 and proj[-max(2, len(proj) // 4):].min() < -0.15 * abs(proj).max())
                dominante = max((("zoom", abs(z.sum())), ("giro", abs(g.sum())), ("deslize", math.hypot(vx, vy))), key=lambda t: t[1])[0]
                repetidos = sum(1 for q in range(a, b) if M[q]["repetido"])
                out.append({"plano": p["n"], "ini": a, "fim": b, "quadros": b - a, "seg": round((b - a) / fps, 3), "ini_s": round(a / fps, 3),
                            "pico": round(float(seg.max()), 5), "pico_rel": round(float(np.argmax(seg)) / max(1, b - a - 1), 2),
                            "curva": curva, "erro_curva": erro, "tipo": "passa do ponto e volta (pop)" if volta else tipo_curva(curva),
                            "dominante": dominante, "direcao": [round(float(vx), 4), round(float(vy), 4)],
                            "zoom_total": round(float(z.sum()), 4), "giro_total": round(float(g.sum()), 4),
                            "area_media": round(float(np.mean([M[q]["area_mov"] for q in range(a, b)])), 3),
                            "quadros_repetidos": repetidos})
            i = j
    return out


def _largura_bordas(F, q):
    """Na região que mexe no quadro q: largura média (px) das bordas medidas ao longo do movimento (10% a 90%)
    e a velocidade (px/quadro). Sem borrão a borda tem ~1 a 2 px; com borrão ela estica junto com a velocidade."""
    g0 = cv2.cvtColor(F[q - 1], cv2.COLOR_RGB2GRAY).astype(np.float32); g1 = cv2.cvtColor(F[q], cv2.COLOR_RGB2GRAY).astype(np.float32)
    fl = cv2.calcOpticalFlowFarneback(g0.astype(np.uint8), g1.astype(np.uint8), None, 0.5, 3, 15, 3, 5, 1.2, 0)
    mag = np.sqrt(fl[..., 0] ** 2 + fl[..., 1] ** 2)
    gx = cv2.Sobel(g1, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g1, cv2.CV_32F, 0, 1, ksize=3)
    ux, uy = fl[..., 0] / (mag + 1e-6), fl[..., 1] / (mag + 1e-6)
    par = np.abs(gx * ux + gy * uy)
    mask = (mag > 2.0) & (par > 0)
    if mask.sum() < 100: return None
    lim = np.percentile(par[mask], 80)
    ys, xs = np.where(mask & (par >= lim))
    if len(ys) < 20: return None
    sel = np.random.default_rng(0).choice(len(ys), min(300, len(ys)), replace=False)
    R = 14; t = np.arange(-R, R + 1, dtype=np.float32)
    larg = []
    for k in sel:
        y, x = ys[k], xs[k]; dx, dy = ux[y, x], uy[y, x]
        mx = (x + t * dx).reshape(1, -1).astype(np.float32); my = (y + t * dy).reshape(1, -1).astype(np.float32)
        perf = cv2.remap(g1, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[0]
        a, b = perf[:R].mean() if False else perf[0], perf[-1]
        if abs(b - a) < 25: continue
        n = (perf - a) / (b - a)
        n = np.maximum.accumulate(np.clip(n, 0, 1)) if b > a or True else n
        i10 = np.argmax(n >= 0.1); i90 = np.argmax(n >= 0.9)
        if i90 > i10: larg.append(i90 - i10)
    if len(larg) < 10: return None
    return float(np.median(larg)), float(np.median(mag[mask]))


def borrao(F, M, MV):
    """Motion blur medido pela largura das bordas ao longo do movimento no quadro mais rápido de cada movimento:
    obturador estimado = (largura - largura sem borrão) / velocidade. 0 = sem borrão; 0,5 = obturador de 180 graus."""
    est = []
    for m in MV:
        vel = [M[q]["mov"] for q in range(m["ini"], m["fim"])]
        if not vel: continue
        pico = m["ini"] + int(np.argmax(vel))
        if pico < 1: continue
        r = _largura_bordas(F, pico)
        if r and r[1] > 4: est.append(max(0.0, 0.76 * (r[0] - 2.0) / r[1]))   # 0,76: calibração com o teste de 180 graus
    if len(est) < 2: return {"tem_borrao": None, "nota": "pouco movimento rápido para medir"}
    o = float(np.median(est))
    return {"tem_borrao": o > 0.12, "obturador_estimado": round(o, 2), "graus_estimados": int(round(min(o, 1) * 360)), "movimentos_medidos": len(est),
            "nota": "sem borrão" if o <= 0.12 else f"borrão de movimento, obturador de uns {int(round(min(o, 1) * 360))} graus"}


def em_dois(M, MV):
    tot = sum(m["quadros"] for m in MV); rep = sum(m["quadros_repetidos"] for m in MV)
    return {"fracao_repetidos_no_movimento": round(rep / tot, 3) if tot else 0,
            "animado_em_dois": bool(tot and rep / tot > 0.35)}


def paleta(F, P, k=8):
    from sklearn.cluster import KMeans
    def km(px, k):
        lab = cv2.cvtColor(px.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
        k = min(k, len(np.unique(lab, axis=0)))
        m = KMeans(n_clusters=k, n_init=3, random_state=0).fit(lab)
        cont = np.bincount(m.labels_, minlength=k) / len(lab)
        cores = cv2.cvtColor(m.cluster_centers_.astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(-1, 3)
        o = np.argsort(-cont)
        return [{"hex": "#%02X%02X%02X" % tuple(int(v) for v in cores[i]), "prop": round(float(cont[i]), 3)} for i in o if cont[i] > 0.005]
    rng = np.random.default_rng(0)
    por, todas = [], []
    for p in P:
        qs = [p["ini"] + int(p["quadros"] * f) for f in (0.2, 0.5, 0.85)]
        px = np.concatenate([F[min(q, len(F) - 1)][::4, ::4].reshape(-1, 3) for q in qs])
        todas.append(px[rng.choice(len(px), min(len(px), 3000), replace=False)])
        por.append({"plano": p["n"], "cores": km(px, 5)})
    geral = km(np.concatenate(todas), k)
    borda = np.concatenate([np.concatenate([f[0], f[-1], f[:, 0], f[:, -1]]) for f in F[:: max(1, len(F) // 40)]])
    q = (borda // 16) * 16 + 8; vals, cont = np.unique(q, axis=0, return_counts=True)
    fundo = "#%02X%02X%02X" % tuple(int(v) for v in vals[np.argmax(cont)])
    return {"geral": geral, "fundo_provavel": fundo, "por_plano": por}


def textos(v, P, MV, fps, saida, de, info):
    if not os.path.exists(TEXTOS): return {"erro": "leitor de texto não instalado"}
    tmp = tempfile.mkdtemp(prefix="txt_")
    alvos = {}
    for p in P:
        for f in (0.5, 0.9):
            alvos[p["ini"] + int(p["quadros"] * f)] = p["n"]
    for m in MV:
        alvos.setdefault(min(m["fim"] + 2, P[-1]["fim"] - 1), m["plano"])
    arqs = {}
    for q in sorted(alvos):
        a = os.path.join(tmp, f"{q:06d}.png")
        subprocess.run([FF, "-v", "error", "-y", "-ss", str(de + q / fps), "-i", v, "-frames:v", "1", a])
        if os.path.exists(a): arqs[a] = q
    res = {}
    lista = sorted(arqs)
    for i in range(0, len(lista), 60):
        r = subprocess.run([TEXTOS] + lista[i:i + 60], capture_output=True, text=True).stdout
        for ln in r.strip().splitlines():
            d = json.loads(ln); q = arqs[d["img"]]
            res[q] = [{"t": t["t"], "c": t["c"], "x": round(t["x"], 3), "y": round(t["y"], 3), "w": round(t["w"], 3), "h": round(t["h"], 3),
                       "altura_pct": round(t["h"] * 100, 1)} for t in d["textos"] if t["c"] >= 0.3]
    shutil.rmtree(tmp, ignore_errors=True)
    porp = {}
    for q, ts in sorted(res.items()):
        porp.setdefault(alvos[q], []).append({"q": q, "s": round(q / fps, 2), "textos": ts})
    todas_h = [t["altura_pct"] for v_ in res.values() for t in v_]
    return {"por_plano": porp, "alturas_pct": sorted(set(round(h) for h in todas_h)),
            "alinhamento": alinhamento([t for v_ in res.values() for t in v_])}


def alinhamento(T):
    if not T: return None
    cx = [t["x"] + t["w"] / 2 for t in T]; lx = [t["x"] for t in T]
    cen = sum(1 for c in cx if abs(c - 0.5) < 0.06) / len(T)
    esq = np.std(lx) < 0.05 and np.mean(lx) < 0.35
    return {"centralizado_frac": round(cen, 2), "esquerda_alinhada": bool(esq), "x_esquerdo_medio": round(float(np.mean(lx)), 3)}


def audio(v, saida, P, MV, fps, de, ate):
    import librosa
    wav = os.path.join(saida, "som.wav")
    subprocess.run([FF, "-v", "error", "-y", "-ss", str(de)] + (["-t", str(ate - de)] if ate else []) + ["-i", v, "-vn", "-ac", "1", "-ar", "22050", wav])
    if not os.path.exists(wav) or os.path.getsize(wav) < 2000: return {"tem_som": False}
    y, sr = librosa.load(wav, sr=22050)
    tempo, bt = librosa.beat.beat_track(y=y, sr=sr)
    batidas = librosa.frames_to_time(bt, sr=sr)
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    ons = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, units="time", backtrack=False)
    rms = librosa.feature.rms(y=y)[0]
    rt = librosa.times_like(rms, sr=sr)
    def mais_perto(t, lista):
        if len(lista) == 0: return None
        i = int(np.argmin(np.abs(np.array(lista) - t))); return round((lista[i] - t) * fps, 1)
    cortes = [p["ini_s"] for p in P[1:]]
    corte_batida = [mais_perto(c, batidas) for c in cortes]
    mov_som = [mais_perto(m["ini_s"], ons) for m in MV]                       # negativo = som antes do movimento
    nb = [abs(x) for x in corte_batida if x is not None]
    silencio = [round(float(t), 2) for t, r in zip(rt, rms) if r < 0.01][::10]
    return {"tem_som": True, "bpm": round(float(np.atleast_1d(tempo)[0]), 1), "batidas_s": [round(float(t), 3) for t in batidas],
            "ataques_s": [round(float(t), 3) for t in ons], "n_ataques": int(len(ons)),
            "cortes_na_batida_frac": round(sum(1 for x in nb if x <= 2) / len(nb), 2) if nb else None,
            "corte_menos_batida_quadros": corte_batida, "som_menos_movimento_quadros": mov_som,
            "volume_medio_db": round(float(20 * np.log10(np.mean(rms) + 1e-9)), 1), "trechos_silencio_s": silencio[:40]}


def folhas(F, P, M, MV, A, saida, fps, info):
    os.makedirs(os.path.join(saida, "folhas"), exist_ok=True)
    th = 180; tw = int(round(th * F.shape[2] / F.shape[1]))
    def tile(q, rot):
        im = cv2.cvtColor(cv2.resize(F[min(q, len(F) - 1)], (tw, th)), cv2.COLOR_RGB2BGR)
        cv2.putText(im, rot, (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA)
        return im
    ts = [tile(p["ini"] + p["quadros"] // 2, f'#{p["n"]} {p["ini_s"]:.2f}s {p["dur_s"]:.2f}s') for p in P]
    por = max(1, 1600 // tw)
    while len(ts) % por: ts.append(np.zeros_like(ts[0]))
    cv2.imwrite(os.path.join(saida, "folhas", "storyboard.jpg"), np.vstack([np.hstack(ts[i:i + por]) for i in range(0, len(ts), por)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    for p in P:
        n = min(8, max(2, p["quadros"]))
        qs = [p["ini"] + int(i * (p["quadros"] - 1) / (n - 1)) for i in range(n)]
        t2 = [tile(q, f'q{q - p["ini"]} {q / fps:.2f}s') for q in qs]
        while len(t2) % 4: t2.append(np.zeros_like(t2[0]))
        cv2.imwrite(os.path.join(saida, "folhas", f'plano_{p["n"]:02d}.jpg'), np.vstack([np.hstack(t2[i:i + 4]) for i in range(0, len(t2), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
    # gráfico de energia
    W, H = 1600, 360; img = np.full((H, W, 3), 24, np.uint8); n = len(M)
    E = np.array([m["mov"] for m in M]); mx = E.max() or 1
    xs = lambda q: int(q / max(1, n - 1) * (W - 20)) + 10
    for p in P[1:]: cv2.line(img, (xs(p["ini"]), 0), (xs(p["ini"]), H), (60, 60, 230), 1)
    for b in (A.get("batidas_s") or []): cv2.line(img, (xs(b * fps), H - 18), (xs(b * fps), H), (40, 160, 230), 1)
    for o in (A.get("ataques_s") or []): cv2.circle(img, (xs(o * fps), H - 28), 2, (80, 220, 80), -1)
    pts = np.array([[xs(i), int(H - 40 - E[i] / mx * (H - 60))] for i in range(n)], np.int32)
    cv2.polylines(img, [pts], False, (240, 240, 240), 1, cv2.LINE_AA)
    for m in MV: cv2.rectangle(img, (xs(m["ini"]), 4), (xs(m["fim"]), 10), (0, 200, 255), -1)
    cv2.putText(img, "branco = movimento | vermelho = corte | laranja = batida | verde = ataque de som | amarelo = animacao", (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
    cv2.imwrite(os.path.join(saida, "folhas", "energia.png"), img)


def resumo(info, P, MV, B, D2, PAL, T, A):
    durs = [p["dur_s"] for p in P]
    tipos = {}
    for m in MV: tipos[m["tipo"]] = tipos.get(m["tipo"], 0) + 1
    seg = sorted(m["seg"] for m in MV)
    return {"planos": len(P), "dur_media_plano_s": round(float(np.mean(durs)), 2), "dur_mediana_plano_s": round(float(np.median(durs)), 2),
            "cortes_por_minuto": round(60 * (len(P) - 1) / info["duracao_analisada"], 1),
            "movimentos": len(MV), "tipos_de_curva": tipos,
            "duracao_movimento_mediana_q": int(np.median([m["quadros"] for m in MV])) if MV else None,
            "duracao_movimento_mediana_s": round(float(np.median(seg)), 3) if seg else None,
            "borrao": B, "animacao_em_dois": D2, "cor_de_fundo": PAL["fundo_provavel"],
            "paleta": PAL["geral"][:6], "tamanhos_de_texto_pct_altura": T.get("alturas_pct"),
            "bpm": A.get("bpm"), "cortes_na_batida": A.get("cortes_na_batida_frac")}


def main():
    v, saida, op = args()
    os.makedirs(saida, exist_ok=True)
    info = info_video(v)
    ate = op["ate"] if op["ate"] else info["duracao"]
    info["de"], info["ate"] = op["de"], ate; info["duracao_analisada"] = round(ate - op["de"], 3)
    fps = info["fps"]
    w = 480; h = int(round(w * info["altura"] / info["largura"] / 2) * 2)
    print("lendo quadros...", flush=True)
    F = quadros(v, w, h, op["de"], op["ate"])
    print(len(F), "quadros; medindo movimento...", flush=True)
    M = metricas(F)
    P = planos(M, fps)
    MV = movimentos(M, P, fps)
    B = borrao(F, M, MV); D2 = em_dois(M, MV)
    print(len(P), "planos,", len(MV), "movimentos; cores...", flush=True)
    PAL = paleta(F, P)
    print("textos...", flush=True)
    T = textos(v, P, MV, fps, saida, op["de"], info)
    print("som...", flush=True)
    A = audio(v, saida, P, MV, fps, op["de"], op["ate"]) if info["tem_som"] else {"tem_som": False}
    folhas(F, P, M, MV, A, saida, fps, info)
    import extras as X
    print("composição, cor, transições, escada, texto...", flush=True)
    EX = {"composicao": X.composicao(F, P, T), "cor_luz": X.cor_luz(v, F, P, info, op["de"], PAL), "transicoes": X.transicoes(M, P, fps),
          "ritmo_planos": X.ritmo_planos(M, P, MV, fps), "escada": X.escada(M, MV, fps), "camera": X.camera(M, MV),
          "texto_entrada": X.texto_entrada(v, P, T, fps, op["de"], TEXTOS), "tecnico": X.tecnico(v)}
    if info["tem_som"] and not op["sem-camadas"]:
        print("separando voz, trilha e efeitos...", flush=True)
        EX["camadas"] = X.camadas(saida, fps, P, MV, op["de"], ate, v)
    R = resumo(info, P, MV, B, D2, PAL, T, A)
    R.update({"transicoes": EX["transicoes"]["tipos"], "escada": EX["escada"].get("passo_mediano_q"), "profundidade": EX["camera"].get("profundidade"),
              "texto_entra": EX["texto_entrada"].get("modos"), "espaco_vazio": EX["composicao"].get("espaco_vazio_frac"),
              "grao": EX["cor_luz"].get("grao_nota"), "proporcao_cor": EX["cor_luz"].get("proporcao_por_papel")})
    for nome, obj in (("info", info), ("metricas", M), ("planos", P), ("movimentos", MV), ("paleta", PAL), ("textos", T), ("audio", A), ("extras", EX)):
        json.dump(obj, open(os.path.join(saida, f"{nome}.json"), "w"), ensure_ascii=False)
    json.dump({"info": info, "resumo": R, "planos": P, "movimentos": MV, "paleta": PAL, "textos": T, "audio": A, "extras": EX},
              open(os.path.join(saida, "analise.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(R, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
