"""Gera a skill de estilo independente (boss-estilo-<nome>) a partir de um estudo APROVADO pelo Rick.

Uso:  python gerar_skill.py <pasta do estudo> <nome-curto> --descricao "Uma frase do estilo" [--previa video.mp4] [--destino pasta] [--forcar]
- nome-curto: minúsculas, números e hífen (ex.: neon-editorial). A skill sai como boss-estilo-<nome-curto>.
- Copia o projeto Remotion da recriação (sem node_modules, venv e out), estilo.md, ficha, prévia e um manifesto.
- Destino padrão: ~/.claude/skills no Mac; na nuvem <repositório>/.claude/skills (vai para o GitHub com um commit). Ver lugares.py.
- Depois rode testar_skill.py na pasta gerada.
"""
import datetime, json, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from lugares import SKILL, SKILLS, PROJETOS  # noqa: E402
MOLDE = os.path.join(SKILL, "moldes", "skill_estilo")


def args():
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    op = {"descricao": "", "previa": None, "destino": SKILLS, "forcar": False}
    if "--forcar" in a: a.remove("--forcar"); op["forcar"] = True
    for k in ("descricao", "previa", "destino"):
        if f"--{k}" in a:
            i = a.index(f"--{k}"); op[k] = a[i + 1]; del a[i:i + 2]
    return a[0], a[1], op


def medidas_md(E):
    c = E.get("curvas", {}); t = E.get("tempos", {}); cor = E.get("cores", {})
    l = [f"- Formato da referência: {E['largura']} x {E['altura']}, {E['fps']} quadros por segundo."]
    for k, v in c.items(): l.append(f"- Curva {k}: cubic-bezier({', '.join(str(x) for x in v)})")
    if E.get("pop", {}).get("existe"): l.append(f"- Pop (passa do ponto e volta): excesso {E['pop'].get('excesso')}")
    l.append("- Tempos em quadros: " + ", ".join(f"{k} {v}" for k, v in t.items()))
    l.append("- Cores: " + ", ".join(f"{k} {v}" for k, v in cor.items() if not re.match(r"p\d+$", k)))
    if E.get("fontes"): l.append("- Fontes: " + ", ".join(f"{f['papel']} = {f.get('nome', f['familia'])} {f.get('peso', '')}" for f in E["fontes"]))
    l.append(f"- Borrão: obturador {E.get('obturador')}; animado em dois: {'sim' if E.get('emDois') else 'não'}")
    if E.get("texto"): l.append(f"- Texto entra: {E['texto']['entrada_principal']} (entrelinha {E['texto'].get('entrelinha')}, {E['texto'].get('quadros_por_palavra')} q por palavra)")
    if E.get("transicoes"): l.append("- Transições: " + ", ".join(f"{k} ({v})" for k, v in E["transicoes"].items()))
    if E.get("composicao"): l.append("- Composição: " + ", ".join(f"{k} {v}" for k, v in E["composicao"].items()))
    if E.get("luz"): l.append("- Luz: " + ", ".join(f"{k} {v}" for k, v in E["luz"].items()))
    if E.get("som"): l.append("- Som: " + ", ".join(f"{k} {v}" for k, v in E["som"].items() if v is not None))
    if E.get("camera", {}).get("profundidade"): l.append(f"- Câmera: {E['camera']['profundidade']}")
    return "\n".join(l)


