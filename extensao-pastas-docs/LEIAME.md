# Pastas Docs: extensão do Chrome

Organize seus Google Docs em pastas. Todos os documentos que você já abriu aparecem sozinhos, na mesma ordem do Google Docs, e você só arrasta cada um para a pasta certa.

## Instalar (ou atualizar)

1. Descompacte o `.zip` num lugar fixo, como a pasta Documentos. O Chrome lê a extensão dali.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao-pastas-docs`.
   - **Para atualizar uma versão já instalada:** substitua os arquivos da pasta pelos novos e clique no botão de recarregar (↻) do Pastas Docs em `chrome://extensions`. Suas pastas continuam salvas.
4. Clique no ícone de quebra-cabeça da barra do Chrome e fixe o **Pastas Docs**.

## Os três modos

Troque de modo no topo da tela cheia, no botão de modo do painel lateral (o ícone de janela dividida) ou no botão flutuante do Google Docs.

| Modo | O que acontece |
| --- | --- |
| **Tela cheia** | A tela inicial do Google Docs vira a tela de pastas da extensão: pastas à esquerda e todos os documentos à direita. |
| **Lateral** | O Google Docs fica normal, e as pastas abrem no painel ao lado (clique no ícone da extensão ou no botão "Pastas" no canto da tela). Dá para arrastar documentos da lista do Google para uma pasta do painel. |
| **Tradicional** | O Google Docs fica como sempre, e a extensão não mexe na tela. |

## De onde vêm os documentos

- **Histórico do Chrome:** todo Google Doc que você já abriu neste Chrome aparece sozinho, em "Fora das pastas". A extensão guarda essa lista e não a perde quando o histórico expira.
- **Tela inicial do Google Docs:** quando você entra nela, a extensão também lê os documentos que o Google mostra ali, inclusive os que você nunca abriu neste Chrome, e usa a mesma ordem.
- **Ordem:** **Recentes** segue a ordem do Google Docs, com os abertos por último primeiro. **A–Z** ordena por nome. **Manual** deixa você arrastar cada item para a posição que quiser.
- **Tirar da lista:** o documento some só da extensão e continua no seu Google Drive. Para trazê-lo de volta, use Backup e sincronização → "Mostrar todos de novo".

## Como organizar

**Tela cheia**
- **Mover para uma pasta:** arraste um documento até uma pasta, na lateral ou nos cartões.
- **Mover vários de uma vez:** clique na bolinha do canto de cada cartão para selecionar, depois arraste qualquer um deles ou use **Mover para…**. Shift + clique seleciona um intervalo, e Ctrl/Cmd + A seleciona todos os que estão na tela.
- **Abrir um documento:** clique para abrir na mesma aba, ou Ctrl/Cmd + clique para abrir numa aba nova.
- **Fora das pastas:** a setinha ao lado desse título recolhe ou mostra os documentos soltos.
- **Apagar pasta:** os documentos e subpastas sobem um nível, e nada se perde. Logo depois aparece o botão **Desfazer**.

**Fluxos (mapa mental)**
- Entre pela lateral da tela cheia (**Fluxos**) e volte pelo botão **← Pastas**, no topo.
- **Lista da esquerda:** mostra as pastas e os documentos. Clique na setinha de uma pasta para ver os documentos dela.
- **Montar o quadro:** arraste uma **pasta** para o quadro e ela vira um bloco. Arraste um **documento** para cima de um bloco para guardá-lo naquela pasta.
- **Setas:** puxe a bolinha azul da borda de um bloco até outro. Clique numa seta para escrever um texto nela, inverter a direção ou apagar.

## Seus dados ficam seguros

- **Neste computador:** tudo é salvo no Chrome assim que você mexe.
- **Na sua conta do Chrome:** a organização das pastas sincroniza com outros computadores que tenham a mesma conta do Chrome (com "Extensões" ligado na sincronização) e esta mesma pasta instalada.
- **Cópias automáticas:** a extensão guarda até 15 versões anteriores. Restaure pela engrenagem.
- **Backup em arquivo:** use **Baixar backup** e **Restaurar de arquivo**, também na engrenagem.

> Instale sempre a partir desta mesma pasta. O `manifest.json` tem uma chave fixa que dá à extensão a mesma identidade em todos os computadores, e é ela que permite a sincronização encontrar os seus dados.

## Permissões que o Chrome vai mostrar

- **Ler o histórico de navegação:** usado só para encontrar os Google Docs que você já abriu. Nada sai do seu computador, a não ser a organização das pastas, que vai para a sua própria conta do Chrome.
- **Ler e alterar dados em docs.google.com:** usado para mostrar a tela de pastas no Google Docs e ler o título dos documentos.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `manifest.json` | Configuração da extensão |
| `background.js` | Sincronização, lista de documentos (histórico), títulos e menu do botão direito |
| `content.js` | Roda na tela inicial do Google Docs: tela cheia, botão flutuante e leitura da lista |
| `store.js` | Dados: salvar, sincronizar, backups, pastas e documentos |
| `common.js` | Ações compartilhadas (mover, apagar, modos, backup) |
| `app.*` | Tela cheia |
| `sidepanel.*` | Painel lateral |
| `flows.*` | Fluxos (mapa mental) |
| `ui.*` | Visual e componentes compartilhados |
