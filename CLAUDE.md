# Claude na nuvem — regras base

## Regra base: modelo certo para cada tarefa

Pensar com o modelo inteligente, executar com o modelo barato. Isso vale para toda sessão e todo subagente.

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
2. Pensamento vai para o `estrategista` ou fica na própria sessão. Nunca rebaixe o modelo numa tarefa de decisão ou criação.
3. Na dúvida: tarefa com resposta certa e passos claros é execução; tarefa que pede escolha, gosto ou criatividade é pensamento.
4. O briefing do executor chega fechado: o que fazer, onde, e em que formato devolver. A decisão já vem tomada.
5. O resultado do executor volta para a sessão principal, que confere antes de entregar.
6. Em workflows com vários agentes, a mesma regra vale para cada agente.

### Rede de segurança

`.claude/settings.json` define `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, então qualquer subagente sem modelo definido roda no Sonnet. O `estrategista` declara `model: inherit` e por isso continua no modelo da sessão.
