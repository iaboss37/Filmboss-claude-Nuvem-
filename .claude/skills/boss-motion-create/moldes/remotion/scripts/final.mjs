// Render final no tamanho e fps do estilo (estilo.json), com motion blur REAL.
// Cada quadro com movimento vira N subquadros (padrão 16, obturador de 180 graus, amostras de q a q + 0,5) renderizados
// em PNG pelo Chrome; a média sai em ponto flutuante fora do navegador (scripts/media.py), sem os degraus de cor do 8 bits.
// Quadro parado (as duas pontas do obturador iguais) usa uma amostra só.
//
// Saída (sempre BT.709 etiquetado):
//   <Nome>.mp4   H.264 de alta qualidade (CRF 10, 4:2:0 8 bits); peça transparente vai sobre a cor fundoMp4
//   <Nome>.mov   ProRes 4444 com alfa (só quando a peça é transparente, ou com --mov). No Resolve: alfa Straight.
//
//   node scripts/final.mjs <Id> [opções]
//     --nome "Vinheta Abertura V2"   nome dos arquivos (padrão: o id)
//     --saida pasta                   padrão out/final/<Id>
//     --amostras 16                   subquadros por quadro com movimento (32 para movimentos muito rápidos)
//     --obturador 0.5                 fração do quadro (padrão: o medido em estilo.json; 0,5 = 180 graus)
//     --escala 1                      2 = 4K
//     --mov                           também ProRes 4444 numa peça opaca
//     --de 0 --ate 47                 só um trecho
//     --props '{"fundo":"branco"}'
//     --sem-som
//     --copiar pasta                  copia os arquivos prontos para essa pasta
//     --concorrencia 4                não passe de 4: outras peças renderizam ao mesmo tempo
import path from "node:path";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { renderFrames, renderMedia } from "@remotion/renderer";
import {
  CHROMIUM,
  CONCORRENCIA_PADRAO,
  PYTHON,
  RAIZ,
  argumentos,
  composicao,
  empacotar,
  exigirId,
  garantirPasta,
  intervalo,
  log,
  navegador,
  props,
} from "./comum.mjs";

const args = argumentos();
const id = exigirId(args, 'uso: node scripts/final.mjs <Id> [--nome "Nome"] [--saida pasta] [--amostras 16] [--escala 1] [--mov] [--copiar pasta]');
const N = Math.max(1, Number(args.amostras ?? 16));
// obturador medido na referência (estilo.json); --obturador troca só neste render
const ESTILO = JSON.parse(fs.readFileSync(path.join(RAIZ, "src/estilo/estilo.json"), "utf8"));
const OBT = Number(args.obturador ?? ESTILO.obturador ?? 0.5);
const ESCALA = Number(args.escala ?? 1);
const CONC = Math.min(8, Number(args.concorrencia ?? CONCORRENCIA_PADRAO));
const BLOCO = 96; // quadros por bloco (limita o disco temporário; cada bloco faz N passadas)
const POS = Array.from({ length: N }, (_, i) => (OBT * i) / N);

