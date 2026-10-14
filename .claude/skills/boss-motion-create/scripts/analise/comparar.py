"""Compara a recriação com a referência: medidas lado a lado, nota de 0 a 100 por item e vídeo lado a lado.

Uso:  python comparar.py <referencia> <analise_da_referencia.json> <recriacao.mp4> <pasta_saida> [--de 0] [--ate SEG]
(--de/--ate: o trecho da referência que foi recriado, o mesmo usado na análise)

Modo estilo (vídeo NOVO feito no estilo, sem a referência):
      python comparar.py --estilo <medidas_do_estilo.json> <video_novo.mp4> <pasta_saida> [--sem-camadas]
      compara só o que é do estilo (ritmo, curvas, tempos, borrão, cores, transições, texto, escada, margem, som),
      nada que dependa do conteúdo. Gera comparacao.json e comparacao.md com a nota de fidelidade ao estilo.
Gera: comparacao.json, comparacao.md (tabela para mostrar ao Rick), lado_a_lado.mp4 (com o som da recriação),
      folha_comparacao.jpg (quadros nos mesmos tempos, referência em cima e recriação embaixo), analise_recriacao/
"""
import json, os, sys, subprocess, shutil, math
import numpy as np, cv2

AQUI = os.path.dirname(os.path.abspath(__file__))
FF = shutil.which("ffmpeg") or os.path.expanduser("~/.cargo/bin/ffmpeg")
sys.path.insert(0, AQUI)
from analisar import info_video, quadros  # noqa: E402


def args():
    a = sys.argv[1:]
    op = {"de": 0.0, "ate": None, "estilo": False, "sem-camadas": False}
    for k in ("estilo", "sem-camadas"):
        if f"--{k}" in a: a.remove(f"--{k}"); op[k] = True
    if op["estilo"]:
        if len(a) < 3: sys.exit(__doc__)
        return None, a[0], a[1], a[2], op
    if len(a) < 4: sys.exit(__doc__)
    for k in ("de", "ate"):
        if f"--{k}" in a:
            i = a.index(f"--{k}"); op[k] = float(a[i + 1]); del a[i:i + 2]
    return a[0], a[1], a[2], a[3], op


def lab(h):
    h = h.lstrip("#"); px = np.uint8([[[int(h[i:i + 2], 16) for i in (0, 2, 4)]]])
    return cv2.cvtColor(px, cv2.COLOR_RGB2LAB)[0, 0].astype(float) * [100 / 255, 1, 1] - [0, 128, 128]


def de(a, b):
    return float(np.linalg.norm(lab(a) - lab(b)))


def nota_razao(a, b):
    """Medidas de um mesmo vídeo variam um pouco (ruído da medição): curvas ~0,05 e obturador ~0,05 já descontados.
    100 quando iguais; cai conforme a razão se afasta de 1 (o dobro ou a metade = 50)."""
    if not a or not b: return None
    return round(100 * min(a, b) / max(a, b))


def nota_dist(d, escala):
    return round(100 * math.exp(-d / escala)) if d is not None else None


def distrib(tipos):
    chaves = ["sai rápido e freia (chegada)", "acelera e freia suave (troca)", "começa devagar e acelera (saída)", "passa do ponto e volta (pop)", "linear"]
    v = np.array([tipos.get(k, 0) for k in chaves], float)
    return v / (v.sum() or 1)


