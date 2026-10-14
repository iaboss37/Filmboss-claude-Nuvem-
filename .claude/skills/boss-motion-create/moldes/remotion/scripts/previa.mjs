// Prévia rápida: H.264 em 960 x 540 (metade do quadro), BT.709 etiquetado, com o som dos efeitos.
//
//   node scripts/previa.mjs <Id> [opções]
//     --saida arquivo.mp4    padrão out/previas/<Id>.mp4
//     --escala 0.5           escala do quadro (1 = 1920 x 1080)
//     --borrao 6             motion blur aproximado dentro do navegador (6 a 8 amostras; mais lento)
//     --de 0 --ate 47        só um trecho (quadros)
//     --props '{"fundo":"amarelo"}'   props da composição
//     --sem-som              sem áudio
//     --concorrencia 4
import path from "node:path";
import { renderMedia } from "@remotion/renderer";
import { CHROMIUM, CONCORRENCIA_PADRAO, RAIZ, argumentos, composicao, empacotar, exigirId, garantirPasta, intervalo, log, navegador, progresso, props } from "./comum.mjs";

const args = argumentos();
const id = exigirId(args, "uso: node scripts/previa.mjs <Id> [--saida x.mp4] [--escala 0.5] [--borrao 6] [--de N --ate N] [--props json] [--sem-som]");
const serveUrl = await empacotar();
const browser = await navegador();
try {
  const base = props(args);
  const { meta } = await composicao(serveUrl, browser, id, base);
  const inputProps = { ...base };
  if (args.borrao) inputProps._borrao = Number(args.borrao);
  if (meta.transparente) inputProps._fundo = meta.fundoMp4;
  const { composition } = await composicao(serveUrl, browser, id, inputProps);
  const saida = path.resolve(args.saida ?? path.join(RAIZ, "out/previas", `${id}.mp4`));
  garantirPasta(path.dirname(saida));
  const passo = progresso(`prévia ${id}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: saida,
    inputProps,
    scale: Number(args.escala ?? 0.5),
    crf: 18,
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    imageFormat: "jpeg",
    jpegQuality: 92,
    frameRange: intervalo(args, composition),
    concurrency: Number(args.concorrencia ?? CONCORRENCIA_PADRAO),
    muted: !!args["sem-som"],
    puppeteerInstance: browser,
    chromiumOptions: CHROMIUM,
    onProgress: ({ progress }) => passo(progress),
  });
  log(`ok ${saida}`);
} finally {
  await browser.close({ silent: true });
}
