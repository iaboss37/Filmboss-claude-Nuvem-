"""Ficha forense em HTML (um arquivo só, imagens dentro), nos 10 pontos, para o Rick abrir e ler.

Uso:  python relatorio.py <pasta_da_analise> <saida.html> [--ficha ficha.md] [--comparacao pasta_comparacao] [--titulo "Nome"] [--sem-imagens]
--sem-imagens: ficha só com números, curvas, paleta e textos, sem nenhum quadro da referência (é a que vai dentro da skill de estilo).
- Números, curvas, paleta e folhas vêm da análise (analise.json e folhas/).
- O que depende do olho vem da ficha.md escrita pelo Claude, com seções "## 1" a "## 10" (o texto vai para o ponto de mesmo número).
"""
import base64, html, json, os, re, sys

PONTOS = ["Estrutura e ritmo", "Composição e grade", "Tipografia", "Cor e luz", "Movimento", "Formas e elementos",
          "Imagens e B-roll", "Som", "Narrativa", "Acabamento técnico"]


def args():
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    op = {"ficha": None, "comparacao": None, "titulo": None, "sem-imagens": False}
    if "--sem-imagens" in a: a.remove("--sem-imagens"); op["sem-imagens"] = True
    for k in op:
        if f"--{k}" in a:
            i = a.index(f"--{k}"); op[k] = a[i + 1]; del a[i:i + 2]
    return a[0], a[1], op


def img(caminho, larg=None):
    if not caminho or not os.path.exists(caminho): return ""
    tipo = "png" if caminho.endswith(".png") else "jpeg"
    b = base64.b64encode(open(caminho, "rb").read()).decode()
    return f'<img src="data:image/{tipo};base64,{b}" alt="" loading="lazy">'


def md(t):
    """Markdown simples: parágrafos, listas com -, **negrito**, `código`."""
    out, lista = [], False
    for linha in t.strip().splitlines():
        s = html.escape(linha.strip())
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s); s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
        if s.startswith("- "):
            if not lista: out.append("<ul>"); lista = True
            out.append(f"<li>{s[2:]}</li>"); continue
        if lista: out.append("</ul>"); lista = False
        if s.startswith("### "): out.append(f"<h4>{s[4:]}</h4>")
        elif s: out.append(f"<p>{s}</p>")
    if lista: out.append("</ul>")
    return "\n".join(out)


def ler_ficha(f):
    if not f or not os.path.exists(f): return {}, ""
    t = open(f).read(); partes = re.split(r"^##\s+(\d+)[^\n]*\n", t, flags=re.M)
    sec = {int(partes[i]): partes[i + 1] for i in range(1, len(partes) - 1, 2)}
    return sec, partes[0]


def curva_svg(c, cor="var(--destaque)"):
    x1, y1, x2, y2 = c; S = 120; P = 10
    X = lambda v: P + v * S; Y = lambda v: P + S - v * S
    return (f'<svg viewBox="0 0 {S + 2 * P} {S + 2 * P}" class="curva"><rect x="{P}" y="{P}" width="{S}" height="{S}" class="grade"/>'
            f'<line x1="{X(0)}" y1="{Y(0)}" x2="{X(x1)}" y2="{Y(y1)}" class="alca"/><line x1="{X(1)}" y1="{Y(1)}" x2="{X(x2)}" y2="{Y(y2)}" class="alca"/>'
            f'<path d="M{X(0)},{Y(0)} C{X(x1)},{Y(y1)} {X(x2)},{Y(y2)} {X(1)},{Y(1)}" style="stroke:{cor}" class="linha"/></svg>')


def fmt(v):
    return str(v).replace(".", ",")


