// Carrega as fontes listadas em estilo.json (arquivos em public/fonts). Nenhuma fonte vem da internet na hora do render.
import { continueRender, delayRender, staticFile } from "remotion";
import ESTILO from "./estilo.json";

type Fonte = { familia: string; arquivo: string; peso?: string; estilo?: string; largura?: string };

const lista = (ESTILO.fontes ?? []) as Fonte[];

if (typeof document !== "undefined" && lista.length) {
  const espera = delayRender("fontes do estilo");
  Promise.all(
    lista.map(async (f) => {
      const face = new FontFace(f.familia, `url(${staticFile(`fonts/${f.arquivo}`)})`, {
        weight: "100 900", // um arquivo por papel: o peso escolhido já está no arquivo (sem negrito falso)
        style: f.estilo ?? "normal",
        stretch: f.largura ?? "normal",
      });
      await face.load();
      document.fonts.add(face);
    }),
  )
    .catch((e) => console.error("fonte não carregou", e))
    .finally(() => continueRender(espera));
}

/** Família pelo papel (titulo, texto, rotulo...): use FONTE.titulo no fontFamily. */
export const FONTE: Record<string, string> = Object.fromEntries(
  lista.map((f) => [(f as Fonte & { papel?: string }).papel ?? f.familia, f.familia]),
);
