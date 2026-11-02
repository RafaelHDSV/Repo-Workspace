# repo-workspace — contexto

> **Para que serve:** hub `ai-context` do hub multi-repo.
> **Fonte da verdade:** `scripts/repo-workspace.mjs`, `repos.config.json`.
> **Relacionados:** [especificacao](especificacao.md) · [ambiente-e-operacao](ambiente-e-operacao.md)

## Objetivo

Hub Yarn local que orquestra vários repositórios Git irmãos: `yarn`, `yarn dev`, `yarn test`, `yarn setup` e `yarn switch` a partir de um único lugar.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node + Yarn |
| Config | `repos.config.json` |
| Escopo | Pastas irmãs com `package.json` / `.git` |

## Decisões fixas

1. O hub não substitui o Git de cada clone — só orquestra comandos.
2. Raiz operacional = pasta do hub ou `--root` / `REPOS_ROOT`.
3. `install`/`dev`/`test` só em subpastas com `package.json`; `switch` em pastas com `.git`.

## Índice

| Documento | Conteúdo | Quando ler |
|---|---|---|
| [context.md](context.md) | Este hub | Sempre |
| [especificacao.md](especificacao.md) | Comportamento dos comandos | Antes de mudar scripts |
| [ambiente-e-operacao.md](ambiente-e-operacao.md) | Setup e CLI | Antes de usar o hub |
| [README.md](../README.md) | Pitch | Onboarding |
| [CHANGELOG.md](../CHANGELOG.md) | Mudanças | Release |