def main():
    estudo, curto, op = args()
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", curto): sys.exit("nome-curto: minúsculas, números e hífen")
    nome_skill = f"boss-estilo-{curto}"
    D = os.path.join(op["destino"], nome_skill)
    if os.path.exists(D):
        if not op["forcar"]: sys.exit(f"já existe: {D} (use --forcar para gerar de novo; a versão antiga vai para a Lixeira)")
        if shutil.which("trash"): subprocess.run(["trash", D], check=True)
        else:   # sem Lixeira (nuvem): a versão antiga vai para boss-motion/lixeira, fora do git
            lixo = os.path.join(os.path.dirname(PROJETOS), "lixeira"); os.makedirs(lixo, exist_ok=True)
            shutil.move(D, os.path.join(lixo, f"{nome_skill}-{datetime.datetime.now():%Y%m%d-%H%M%S}"))
    R = os.path.join(estudo, "recriacao")
    E = json.load(open(os.path.join(R, "src", "estilo", "estilo.json")))
    est = json.load(open(os.path.join(estudo, "estudo.json"))) if os.path.exists(os.path.join(estudo, "estudo.json")) else {}
    # nota da última comparação
    nota = "?"
    comps = sorted((os.path.join(dp, "comparacao.json") for dp, _, fs in os.walk(os.path.join(estudo, "comparacao")) if "comparacao.json" in fs), key=os.path.getmtime)
    if comps: nota = json.load(open(comps[-1]))["nota_geral"]
    os.makedirs(D)
    # projeto
    shutil.copytree(R, os.path.join(D, "projeto"), symlinks=False,
                    ignore=shutil.ignore_patterns("node_modules", "venv", "out", "._*", ".DS_Store", "*.log"))
    E["nome"] = curto; E["skill"] = nome_skill
    json.dump(E, open(os.path.join(D, "projeto", "src", "estilo", "estilo.json"), "w"), ensure_ascii=False, indent=2)
    pk = os.path.join(D, "projeto", "package.json"); P = json.load(open(pk)); P["name"] = nome_skill
    P["description"] = f"Projeto Remotion do estilo {curto} (gerado pela boss-motion-create)"; json.dump(P, open(pk, "w"), ensure_ascii=False, indent=2)
    # textos
    os.makedirs(os.path.join(D, "references")); os.makedirs(os.path.join(D, "previa")); os.makedirs(os.path.join(D, "scripts"))
    shutil.copy(os.path.join(estudo, "estilo.md"), os.path.join(D, "references", "estilo.md"))
    # medidas completas da referência (plano a plano, movimentos, texto, som), sem caminhos do computador
    an = os.path.join(estudo, "analise", "analise.json")
    if os.path.exists(an):
        A = json.load(open(an))
        A.get("info", {}).pop("arquivo", None)
        ((A.get("extras") or {}).get("camadas") or {}).pop("pasta", None)
        json.dump(A, open(os.path.join(D, "references", "medidas_referencia.json"), "w"), ensure_ascii=False, indent=1)
    # ficha sem nenhum quadro da referência: a imagem do estilo é a prévia da NOSSA recriação (previa/)
    if os.path.exists(an):
        cmd = [sys.executable, os.path.join(AQUI, "analise", "relatorio.py"), os.path.join(estudo, "analise"), os.path.join(D, "references", "ficha.html"),
               "--sem-imagens", "--titulo", f"Estilo {curto}"]
        if os.path.exists(os.path.join(estudo, "ficha.md")): cmd += ["--ficha", os.path.join(estudo, "ficha.md")]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    # conferência de fidelidade: os scripts de medida vão junto (sem caminhos deste computador)
    conf = os.path.join(D, "scripts", "conferir"); os.makedirs(conf)
    for f in ("analisar.py", "extras.py", "comparar.py"):
        t = open(os.path.join(AQUI, "analise", f)).read()
        if f == "extras.py":
            t = re.sub(r'^MSST = .*$', 'MSST = os.environ.get("BOSS_MSST", "")  # separador de faixas (opcional): pasta do Music-Source-Separation-Training', t, flags=re.M)
            t = re.sub(r'^SFX_PY = .*$', 'SFX_PY = os.environ.get("BOSS_MSST_PY", "")  # python com torch do separador (opcional)', t, flags=re.M)
        open(os.path.join(conf, f), "w").write(t)
    os.makedirs(os.path.join(D, "scripts", "bin"))
    for f in ("textos.swift", "textos_linux.py"):
        shutil.copy2(os.path.join(SKILL, "scripts", "bin", f), os.path.join(D, "scripts", "bin", f))
    # prévia: o render aprovado em até 1080 de altura + storyboard
    if op["previa"]:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", op["previa"], "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-crf", "20",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", os.path.join(D, "previa", "estilo.mp4")], check=True)
    # quadros da NOSSA recriação, plano a plano (a régua visual do estilo; nenhum quadro da referência vai junto)
    if op["previa"]:
        tmpq = os.path.join(D, "previa", "_analise")
        subprocess.run([sys.executable, os.path.join(AQUI, "analise", "analisar.py"), op["previa"], tmpq, "--sem-camadas"], check=True, stdout=subprocess.DEVNULL)
        shutil.move(os.path.join(tmpq, "folhas"), os.path.join(D, "previa", "quadros"))
        R2 = json.load(open(os.path.join(tmpq, "analise.json"))); R2.get("info", {}).pop("arquivo", None)
        json.dump(R2, open(os.path.join(D, "references", "medidas_recriacao.json"), "w"), ensure_ascii=False, indent=1)
        shutil.rmtree(tmpq)
    else:
        sb = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(R, "out", "quadros")) for f in fs if f.endswith("storyboard.png")]
        if sb: shutil.copy(max(sb, key=os.path.getmtime), os.path.join(D, "previa", "storyboard.png"))
    # manifesto
    sfx = json.load(open(os.path.join(R, "src", "estilo", "sfx.json")))
    lic = json.load(open(os.path.join(estudo, "licencas.json"))) if os.path.exists(os.path.join(estudo, "licencas.json")) else {}
    man = {"skill": nome_skill, "nome": curto, "versao": 1, "gerado_em": datetime.date.today().isoformat(), "nota_recriacao": nota,
           "descricao": op["descricao"], "estudo": est.get("nome"),
           "fontes": [{k: f.get(k) for k in ("papel", "nome", "familia", "arquivo", "peso", "licenca", "onde_baixar", "substitui", "parecenca", "medidas_referencia") if f.get(k) is not None}
                      for f in E.get("fontes", [])],
           "sfx": [{"nome": k, "arquivo": v["arquivo"], **lic.get(k, {"origem": "acervo", "licenca": "conferir antes de distribuir"})} for k, v in sfx.items()]}
    json.dump(man, open(os.path.join(D, "manifesto.json"), "w"), ensure_ascii=False, indent=1)
    # SKILL.md, instalar.sh, novo_video.sh
    estilo_md = open(os.path.join(estudo, "estilo.md")).read()
    frase = next((l.strip() for l in estilo_md.splitlines()[1:] if l.strip() and not l.startswith("#")), op["descricao"])
    troca = {"{{SKILL}}": nome_skill, "{{NOME}}": curto, "{{NOME_CURTO}}": curto, "{{DESCRICAO}}": op["descricao"].replace('"', "'"),
             "{{FRASE}}": frase, "{{DATA}}": datetime.date.today().strftime("%d/%m/%Y"), "{{NOTA}}": str(nota),
             "{{MEDIDAS}}": medidas_md(E), "{{OBTURADOR}}": str(E.get("obturador"))}
    for orig, dest in (("SKILL.md", "SKILL.md"), ("instalar.sh", "instalar.sh"), ("scripts/novo_video.sh", "scripts/novo_video.sh")):
        s = open(os.path.join(MOLDE, orig)).read()
        for k, v in troca.items(): s = s.replace(k, v)
        open(os.path.join(D, dest), "w").write(s)
        if dest.endswith(".sh"): os.chmod(os.path.join(D, dest), 0o755)
    tam = subprocess.run(["du", "-sh", D], capture_output=True, text=True).stdout.split()[0]
    print(json.dumps({"skill": D, "tamanho": tam, "nota": nota}, ensure_ascii=False))


if __name__ == "__main__":
    main()
