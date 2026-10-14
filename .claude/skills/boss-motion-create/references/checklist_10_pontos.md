# Checklist da análise (10 pontos)

A máquina mede (analisar.py). O olho completa na ficha.md, olhando folhas/storyboard.jpg, folhas/plano_NN.jpg e quadros soltos.

| Ponto | Medido pela máquina | O olho confere |
|---|---|---|
| 1 Estrutura e ritmo | planos, duração de cada, cortes por minuto, BPM, cortes na batida, curva de energia, maior tempo sem evento, gancho dos 2 primeiros segundos, entrada/permanência/saída de cada plano | blocos, respiros, clímax |
| 2 Composição e grade | margem segura, colunas onde o texto alinha, centralizado ou margem, onde o texto mora (topo, meio, base), caixa do conteúdo, espaço vazio | grade fina, camadas, equilíbrio |
| 3 Tipografia | textos lidos, níveis de tamanho e proporção entre eles, entrelinha, como entra (letra, palavra, linha, inteiro) e quadros por palavra; fonte por comparação de desenho (Google Fonts e Fontshare) | caixa, espaço entre letras, contorno, sombra, gradiente, textura |
| 4 Cor e luz | paleta com códigos e proporção, fundo, proporção por papel (fundo, neutros, texto, destaque), contraste, saturação, grão (na resolução original), vinheta | degradês, brilho, tratamento das imagens |
| 5 Movimento | curva exata de cada movimento, durações, tipos de curva, borrão (obturador), em dois, atraso entre elementos (escada) e direção, câmera (zoom, deslize, giro, profundidade por paralaxe), tipo e duração de cada transição | movimento contínuo sutil, lente, intenção |
| 6 Formas e elementos | | formas, ícones, espessura das linhas, raio dos cantos, partículas, 3D (material, luz, lente) |
| 7 Imagens e B-roll | | tipo de imagem, como entra (moldura, máscara, colagem), tratamento, profundidade de campo |
| 8 Som | BPM, batidas, ataques; voz, trilha e efeitos separados (volume, pico, proporção), quantos cortes e movimentos têm efeito e quantos quadros antes ou depois | quais efeitos (whoosh, golpe, clique), onde entra o silêncio |
| 9 Narrativa | gancho medido (cortes, movimentos e energia nos 2 primeiros segundos) | o que conta, como a ideia é apresentada, fecho, logo |
| 10 Acabamento | formato, fps, codec, taxa de bits, formato de pixel e cor, áudio, grão | compressão, legendas, fundo transparente nas peças |

Como fica registrado: `Ficha.html` (10 pontos + plano a plano com quadros, tempos, entrada e saída, movimentos, textos, cores, efeitos sonoros e a passagem para o próximo), `analise.json` e `extras.json` (medidas), `src/estilo/estilo.json` (o que o código lê), `folhas/` (quadros-chave) e a comparação lado a lado.

## Fonte
1. Ache um texto grande e nítido em textos.json (c = 1).
2. `fonte.py recortar <video> <s> x y w h recorte.png`
3. Diga qual é a fonte original quando der para saber (pelo olho, pelo nome em créditos, ou o Rick usando WhatTheFont). Liste 5 a 10 candidatas
   livres pelo desenho (Google Fonts e Fontshare; "fontshare:Nome" força o Fontshare) e rode
   `fonte.py comparar recorte.png "TEXTO" "Familia" ... --saida <estudo>/analise/fonte_titulo.jpg` (grava também o ranking .json).
4. A primeira do ranking, conferida no olho na folha, vai para o projeto:
   `estilo.py fonte <recriacao> "Familia" <peso> <papel> --original "Fonte da referência" --comparacao <estudo>/analise/fonte_titulo.json`
   (grava de onde baixar, licença, o que ela substitui, a nota de parecença e as medidas que ela precisa bater).
5. Fonte paga que é a alma do estilo: avisar o Rick (ele decide se compra); usar a substituta enquanto isso.

## Som
- Efeitos: escolher no acervo do Rick (`CRIACAO/_Acervo de Efeitos`, preferir a pasta 00 Melhores) o mais parecido com cada evento; `estilo.py sfx <recriacao> <arquivo> <nome>`.
- Atraso do som: o resumo traz a mediana; golpe costuma vir uns 2 quadros antes, whoosh de 5 a 7.
- Trilha: se a referência tem trilha, recriar no mesmo andamento (Suno, só com OK do Rick e custo dito) ou usar uma do Catálogo de Trilhas.
