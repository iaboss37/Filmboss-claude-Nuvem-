---
name: boss-motion-create
description: "Boss Motion Create: analisa um vídeo de motion graphics de referência (análise forense em 10 pontos com medidas quadro a quadro: ritmo, curvas de animação, tempos, borrão de movimento, cores, tipografia, som), recria o trecho no Remotion o mais parecido possível, compara lado a lado com nota e, depois da aprovação do Rick, gera uma skill de estilo independente (boss-estilo-<nome>) que produz vídeos novos naquele estilo. Use sempre que o Rick colar ou mandar um vídeo, link ou pasta de motion para analisar, estudar, recriar, copiar o estilo, entender como foi feito, virar skill ou template de estilo, ou digitar /boss-motion-create, mesmo que não diga a palavra skill."
---

# Boss Motion Create

Ferramenta do Rick (fase 1). Fluxo fixo: **analisar → perguntar quanto recriar → recriar → comparar → mostrar → aprovação → gerar a skill de estilo → testar**.
Python da skill: `~/FilmbossTools/boss-motion/venv/bin/python` (abaixo, `PY`). Scripts na pasta `scripts` desta skill (`S`).
Se o venv ou `~/FilmbossTools/boss-motion/base/node_modules` não existirem: `bash <pasta desta skill>/instalar.sh`.
Na nuvem (Claude Code na web) leia antes a seção **Na nuvem** no fim deste arquivo.

Logo no começo (no Mac; na nuvem ele não existe): `~/FilmbossTools/bin/progresso plano "Análise:2" "Ficha:3" "Recriação:20" "Comparação:5" "Skill de estilo:5"`.

## 1. Análise (sozinha, sem perguntar nada)
1. O nome do estudo vem do vídeo (o que é, de quem é o estilo, 2 a 4 palavras). Link: baixar é pedido do Rick ao colar.
   `PY S/novo_projeto.py "<Nome>" "<video, link ou pasta>"` → cria `projetos/NNN - Nome` (no Mac em `~/FilmbossTools/boss-motion`; na nuvem em `boss-motion/` no repositório), atalho em
   `CRIACAO/3 Motion Graphics/Estudos de Referência/` (só com o SSD ligado), roda `analisar.py`, passa as medidas para o projeto Remotion (`estilo.py medidas`) e gera a `Ficha.html`.
   A análise mede os 10 pontos (lista em `references/checklist_10_pontos.md`) e separa voz, trilha e efeitos com o separador de faixas;
   leva uns 2 minutos a cada 20 s de vídeo (rode em segundo plano com descrição clara). Vídeo longo: analise tudo; a recriação é que fica curta.
2. Olhe `analise/folhas/storyboard.jpg`, as folhas `plano_NN.jpg` e o `resumo` do `analise.json`.
3. Fonte: siga `references/checklist_10_pontos.md` (recortar, comparar candidatas do Google Fonts e do Fontshare com `fonte.py`,
   registrar com `estilo.py fonte ... --original ... --comparacao ...`).
4. Escreva a `ficha.md` do estudo (modelo já copiado, seções 1 a 10: o que o olho vê e a máquina não mede) e gere a ficha de novo:
   `PY S/analise/relatorio.py <estudo>/analise <estudo>/Ficha.html --ficha <estudo>/ficha.md --titulo "<Nome>"`.
5. Mostre ao Rick: 5 a 8 linhas com o que define o estilo (ritmo, curvas, tempos, borrão, cor, fonte, som) + link da Ficha.html
   (e SendUserFile dela). Na mesma mensagem, a ÚNICA pergunta: **quanto recriar: 10 s, 20 s ou tudo?** (diga a duração total).

## 2. Recriação
Siga `references/recriacao.md` à risca. Resumo:
- Escreva `estilo.md` (modelo copiado) com o sistema ANTES de animar.
- Uma peça por plano em `recriacao/src/pecas/recriacao/` + a peça `Recriacao` que junta tudo nos quadros exatos.
- Componentes que se repetem vão para `recriacao/src/estilo/` (é o que a skill de estilo reaproveita).
- Sons do acervo do Rick (`CRIACAO/_Acervo de Efeitos`, 00 Melhores primeiro) com `estilo.py sfx`; registre origem e licença em `<estudo>/licencas.json` (`{"nome": {"origem": "...", "licenca": "..."}}`).
- 3D: Blender pelo MCP. IA só com OK e custo dito antes. Material de imagem da referência nunca é copiado: troque por material próprio de mesmo papel.

## 3. Comparação (antes de mostrar)
`node scripts/final.mjs Recriacao --escala 0.5` (rascunho) e
`PY S/analise/comparar.py <referencia> <estudo>/analise/analise.json <render> <estudo>/comparacao/vN [--de --ate]`.
Olhe `folha_comparacao.jpg` e os 3 piores itens; corrija e repita até nota 85+ e nenhum item abaixo de 60 (ou o olho dizer que está igual).
Renders em segundo plano com descrição clara (o ícone de progresso lê a %).

