# Afinador Boss

Afina a voz de quem canta em cima de um instrumental, sozinho, no Mac (sem gastar crédito).
Atalho em `SITES E APPS/Apps/031 - Afinador Boss`. Começou em 11/10/2026.

## O que ele faz
1. **Instrumental:** acha a afinação de referência (se a banda não está em A=440), o andamento, o acorde de cada batida e a escala de cada trecho (maior, menor, harmônica, modos, pentatônica, blues; muda se a música modular).
2. **Voz:** mede a nota a cada 10 ms (torchcrepe) e divide em notas, ignorando o vibrato.
3. **Nota certa de cada nota cantada:** um placar que soma
   - distância até o que foi cantado (erro pequeno é comum, erro grande é raro);
   - nota fora da escala custa caro, mas nota do acorde do momento nunca é "fora";
   - bônus para nota do acorde, maior em nota longa e na batida;
   - **repetições:** o que o próprio cantor cantou no mesmo ponto das outras vezes que a frase apareceu;
   - **guia:** a melodia da música original (separada com o Demucs, alinhada no tempo e no tom);
   - **desenho da melodia:** se ele subiu, a nota certa fica acima da anterior.
   O caminho mais provável é escolhido frase a frase (Viterbi), e cada nota ganha uma margem: se a segunda opção quase empata e a correção é grande, ela vira **dúvida** no relatório, com a outra opção.
4. **Improviso:** no modo equilibrado, nota longe da guia (1,5 semitom ou mais), cantada no meio de uma nota da escala e sem tremer, é tratada como improviso e fica.
5. **Voz nova:** corrige o centro de cada nota, tira 30% da oscilação lenta e mantém o vibrato. Muda a nota com PSOLA do Praat (timbre igual).

## Modos
- `so-afinar`: só escala, acordes e repetições.
- `equilibrado` (padrão): segue a guia, mas mantém improviso bem cantado.
- `fiel`: tudo vai para a melodia da guia.

## Como rodar
```bash
cd ~/FilmbossTools/afinador-boss
venv/bin/python afinador.py --instrumental inst.wav --voz voz.wav --saida "pasta de saída" --guia "musica original.mp3"
```
Opções: `--guia-so-voz` (a guia já é só a voz), `--modo`, `--forca 0.8` (correção parcial), `--deriva 0.3`, `--robo` (efeito T-Pain), `--sem-repeticoes`.

Saída: `<voz> [afinada].wav`, `Mix teste - antes.wav`, `Mix teste - depois.wav`, `relatorio.json`, `notas.txt` e `Ouvir e conferir.html` (notas desenhadas, player antes/depois/só a voz, lista de dúvidas com botão Ouvir).

Para mandar a página com o áudio dentro (abre em qualquer lugar, ~8 MB):
```bash
venv/bin/python relatorio_html.py "pasta de saída" --embutir
```

## Instalar em outro computador
O pacote é `SKILLS E METODOS/Pacotes .skill/afinador-boss.skill` (um zip com a skill, os scripts e o `instalar.sh`).
1. Descompactar dentro de `~/.claude/skills` do outro Mac (fica `~/.claude/skills/afinador-boss`).
2. Pedir "afina essa voz" no Claude Code (aba Code ou terminal). Na primeira vez, a skill roda o `instalar.sh` sozinha: cria `~/FilmbossTools/afinador-boss` com o Python dele (1,2 GB, uns 5 minutos, precisa de internet e de Python 3.10 ou mais novo).
Não funciona no chat normal do claude.ai: lá a skill roda na nuvem, sem o Python com torch.

Depois de mudar o código aqui, rodar `bash empacotar.sh`: atualiza a skill instalada e gera o pacote de novo. Testado do zero em 13/10/2026 (instalação numa pasta vazia, modelo baixado sozinho, trecho de 30 s afinado com guia).

## Teste com gabarito
`teste_erros.py` afina a voz de referência no centro de cada nota, desafina de propósito (erro pequeno em todas as notas, erro grande de 1,3 a 2,2 semitons em 20% das longas, nota trocada e afinada em 6%) e mede quadro a quadro, na voz que saiu, quantas notas voltaram para a melodia certa. Material: a música do clipe 032 (O Povo Vai Votar), em `teste/`.

Resultado nas rodadas 3 a 5 (11/10/2026):
- Só escala: erro pequeno 95 a 98% certo; erro grande 0% (vai para a nota vizinha que cabe na música, limite de todo autotune).
- Escala + repetições: igual ao só escala nessa música (é quase falada, os trechos parecidos nem sempre têm a mesma melodia). As repetições só valem com consenso forte, para nunca atrapalhar.
- Guia equilibrado: erro pequeno 97 a 99%; erro grande 86 a 100%; nota trocada e afinada fica como improviso.
- Guia fiel: erro pequeno 97 a 99%; erro grande 86 a 100%; nota trocada volta para a melodia.

Armadilhas já resolvidas:
- Nota curta (menos de 0,12 s) é passagem: só segue a guia se a guia cobrir 80% dela e a correção for de até 2,2 semitons. Sem isso, a guia puxava 4 ou 5 semitons.
- Com guia, o contorno ("se subiu, a certa está acima") fica desligado, porque atrapalha justamente na nota errada.
- A busca de repetições aceita 100 ms de diferença de tempo e não usa a própria nota (ela pode ser o erro).

## Arquivos
- `analise.py`: afinação da voz, notas, acordes, escala.
- `correcao.py`: placar, repetições, guia, Viterbi, curva de correção e PSOLA.
- `afinador.py`: o comando completo e o relatório.
- `relatorio_html.py`: a página Ouvir e conferir.
- `teste_erros.py`: o teste com gabarito.
- `empacotar.sh`: atualiza a skill e gera o `afinador-boss.skill`.
- `requirements.txt`: bibliotecas que o `instalar.sh` da skill instala.
- `venv/`: Python 3.13 com torch, torchcrepe, librosa, praat-parselmouth, demucs.
