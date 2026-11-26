# Histórico de mudanças

> **Para que serve:** registro datado de mudanças notáveis — não é estado atual
> **Fonte da verdade:** o que entrou/saiu do produto em cada data
> **Relacionados:** [context](context.md) · [especificacao](especificacao.md) · [CHANGELOG](../CHANGELOG.md)

Use `CHANGELOG.md` na raiz para releases Keep a Changelog. Este arquivo guarda o detalhe por data.

## 2026-11-25

### Reselect após Ctrl+C em dev/setup (issue #2)

- Loop interativo: confirm + multiselect com última seleção confirmada pré-marcada.
- Escopo só `dev` e fase `dev` do `setup`; sem persistência em disco; setup não reinstala no reselect.

### Deno no setup/dev (Repo-Workspace#3)

- Descoberta unificada para install/dev/setup: `package.json` ∪ `deno.json` com `tasks.dev`.
- Install pula yarn em só-Deno; fase paralela usa `deno task dev` quando elegível.
- `yarn test` permanece só Yarn.

## 2026-11-03

### Living docs (board#7)

- Conjunto canônico de 12 documentos em `docs/` alinhado ao padrão forge.
- Arquivos de comunidade e README vendável.

## Extraído do CHANGELOG

# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Living docs (hub `docs/context.md`), arquivos de comunidade e README no padrão board#7.
