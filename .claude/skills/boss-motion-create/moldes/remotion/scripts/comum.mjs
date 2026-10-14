// Peças compartilhadas pelos scripts de render (previa, quadros, final).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, selectComposition } from "@remotion/renderer";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Python com numpy e opencv: variável BOSS_PY, ou o venv do projeto (criado por instalar.sh), ou python3.
export const PYTHON = process.env.BOSS_PY || (fs.existsSync(path.join(RAIZ, "venv/bin/python")) ? path.join(RAIZ, "venv/bin/python") : "python3");
export const CHROMIUM = { gl: "angle" };
export const CONCORRENCIA_PADRAO = 4;
// Chrome do render: o Remotion baixa o dele na primeira vez. Onde a rede não deixa (nuvem), usa um já instalado:
// variável BOSS_CHROME, ou o headless_shell do Playwright em /opt/pw-browsers (Linux).
export const CHROME = (() => {
  if (process.env.BOSS_CHROME) return process.env.BOSS_CHROME;
  const pw = "/opt/pw-browsers";
  if (process.platform !== "linux" || !fs.existsSync(pw)) return null;
  for (const d of fs.readdirSync(pw).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    const p = path.join(pw, d, "chrome-linux", "headless_shell");
    if (fs.existsSync(p)) return p;
  }
  return null;
})();

/** Lê "Id --chave valor --flag" em { _: [Id], chave: valor, flag: true }. */
export function argumentos(lista = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = lista[i + 1];
      if (v === undefined || v.startsWith("--")) out[k] = true;
      else {
        out[k] = v;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

export function exigirId(args, uso) {
  const id = args._[0];
  if (!id) {
    console.error(uso);
    process.exit(1);
  }
  return id;
}

export const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/** Bundle do projeto (sem cache do webpack: vários renders rodam juntos e o node_modules é compartilhado). */
export async function empacotar() {
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(RAIZ, "src/index.ts"),
    rootDir: RAIZ,
    publicDir: path.join(RAIZ, "public"),
    enableCaching: false,
  });
  log(`bundle pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // cada bundle copia a pasta public inteira para a pasta temporária do sistema: apaga ao sair (senão enche o disco)
  const limpar = () => {
    try {
      if (fs.existsSync(serveUrl)) fs.rmSync(serveUrl, { recursive: true, force: true });
    } catch {}
  };
  process.on("exit", limpar);
  for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => (limpar(), process.exit(130)));
  return serveUrl;
}

export async function navegador() {
  return openBrowser("chrome", { chromiumOptions: CHROMIUM, ...(CHROME ? { browserExecutable: CHROME } : {}) });
}

/** Seleciona a composição com as props pedidas; devolve também os metadados da peça (definirPeca). */
export async function composicao(serveUrl, browser, id, inputProps = {}) {
  const composition = await selectComposition({ serveUrl, id, inputProps, puppeteerInstance: browser, chromiumOptions: CHROMIUM });
  const meta = composition.props?._meta ?? { transparente: false, fundoMp4: "#7A7A7A", categoria: "Outras", corte: null, descricao: "" };
  return { composition, meta };
}

export function intervalo(args, composition) {
  const de = args.de !== undefined ? Number(args.de) : 0;
  const ate = args.ate !== undefined ? Number(args.ate) : composition.durationInFrames - 1;
  return [Math.max(0, de), Math.min(composition.durationInFrames - 1, ate)];
}

export function props(args) {
  return args.props ? JSON.parse(args.props) : {};
}

export function garantirPasta(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/** Barra de progresso em uma linha por passo de 10% (o Rick gosta de ver o %). */
export function progresso(rotulo) {
  let ultimo = -1;
  return (fracao) => {
    const pct = Math.floor(fracao * 100);
    const passo = Math.floor(pct / 10);
    if (passo !== ultimo) {
      ultimo = passo;
      log(`${rotulo} ${pct}%`);
    }
  };
}
