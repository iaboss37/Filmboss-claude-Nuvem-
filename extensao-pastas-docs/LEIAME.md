# Pastas Docs: extensão do Chrome

Organize seus Google Docs em pastas num painel lateral do Chrome e monte fluxos em mapa mental com as suas pastas.

## Instalar (uma vez por computador)

1. Baixe esta pasta `extensao-pastas-docs` inteira para o computador. Guarde-a num lugar fixo (por exemplo, Documentos), porque o Chrome lê a extensão dali.
2. No Chrome, abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação** e escolha a pasta `extensao-pastas-docs`.
5. Clique no ícone de quebra-cabeça da barra do Chrome e fixe o **Pastas Docs**.

Clique no ícone para abrir o painel lateral. O atalho é `Alt + Shift + P`.

## Como usar

**Painel lateral**
- **Salvar um Doc:** abra o documento e clique em **Salvar** no cartão do topo do painel. Depois escolha a pasta.
- **Outras formas de salvar:** clique com o botão direito num link de Google Doc e escolha "Salvar este Doc no Pastas Docs", ou arraste o link para dentro do painel.
- **Nova pasta:** use o botão **Nova pasta**. Para criar uma subpasta, clique com o botão direito numa pasta e escolha **Nova subpasta**.
- **Organizar:** arraste documentos e pastas para dentro de outras pastas.
- **Lista ou Ícones:** os botões no topo trocam entre a árvore de pastas e a grade de ícones, que funciona como o Finder.
- **A–Z ou Manual:** A–Z ordena sozinho por nome. Em Manual, você arrasta cada item para a posição que quiser.
- **Fora das pastas:** a seta ao lado desse título esconde ou mostra os documentos soltos.
- **Apagar pasta:** nada se perde. Os documentos e subpastas sobem um nível e ficam soltos se a pasta estava na raiz. Logo depois aparece o botão **Desfazer**.
- **Remover um Doc da lista:** só tira o documento da extensão. Ele continua no seu Google Drive.
- **Clique direito:** em qualquer item, abre renomear, mover, cor da pasta e copiar link.

**Fluxos (mapa mental)**
- No painel, clique no ícone de fluxo (ao lado da engrenagem). A tela abre numa aba.
- Cada fluxo é um quadro separado, e a mesma pasta pode aparecer em vários fluxos.
- **Colocar pastas no quadro:** arraste da lista à esquerda, ou dê dois cliques num espaço vazio para criar uma pasta nova ali.
- **Ligar blocos:** puxe a bolinha azul da borda de um bloco até outro. Se soltar no vazio, o quadro oferece criar uma pasta já ligada.
- **Ver documentos:** clique em "N documentos" num bloco para ver e abrir os Docs daquela pasta.
- **Setas:** clique numa seta para escrever um texto nela, inverter a direção ou apagar.
- **Navegar:** arraste o fundo para mover a tela. Use a rolagem do trackpad para navegar, pinça ou Ctrl + rolagem para zoom, e `Ctrl/Cmd + Z` para desfazer.

## Seus dados ficam seguros

- **Neste computador:** tudo é salvo no próprio Chrome assim que você mexe.
- **Na sua conta do Chrome:** a organização é sincronizada automaticamente. Em outro computador, entre na mesma conta do Chrome com a sincronização ligada (incluindo "Extensões") e instale esta mesma pasta. As suas pastas aparecem sozinhas.
- **Cópias automáticas:** a extensão guarda até 15 versões anteriores. Restaure pela engrenagem → Cópias automáticas.
- **Backup em arquivo:** na engrenagem, use **Baixar backup** para guardar um `.json` (no Drive, por exemplo) e **Restaurar de arquivo** para voltar a ele.

> Instale sempre a partir desta mesma pasta. O arquivo `manifest.json` tem uma chave fixa que dá à extensão a mesma identidade em todos os computadores, e é ela que permite a sincronização encontrar os seus dados.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `manifest.json` | Configuração da extensão |
| `background.js` | Sincroniza com a conta do Chrome, atualiza títulos e menu do botão direito |
| `store.js` | Dados: salvar, sincronizar, backups, operações de pasta |
| `sidepanel.*` | Painel lateral (lista, ícones, busca, backup) |
| `flows.*` | Tela de fluxos (mapa mental) |
| `ui.*` | Visual e componentes compartilhados |
