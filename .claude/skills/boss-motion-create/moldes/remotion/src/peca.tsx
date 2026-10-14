// Como uma peça se registra. Cada animador cria o próprio arquivo terminado em .peca.tsx dentro de src/pecas/
// (em qualquer subpasta) com um export default de definirPeca({...}) ou de uma lista delas. O Root acha sozinho:
// ninguém precisa editar um arquivo compartilhado.
import React from "react";
import { AbsoluteFill, Freeze, getInputProps, useCurrentFrame } from "remotion";

/** Recriacao = a recriação da referência; as outras são peças soltas do estilo. */
export const CATEGORIAS = ["Recriacao", "Textos", "Transicoes", "Elementos", "Fundos", "Teste"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type Peca<P extends Record<string, unknown> = Record<string, unknown>> = {
  /** Nome da composição: letras, números e hífen (sem espaço, acento ou _). Ex.: "Titulo-Entrada". */
  id: string;
  componente: React.FC<P>;
  /** Duração em quadros, no fps do estilo (estilo.json). */
  duracao: number;
  largura?: number; // padrão: largura de estilo.json
  altura?: number; // padrão: altura de estilo.json
  /** true = a peça não pinta fundo: o render final sai também em ProRes 4444 com alfa (.mov). */
  transparente?: boolean;
  /** Cor por trás do MP4 e da prévia quando a peça é transparente (padrão cinza médio #7A7A7A). */
  fundoMp4?: string;
  categoria?: Categoria;
  /** Quadro de corte das transições: onde o clipe novo começa por baixo (vai para o LEIA-ME da entrega). */
  corte?: number;
  descricao?: string;
  props?: P;
};

export const definirPeca = <P extends Record<string, unknown>>(p: Peca<P>) => p;

/** Metadados que os scripts de render leem de composition.props._meta. */
export type Meta = { transparente: boolean; fundoMp4: string; categoria: string; corte: number | null; descricao: string };

/** Props internas usadas pelos scripts de render (não use nas peças):
 *  _t        deslocamento do tempo em quadros (subquadro do motion blur do render final)
 *  _borrao   amostras do borrão dentro do navegador (prévia com motion blur aproximado)
 *  _obturador fração do quadro em que o obturador fica aberto (0,5 = 180 graus)
 *  _fundo    cor pintada por trás (prévia de peça transparente) */
export type Internas = { _t?: number; _borrao?: number; _obturador?: number; _fundo?: string; _meta?: Meta };

/** Envolve o componente da peça: aplica o subquadro (_t) e o borrão da prévia (_borrao).
 *  As amostras ficam DEPOIS do quadro (de q a q + obturador): um corte seco no quadro q continua seco. */
export const embrulhar = <P extends Record<string, unknown>>(C: React.FC<P>) => {
  const Embrulho: React.FC<P & Internas> = (todas) => {
    // as internas chegam pelas props ou direto pelas inputProps do render (os scripts mudam só o _t entre as
    // amostras, sem selecionar a composição de novo)
    const entrada = (typeof window !== "undefined" ? getInputProps() : {}) as Internas;
    const { _t: t0, _borrao: b0, _obturador: o0, _fundo: f0, _meta, ...props } = todas as P & Internas;
    const _t = t0 ?? entrada._t ?? 0;
    const _borrao = b0 ?? entrada._borrao ?? 0;
    const _obturador = o0 ?? entrada._obturador ?? 0.5;
    const _fundo = f0 ?? entrada._fundo;
    const frame = useCurrentFrame();
    const fundo = _fundo ? <AbsoluteFill style={{ background: _fundo }} /> : null;
    if (_borrao > 1) {
      return (
        <AbsoluteFill>
          {fundo}
          <AbsoluteFill style={{ isolation: "isolate" }}>
            {Array.from({ length: _borrao }, (_, i) => (
              <AbsoluteFill key={i} style={{ opacity: 1 / _borrao, mixBlendMode: "plus-lighter" }}>
                <Freeze frame={frame + (_obturador * i) / _borrao}>
                  <C {...(props as unknown as P)} />
                </Freeze>
              </AbsoluteFill>
            ))}
          </AbsoluteFill>
        </AbsoluteFill>
      );
    }
    const corpo = _t ? (
      <Freeze frame={frame + _t}>
        <C {...(props as unknown as P)} />
      </Freeze>
    ) : (
      <C {...(props as unknown as P)} />
    );
    return fundo ? (
      <AbsoluteFill>
        {fundo}
        {corpo}
      </AbsoluteFill>
    ) : (
      corpo
    );
  };
  Embrulho.displayName = `Peca(${C.displayName ?? C.name ?? "componente"})`;
  return Embrulho;
};
