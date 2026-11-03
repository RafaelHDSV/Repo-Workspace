# Fluxo de trabalho de IA

> **Para que serve:** onde vivem rules/skills e como o agente consulta/atualiza docs por etapa
> **Fonte da verdade:** pastas `.ai/`, `.cursor/`, `.claude/`, `.opencode/` (quando existirem)
> **Relacionados:** [context](context.md) · regra `ai-context`

## Consulta por etapa

1. Ler `docs/context.md` (hub).
2. Seguir a coluna "quando ler" e abrir o documento dono do domínio.
3. Só então editar código.

## Atualização no mesmo turno

Toda mudança de comportamento atualiza o documento dono **no mesmo turno**. Domínio novo sem dono: criar o markdown (cabeçalho padrão) e acrescentar linha no índice de `context.md`.

## Pastas

| Pasta | Papel |
|---|---|
| `.ai/` | Hub de rules/skills (quando houver) |
| `.cursor/`, `.claude/`, `.opencode/` | Espelhos / alvos do editor |

## Fora deste contrato

Perguntas, exploração, review de PR e tipografia/format-only não exigem Write em `docs/`.
