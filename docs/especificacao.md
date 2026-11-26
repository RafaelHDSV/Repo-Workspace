# Especificação

> **Para que serve:** o que o hub multi-repo faz.
> **Fonte da verdade:** `scripts/repo-workspace.mjs`.
> **Relacionados:** [context](context.md)

## Comandos

| Comando | Papel |
|---|---|
| install / yarn | Instala deps nas subpastas elegíveis (Yarn); repos só-Deno entram na seleção e pulam yarn com aviso |
| dev | Sobe `yarn dev` ou `deno task dev` nos selecionados |
| test | Roda testes Yarn (só pastas com `package.json`) |
| setup | install + dev (mesma seleção unificada) |
| switch | Troca branch nos clones com `.git` |

## Runtimes

- **Yarn/Node:** pasta com `package.json`.
- **Deno:** pasta sem `package.json` com `deno.json` e `tasks.dev` (ex.: `nexus`). Não exige `deno.lock`.

## O que não faz

- Não é monorepo de pacotes npm publicados juntos
- Não clona repositórios automaticamente (salvo fluxo explícito do script, se houver)
- Não agrega `deno test` em `yarn test` (fora de escopo atual)
