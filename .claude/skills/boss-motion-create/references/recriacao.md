# Como recriar a referência no Remotion

Objetivo: a recriação tem que parecer o mesmo vídeo para quem assiste. Não é "inspirado em": é o mesmo sistema, plano a plano.

## Ordem
1. Leia analise.json (resumo, planos, movimentos), as folhas e a ficha.md. Escreva no estilo.md o sistema antes de animar.
2. `estilo.py medidas` já pôs curvas, tempos, obturador, fps, tamanho e cores em src/estilo/estilo.json. Confira no olho:
   a curva com poucos movimentos pode ter saído torta (veja "contagem_curvas"); a cor de destaque pode ter vindo de uma foto.
3. Fonte: checklist_10_pontos.md. Sons: idem.
4. Uma peça por plano em src/pecas/recriacao/ (`node scripts/nova.mjs Recriacao Plano-01`), mais uma peça "Recriacao" que junta
   todos em <Sequence> nos quadros exatos de planos.json. Elementos que se repetem (título, cartão, transição) viram componentes
   em src/estilo/ e são usados por todos os planos: é isso que a skill de estilo vai reaproveitar.
5. Tempos: copie os quadros de início e fim de cada movimento de movimentos.json (ini, fim) e a curva medida dele.
   Nada de tempo "no olho" quando a medida existe.
6. Imagens, vídeos e 3D da referência: não copiar o material de outra pessoa. Substitua por material próprio de mesmo papel
   (cor, enquadramento, movimento). 3D: recriar no Blender buscando o mesmo visual (MCP do Blender). IA só com OK e custo dito.
7. Som: efeitos nos mesmos eventos e com o mesmo atraso medido; trilha no mesmo andamento.

## Conferência (repetir até a diferença sumir)
1. `node scripts/quadros.mjs Recriacao <quadros> --folha` e compare com folhas/plano_NN.jpg da referência no MESMO quadro.
2. `node scripts/final.mjs Recriacao --escala 0.5` (rascunho) e `comparar.py`: olhe a folha_comparacao.jpg e os 3 piores itens.
3. Corrija o pior item primeiro. Meta: nota 85 ou mais e nenhum item abaixo de 60 (a semelhança quadro a quadro pode ficar
   baixa quando as imagens foram trocadas por material próprio; aí vale o olho).
4. Só depois disso mostre ao Rick: o lado_a_lado.mp4 e a nota. Render final no tamanho da referência só depois do OK.

## Armadilhas já vividas
- Fidelidade: copiar o sistema plano a plano; não misturar com o design system Filmboss nem com outra referência.
- Paleta de marca alheia (logo, cor de empresa): copie o movimento; a cor de marca vira a cor do Rick só na skill de estilo, se ele pedir.
- Nada de colagem infantil: motion de empresa grande, com rigor.
- Borrão: o render final faz a média em ponto flutuante (sem degraus). Na prévia o borrão é aproximado.
- Cor: o MP4 sai etiquetado BT.709. No Resolve, ProRes com alfa é Straight.
- Só está feito depois de ver o quadro exportado.
