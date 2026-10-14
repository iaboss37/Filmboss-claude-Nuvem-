---
name: afinador-boss
description: Afinador Boss, o afinador automático de voz cantada do Rick Miura, que roda no Mac sem gastar crédito. Recebe o instrumental e a voz (ou a música já mixada, que ele separa), descobre o tom, os acordes e a escala de cada trecho, mede cada nota cantada e puxa para a nota certa. Quando tem a música original, usa a melodia dela como guia, inclusive para erros grandes de mais de meio tom, e mantém o improviso que foi bem cantado. Entrega a voz afinada, a mixagem de teste antes e depois e uma página para ouvir e conferir. Use sempre que o Rick pedir para afinar uma voz, corrigir a afinação, "deixar o cantor afinado", autotune, tirar desafinação, ajustar a voz à melodia original, ou mandar instrumental e voz pedindo correção, mesmo que ele não diga "Afinador Boss".
---

# Afinador Boss

O motor fica em `~/FilmbossTools/afinador-boss` (código, Python próprio e o LEIA-ME com os detalhes e os testes). Ler o LEIA-ME antes de mexer no código. Para só afinar, basta seguir os passos abaixo.

## Primeira vez neste computador
Se `~/FilmbossTools/afinador-boss/venv/bin/python` não existir, instalar antes de tudo:
```bash
bash ~/.claude/skills/afinador-boss/instalar.sh
```
(Se a skill estiver em outra pasta, rodar o `instalar.sh` que está ao lado deste arquivo.) Precisa de internet e leva uns 5 minutos. Na primeira vez que usar a guia, o separador de voz baixa o modelo dele (uns 80 MB). Funciona em qualquer Mac: no chip da Apple é rápido; em Mac com Intel usa o processador e demora umas 3 vezes mais.

## O que pedir ao Rick (uma coisa por vez, só o que faltar)
1. **A voz e o instrumental**, separados. Se ele só tiver a gravação com tudo junto, serve: o afinador separa (`--mixagem`).
2. **A música original**, se existir (a versão de referência, inteira ou só a voz). É ela que conserta os erros grandes. Sem ela, o afinador só usa a escala e os acordes.
3. Ele pode arrastar os arquivos para a caixa de mensagem ou dizer em que pasta estão.

Voz e instrumental precisam começar no mesmo ponto (exportados juntos da mesma sessão). A guia não precisa: o afinador acha sozinho o atraso e o tom dela.

Modo padrão: `equilibrado` (segue a guia, mas mantém o improviso bem cantado). Só usar `fiel` se ele pedir para seguir a original nota por nota. Sem guia, o modo é `so-afinar`.

## Como rodar
Saída numa pasta `Voz afinada [Claude]` ao lado do arquivo de voz (dentro do projeto). Se a voz estiver em Downloads ou fora de um projeto, perguntar onde salvar.

Se existir `~/FilmbossTools/bin/progresso`, marcar as etapas no ícone de progresso:
```bash
~/FilmbossTools/bin/progresso plano "Separar e analisar:2" "Afinar a voz:2" "Montar a página:1"
```
Afinar:
```bash
cd ~/FilmbossTools/afinador-boss
venv/bin/python -u afinador.py --voz "<voz>" --instrumental "<instrumental>" --guia "<original>" --saida "<pasta>/Voz afinada [Claude]"
# ou, com tudo junto:
venv/bin/python -u afinador.py --mixagem "<gravação>" --guia "<original>" --saida "<pasta>/Voz afinada [Claude]"
```
Rodar em segundo plano, com descrição clara. Leva uns 2 minutos por música de 1 minuto e meio no chip da Apple (mais 30 s se a guia precisar ser separada).

Opções: `--modo fiel|equilibrado|so-afinar`, `--forca 0.8` (correção parcial, mais natural), `--robo` (efeito T-Pain), `--guia-so-voz` (a guia já é só a voz), `--sem-repeticoes`.

## O que entregar
- Abrir a página para ele: `open -a "Google Chrome" "<saída>/Ouvir e conferir (com áudio).html"` (no Mac do Rick, arquivo .html não abre com clique). Sem Chrome, `open "<arquivo>"`.
- Na resposta, dizer a escala que achou, quantas notas corrigiu, quantas foram pela melodia guia, os improvisos mantidos e as dúvidas, com o minuto de cada uma (estão em `notas.txt`).
- Arquivos: `<voz> [afinada].wav` (a voz pronta), `Mix teste - antes.wav` e `Mix teste - depois.wav`.
- Se ele achar que uma dúvida ficou errada, rodar de novo com `--modo fiel` ou mudar só aquela nota (ver o LEIA-ME).

## Limites (dizer quando importar)
- Sem a música original, erro grande (mais de meio tom) vai para a nota vizinha que cabe na música, que pode não ser a da melodia.
- Correção muito grande (mais de 3 semitons) fica com som mais artificial que no Melodyne.
- Voz com muito eco ou duas vozes juntas (dueto, segunda voz) confunde a medição da nota.

## Manutenção (só neste Mac do Rick)
Depois de mudar o código em `~/FilmbossTools/afinador-boss`, rodar `bash ~/FilmbossTools/afinador-boss/empacotar.sh`: ele copia o código para esta skill e gera o pacote `afinador-boss.skill` em `SKILLS E METODOS/Pacotes .skill`, para instalar em outro computador.
