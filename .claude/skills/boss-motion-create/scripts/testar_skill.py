"""Testa uma skill de estilo como se fosse outro computador.

Uso:  python testar_skill.py <pasta da skill> [--completo]
1. Procura caminhos do computador do Rick e coisas fora do pacote (/Users/, /Volumes/, FilmbossTools...).
2. Confere o pacote: SKILL.md com name igual à pasta, fontes e sons citados existem, todo <Efeito som> está no sfx.json.
3. Copia a skill para uma pasta temporária limpa, cria um vídeo com novo_video.sh, compila (tsc) e renderiza
   o primeiro quadro de cada composição. Sem --completo usa o node_modules já instalado (rápido);
   com --completo roda o instalar.sh de verdade (npm install do zero, uns minutos).
Sai com código 1 se algo falhar.
"""
import glob, json, os, re, shutil, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lugares import BASE  # noqa: E402

PROIBIDOS = [r"/Users/", r"/Volumes/", r"FilmbossTools", r"rickmiura", r"____FILMBOSS", r"/private/tmp", r"/var/folders", r"/home/user/", r"/root/"]
TESTE_JS = """
import path from "node:path";
import fs from "node:fs";
import { getCompositions, renderStill } from "@remotion/renderer";
import { empacotar, navegador, CHROMIUM } from "./comum.mjs";
const saida = process.argv[2]; fs.mkdirSync(saida, { recursive: true });
const serveUrl = await empacotar();
const browser = await navegador();
const comps = await getCompositions(serveUrl, { puppeteerInstance: browser, chromiumOptions: CHROMIUM });
for (const c of comps) {
  try {
    await renderStill({ composition: c, serveUrl, output: path.join(saida, c.id + ".png"), frame: 0, puppeteerInstance: browser, chromiumOptions: CHROMIUM, inputProps: c.props });
    console.log("ok " + c.id);
  } catch (e) { console.log("falhou " + c.id + ": " + String(e).slice(0, 200)); }
}
await browser.close({ silent: true });
process.exit(0);
"""
TEXTO = (".md", ".ts", ".tsx", ".mjs", ".js", ".json", ".py", ".sh", ".txt", ".html", ".css")


def main():
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    S = os.path.abspath(a[0]); completo = "--completo" in a
    erros, avisos = [], []
    # 1 caminhos
    for dp, dns, fs in os.walk(S):
        dns[:] = [d for d in dns if d not in ("node_modules", "venv", "out")]
        for f in fs:
            p = os.path.join(dp, f)
            if os.path.islink(p): erros.append(f"atalho dentro do pacote: {os.path.relpath(p, S)}"); continue
            if not f.endswith(TEXTO) or f == "ficha.html": continue
            t = open(p, errors="ignore").read()
            for pr in PROIBIDOS:
                for m in re.finditer(pr, t):
                    linha = t.count("\n", 0, m.start()) + 1
                    erros.append(f"caminho local em {os.path.relpath(p, S)}:{linha} ({pr})")
    # 2 pacote
    sk = open(os.path.join(S, "SKILL.md")).read()
    m = re.search(r"^name:\s*(\S+)", sk, re.M)
    if not m or m.group(1) != os.path.basename(S): erros.append("name do SKILL.md diferente do nome da pasta")
    if "{{" in sk: erros.append("SKILL.md com marcador {{...}} sem trocar")
    pj = os.path.join(S, "projeto")
    E = json.load(open(os.path.join(pj, "src", "estilo", "estilo.json")))
    for f in E.get("fontes", []):
        if not os.path.exists(os.path.join(pj, "public", "fonts", f["arquivo"])): erros.append(f"fonte faltando: {f['arquivo']}")
    if not E.get("fontes"): avisos.append("nenhuma fonte registrada (o texto sai na fonte do sistema)")
    sfx = json.load(open(os.path.join(pj, "src", "estilo", "sfx.json")))
    for k, v in sfx.items():
        if not os.path.exists(os.path.join(pj, "public", "sfx", v["arquivo"])): erros.append(f"som faltando: {v['arquivo']}")
    usados = set()
    for f in glob.glob(os.path.join(pj, "src", "**", "*.tsx"), recursive=True):
        usados |= set(re.findall(r'som="([^"]+)"', open(f).read()))
    for u in sorted(usados - set(sfx)):
        (avisos if u == "entrada" else erros).append(f'<Efeito som="{u}"> sem o som no sfx.json')
    if not os.path.exists(os.path.join(S, "references", "estilo.md")): erros.append("falta references/estilo.md")
    elif "<nome>" in open(os.path.join(S, "references", "estilo.md")).read(): erros.append("estilo.md ainda é o modelo (não foi escrito)")
    if not glob.glob(os.path.join(S, "previa", "*")): avisos.append("sem prévia em previa/")
    # 3 teste em pasta limpa
    tmp = tempfile.mkdtemp(prefix="teste_estilo_")
    try:
        T = os.path.join(tmp, os.path.basename(S))
        shutil.copytree(S, T, symlinks=True, ignore=shutil.ignore_patterns("node_modules", "venv", "out"))
        if completo:
            r = subprocess.run(["bash", os.path.join(T, "instalar.sh")], capture_output=True, text=True)
            if r.returncode: erros.append("instalar.sh falhou: " + r.stdout[-400:] + r.stderr[-400:])
        else:
            nm = os.path.join(S, "projeto", "node_modules")
            if not os.path.exists(nm): nm = os.path.join(BASE, "base", "node_modules")
            os.symlink(os.path.realpath(nm), os.path.join(T, "projeto", "node_modules"))
            py = os.path.join(S, "projeto", "venv")
            if not os.path.exists(py): py = os.path.join(BASE, "venv")
            os.symlink(os.path.realpath(py), os.path.join(T, "projeto", "venv"))
        if not erros or completo:
            r = subprocess.run(["bash", os.path.join(T, "scripts", "novo_video.sh"), "Teste", os.path.join(tmp, "videos")],
                               capture_output=True, text=True, env={**os.environ, "HOME": tmp})
            if r.returncode: erros.append("novo_video.sh falhou: " + r.stderr[-400:])
            else:
                V = r.stdout.strip().splitlines()[-1]
                r = subprocess.run(["npx", "tsc"], cwd=V, capture_output=True, text=True)
                if r.returncode: erros.append("tsc: " + r.stdout[-800:])
                js = os.path.join(V, "scripts", "_teste_quadro0.mjs")
                open(js, "w").write(TESTE_JS)
                r = subprocess.run(["node", js, os.path.join(tmp, "quadros")], cwd=V, capture_output=True, text=True)
                ids = [l[3:] for l in r.stdout.splitlines() if l.startswith("ok ")]
                for l in r.stdout.splitlines():
                    if l.startswith("falhou "): erros.append("render " + l)
                if r.returncode and not ids: erros.append("render: " + (r.stderr or r.stdout)[-600:])
                print(f"{len(ids)} composições renderizadas no quadro 0")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    for x in avisos: print("aviso:", x)
    for x in erros: print("ERRO:", x)
    print("PASSOU" if not erros else f"FALHOU ({len(erros)} erros)")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
