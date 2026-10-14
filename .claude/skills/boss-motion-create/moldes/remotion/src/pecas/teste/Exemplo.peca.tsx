// Exemplo: título que entra com a curva de chegada do estilo, assenta e sai pela curva de saída.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COR, TEMPO, anima, camera } from "../../estilo/curvas";
import { FONTE } from "../../estilo/fontes";
import { definirPeca } from "../../peca";

const DURACAO = 48;

const Exemplo: React.FC = () => {
  const frame = useCurrentFrame();
  const entra = anima(frame, 0, TEMPO.chegada, 120, 0, "chegada");
  const sai = anima(frame, DURACAO - TEMPO.saida, TEMPO.saida, 0, -140, "saida");
  return (
    <AbsoluteFill style={{ background: COR.fundo, alignItems: "center", justifyContent: "center", transform: `scale(${camera(frame, DURACAO)})` }}>
      <div style={{ color: COR.texto, fontFamily: FONTE.titulo ?? "sans-serif", fontWeight: 800, fontSize: 150, transform: `translateY(${entra + sai}px)` }}>
        Boss <span style={{ color: COR.destaque }}>Motion</span>
      </div>
    </AbsoluteFill>
  );
};

export default definirPeca({ id: "Exemplo", componente: Exemplo, duracao: DURACAO, categoria: "Teste", descricao: "teste do molde" });
