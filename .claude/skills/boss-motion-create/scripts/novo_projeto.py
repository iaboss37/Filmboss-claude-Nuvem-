"""Abre um estudo novo a partir de uma referência e já roda a análise e a ficha.

Uso:  python novo_projeto.py "<Nome do estudo>" <video, link ou pasta> [--de 0] [--ate SEG] [--sem-analise]
Cria  ~/FilmbossTools/boss-motion/projetos/NNN - Nome/   (código fora do SSD: o exFAT não aguenta node;
      na nuvem: <repositório>/boss-motion/projetos/NNN - Nome/, fora do git; ver lugares.py)
        referencia/      o vídeo (link baixado com yt-dlp; pasta = todos os vídeos dela, o primeiro é o principal)
        analise/         medidas, folhas e analise.json
        recriacao/       projeto Remotion copiado do molde (node_modules e venv compartilhados)
        comparacao/      comparações de cada versão da recriação
        ficha.md         o que depende do olho (o Claude escreve; vai para a ficha)
        estilo.md        regras do estilo (o Claude escreve; vira a skill)
        Ficha.html       ficha forense para o Rick
e um atalho em CRIACAO/3 Motion Graphics/Estudos de Referência/NNN - Nome (só quando o SSD está ligado).
Imprime um JSON com os caminhos.
"""
import glob, json, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from lugares import SKILL, BASE, PROJETOS  # noqa: E402
ESTUDOS = os.environ.get("BOSS_MOTION_ESTUDOS") or "/Volumes/Filmboss 01/____FILMBOSS [Claude]/CRIACAO/3 Motion Graphics/Estudos de Referência"
PY = os.path.join(BASE, "venv", "bin", "python")
VIDEO = (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".gif", ".avi")


def args():
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    op = {"de": None, "ate": None, "sem-analise": False}
    if "--sem-analise" in a: a.remove("--sem-analise"); op["sem-analise"] = True
    for k in ("de", "ate"):
        if f"--{k}" in a:
            i = a.index(f"--{k}"); op[k] = a[i + 1]; del a[i:i + 2]
    return a[0], a[1], op


def proximo_numero():
    nums = [0]
    for pasta in (PROJETOS, ESTUDOS):
        if os.path.isdir(pasta):
            for n in os.listdir(pasta):
                m = re.match(r"(\d{3}) - ", n)
                if m: nums.append(int(m.group(1)))
    return max(nums) + 1


def trazer_referencia(fonte, destino):
    os.makedirs(destino, exist_ok=True)
    if re.match(r"https?://", fonte):
        ytdlp = ["yt-dlp"] if shutil.which("yt-dlp") else [os.path.join(BASE, "venv", "bin", "yt-dlp")]
        subprocess.run([*ytdlp, "-q", "--no-playlist", "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4",
                        "-o", os.path.join(destino, "%(title).80s.%(ext)s"), fonte], check=True)
    elif os.path.isdir(fonte):
        for f in sorted(os.listdir(fonte)):
            if f.lower().endswith(VIDEO) and not f.startswith("._"): shutil.copy2(os.path.join(fonte, f), destino)
    else:
        shutil.copy2(fonte, destino)
    vids = sorted((f for f in glob.glob(os.path.join(destino, "*")) if f.lower().endswith(VIDEO)), key=os.path.getsize, reverse=True)
    if not vids: sys.exit("nenhum vídeo na referência")
    v = vids[0]
    if v.lower().endswith((".gif", ".webm", ".mkv", ".avi")):   # o Remotion e o OCR preferem mp4
        mp4 = os.path.splitext(v)[0] + ".mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", v, "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4], check=True)
        v = mp4
    return v


def main():
    nome, fonte, op = args()
    nome = re.sub(r'[/:"\\]', "-", nome).strip()
    n = proximo_numero(); pasta_nome = f"{n:03d} - {nome}"
    P = os.path.join(PROJETOS, pasta_nome); os.makedirs(P)   # cria PROJETOS junto se faltar
    ref = trazer_referencia(fonte, os.path.join(P, "referencia"))
    # projeto Remotion
    R = os.path.join(P, "recriacao")
    shutil.copytree(os.path.join(SKILL, "moldes", "remotion"), R, ignore=shutil.ignore_patterns("node_modules", "out", "venv", "._*"))
    os.symlink(os.path.join(BASE, "base", "node_modules"), os.path.join(R, "node_modules"))
    os.symlink(os.path.join(BASE, "venv"), os.path.join(R, "venv"))
    E = json.load(open(os.path.join(R, "src", "estilo", "estilo.json"))); E["nome"] = nome
    json.dump(E, open(os.path.join(R, "src", "estilo", "estilo.json"), "w"), ensure_ascii=False, indent=2)
    for d in ("analise", "comparacao"): os.makedirs(os.path.join(P, d))
    shutil.copy(os.path.join(SKILL, "references", "modelo_ficha.md"), os.path.join(P, "ficha.md"))
    shutil.copy(os.path.join(SKILL, "references", "modelo_estilo.md"), os.path.join(P, "estilo.md"))
    json.dump({"nome": nome, "numero": n, "referencia": ref, "fonte_original": fonte, "de": op["de"], "ate": op["ate"]},
              open(os.path.join(P, "estudo.json"), "w"), ensure_ascii=False, indent=1)
    # atalho no SSD
    atalho = None
    if os.path.isdir(ESTUDOS):
        atalho = os.path.join(ESTUDOS, pasta_nome)
        try: os.symlink(P, atalho)
        except OSError: atalho = None
    if not op["sem-analise"]:
        trecho = (["--de", op["de"]] if op["de"] else []) + (["--ate", op["ate"]] if op["ate"] else [])
        subprocess.run([PY, os.path.join(AQUI, "analise", "analisar.py"), ref, os.path.join(P, "analise"), *trecho], check=True)
        subprocess.run([PY, os.path.join(AQUI, "estilo", "estilo.py"), "medidas", os.path.join(P, "analise", "analise.json"), R], check=True, stdout=subprocess.DEVNULL)
        subprocess.run([PY, os.path.join(AQUI, "analise", "relatorio.py"), os.path.join(P, "analise"), os.path.join(P, "Ficha.html"),
                        "--ficha", os.path.join(P, "ficha.md"), "--titulo", nome], check=True, stdout=subprocess.DEVNULL)
    print(json.dumps({"projeto": P, "atalho": atalho, "referencia": ref, "analise": os.path.join(P, "analise"), "recriacao": R,
                      "ficha": os.path.join(P, "Ficha.html")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