def main():
    pasta, saida, op = args()
    if op["sem-imagens"]:
        global img
        img = lambda *_a, **_k: ""
    A = json.load(open(os.path.join(pasta, "analise.json")))
    info, R, P, MV, PAL, T, AU = A["info"], A["resumo"], A["planos"], A["movimentos"], A["paleta"], A["textos"], A["audio"]
    EX = A.get("extras") or {}
    CO, CL, TR, RP, ES, CA, TE, SO, TC = (EX.get(k) or {} for k in ("composicao", "cor_luz", "transicoes", "ritmo_planos", "escada", "camera", "texto_entrada", "camadas", "tecnico"))
    num = lambda v, r: f'<div><b>{v}</b><span>{r}</span></div>'
    pct = lambda v: "?" if v is None else f"{round(100 * v)}%"
    ficha, intro = ler_ficha(op["ficha"])
    titulo = op["titulo"] or os.path.splitext(os.path.basename(info["arquivo"]))[0]
    F = os.path.join(pasta, "folhas")
    blocos = {}
    # 1 estrutura
    G = RP.get("gancho") or {}
    E_ = A.get("extras", {})
    sem_evento = None
    ev = sorted([p["ini"] for p in P] + [m["ini"] for m in MV])
    if len(ev) > 1:
        import numpy as np
        sem_evento = int(max(np.diff(ev)))
    blocos[1] = (f'<div class="nums"><div><b>{R["planos"]}</b><span>planos</span></div><div><b>{fmt(R["dur_mediana_plano_s"])} s</b><span>plano típico</span></div>'
                 f'<div><b>{fmt(R["cortes_por_minuto"])}</b><span>cortes por minuto</span></div>'
                 + (num(f'{sem_evento} q', "maior tempo sem acontecer nada") if sem_evento is not None else "")
                 + (num(f'{G.get("cortes_2s", 0)} cortes, {G.get("movimentos_2s", 0)} mov.', f'gancho: 2 primeiros segundos (energia {fmt(G.get("energia_2s_sobre_media"))} x a média)') if G else "")
                 + f'</div>{img(os.path.join(F, "storyboard.jpg"))}')
    # 2 composição
    al = T.get("alinhamento") or {}
    blocos[2] = ('<div class="nums">'
                 + (num(f'{round(100 * al.get("centralizado_frac", 0))}%', "textos centralizados") + num("sim" if al.get("esquerda_alinhada") else "não", "margem esquerda fixa") if al else "")
                 + (num(f'{fmt(CO["margem_texto_min_pct"])}%', "margem segura (texto mais perto da borda)") if CO.get("margem_texto_min_pct") is not None else "")
                 + (num(", ".join(f"{c}%" for c in CO["colunas_esquerda_pct"]), "colunas onde o texto alinha") if CO.get("colunas_esquerda_pct") else "")
                 + (num(pct(CO.get("espaco_vazio_frac")), "da tela fica vazia (respiro)") if CO.get("espaco_vazio_frac") is not None else "")
                 + (num(" · ".join(f"{k} {pct(v)}" for k, v in CO["texto_vertical"].items()), "onde o texto mora") if CO.get("texto_vertical") else "")
                 + (num(", ".join(f"{c}%" for c in CO["conteudo_caixa_pct"]), "caixa do conteúdo (x0, y0, x1, y1)") if CO.get("conteudo_caixa_pct") else "")
                 + '</div>')
    # 3 tipografia
    exemplos = []
    for pl, lst in (T.get("por_plano") or {}).items():
        for q in lst:
            for t in q["textos"]:
                if t["c"] >= 0.9 and len(t["t"]) > 3: exemplos.append((t["altura_pct"], t["t"], pl))
    vistos, ex = set(), []
    for h, t, pl in sorted(exemplos, reverse=True):
        if t in vistos: continue
        vistos.add(t); ex.append(f"<tr><td>{html.escape(t)}</td><td>{fmt(h)}%</td><td>{pl}</td></tr>")
    tip = ('<div class="nums">'
           + (num(" · ".join(f"{fmt(v)}%" for v in CO["niveis_texto_pct"]), "níveis de tamanho (% da altura)") if CO.get("niveis_texto_pct") else "")
           + (num(" · ".join(fmt(v) for v in CO["proporcao_entre_niveis"]), "proporção entre os níveis") if CO.get("proporcao_entre_niveis") else "")
           + (num(fmt(TE["entrelinha_mediana"]), "entrelinha (vão entre linhas / altura da linha)") if TE.get("entrelinha_mediana") is not None else "")
           + (num(", ".join(f"{k} ({v})" for k, v in TE["modos"].items()), "como o texto entra") if TE.get("modos") else "")
           + '</div>')
    blocos[3] = tip + (f'<p class="leve">Textos lidos na tela, do maior para o menor (altura da letra em % da altura do quadro).</p>'
                 f'<table><tr><th>Texto</th><th>Altura</th><th>Plano</th></tr>{"".join(ex[:12])}</table>' if ex else "")
    # 4 cor
    sw = "".join(f'<div class="sw"><i style="background:{c["hex"]}"></i><b>{c["hex"]}</b><span>{round(100 * c["prop"])}%</span></div>' for c in PAL["geral"])
    pp = CL.get("proporcao_por_papel") or {}
    blocos[4] = (f'<div class="paleta">{sw}</div><p class="leve">Fundo mais provável: <b>{PAL["fundo_provavel"]}</b></p><div class="nums">'
                 + (num(" · ".join(f"{k} {pct(v)}" for k, v in pp.items()), "proporção por papel") if pp else "")
                 + (num(fmt(CL["contraste"]), f'contraste (luz de {fmt(CL["luz_p5_p95"][0])} a {fmt(CL["luz_p5_p95"][1])})') if CL.get("contraste") is not None else "")
                 + (num(pct(CL.get("saturacao_media")), "saturação média") if CL.get("saturacao_media") is not None else "")
                 + (num(CL.get("grao_nota", "?"), f'grão medido na resolução original ({fmt(CL.get("grao"))})') if CL.get("grao") is not None else "")
                 + (num(fmt(CL["vinheta_cantos_sobre_centro"]), "cantos / centro (abaixo de 0,85 = vinheta)") if CL.get("vinheta_cantos_sobre_centro") is not None else "")
                 + '</div>')
    # 5 movimento
    grupos = {}
    for m in MV:
        if m.get("erro_curva", 1) <= 0.05: grupos.setdefault(m["tipo"], []).append(m)
    cards = ""
    for tipo, ms in sorted(grupos.items(), key=lambda t: -len(t[1])):
        import numpy as np
        c = [round(float(v), 2) for v in np.median(np.array([m["curva"] for m in ms]), axis=0)]
        q = int(np.median([m["quadros"] for m in ms]))
        cards += (f'<div class="card">{curva_svg(c)}<b>{html.escape(tipo)}</b><span>{len(ms)} movimentos, {q} quadros</span>'
                  f'<code>cubic-bezier({", ".join(fmt(v) for v in c)})</code></div>')
    B = R.get("borrao") or {}; D2 = R.get("animacao_em_dois") or {}
    blocos[5] = (f'<div class="nums"><div><b>{R["movimentos"]}</b><span>movimentos medidos</span></div>'
                 f'<div><b>{R["duracao_movimento_mediana_q"]} q</b><span>movimento típico ({fmt(R["duracao_movimento_mediana_s"])} s)</span></div>'
                 f'<div><b>{B.get("graus_estimados", "?")}°</b><span>{html.escape(B.get("nota", ""))}</span></div>'
                 f'<div><b>{"sim" if D2.get("animado_em_dois") else "não"}</b><span>animado em dois</span></div>'
                 + (num(f'{fmt(ES["passo_mediano_q"])} q', "atraso entre elementos (escada) · " + ", ".join(ES.get("direcoes", {}))) if ES.get("tem_escada") else num("não", "escada: elementos entram juntos"))
                 + (num(CA["profundidade"], f'câmera: paralaxe {fmt(CA.get("paralaxe"))}') if CA.get("profundidade") else "")
                 + (num(f'{CA.get("movimentos_de_zoom", 0)} · {CA.get("movimentos_de_deslize", 0)} · {CA.get("movimentos_de_giro", 0)}', "câmera: zoom · deslize · giro") if CA else "")
                 + '</div>'
                 + (f'<h4>Transições</h4><p>{", ".join(f"{k} ({v})" for k, v in TR["tipos"].items())}</p>' if TR.get("tipos") else "")
                 + f'<div class="cards">{cards}</div>{img(os.path.join(F, "energia.png"))}')
    # 8 som
    if AU.get("tem_som"):
        import numpy as np
        sm = AU.get("som_menos_movimento_quadros") or []
        md_ = float(np.median(sm)) if sm else 0
        adi = (f'{fmt(round(abs(md_), 1))} quadros {"antes" if md_ < 0 else "depois"}' if abs(md_) >= 0.5 else "junto") if sm else "?"
        blocos[8] = (f'<div class="nums"><div><b>{fmt(AU["bpm"])}</b><span>BPM</span></div><div><b>{round(100 * (AU.get("cortes_na_batida_frac") or 0))}%</b><span>cortes na batida</span></div>'
                     f'<div><b>{AU.get("n_ataques", 0)}</b><span>ataques de som</span></div><div><b>{adi}</b><span>som em relação ao visual (mediana)</span></div>'
                     f'<div><b>{fmt(AU.get("volume_medio_db", ""))} dB</b><span>volume médio</span></div></div>')
        if SO.get("separado"):
            ef = SO.get("efeitos") or {}
            q = lambda v: "?" if v is None else ("junto" if abs(v) < 0.5 else f'{fmt(abs(v))} q {"antes" if v < 0 else "depois"}')
            blocos[8] += ('<h4>Camadas separadas (voz, trilha, efeitos)</h4><div class="nums">'
                          + "".join(num(f'{fmt(SO[k]["volume_medio_db"])} dB', f'{k} (pico {fmt(SO[k]["pico_db"])} dB, {pct((SO.get("proporcao_energia") or {}).get(k))} da energia)') for k in ("trilha", "efeitos", "voz") if k in SO)
                          + num(ef.get("n_efeitos", 0), "efeitos sonoros")
                          + num(pct(ef.get("cortes_com_efeito_frac")), f'cortes com efeito ({q(ef.get("efeito_menos_corte_q"))} do corte)')
                          + num(pct(ef.get("movimentos_com_efeito_frac")), f'movimentos com efeito ({q(ef.get("efeito_menos_movimento_q"))} do movimento)')
                          + '</div>')
    else:
        blocos[8] = '<p class="leve">Sem som.</p>'
    # 10 técnico
    blocos[10] = (f'<div class="nums"><div><b>{info["largura"]} x {info["altura"]}</b><span>{info.get("proporcao", "")}</span></div>'
                  f'<div><b>{fmt(info["fps"])}</b><span>quadros por segundo</span></div><div><b>{info["codec"]}</b><span>codec</span></div>'
                  f'<div><b>{fmt(info["duracao_analisada"])} s</b><span>analisados de {fmt(round(info["duracao"], 1))} s</span></div>'
                  + (num(f'{fmt(TC["video_mbps"])} Mb/s', f'vídeo ({TC.get("pix_fmt")}, cor {TC.get("cor")})') if TC.get("video_mbps") else "")
                  + (num(TC.get("audio", ""), f'{TC.get("audio_kbps", "?")} kb/s') if TC.get("audio") else "")
                  + (num(CL.get("grao_nota", ""), "grão") if CL.get("grao_nota") else "")
                  + '</div>')
    # plano a plano: quadros, tempos, entrada e saída, movimentos, textos, cores, transição e sons
    rp = {r["plano"]: r for r in RP.get("por_plano", [])}
    te = {r["plano"]: r for r in TE.get("por_plano", [])}
    tr = {t["quadro"]: t for t in TR.get("lista", [])}
    cp = {c["plano"]: c["cores"] for c in PAL.get("por_plano", [])}
    efs = (SO.get("efeitos") or {}).get("efeitos_s", [])
    cartoes = ""
    for p in P:
        r = rp.get(p["n"], {}); t = te.get(p["n"]); ms = [m for m in MV if m["plano"] == p["n"]]
        prox = tr.get(p["fim"])
        txts = []
        for q in (T.get("por_plano") or {}).get(str(p["n"]), []):
            for x in q["textos"]:
                if x["c"] >= 0.9 and x["t"] not in txts: txts.append(x["t"])
        sons = [e for e in efs if p["ini_s"] <= e < p["ini_s"] + p["dur_s"]]
        li = [f'<li><b>Tempo:</b> {fmt(p["ini_s"])} s, dura {fmt(p["dur_s"])} s ({p["quadros"]} quadros)</li>']
        if r:
            ent = r["entrada_tipo"] + (f' em {r["entrada_q"]} q' if r.get("entrada_q") else "")
            sai = r["saida_tipo"] + (f' em {r["saida_q"]} q' if r.get("saida_q") else "")
            li.append(f'<li><b>Entrada:</b> {ent} · <b>saída:</b> {sai} · parado {r.get("parado_q", 0)} q</li>')
        if ms: li.append("<li><b>Movimentos:</b> " + "; ".join(f'{m["dominante"]} {m["quadros"]} q, {m["tipo"]}' for m in ms) + "</li>")
        if t: li.append(f'<li><b>Texto:</b> {t["modo"]}' + (f', {t["quadros_ate_completar"]} q até completar' if t.get("quadros_ate_completar") else "") + "</li>")
        if txts: li.append("<li><b>Lido:</b> " + html.escape(" / ".join(txts[:4])) + "</li>")
        if cp.get(p["n"]): li.append('<li><b>Cores:</b> ' + "".join(f'<i class="pt" style="background:{c["hex"]}"></i>' for c in cp[p["n"]]) + "</li>")
        if sons: li.append(f'<li><b>Efeitos sonoros:</b> {len(sons)} (em ' + ", ".join(f"{fmt(round(e - p['ini_s'], 2))} s" for e in sons[:6]) + ")</li>")
        if prox: li.append(f'<li><b>Passagem para o próximo:</b> {prox["tipo"]}' + (f' ({prox["quadros"]} q)' if prox["quadros"] > 1 else "") + "</li>")
        cartoes += f'<details class="pl"><summary>Plano {p["n"]} · {fmt(p["ini_s"])} s · {fmt(p["dur_s"])} s</summary>{img(os.path.join(F, "plano_%02d.jpg" % p["n"]))}<ul>{"".join(li)}</ul></details>'
    blocos[1] += f'<h4>Plano a plano</h4>{cartoes}'
    secoes = ""
    for i, nome in enumerate(PONTOS, 1):
        olho = md(ficha[i]) if i in ficha else ""
        corpo = (olho and f'<div class="olho">{olho}</div>') + blocos.get(i, "")
        if not corpo: corpo = '<p class="leve">Sem observação.</p>'
        secoes += f'<section id="p{i}"><h2><em>{i:02d}</em>{nome}</h2>{corpo}</section>'
    comp = ""
    if op["comparacao"] and os.path.exists(os.path.join(op["comparacao"], "comparacao.json")):
        C = json.load(open(os.path.join(op["comparacao"], "comparacao.json")))
        lin = "".join(f'<tr><td>{html.escape(i["item"])}</td><td class="n">{"" if i["nota"] is None else i["nota"]}</td></tr>' for i in C["itens"])
        comp = (f'<section id="comp"><h2><em>✓</em>Recriação x referência: nota {C["nota_geral"]}</h2>'
                f'{img(os.path.join(op["comparacao"], "folha_comparacao.jpg"))}<table>{lin}</table></section>')
    nav = "".join(f'<a href="#p{i}">{i:02d} {n}</a>' for i, n in enumerate(PONTOS, 1))
    doc = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ficha {html.escape(titulo)}</title><style>
