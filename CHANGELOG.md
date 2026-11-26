# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Após Ctrl+C em `yarn dev` / fase `dev` do `yarn setup` (seleção interativa), pergunta se reescolhe repositórios com a última seleção pré-marcada; no setup não reinstala.
- Suporte a repositórios Deno (`deno.json` + `tasks.dev`) em `yarn install` / `yarn dev` / `yarn setup` (ex.: `nexus`); skip de yarn na install e `deno task dev` na fase paralela.
- Living docs (hub `docs/context.md`), arquivos de comunidade e README no padrão board#7.
