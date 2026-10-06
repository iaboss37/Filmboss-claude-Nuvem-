# Claude na nuvem — regras base

## Regra base: modelo certo para cada tarefa

Pensar com o modelo inteligente, executar com o modelo barato. O objetivo é fazer tarefas complexas mais rápido e gastar menos créditos. Isso vale para toda sessão e todo subagente.

### Quem pensa

A sessão principal (o modelo escolhido no chat) coordena tudo: entende o pedido, planeja, decide, divide o trabalho e revisa o que os subagentes entregam antes de passar ao usuário.

Tarefas de pensamento ficam na sessão principal ou vão para o subagente `estrategista`, que usa o mesmo modelo da sessão:

- planejamento de projeto, estratégia, estrutura
- tomada de decisão, escolha entre caminhos
- roteiro, conceito criativo, copy, prompts criativos (vídeo, imagem, música)
- análise que exige julgamento (o que cortar numa aula, se um criativo funciona)
- revisão final de qualidade

### Quem executa

Tarefas de execução vão para o subagente `executor` (Sonnet, esforço baixo):

- buscar, ler e resumir arquivos; levantar informações
- organizar, renomear e converter arquivos (vídeo, áudio, imagem, planilha)
- extrair frames, transcrever, detectar silêncios
- aplicar mudanças já decididas, seguir um plano pronto, preencher modelos
- rodar comandos, uploads e chamadas repetitivas a ferramentas

### Ao delegar

1. Execução vai para `subagent_type: "executor"`. Se for preciso outro tipo de agente para uma tarefa de execução (`Explore`, `general-purpose`, `claude-code-guide` etc.), passe `model: "sonnet"` e `effort: "low"` na chamada.
2. Pensamento fica na própria sessão; o `estrategista` entra só quando há pensamento para rodar em paralelo, porque custa o mesmo que a sessão mais a carga inicial. Nunca rebaixe o modelo numa tarefa de decisão ou criação.
3. Na dúvida: tarefa com resposta certa e passos claros é execução; tarefa que pede escolha, gosto ou criatividade é pensamento.
4. O briefing do executor chega fechado: o que fazer, onde, e em que formato devolver. A decisão já vem tomada.
5. O resultado do executor volta para a sessão principal, que confere antes de entregar.
6. Em workflows com vários agentes, a mesma regra vale para cada agente.

### Economia e velocidade

- Cada subagente começa carregando cerca de 57 mil tokens de instruções e ferramentas (medido nesta configuração). Delegar só compensa em tarefa grande: vários passos, muitos arquivos ou muito conteúdo que encheria a conversa principal. Um comando rápido ou a leitura de um arquivo curto se faz direto na sessão.
- Junte tarefas pequenas parecidas num único briefing para o executor, em vez de abrir um subagente por item.
- Tarefas independentes rodam em paralelo, com vários subagentes disparados na mesma chamada.
- O executor devolve só o resumo (o que fez, onde está, o que falhou), nunca o conteúdo inteiro de arquivos ou logs.

### Rede de segurança

`.claude/settings.json` define `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, então qualquer subagente sem modelo definido roda no Sonnet. O `estrategista` declara `model: inherit` e por isso continua no modelo da sessão.