:root{{--fundo:#0E0D12;--card:#18171E;--linha:#2A2833;--texto:#F4EFE6;--leve:#9A958C;--destaque:#C4FF3A}}
@media (prefers-color-scheme: light){{:root:not([data-theme="dark"]){{--fundo:#F6F3EE;--card:#FFFFFF;--linha:#E2DDD4;--texto:#16151A;--leve:#6F6A62;--destaque:#2F5BFF}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.55 -apple-system,"SF Pro Text",Helvetica,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:40px 16px 80px}}h1{{font-size:clamp(30px,5vw,52px);line-height:1.05;margin:0 0 8px;letter-spacing:-.02em}}
.sub{{color:var(--leve);margin:0 0 24px}}nav{{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 32px}}nav a{{color:var(--texto);text-decoration:none;border:1px solid var(--linha);border-radius:99px;padding:5px 12px;font-size:13px}}
section{{background:var(--card);border:1px solid var(--linha);border-radius:18px;padding:24px;margin:0 0 18px}}h2{{margin:0 0 16px;font-size:24px;display:flex;gap:12px;align-items:baseline}}
h2 em{{font-style:normal;color:var(--destaque);font-variant-numeric:tabular-nums}}img{{width:100%;border-radius:10px;margin:12px 0;display:block}}
.nums{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 8px}}.nums div{{border:1px solid var(--linha);border-radius:12px;padding:12px 14px}}
.nums b{{display:block;font-size:24px}}.nums span{{color:var(--leve);font-size:13px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:14px 0}}.card{{border:1px solid var(--linha);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}}
.card span{{color:var(--leve);font-size:13px}}code{{font:12px ui-monospace,Menlo,monospace;color:var(--leve)}}
.curva{{width:120px;height:120px}}.curva .grade{{fill:none;stroke:var(--linha)}}.curva .alca{{stroke:var(--leve);stroke-dasharray:3 3}}.curva .linha{{fill:none;stroke-width:3}}
.paleta{{display:flex;flex-wrap:wrap;gap:10px}}.sw{{width:110px}}.sw i{{display:block;height:64px;border-radius:10px;border:1px solid var(--linha)}}.sw b{{display:block;font-size:13px;margin-top:6px}}.sw span{{color:var(--leve);font-size:12px}}
table{{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}}td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--linha)}}th{{color:var(--leve);font-weight:500}}td.n{{text-align:right;font-weight:700}}
.pl{{border:1px solid var(--linha);border-radius:12px;padding:10px 14px;margin:8px 0}}.pl summary{{color:var(--texto);font-weight:600}}.pl ul{{margin:8px 0 4px;padding-left:18px}}
i.pt{{display:inline-block;width:18px;height:18px;border-radius:4px;margin:0 3px -4px 0;border:1px solid var(--linha)}}h4{{margin:16px 0 6px}}
.olho{{border-left:3px solid var(--destaque);padding:2px 0 2px 16px;margin:0 0 14px}}.leve{{color:var(--leve)}}details summary{{cursor:pointer;color:var(--leve);margin:8px 0}}
</style></head><body><main><h1>{html.escape(titulo)}</h1><p class="sub">Ficha forense de motion · {fmt(info["duracao_analisada"])} s analisados</p>
{('<div class="olho">' + md(intro) + '</div>') if intro.strip() else ''}<nav>{nav}</nav>{comp}{secoes}</main></body></html>"""
    open(saida, "w").write(doc)
    print("ok", saida, f"{os.path.getsize(saida) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
