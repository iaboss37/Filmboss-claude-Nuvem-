"""Passa as medidas da análise para o projeto Remotion (src/estilo/estilo.json) e põe fontes e sons no projeto.

  python estilo.py medidas <analise.json> <projeto_remotion>
      curvas (cubic-bezier mediana por tipo), tempos em quadros, obturador, em dois, fps, tamanho e cores
  python estilo.py fonte <projeto_remotion> "Familia" <peso> <papel> [--original "Fonte da referência"] [--comparacao ranking.json]
      copia a fonte (Google Fonts ou Fontshare, licença livre) para public/fonts e registra em estilo.json com o papel
      (titulo, texto, rotulo, numero...), de onde baixar, a licença, a fonte original que ela substitui, a nota de
      parecença e as medidas da referência (do ranking.json do fonte.py comparar). No código: fontFamily: FONTE.titulo
  python estilo.py sfx <projeto_remotion> <arquivo de som> <nome>
      copia o som para public/sfx/<nome>.<ext> e mede o ataque (src/estilo/sfx.json). No código: <Efeito som="nome" .../>
  python estilo.py cor <projeto_remotion> <nome> <#RRGGBB>
      grava uma cor com nome em estilo.json (COR.nome no código)
"""
import json, os, sys, shutil, subprocess, colorsys
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "..", "analise"))

GRUPO = {"sai rápido e freia (chegada)": "chegada", "acelera e freia suave (troca)": "troca",
         "começa devagar e acelera (saída)": "saida", "passa do ponto e volta (pop)": "pop", "linear": "linear"}


def caminho_estilo(proj):
    return os.path.join(proj, "src", "estilo", "estilo.json")


def ler(proj):
    return json.load(open(caminho_estilo(proj)))


def gravar(proj, E):
    json.dump(E, open(caminho_estilo(proj), "w"), ensure_ascii=False, indent=2)


def hex_rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def luz(h):
    r, g, b = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hex_rgb(h)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    la, lb = sorted((luz(a), luz(b)), reverse=True); return (la + 0.05) / (lb + 0.05)


def medidas(analise, proj):
    A = json.load(open(analise)); E = ler(proj)
    info, R, MV = A["info"], A["resumo"], A["movimentos"]
    fps = info["fps"]; E["fps"] = int(round(fps)) if abs(fps - round(fps)) < 0.01 else fps
    E["largura"], E["altura"] = info["largura"], info["altura"]
    E["nome"] = E.get("nome", "molde")
    # curvas: mediana dos pontos de controle dos movimentos bem ajustados de cada tipo
    grupos = {}
    for m in MV:
        if m.get("erro_curva", 1) > 0.05: continue
        grupos.setdefault(GRUPO.get(m["tipo"], "troca"), []).append(m)
    curvas, tempos = {}, dict(E.get("tempos", {}))
    for g, ms in grupos.items():
        if g in ("pop", "linear"): continue
        c = np.median(np.array([m["curva"] for m in ms]), axis=0)
        curvas[g] = [round(float(v), 3) for v in c]
    E["curvas"] = {**E.get("curvas", {}), **curvas}
    E["contagem_curvas"] = {g: len(ms) for g, ms in grupos.items()}
    E["pop"] = {"existe": "pop" in grupos, "excesso": E.get("pop", {}).get("excesso", 1.7)}
    dur = lambda g: int(round(np.median([m["quadros"] for m in grupos[g]]))) if grupos.get(g) else None
    tempos["chegada"] = dur("chegada") or dur("troca") or tempos.get("chegada", 6)
    tempos["troca"] = dur("troca") or tempos.get("chegada")
    tempos["saida"] = dur("saida") or tempos.get("saida", 4)
    if grupos.get("pop"): tempos["pop"] = dur("pop")
    tempos["plano"] = int(round(R["dur_mediana_plano_s"] * fps))
    tempos["planoMedio"] = int(round(R["dur_media_plano_s"] * fps))
    # maior intervalo sem nenhum evento (corte ou movimento), em quadros
    ev = sorted([p["ini"] for p in A["planos"]] + [m["ini"] for m in MV])
    vaos = np.diff(ev) if len(ev) > 1 else [tempos.get("maxSemEvento", 12)]
    tempos["maxSemEvento"] = int(np.percentile(vaos, 90))
    if R.get("bpm"): tempos["batida"] = round(60 * fps / R["bpm"], 2); E["bpm"] = R["bpm"]
    E["tempos"] = tempos
    B = R.get("borrao") or {}
    if B.get("tem_borrao") is not None: E["obturador"] = B["obturador_estimado"] if B["tem_borrao"] else 0
    E["emDois"] = bool((R.get("animacao_em_dois") or {}).get("animado_em_dois"))
    # câmera: zoom lento medido nos movimentos dominados por zoom e longos
    zl = [m["zoom_total"] for m in MV if m["dominante"] == "zoom" and m["quadros"] > fps]
    if zl: E["camera"]["aproximacao"] = [1, round(1 + float(np.median(np.abs(zl))), 3)]
    # cores
    fundo = R["cor_de_fundo"]; pal = [c["hex"] for c in A["paleta"]["geral"]]
    texto = max(pal, key=lambda h: contraste(h, fundo))
    sat = lambda h: colorsys.rgb_to_hsv(*hex_rgb(h))[1] * (0.4 + colorsys.rgb_to_hsv(*hex_rgb(h))[2])
    resto = [h for h in pal if h not in (texto,) and contraste(h, fundo) > 1.6] or pal
    destaque = max(resto, key=sat)
    cores = dict(E.get("cores", {})); cores.update({"fundo": fundo, "texto": texto, "destaque": destaque})
    for i, h in enumerate(pal): cores.setdefault(f"p{i + 1}", h)
    E["cores"] = cores
    # o resto dos 10 pontos que o código usa ou que a skill consulta
    X = A.get("extras") or {}
    es = X.get("escada") or {}
    if es.get("tem_escada"): tempos["escada"] = es["passo_mediano_q"]
    te = X.get("texto_entrada") or {}
    if te.get("modos"):
        modo = max(te["modos"].items(), key=lambda t: t[1])[0]
        qpp = [r["quadros_por_palavra"] for r in te.get("por_plano", []) if r.get("quadros_por_palavra")]
        E["texto"] = {"entrada_principal": modo, "modos": te["modos"], "entrelinha": te.get("entrelinha_mediana"),
                      "quadros_por_palavra": round(float(np.median(qpp)), 1) if qpp else None}
        if qpp: tempos["palavra"] = round(float(np.median(qpp)), 1)
    co = X.get("composicao") or {}
    E["composicao"] = {k: co.get(k) for k in ("margem_texto_min_pct", "margem_lateral_pct", "colunas_esquerda_pct", "texto_vertical",
                                               "niveis_texto_pct", "proporcao_entre_niveis", "espaco_vazio_frac") if co.get(k) is not None}
    cl = X.get("cor_luz") or {}
    E["luz"] = {k: cl.get(k) for k in ("contraste", "saturacao_media", "grao", "grao_nota", "vinheta_cantos_sobre_centro", "proporcao_por_papel") if cl.get(k) is not None}
    tr = X.get("transicoes") or {}
    if tr.get("tipos"): E["transicoes"] = tr["tipos"]
    ca = X.get("camera") or {}
    if ca.get("profundidade"): E["camera"]["profundidade"] = ca["profundidade"]
    so = X.get("camadas") or {}
    if so.get("separado"):
        ef = so.get("efeitos") or {}
        E["som"] = {"proporcao_energia": so.get("proporcao_energia"), "trilha_db": (so.get("trilha") or {}).get("volume_medio_db"),
                    "efeitos_db": ef.get("volume_medio_db"), "cortes_com_efeito": ef.get("cortes_com_efeito_frac"),
                    "efeito_menos_corte_q": ef.get("efeito_menos_corte_q"), "movimentos_com_efeito": ef.get("movimentos_com_efeito_frac"),
                    "efeito_menos_movimento_q": ef.get("efeito_menos_movimento_q"), "bpm": (so.get("trilha") or {}).get("bpm")}
    E["tempos"] = tempos
    gravar(proj, E)
    print(json.dumps({k: E[k] for k in ("fps", "largura", "altura", "curvas", "tempos", "obturador", "emDois", "cores", "texto", "transicoes", "som") if k in E}, ensure_ascii=False, indent=1))


