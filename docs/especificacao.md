# Especificação

> **Para que serve:** o que o hub multi-repo faz.
> **Fonte da verdade:** `scripts/repo-workspace.mjs`.
> **Relacionados:** [context](context.md)

## Comandos

| Comando | Papel |
|---|---|
| install / yarn | Instala deps nas subpastas elegíveis (Yarn); repos só-Deno entram na seleção e pulam yarn com aviso |
| dev | Sobe `yarn dev` ou `deno task dev`; Ctrl+C na fase paralela pode reabrir a seleção |
| test | Roda testes Yarn (só pastas com `package.json`) |
| setup | install + dev (mesma seleção); Ctrl+C na fase `dev` reabre só o `dev` (sem reinstalar) |
| switch | Troca branch nos clones com `.git` |
| open | Ativa repos no Source Control do editor |

## Comportamento pós-Ctrl+C (`dev` / fase `dev` do `setup`)

Em seleção interativa (multiselect), o primeiro Ctrl+C durante a fase `dev` paralela (`yarn`/`deno`) pergunta se o usuário quer escolher repositórios de novo com a última seleção confirmada já marcada. Aceitar reabre o menu; recusar (ou cancelar o confirm) encerra com código 0. Sem persistência em disco. Com `--all`, `REPOS_SKIP_PROMPT=1` ou nomes na CLI, não há esse loop.

## Runtimes

- **Yarn/Node:** pasta com `package.json`.
- **Deno:** pasta sem `package.json` com `deno.json` e `tasks.dev` (ex.: `nexus`). Não exige `deno.lock`.

## O que não faz

- Não é monorepo de pacotes npm publicados juntos
- Não clona repositórios automaticamente (salvo fluxo explícito do script, se houver)
- Não agrega `deno test` em `yarn test` (fora de escopo atual)
