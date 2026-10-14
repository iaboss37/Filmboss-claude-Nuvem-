// <Efeito>: efeito sonoro com o ATAQUE do som (medido em sfx.json por scripts/medir_sfx.py) colado no quadro pedido.
// O tempo de cada efeito em relação ao visual vem da análise da referência (references/estilo.md do estilo).
import React from "react";
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import SFX_JSON from "./sfx.json";
import { FPS } from "./curvas";

type InfoSom = { arquivo: string; ataque: number; duracao: number };
const SFX = SFX_JSON as Record<string, InfoSom>;
export type NomeSom = string;

/** Volumes de partida por tipo de som (a análise da referência ajusta no estilo gerado). */
export const VOLUME: Record<string, number> = { clique: 0.45, pop: 0.45, hit: 0.75, whoosh: 0.55, glitch: 0.4, brilho: 0.8, bip: 0.5 };

export const Efeito: React.FC<{ som: NomeSom; quadro: number; volume?: number; duracao?: number }> = ({ som, quadro, volume = 0.5, duracao }) => {
  const info = SFX[som];
  if (!info) return null; // som que não está em sfx.json: fica mudo em vez de quebrar o render
  const inicio = quadro - info.ataque * FPS; // em quadros, pode ser fracionado
  const from = Math.max(0, Math.ceil(inicio));
  const trimBefore = from - inicio; // quadros do arquivo que ficam antes do 'from'
  const dur = Math.max(1, Math.ceil(duracao ?? info.duracao * FPS - trimBefore));
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <Audio src={staticFile(`sfx/${info.arquivo}`)} trimBefore={trimBefore > 0 ? trimBefore : undefined} volume={volume} />
    </Sequence>
  );
};
