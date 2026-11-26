# API

> **Para que serve:** rotas HTTP, CLI I/O, códigos de erro e contratos
> **Fonte da verdade:** handlers / routers / entrypoints CLI
> **Relacionados:** [arquitetura](arquitetura.md) · [banco-de-dados](banco-de-dados.md) · [seguranca](seguranca.md)

## Convenções

- Prefixo / entrypoint: ver código (`/api`, `/v1`, binário CLI, etc.)
- Auth: ver [seguranca](seguranca.md)

## Superfície

Sem HTTP. Contrato = CLI (`scripts/repo-workspace.mjs`) e config (`repos.config.json`).

Layout e menus: [ambiente-e-operacao](ambiente-e-operacao.md). Contexto: [context](context.md).

| Comando | Entrada | Saída / códigos | Nota |
|---|---|---|---|
| `dev` / `setup` (fase paralela) | Multiselect ou CLI | Após SIGINT interativo: confirm de reselect; Não/cancel → exit 0 | Sem loop se `--all`, `REPOS_SKIP_PROMPT=1` ou nomes após `--` |
| demais modos | ver [ambiente-e-operacao](ambiente-e-operacao.md) | | Inalterados neste card |

Mensagem do confirm (stderr / `prompts`): `Parou os servidores dev. Quer escolher repositórios de novo com a mesma seleção marcada?`
