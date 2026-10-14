---
name: {{SKILL}}
description: "{{DESCRICAO}} Use sempre que pedirem um vídeo, vinheta, abertura, texto animado ou peça de motion no estilo {{NOME}}, ou digitarem /{{SKILL}}."
---

# Estilo {{NOME}}

{{FRASE}}

Pacote independente: projeto Remotion com as medidas do estilo, componentes, fontes livres e efeitos sonoros dentro.
Gerado pela boss-motion-create em {{DATA}} a partir de um estudo aprovado (nota {{NOTA}} na comparação com a referência).

Antes de criar qualquer coisa:
1. Leia `references/estilo.md` (regras, componentes e o que nunca fazer).
2. OLHE `previa/quadros/storyboard.jpg` e os `previa/quadros/plano_NN.jpg`: são quadros da recriação aprovada, a régua visual do estilo.
   Composição, tamanho do texto, cor, respiro e acabamento do vídeo novo têm que parecer com eles. Assista também `previa/estilo.mp4`.
Medidas completas da referência, plano a plano (ritmo, movimentos, entrada do texto, transições, som), em `references/medidas_referencia.json`.
A prévia do estilo está em `previa/` (vídeo e storyboard): é a régua de qualidade.

## Medidas (src/estilo/estilo.json)
{{MEDIDAS}}

## Instalação (uma vez por computador)
Se `projeto/node_modules` não existir: `bash <pasta desta skill>/instalar.sh` (precisa de Node 18+, ffmpeg e python3; faz o npm install e o venv do numpy).
Na nuvem (Claude Code na web) a máquina é nova a cada sessão: rode o instalar.sh antes de começar (uns minutos, em segundo plano).

## Fluxo
1. Entenda o pedido. Se faltar, pergunte numa mensagem só: o texto ou roteiro, o formato (16:9, 9:16, 1:1, 4:5), a duração e se tem voz ou trilha própria. Nunca escolha o formato sozinho.
2. Se o pedido tiver 3D, filmagem ou ilustração, pergunte como fazer essas partes:
   - no Blender (se houver Blender e o MCP do Blender nesta máquina),
   - com IA (dizer o custo estimado antes e esperar o OK),
   - ou sem elas, em motion tradicional (formas, texto e cor do estilo).
3. Crie a pasta do vídeo: `bash <pasta desta skill>/scripts/novo_video.sh "<Nome do vídeo>" [pasta]`
   (padrão: `~/BossEstilos/{{NOME_CURTO}}/videos/NNN - Nome`; se as regras de pasta de quem usa disserem outro lugar, siga elas e passe a pasta;
   na nuvem passe `boss-motion/videos` dentro do repositório, que fica fora do git e pode ser aberto pelo app).
   O node_modules e o venv são atalhos para os da skill: nada é instalado de novo.
4. Escreva as peças em `src/pecas/` com `node scripts/nova.mjs <Categoria> <Id>`, usando SÓ o sistema do estilo:
   curvas `CURVA`/`anima`/`prog`, tempos `TEMPO`, cores `COR`, fontes `FONTE`, sons `<Efeito>` e os componentes de `src/estilo/`.
   As peças da recriação (`src/pecas/recriacao/`) são o exemplo de como o estilo monta um plano.
   Formato diferente da referência: passe `largura`/`altura` no definirPeca e posicione em % do quadro.
5. Aprovação em etapas:
   - quadros-chave: `node scripts/quadros.mjs <Id> --folha`; ponha a folha ao lado de `previa/quadros/storyboard.jpg` e corrija o que destoar antes de mostrar;
   - prévia leve: `node scripts/previa.mjs <Id>`;
   - **conferência de fidelidade (obrigatória antes de mostrar):**
     `<pasta desta skill>/projeto/venv/bin/python <pasta desta skill>/scripts/conferir/comparar.py --estilo <pasta desta skill>/references/medidas_referencia.json <prévia.mp4> <pasta do vídeo>/out/conferencia --sem-camadas`
     Meta: nota 80 ou mais e nenhum item abaixo de 50. Corrija primeiro os 3 piores itens (a tabela diz o valor do estilo e o do vídeo novo) e confira de novo.
     Mostre a nota junto da prévia. Itens que dependem do conteúdo (quantidade de texto, por exemplo) podem ficar abaixo: diga quais e por quê;
   - final só depois do OK: `node scripts/final.mjs <Id> --escala 2 --copiar "<pasta de entrega>"` (2 = 4K a partir de 1920).
6. Entregue o caminho do arquivo final. Se quem usa tiver regra de onde guardar vídeo pronto, siga. Na nuvem, mande o arquivo com SendUserFile.

## Regras
- O render final faz o borrão de movimento de verdade (obturador medido: {{OBTURADOR}}). Não desligue.
- O MP4 sai em BT.709 etiquetado. MOV com alfa (peça transparente) entra no editor como alfa Straight.
- Fonte paga não vem no pacote: use a do `estilo.json` (livre).
- Nada de inventar curva ou tempo fora do `estilo.json` sem motivo dito.
