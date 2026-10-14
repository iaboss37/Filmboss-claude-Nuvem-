// Registra sozinho toda peça de src/pecas/**/*.peca.tsx (export default de definirPeca ou de uma lista).
import React from "react";
import { Composition, Folder } from "remotion";
import "./estilo/fontes";
import { CATEGORIAS as CATS, embrulhar, type Meta, type Peca } from "./peca";
import ESTILO from "./estilo/estilo.json";

type Contexto = { keys(): string[]; (k: string): { default?: Peca | Peca[] } };
// webpack (bundler do Remotion) troca isto pela lista de arquivos na hora do bundle
const ctx: Contexto = (require as unknown as { context: (d: string, s: boolean, r: RegExp) => Contexto }).context("./pecas", true, /\.peca\.tsx$/);

const PECAS: Peca[] = ctx
  .keys()
  .filter((k) => k.startsWith("./"))
  .sort()
  .flatMap((k) => {
    const m = ctx(k).default;
    return m ? (Array.isArray(m) ? m : [m]) : [];
  });

const vistos = new Set<string>();
for (const p of PECAS) {
  if (vistos.has(p.id)) throw new Error(`Duas peças com o mesmo id: ${p.id}`);
  vistos.add(p.id);
}

const EMBRULHOS = new Map(PECAS.map((p) => [p.id, embrulhar(p.componente)]));
const CATEGORIAS: string[] = [...CATS, "Outras"];

export const RemotionRoot: React.FC = () => (
  <>
    {CATEGORIAS.map((cat) => {
      const daqui = PECAS.filter((p) => (p.categoria ?? "Outras") === cat);
      if (!daqui.length) return null;
      return (
        <Folder key={cat} name={cat}>
          {daqui.map((p) => {
            const meta: Meta = {
              transparente: !!p.transparente,
              fundoMp4: p.fundoMp4 ?? "#7A7A7A",
              categoria: p.categoria ?? "Outras",
              corte: p.corte ?? null,
              descricao: p.descricao ?? "",
            };
            return (
              <Composition
                key={p.id}
                id={p.id}
                component={EMBRULHOS.get(p.id)! as React.FC<Record<string, unknown>>}
                durationInFrames={p.duracao}
                fps={ESTILO.fps}
                width={p.largura ?? ESTILO.largura}
                height={p.altura ?? ESTILO.altura}
                defaultProps={{ ...(p.props ?? {}), _meta: meta }}
              />
            );
          })}
        </Folder>
      );
    })}
  </>
);