def main():
    ref, analise_ref, rec, saida, op = args()
    os.makedirs(saida, exist_ok=True)
    py = sys.executable
    ar = os.path.join(saida, "analise_recriacao")
    if not os.path.exists(os.path.join(ar, "analise.json")):
        subprocess.run([py, os.path.join(AQUI, "analisar.py"), rec, ar] + (["--sem-camadas"] if op["sem-camadas"] else []), check=True, stdout=subprocess.DEVNULL)
    estilo = op["estilo"]
    A = json.load(open(analise_ref)); B = json.load(open(os.path.join(ar, "analise.json")))
    ra, rb = A["resumo"], B["resumo"]
    itens = []

    def item(nome, ref_v, rec_v, nota, peso, explica):
        itens.append({"item": nome, "referencia": ref_v, "recriacao": rec_v, "nota": nota, "peso": peso, "o_que_e": explica})

    item("Duração dos planos (mediana, s)", ra["dur_mediana_plano_s"], rb["dur_mediana_plano_s"], nota_razao(ra["dur_mediana_plano_s"], rb["dur_mediana_plano_s"]), 2, "ritmo de corte")
    item("Cortes por minuto", ra["cortes_por_minuto"], rb["cortes_por_minuto"], nota_razao(ra["cortes_por_minuto"] or 0.1, rb["cortes_por_minuto"] or 0.1), 1, "ritmo de corte")
    item("Duração dos movimentos (mediana, quadros)", ra["duracao_movimento_mediana_q"], rb["duracao_movimento_mediana_q"], nota_razao(ra["duracao_movimento_mediana_q"], rb["duracao_movimento_mediana_q"]), 3, "velocidade das animações")
    da, db = distrib(ra["tipos_de_curva"]), distrib(rb["tipos_de_curva"])
    item("Tipos de curva", ra["tipos_de_curva"], rb["tipos_de_curva"], round(100 * (1 - 0.5 * np.abs(da - db).sum())), 3, "como as coisas aceleram e freiam")
    # curva mediana de cada tipo
    def med(MV, tipo):
        c = [m["curva"] for m in MV if m["tipo"] == tipo and m.get("erro_curva", 1) <= 0.05]
        return np.median(np.array(c), axis=0) if c else None
    ds = []
    for t in ("sai rápido e freia (chegada)", "acelera e freia suave (troca)", "começa devagar e acelera (saída)"):
        x, y = med(A["movimentos"], t), med(B["movimentos"], t)
        if x is not None and y is not None: ds.append(float(np.abs(x - y).mean()))
    item("Forma das curvas (diferença média dos pontos)", None, round(float(np.mean(ds)), 3) if ds else None, nota_dist(max(0, np.mean(ds) - 0.04), 0.15) if ds else None, 3, "o desenho exato da aceleração")
    oa = (ra.get("borrao") or {}).get("obturador_estimado"); ob = (rb.get("borrao") or {}).get("obturador_estimado")
    item("Borrão de movimento (obturador)", oa, ob, nota_dist(max(0, abs(oa - ob) - 0.05), 0.2) if oa is not None and ob is not None else None, 2, "rastro nas coisas rápidas")
    item("Cor de fundo (diferença ΔE)", ra["cor_de_fundo"], rb["cor_de_fundo"], nota_dist(de(ra["cor_de_fundo"], rb["cor_de_fundo"]), 12), 2, "abaixo de 3 é igual ao olho")
    # paleta: cada cor da referência procura a mais perto na recriação, pesada pela proporção
    pa, pb = A["paleta"]["geral"], B["paleta"]["geral"]
    dpal = sum(c["prop"] * min(de(c["hex"], d["hex"]) for d in pb) for c in pa) / sum(c["prop"] for c in pa)
    item("Paleta (diferença ΔE média)", [c["hex"] for c in pa[:5]], [c["hex"] for c in pb[:5]], nota_dist(dpal, 15), 2, "cores e proporção")
    # energia: curva de movimento quadro a quadro, reamostrada para o mesmo tamanho (só contra a própria referência)
    if not estilo:
      ea = np.array([m["mov"] for m in json.load(open(os.path.join(os.path.dirname(analise_ref), "metricas.json")))])
      eb = np.array([m["mov"] for m in json.load(open(os.path.join(ar, "metricas.json")))])
      n = min(len(ea), len(eb)); ea2 = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(ea)), ea); eb2 = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(eb)), eb)
      cor = float(np.corrcoef(ea2, eb2)[0, 1]) if ea2.std() > 0 and eb2.std() > 0 else 0
      item("Energia ao longo do tempo (correlação)", None, round(cor, 2), round(100 * max(0, cor)), 3, "os picos de movimento caem nos mesmos lugares")
    if ra.get("bpm") and rb.get("bpm") and not estilo:
        item("Ritmo do som (BPM)", ra["bpm"], rb["bpm"], nota_razao(ra["bpm"], rb["bpm"]), 1, "andamento da trilha")
    # pontos medidos em extras (composição, texto, transições, escada, luz, som em camadas)
    xa, xb = A.get("extras") or {}, B.get("extras") or {}
    def dist_tipos(a, b):
        ks = set(a) | set(b)
        if not ks: return None
        va = np.array([a.get(k, 0) for k in ks], float); vb = np.array([b.get(k, 0) for k in ks], float)
        va /= va.sum() or 1; vb /= vb.sum() or 1
        return round(100 * (1 - 0.5 * np.abs(va - vb).sum()))
    ta, tb = (xa.get("transicoes") or {}).get("tipos", {}), (xb.get("transicoes") or {}).get("tipos", {})
    if ta: item("Tipos de transição", ta, tb, dist_tipos(ta, tb), 2, "como um plano passa para o outro")
    ma, mb = (xa.get("texto_entrada") or {}).get("modos", {}), (xb.get("texto_entrada") or {}).get("modos", {})
    # a leitura de texto varia um pouco entre resoluções: 15 pontos de tolerância
    if ma: item("Como o texto entra", ma, mb, min(100, dist_tipos(ma, mb) + 15), 2, "letra, palavra, linha ou inteiro")
    ea_, eb_ = xa.get("escada") or {}, xb.get("escada") or {}
    if ea_.get("tem_escada") or eb_.get("tem_escada"):
        pa_, pb_ = ea_.get("passo_mediano_q"), eb_.get("passo_mediano_q")
        item("Atraso entre elementos (escada, quadros)", pa_, pb_, nota_razao(pa_, pb_) if pa_ and pb_ else 0, 2, "elementos entrando um depois do outro")
    va, vb = (xa.get("composicao") or {}).get("espaco_vazio_frac"), (xb.get("composicao") or {}).get("espaco_vazio_frac")
    if va is not None and vb is not None: item("Espaço vazio na tela", va, vb, nota_dist(abs(va - vb), 0.15), 1, "respiro da composição")
    la, lb = (xa.get("composicao") or {}).get("margem_texto_min_pct"), (xb.get("composicao") or {}).get("margem_texto_min_pct")
    if la is not None and lb is not None: item("Margem segura do texto (%)", la, lb, nota_dist(abs(la - lb), 4), 1, "distância do texto até a borda")
    pa2, pb2 = (xa.get("cor_luz") or {}).get("proporcao_por_papel"), (xb.get("cor_luz") or {}).get("proporcao_por_papel")
    if pa2 and pb2: item("Proporção das cores por papel", pa2, pb2, round(100 * (1 - 0.5 * sum(abs(pa2.get(k, 0) - pb2.get(k, 0)) for k in set(pa2) | set(pb2)))), 2, "quanto de fundo, texto e destaque")
    ga, gb = (xa.get("cor_luz") or {}).get("grao"), (xb.get("cor_luz") or {}).get("grao")
    if ga is not None and gb is not None: item("Grão", ga, gb, nota_dist(max(0, abs(ga - gb) - 0.3), 1.0), 1, "textura de filme na imagem")
    sa, sb = (xa.get("camadas") or {}).get("efeitos") or {}, (xb.get("camadas") or {}).get("efeitos") or {}
    if sa.get("cortes_com_efeito_frac") is not None and sb.get("cortes_com_efeito_frac") is not None:
        item("Efeitos sonoros nos cortes", sa["cortes_com_efeito_frac"], sb["cortes_com_efeito_frac"], nota_dist(max(0, abs(sa["cortes_com_efeito_frac"] - sb["cortes_com_efeito_frac"]) - 0.1), 0.25), 2, "quantos cortes têm efeito sonoro")
    pea, peb = (xa.get("camadas") or {}).get("proporcao_energia"), (xb.get("camadas") or {}).get("proporcao_energia")
    if pea and peb: item("Mistura (trilha, efeitos, voz)", pea, peb, round(100 * (1 - 0.5 * sum(abs(pea.get(k, 0) - peb.get(k, 0)) for k in set(pea) | set(peb)))), 1, "volume de cada camada")
    ia, ib = A["info"], B["info"]
    Fa = Fb = []
    if not estilo:
        # semelhança de quadro (desenho e composição), quadros nos mesmos tempos em cinza 96 px
        w = 160; h = int(round(w * ia["altura"] / ia["largura"] / 2) * 2)
        Fa = quadros(ref, w, h, op["de"], op["ate"]); Fb = quadros(rec, w, h, 0, None)
        n = min(len(Fa), len(Fb)); idx = np.linspace(0, n - 1, min(n, 60)).astype(int)
        def ssim(x, y):
            x = cv2.cvtColor(x, cv2.COLOR_RGB2GRAY).astype(float); y = cv2.cvtColor(y, cv2.COLOR_RGB2GRAY).astype(float)
            mx, my = cv2.GaussianBlur(x, (7, 7), 1.5), cv2.GaussianBlur(y, (7, 7), 1.5)
            vx = cv2.GaussianBlur(x * x, (7, 7), 1.5) - mx * mx; vy = cv2.GaussianBlur(y * y, (7, 7), 1.5) - my * my; cxy = cv2.GaussianBlur(x * y, (7, 7), 1.5) - mx * my
            c1, c2 = 6.5, 58.5
            return float((((2 * mx * my + c1) * (2 * cxy + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2))).mean())
        s = [ssim(Fa[i], Fb[i]) for i in idx]
        item("Quadro a quadro (semelhança da imagem)", None, round(float(np.mean(s)), 3), round(100 * min(1, max(0, (np.mean(s) - 0.2) / 0.7))), 2, "composição e desenho nos mesmos tempos")
    validos = [i for i in itens if i["nota"] is not None]
    geral = round(sum(i["nota"] * i["peso"] for i in validos) / sum(i["peso"] for i in validos))
    piores = sorted(validos, key=lambda i: i["nota"])[:3]
    json.dump({"nota_geral": geral, "modo": "estilo" if estilo else "referencia", "itens": itens, "piores": [p["item"] for p in piores],
               "duracao_ref_q": len(Fa), "duracao_rec_q": len(Fb)},
              open(os.path.join(saida, "comparacao.json"), "w"), ensure_ascii=False, indent=1)
    with open(os.path.join(saida, "comparacao.md"), "w") as f:
        if estilo: f.write(f"# Fidelidade ao estilo: nota {geral} de 100\n\n| Item | Estilo | Vídeo novo | Nota |\n|---|---|---|---|\n")
        else: f.write(f"# Comparação com a referência: nota {geral} de 100\n\n| Item | Referência | Recriação | Nota |\n|---|---|---|---|\n")
        for i in itens:
            fmt = lambda v: "" if v is None else (", ".join(v) if isinstance(v, list) else (", ".join(f"{k.split('(')[-1].rstrip(')')} {c}" for k, c in v.items()) if isinstance(v, dict) else str(v).replace(".", ",")))
            f.write(f"| {i['item']} | {fmt(i['referencia'])} | {fmt(i['recriacao'])} | {'' if i['nota'] is None else i['nota']} |\n")
        f.write(f"\nOnde mais se afasta: {', '.join(p['item'] for p in piores)}.\n")
    if estilo:
        print(open(os.path.join(saida, "comparacao.md")).read()); return
    # folha: 8 tempos, referência em cima e recriação embaixo
    W = 480; Hh = int(round(W * ia["altura"] / ia["largura"]))
    Fa2 = quadros(ref, W, Hh // 2 * 2, op["de"], op["ate"]); Fb2 = quadros(rec, W, Hh // 2 * 2, 0, None)
    n = min(len(Fa2), len(Fb2)); ts = np.linspace(0, n - 1, 8).astype(int)
    lin_a = np.hstack([cv2.copyMakeBorder(Fa2[t], 6, 6, 6, 6, cv2.BORDER_CONSTANT, value=(14, 13, 18)) for t in ts])
    lin_b = np.hstack([cv2.copyMakeBorder(Fb2[t], 6, 6, 6, 6, cv2.BORDER_CONSTANT, value=(14, 13, 18)) for t in ts])
    cab = np.full((60, lin_a.shape[1], 3), (14, 13, 18), np.uint8)
    cv2.putText(cab, f"REFERENCIA (cima) x RECRIACAO (baixo)   nota {geral}", (12, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (247, 240, 227), 2)
    cv2.imwrite(os.path.join(saida, "folha_comparacao.jpg"), cv2.cvtColor(np.vstack([cab, lin_a, lin_b]), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    # vídeo lado a lado (em cima e embaixo se for horizontal), som da recriação
    empilha = "vstack" if ia["largura"] >= ia["altura"] else "hstack"
    alt = 540 if empilha == "vstack" else 960
    esc = f"scale=-2:{alt}" if empilha == "hstack" else f"scale=960:-2"
    trecho = ["-ss", str(op["de"])] + (["-t", str(op["ate"] - op["de"])] if op["ate"] else [])
    subprocess.run([FF, "-v", "error", "-y", *trecho, "-i", ref, "-i", rec, "-filter_complex",
                    f"[0:v]{esc},setsar=1,fps={round(ib['fps'], 3)}[a];[1:v]{esc},setsar=1[b];[a][b]{empilha}=shortest=1[v]",
                    "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    os.path.join(saida, "lado_a_lado.mp4")], check=True)
    print(open(os.path.join(saida, "comparacao.md")).read())


if __name__ == "__main__":
    main()
