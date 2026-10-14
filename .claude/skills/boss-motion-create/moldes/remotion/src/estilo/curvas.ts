// Curvas e tempos do estilo, lidos de estilo.json (medidos na referência pela análise da boss-motion-create).
// Pense em quadros: os tempos de estilo.json estão em quadros no fps do estilo.
import { Easing, interpolate, random } from "remotion";
import ESTILO from "./estilo.json";

export const FPS: number = ESTILO.fps;

const bz = (c: number[]) => Easing.bezier(c[0], c[1], c[2], c[3]);
const curvasMedidas = Object.fromEntries(Object.entries(ESTILO.curvas as Record<string, number[]>).map(([k, v]) => [k, bz(v)]));

/** Curvas do estilo (cubic-bezier medidas na referência) + pop (passa do ponto e volta) + linear (câmera e glitch). */
export const CURVA: Record<string, (t: number) => number> = {
  chegada: Easing.bezier(0.16, 1, 0.3, 1),
  troca: Easing.bezier(0.65, 0, 0.35, 1),
  saida: Easing.bezier(0.7, 0, 0.84, 0),
  ...curvasMedidas,
  pop: Easing.out(Easing.back(ESTILO.pop?.excesso ?? 1.7)),
  linear: (t: number) => t,
};

export type NomeCurva = string;

/** Tempos do estilo, em quadros. */
export const TEMPO = ESTILO.tempos as Record<string, number>;

/** Cores do estilo (fundo, texto, destaque e as outras medidas). */
export const COR = ESTILO.cores as Record<string, string>;

/** Bloqueio "em dois": a animação anda a cada 2 quadros (estilo de quem anima assim). */
export const passo = (frame: number) => (ESTILO.emDois ? Math.floor(frame / 2 + 1e-6) * 2 : frame);

const resolver = (c: NomeCurva | ((t: number) => number)) => (typeof c === "function" ? c : CURVA[c] ?? CURVA.chegada);

/** Progresso de 0 a 1 entre 'inicio' e 'inicio + duracao' (em quadros), já com a curva. */
export const prog = (frame: number, inicio: number, duracao: number, curva: NomeCurva | ((t: number) => number) = "chegada") =>
  interpolate(frame, [inicio, inicio + Math.max(duracao, 1e-6)], [0, 1], {
    easing: resolver(curva),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** Valor animado de 'de' para 'para' em 'duracao' quadros a partir de 'inicio'. */
export const anima = (
  frame: number,
  inicio: number,
  duracao: number,
  de: number,
  para: number,
  curva: NomeCurva | ((t: number) => number) = "chegada",
) => de + (para - de) * prog(frame, inicio, duracao, curva);

/** Liga quando o quadro chega em 'inicio' (corte seco). Funciona certo com o motion blur por subquadros. */
export const desde = (frame: number, inicio: number) => frame >= inicio;

/** Quadro inteiro (para coisas que mudam uma vez por quadro: tremida, glitch, piscar de pixel, sorteio).
 *  No render final o quadro vem fracionado (subquadros do motion blur): sorteie sempre com o quadro inteiro. */
export const quadroInteiro = (frame: number) => Math.floor(frame + 1e-6);

/** Câmera viva: aproximação lenta e linear do primeiro ao último quadro (valores medidos em estilo.json). */
export const camera = (frame: number, duracao: number, de = ESTILO.camera.aproximacao[0], para = ESTILO.camera.aproximacao[1]) =>
  interpolate(frame, [0, Math.max(duracao - 1, 1)], [de, para], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Soco de câmera num tempo forte: de 'pico' para 1 em poucos quadros, curva chegada. Antes do quadro, 1. */
export const soco = (frame: number, quadro: number, pico = ESTILO.camera.soco, duracao = ESTILO.camera.socoQuadros) =>
  frame < quadro ? 1 : anima(frame, quadro, duracao, pico, 1, "chegada");

/** Tremida (registro de urgência ou risada): 18 a 28 px caindo até zero em 3 a 4 quadros, sorteada por quadro inteiro. */
export const tremida = (frame: number, inicio: number, duracao = 4, amplitude = 24, semente = "tremida") => {
  const q = quadroInteiro(frame);
  if (q < inicio || q >= inicio + duracao) return { x: 0, y: 0, rot: 0 };
  const k = 1 - (q - inicio) / duracao;
  return {
    x: (random(`${semente}-x-${q}`) * 2 - 1) * amplitude * k,
    y: (random(`${semente}-y-${q}`) * 2 - 1) * amplitude * k,
    rot: (random(`${semente}-r-${q}`) * 2 - 1) * 2 * k,
  };
};

/** Boia flutuando (contínuo): sobe e desce 8 a 10 px (ciclo de 1,6 s) e balança 4 graus (ciclo de 2 s). */
export const boia = (frame: number, fase = 0, altura = 9, giro = 4) => ({
  y: Math.sin(((frame / FPS) * 2 * Math.PI) / 1.6 + fase) * altura,
  rot: Math.sin(((frame / FPS) * 2 * Math.PI) / 2 + fase * 1.3) * giro,
});

/** Atrasos em escada: o item i começa em inicio + i * intervalo (letra por letra, palavra por palavra). */
export const escada = (i: number, inicio: number, intervalo = 3) => inicio + i * intervalo;
