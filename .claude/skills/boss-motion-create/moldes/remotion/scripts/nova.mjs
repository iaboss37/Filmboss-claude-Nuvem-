// Cria uma peça nova a partir do modelo.
//   node scripts/nova.mjs <Categoria> <Id>
//   Categoria: Recriacao, Textos, Transicoes, Elementos, Fundos ou Teste.  Id: letras, números e hífen.
// Cria src/pecas/<categoria>/<Id>.peca.tsx. O Root acha sozinho; não precisa registrar em lugar nenhum.
import path from "node:path";
import fs from "node:fs";
import { RAIZ, argumentos } from "./comum.mjs";

const args = argumentos();
const [categoria, id] = args._;
const CATS = ["Recriacao", "Textos", "Transicoes", "Elementos", "Fundos", "Teste"];
if (!CATS.includes(categoria) || !/^[A-Za-z0-9-]+$/.test(id ?? "")) {
  console.error(`uso: node scripts/nova.mjs <${CATS.join("|")}> <Id com letras, números e hífen>`);
  process.exit(1);
}
const pasta = path.join(RAIZ, "src/pecas", categoria.toLowerCase());
const arq = path.join(pasta, `${id}.peca.tsx`);
if (fs.existsSync(arq)) {
  console.error(`já existe: ${arq}`);
  process.exit(1);
}
const comp = id.replace(/-/g, "");
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(
  arq,
  `// ${id}: descreva aqui a peça em uma linha (o que entra, o que sai, onde corta).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COR, TEMPO, anima, camera, soco } from "../../estilo/curvas";
import { FONTE } from "../../estilo/fontes";
import { Efeito } from "../../estilo/Som";
import { definirPeca } from "../../peca";

const DURACAO = TEMPO.plano;

const ${comp}: React.FC = () => {
  const frame = useCurrentFrame(); // no render final vem fracionado (subquadros do motion blur): não arredonde
  const zoom = camera(frame, DURACAO) * soco(frame, 6);
  const y = anima(frame, 0, TEMPO.chegada, 80, 0, "chegada");
  return (
    <AbsoluteFill style={{ background: COR.fundo, alignItems: "center", justifyContent: "center", transform: \`scale(\${zoom})\` }}>
      <div style={{ color: COR.texto, fontFamily: FONTE.titulo, fontSize: 140, transform: \`translateY(\${y}px)\` }}>${id}</div>
      <Efeito som="entrada" quadro={0} />
    </AbsoluteFill>
  );
};

export default definirPeca({
  id: "${id}",
  componente: ${comp},
  duracao: DURACAO,
  categoria: "${categoria}",
  // transparente: true,   // sem fundo: o final sai também em ProRes 4444 com alfa
  // corte: 12,            // transições: quadro em que o clipe novo começa por baixo
  descricao: "",
});
`,
);
console.log(`ok ${arq}`);
