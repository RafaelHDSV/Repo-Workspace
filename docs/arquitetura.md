# Arquitetura

> **Para que serve:** estrutura do repositório, ciclo de request e fronteiras de empacotamento/deploy
> **Fonte da verdade:** layout de pastas, entrypoints, `vercel.json` / scripts de build
> **Relacionados:** [context](context.md) · [api](api.md) · [ambiente-e-operacao](ambiente-e-operacao.md)

## Visão

repo-workspace é tooling. Estrutura típica: scripts/`package.json` na raiz; sem monorepo de produto salvo indicação em `context.md`.

## Fronteiras

| Fronteira | Nota |
|---|---|
| App vs docs | `docs/` é contrato de living docs (board#7), não runtime |
| Segredos | Só `.env` / painel do provedor — nunca no Git |

Dependências declaradas em `package.json` (amostra): concurrently, prompts.