const t0 = Date.now();
const serveUrl = await empacotar();
const browser = await navegador();
const tmp = garantirPasta(path.join(RAIZ, "out/.sub_tmp", `${id}-${process.pid}`));
let py = null;
try {
  const base = props(args);
  const { composition, meta } = await composicao(serveUrl, browser, id, base);
  const [de, ate] = intervalo(args, composition);
  const total = ate - de + 1;
  const W = Math.round(composition.width * ESCALA);
  const H = Math.round(composition.height * ESCALA);
  const nome = args.nome ?? id;
  const pasta = garantirPasta(path.resolve(args.saida ?? path.join(RAIZ, "out/final", id)));
  const querMov = meta.transparente || !!args.mov;
  log(`${id}: ${total} quadros, ${W} x ${H}, ${N} amostras, ${meta.transparente ? "transparente (MP4 + MOV com alfa)" : querMov ? "opaca (MP4 + MOV)" : "opaca (MP4)"}`);

  // ---- som (efeitos), renderizado à parte
  let wav = null;
  if (!args["sem-som"]) {
    wav = path.join(tmp, "som.wav");
    await renderMedia({ composition, serveUrl, codec: "wav", outputLocation: wav, inputProps: base, frameRange: [de, ate], concurrency: CONC, puppeteerInstance: browser, chromiumOptions: CHROMIUM });
    const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", wav, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const m = vd.match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
    if (!m || m[1] === "-inf" || Number(m[1]) < -80) {
      wav = null;
      log("sem som na peça");
    } else log(`som ok (pico ${m[1]} dB)`);
  }

  // ---- média em float (Python), com os codificadores abertos
  const vMp4 = path.join(tmp, "video.mp4");
  const vMov = querMov ? path.join(tmp, "video.mov") : null;
  py = spawn(PYTHON, [path.join(RAIZ, "scripts/media.py"), "servidor"], { stdio: ["pipe", "pipe", "inherit"] });
  const respostas = readline.createInterface({ input: py.stdout });
  const esperando = new Map();
  respostas.on("line", (l) => {
    try {
      const m = JSON.parse(l);
      const k = m.ok !== undefined ? `b${m.ok}` : m.fim ? "fim" : null;
      if (k && esperando.has(k)) {
        esperando.get(k)();
        esperando.delete(k);
      }
    } catch {}
  });
  const pyErro = new Promise((_, rej) => py.on("exit", (c) => c && rej(new Error(`media.py saiu com código ${c}`))));
  const enviar = (msg, chave) => {
    const p = new Promise((res) => esperando.set(chave, res));
    py.stdin.write(JSON.stringify(msg) + "\n");
    return Promise.race([p, pyErro]);
  };
  py.stdin.write(JSON.stringify({ inicio: { w: W, h: H, fps: composition.fps, mp4: vMp4, mov: vMov, fundo: meta.transparente ? meta.fundoMp4 : "#000000" } }) + "\n");

  // ---- passadas: uma renderização por posição do obturador
  const passe = async (dir, i, faixa) => {
    const out = garantirPasta(path.join(dir, `s${String(i).padStart(2, "0")}`));
    await renderFrames({
      composition,
      serveUrl,
      inputProps: { ...base, _t: POS[i] },
      outputDir: out,
      imageFormat: "png",
      scale: ESCALA,
      frameRange: faixa,
      concurrency: CONC,
      puppeteerInstance: browser,
      chromiumOptions: CHROMIUM,
      onStart: () => {},
      onFrameUpdate: () => {},
    });
    return out;
  };
  const arquivos = (dir) => {
    const m = new Map();
    for (const f of fs.readdirSync(dir)) {
      const r = f.match(/(\d+)\.png$/);
      if (r) m.set(Number(r[1]), path.join(dir, f));
    }
    return m;
  };
  const iguais = (a, b) => {
    const x = fs.readFileSync(a);
    const y = fs.readFileSync(b);
    return x.length === y.length && x.equals(y);
  };
  const faixas = (lista) => {
    const out = [];
    for (const q of lista) {
      const ult = out[out.length - 1];
      if (ult && q === ult[1] + 1) ult[1] = q;
      else out.push([q, q]);
    }
    return out;
  };

  let feitos = 0;
  let pendente = null;
  const blocos = [];
  for (let a = de; a <= ate; a += BLOCO) blocos.push([a, Math.min(ate, a + BLOCO - 1)]);
  for (const [k, [a, b]] of blocos.entries()) {
    const dir = path.join(tmp, `b${k}`);
    const ini = arquivos(await passe(dir, 0, [a, b]));
    let moveis = [];
    let fim = ini;
    if (N > 1) {
      fim = arquivos(await passe(dir, N - 1, [a, b]));
      for (let q = a; q <= b; q++) {
        if (!ini.has(q) || !fim.has(q)) throw new Error(`faltou a amostra do quadro ${q} (nomes: ${[...ini.keys()].slice(0, 3)})`);
        if (!iguais(ini.get(q), fim.get(q))) moveis.push(q);
      }
    }
    const meio = [];
    const fx = faixas(moveis);
    for (let i = 1; i < N - 1 && moveis.length; i++) {
      const d = path.join(dir, `s${String(i).padStart(2, "0")}`);
      for (const f of fx) await passe(dir, i, f);
      meio[i] = arquivos(d);
      log(`bloco ${k + 1} de ${blocos.length}: amostra ${i + 1} de ${N} (${Math.round((100 * (feitos + ((b - a + 1) * (i + 1)) / N)) / total)}%)`);
    }
    const mset = new Set(moveis);
    const quadros = [];
    for (let q = a; q <= b; q++) {
      if (!mset.has(q)) quadros.push([q, [ini.get(q)]]);
      else quadros.push([q, POS.map((_, i) => (i === 0 ? ini.get(q) : i === N - 1 ? fim.get(q) : meio[i].get(q)))]);
    }
    if (pendente) await pendente;
    pendente = enviar({ bloco: k, quadros, apagar: [dir] }, `b${k}`);
    feitos += b - a + 1;
    log(`render ${Math.round((100 * feitos) / total)}% (quadros ${a} a ${b}: ${moveis.length} com movimento)`);
  }
  if (pendente) await pendente;
  await enviar({ fim: true }, "fim");
  log("média e codificação ok");

  // ---- junta o som e confere
  const final = [];
  // som mais curto que a peça (ex.: só o som do logo) é completado com silêncio; o vídeo nunca é cortado
  const juntar = (video, saida, audioCodec) => {
    if (!wav) {
      fs.copyFileSync(video, saida);
    } else {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", ...audioCodec, "-af", "apad", "-t", String(total / composition.fps), ...(saida.endsWith(".mp4") ? ["-movflags", "+faststart"] : []), saida], { encoding: "utf8" });
      if (r.status) throw new Error(r.stderr);
    }
    final.push(saida);
  };
  juntar(vMp4, path.join(pasta, `${nome}.mp4`), ["-c:a", "aac", "-b:a", "320k"]);
  if (vMov) juntar(vMov, path.join(pasta, `${nome}.mov`), ["-c:a", "pcm_s24le"]);
  for (const f of final) {
    const p = JSON.parse(
      spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=codec_name,pix_fmt,width,height,color_space,color_primaries,color_transfer,nb_read_packets", "-of", "json", f], { encoding: "utf8" }).stdout,
    ).streams[0];
    const ok = Number(p.nb_read_packets) === total && p.color_space === "bt709" && p.color_primaries === "bt709" && p.color_transfer === "bt709";
    log(`${ok ? "ok" : "CONFERIR"} ${f} (${p.codec_name} ${p.pix_fmt} ${p.width}x${p.height}, ${p.nb_read_packets} quadros, ${p.color_space}/${p.color_primaries}/${p.color_transfer})`);
  }
  if (meta.corte !== null && meta.corte !== undefined) log(`quadro de corte da transição: ${meta.corte}`);

  // ---- cópias no disco
  const copiar = (destino) => {
    garantirPasta(destino);
    for (const f of final) fs.copyFileSync(f, path.join(destino, path.basename(f)));
    log(`copiado para ${destino}`);
  };
  if (args.copiar) copiar(String(args.copiar));
  log(`pronto em ${((Date.now() - t0) / 60000).toFixed(1)} min`);
} finally {
  if (py && py.exitCode === null) py.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close({ silent: true });
}
