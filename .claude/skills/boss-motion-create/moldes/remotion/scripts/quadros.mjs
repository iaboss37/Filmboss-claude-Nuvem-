// Quadros PNG de uma composição, para storyboard e conferência.
//
//   node scripts/quadros.mjs <Id> [opções]
//     --quadros 0,7,14,30    quais quadros (padrão: um a cada 6)
//     --cada 6               um quadro a cada N
//     --escala 1             1 = 1920 x 1080; 0.5 para conferir rápido
//     --mb 16                motion blur REAL: N subquadros por quadro, média em float fora do navegador (igual ao final)
//     --borrao 8             motion blur aproximado dentro do navegador (mais rápido, pode fazer degraus de cor)
//     --obturador 0.5        fração do quadro com o obturador aberto (0,5 = 180 graus)
//     --folha                monta também a folha de storyboard (grade com número do quadro e tempo)
//     --saida pasta          padrão out/quadros/<Id>
//     --props '{"x":1}'
// Saída: <pasta>/<Id> - q007.png (e "<Id> - storyboard.png" com --folha).
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { renderStill } from "@remotion/renderer";
import { CHROMIUM, PYTHON, RAIZ, argumentos, composicao, empacotar, exigirId, garantirPasta, log, navegador, props } from "./comum.mjs";

const args = argumentos();
const id = exigirId(args, "uso: node scripts/quadros.mjs <Id> [--quadros 0,7,14] [--cada 6] [--escala 1] [--mb 16] [--folha] [--saida pasta]");
const serveUrl = await empacotar();
const browser = await navegador();
try {
  const base = props(args);
  const { composition: c0, meta } = await composicao(serveUrl, browser, id, base);
  const dur = c0.durationInFrames;
  const quadros = args.quadros
    ? String(args.quadros).split(",").map((s) => Math.min(dur - 1, Math.max(0, Number(s.trim()))))
    : Array.from({ length: Math.ceil(dur / Number(args.cada ?? 6)) }, (_, i) => i * Number(args.cada ?? 6)).filter((q) => q < dur);
  const pasta = garantirPasta(path.resolve(args.saida ?? path.join(RAIZ, "out/quadros", id)));
  const escala = Number(args.escala ?? 1);
  const mb = Number(args.mb ?? 0);
  const obt = Number(args.obturador ?? 0.5);
  const nome = (q) => path.join(pasta, `${id} - q${String(q).padStart(3, "0")}.png`);
  const still = async (q, extra, saida) => {
    // a composição é a mesma; só as props internas (_t, _borrao) mudam, lidas pelo embrulho via getInputProps()
    const inputProps = { ...base, ...extra };
    await renderStill({ composition: c0, serveUrl, frame: q, output: saida, inputProps, scale: escala, imageFormat: "png", puppeteerInstance: browser, chromiumOptions: CHROMIUM, overwrite: true });
  };
  for (const [k, q] of quadros.entries()) {
    if (mb > 1) {
      const tmp = garantirPasta(path.join(pasta, `.sub_${q}`));
      const amostras = [];
      for (let i = 0; i < mb; i++) {
        const p = path.join(tmp, `s${String(i).padStart(2, "0")}.png`);
        await still(q, { _t: (obt * i) / mb }, p);
        amostras.push(p);
      }
      execFileSync(PYTHON, [path.join(RAIZ, "scripts/media.py"), "png", nome(q), ...(meta.transparente ? ["--transparente"] : []), ...amostras], { stdio: "inherit" });
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      await still(q, args.borrao ? { _borrao: Number(args.borrao), _obturador: obt } : {}, nome(q));
    }
    log(`quadro ${q} (${k + 1} de ${quadros.length}) ok`);
  }
  if (args.folha) {
    const folha = path.join(pasta, `${id} - storyboard.png`);
    execFileSync(PYTHON, [path.join(RAIZ, "scripts/folha.py"), folha, id, ...quadros.map((q) => `${q}=${nome(q)}`)], { stdio: "inherit" });
    log(`folha ${folha}`);
  }
  log(`ok ${pasta}`);
} finally {
  await browser.close({ silent: true });
}
