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
| **Node por repo** | Versão fixável em `repos.config.json` |

## Como funciona

```text
Hub (package.json + scripts + repos.config.json)
        ↓
subpastas irmãs com package.json / .git
        ↓
install | dev | test | setup | switch | open
```

Raiz operacional = pasta do hub ou `--root` / `REPOS_ROOT`. Guia completo (menus, Source Control, testes agregados): [`docs/ambiente-e-operacao.md`](docs/ambiente-e-operacao.md).

## Posicionamento

| repo-workspace é | repo-workspace não é |
|---|---|
| Orquestrador local | Monorepo npm publicado |
| Hub com clones irmãos | Substituto do Git de cada repo |
| Yarn na raiz do hub | Docker Compose obrigatório |

## Stack (em uma linha)

Node + Yarn · `repos.config.json` · `scripts/repo-workspace.mjs`.

Detalhes: [`docs/context.md`](docs/context.md) · especificação: [`docs/especificacao.md`](docs/especificacao.md).

## Começar

Layout e comandos do dia a dia: [`docs/ambiente-e-operacao.md`](docs/ambiente-e-operacao.md).

Contribuição: [`CONTRIBUTING.md`](CONTRIBUTING.md) · conduta: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · mudanças: [`CHANGELOG.md`](CHANGELOG.md).