def fonte(proj, familia, peso, papel, *extra):
    from fonte import baixar, origem
    ex = list(extra); original = comparacao = None
    if "--original" in ex: i = ex.index("--original"); original = ex[i + 1]
    if "--comparacao" in ex: i = ex.index("--comparacao"); comparacao = json.load(open(ex[i + 1]))
    pesos = baixar(familia)
    if not pesos: sys.exit(f"não achei {familia} no Google Fonts nem no Fontshare")
    peso = int(peso)
    p, arq = min(pesos, key=lambda t: abs(t[0] - peso) if t[0] else 0)
    familia = familia.split(":", 1)[-1].strip() if familia.lower().startswith("fontshare:") else familia
    nome = f"{familia.replace(' ', '')}-{p or 'VF'}{os.path.splitext(arq)[1]}"
    os.makedirs(os.path.join(proj, "public", "fonts"), exist_ok=True)
    shutil.copy(arq, os.path.join(proj, "public", "fonts", nome))
    E = ler(proj)
    E["fontes"] = [f for f in E.get("fontes", []) if f.get("papel") != papel]
    item = {"papel": papel, "familia": f"{familia} {papel}", "nome": familia, "arquivo": nome, "peso": str(p or "100 900"), **origem(familia)}
    if original: item["substitui"] = original
    if comparacao:
        item["medidas_referencia"] = comparacao.get("medidas_referencia")
        r = next((r for r in comparacao.get("ranking", []) if r["familia"].split(":")[-1].strip() == familia and r["peso"] == p), None)
        if r: item["parecenca"] = {"nota": r["nota"], "sobreposicao": r["sobreposicao"], "largura_rel": r["largura_rel"]}
    E["fontes"].append(item)
    gravar(proj, E)
    print(f"ok {papel}: {familia} {p} -> public/fonts/{nome}")


def sfx(proj, arquivo, nome):
    if os.path.basename(arquivo).startswith("._"): sys.exit("arquivo ._ é sobra do exFAT, não é som: escolha o arquivo sem ._")
    ext = os.path.splitext(arquivo)[1].lower()
    os.makedirs(os.path.join(proj, "public", "sfx"), exist_ok=True)
    shutil.copy(arquivo, os.path.join(proj, "public", "sfx", nome + ext))
    py = os.environ.get("BOSS_PY") or sys.executable
    subprocess.run([py, os.path.join(proj, "scripts", "medir_sfx.py")], check=True)


def cor(proj, nome, hx):
    E = ler(proj); E.setdefault("cores", {})[nome] = hx.upper(); gravar(proj, E); print("ok", nome, hx)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    {"medidas": medidas, "fonte": fonte, "sfx": sfx, "cor": cor}[a[0]](*a[1:])
