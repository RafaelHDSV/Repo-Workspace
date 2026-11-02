<p align="center">
  <strong>repo-workspace</strong>
</p>

<p align="center">
  <strong>Vários repos. Um hub. Os mesmos comandos.</strong><br />
  Instalar, subir, testar e trocar de branch em pastas irmãs — sem abrir um terminal por projeto.
</p>

---

## Por que existe

Manter `api/`, `web/` e `worker/` lado a lado vira repetição: `cd`, `yarn`, `yarn dev`, branch a branch. O repo-workspace é a pasta central que orquestra esses clones sem virar monorepo e sem substituir o Git de cada um.

## O que você ganha

| | |
|---|---|
| **Um lugar** | `yarn`, `yarn dev`, `yarn test`, `yarn setup`, `yarn switch` |
| **Menu ou CLI** | Seleção interativa ou nomes na linha de comando |
| **Source Control** | `yarn open` alinha o painel do editor aos repos ativos |

## Para quem é

Quem trabalha com vários repositórios Git no mesmo diretório e quer orquestração local leve.

## Stack (em uma linha)

Node + Yarn · `repos.config.json` · scripts em `scripts/repo-workspace.mjs`.

## Começar

Layout, comandos e Source Control: [`docs/ambiente-e-operacao.md`](docs/ambiente-e-operacao.md). Contexto: [`docs/context.md`](docs/context.md).

Contribuição: [`CONTRIBUTING.md`](CONTRIBUTING.md) · conduta: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · mudanças: [`CHANGELOG.md`](CHANGELOG.md).