## 4. Mostrar e pedir aprovação
Render no tamanho da referência (`final.mjs Recriacao`), comparação final, ficha atualizada com `--comparacao`.
Envie o `lado_a_lado.mp4` (SendUserFile) e a nota. Pergunte: aprova, ou o que ajustar? Ajuste um ponto por vez até ele aprovar.

## 5. Skill de estilo (só depois do OK do Rick)
Pergunte se pode gerar e com que nome (sugira um nome curto). Com o OK:
1. Revise `estilo.md` com tudo que aprendeu (componentes, regras, o que nunca fazer, como o estilo resolve 3D/filmagem).
2. `PY S/gerar_skill.py <estudo> <nome-curto> --descricao "<uma frase>" --previa <render final da recriação aprovada>` → `<skills>/boss-estilo-<nome-curto>`
   (`<skills>`: `~/.claude/skills` no Mac; `.claude/skills` do repositório na nuvem).
   A skill de estilo leva: projeto com componentes, estilo.json, medidas completas da referência (JSON, sem caminhos), quadros plano a plano
   da NOSSA recriação (régua visual; nenhum quadro da referência vai junto), ficha sem imagens, fontes, sons e a conferência de fidelidade
   (`scripts/conferir/comparar.py --estilo`: nota 80+ antes de mostrar; um vídeo fora do estilo deu 51 no teste, o próprio estilo deu 98).
3. `PY S/testar_skill.py <skills>/boss-estilo-<nome-curto>` (e `--completo` na primeira skill de cada versão do motor). Tem que dar PASSOU.
4. Avise o Rick: nome do comando (`/boss-estilo-<nome>`), o que ela faz e o resultado do teste.
   Na nuvem: faça commit e push da pasta da skill nova na branch da sessão (sem isso ela some quando a sessão acaba).

## Regras
- Nomes sempre começam com `boss-`. Tudo em português, sem travessão.
- Nada se apaga sem o OK do Rick (`trash`, nunca `rm` em coisa dele; na nuvem, sem Lixeira, o `gerar_skill --forcar` move a versão antiga para `boss-motion/lixeira`).
- Geração paga (Higgsfield, Suno, ElevenLabs): custo dito antes e OK.
- O Remotion apaga o próprio bundle ao terminar (comum.mjs); se um render for morto à força, limpe `remotion-webpack-bundle-*` da pasta temporária (/var/folders no Mac, /tmp na nuvem) criado por este chat.
- Ficha, comparação e lado a lado ficam no estudo; o atalho no SSD aponta para lá.

## Referências
- `references/checklist_10_pontos.md`: o que medir e o que olhar; fonte e som.
- `references/recriacao.md`: método de recriação e conferência.
- `references/modelo_ficha.md`, `references/modelo_estilo.md`: modelos copiados para cada estudo.
- Scripts: `analise/analisar.py`, `analise/fonte.py`, `analise/comparar.py`, `analise/relatorio.py`, `estilo/estilo.py`, `novo_projeto.py`, `gerar_skill.py`, `testar_skill.py`.
- `lugares.py`: onde ficam motor, estudos e skills geradas, no Mac e na nuvem.

## Na nuvem (Claude Code na web, pelo repositório do GitHub)
A skill mora em `.claude/skills/boss-motion-create` do repositório e carrega sozinha em toda sessão. O fluxo é o mesmo; muda isto:
- A máquina é nova a cada sessão: rode `bash .claude/skills/boss-motion-create/instalar.sh` antes do primeiro passo
  (uns minutos: bibliotecas do python, Remotion, Tesseract e yt-dlp). Rode em segundo plano com descrição clara.
- Referência: o vídeo que o Rick manda no chat (caminho do upload) ou um link (yt-dlp). Se o site bloquear o download, peça o arquivo.
- Os estudos ficam em `boss-motion/projetos/` no repositório, fora do git (vídeo pesa). Mostre tudo com SendUserFile
  (Ficha.html, folhas, lado_a_lado.mp4). Quando a sessão acaba o estudo some; o que fica é a skill de estilo.
- Sem SSD: não tem atalho em CRIACAO nem o acervo de efeitos. Peça ao Rick os sons (upload no chat) ou siga sem efeitos e diga isso.
- Sem Blender: partes em 3D só com IA (custo dito antes e OK) ou em motion tradicional.
- Leitor de texto: Tesseract no lugar do Vision do Mac. Lê pior texto pequeno, fino ou muito estilizado: confira os textos no olho.
- Sem separador de faixas: o som fica com BPM, batidas e ataques, sem voz, trilha e efeitos separados.
- Skill de estilo: sai em `.claude/skills/boss-estilo-<nome>` do repositório. Depois do PASSOU, commit e push na branch da sessão;
  para valer em toda sessão nova ela precisa chegar na branch principal (pull request).
