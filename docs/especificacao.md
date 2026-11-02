# Especificação

> **Para que serve:** o que o hub multi-repo faz.
> **Fonte da verdade:** `scripts/repo-workspace.mjs`.
> **Relacionados:** [context](context.md)

## Comandos

| Comando | Papel |
|---|---|
| install / yarn | Instala deps nas subpastas elegíveis |
| dev | Sobe dev nos selecionados |
| test | Roda testes |
| setup | install + dev |
| switch | Troca branch nos clones com `.git` |

## O que não faz

- Não é monorepo de pacotes npm publicados juntos
- Não clona repositórios automaticamente (salvo fluxo explícito do script, se houver)
