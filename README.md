# repo-workspace

Ferramenta leve para quem mantém **vários repositórios** como pastas irmãs no mesmo diretório: instala dependências (`yarn`) e sobe `yarn dev` em paralelo, com **seleção interativa** (multiselect) ou **linha de comando**.

- Só a **raiz desta pasta de trabalho** (onde estão `package.json`, `repos.config.json` e `scripts/`) concentra a ferramenta. Os **outros projetos** são **subpastas diretas** desse diretório (não fiquem dentro de `scripts/`). Se usares a pasta `repo-workspace` no Desktop só como **modelo**, copia o conteúdo para a pasta real onde já tens os clones irmãos (por exemplo `~/repos/`), a **mesma** hierarquia que tínhamos com `package.json` na raiz e `uxvision-web/`, `core/`, etc. ao lado.
- Suporta **NVM for Windows** (e variáveis `NVM_HOME` / `NVM_SYMLINK`) para fixar a versão do Node por pasta.
- No **install** o prompt vem com tudo **selecionado**; no **dev**, com **nada selecionado** (você marca o que precisa).

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- [Yarn Classic](https://classic.yarnpkg.com/) (v1) nos repositórios filhos
- Opcional: [NVM for Windows](https://github.com/coreybutler/nvm-windows) se usar `nodeVersionByRepo` em `repos.config.json`

## Instalação (neste repositório)

```bash
cd repo-workspace
yarn
```

## Uso

| Objetivo | Comando |
|----------|---------|
| `yarn` em subprojetos (com prompt) | `yarn install` (em **terminal interativo**) |
| Todos os subprojetos, sem prompt | `yarn run install -- --all` ou `REPOS_SKIP_PROMPT=1 yarn install` |
| Apenas alguns | `yarn run install -- -- nome-pasta outro-repo` |
| `yarn dev` em paralelo (com prompt) | `yarn dev` |
| Subir só alguns | `yarn dev -- core fronte-nd` |
| CI / sem TTY | `REPOS_SKIP_PROMPT=1 yarn dev` |

### Atenção: `yarn add` nesta pasta

Após `yarn add` neste pacote, o script de `install` pode rodar **sem TTY** e **pular** a instalação nos sub-repositórios (comportamento intencional). Use `yarn run install -- --all` se precisar forçar.

## Configuração: `repos.config.json`

- **`ignore`**: nomes de pastas na **raiz do diretório pai** que **não** entram na lista (além de `node_modules` e `.git`, aplicados por padrão no script).
- **`nodeVersionByRepo`**: mapeia **nome da pasta** → **versão** do Node (ex.: `"20.18.3"`). Pastas **omitidas** usam o Node atual do `PATH`. Requer `NVM_HOME` (ou equivalente) e instalação da versão no NVM.

Exemplo mínimo:

```json
{
  "ignore": ["arquivos-locais", "legacy"],
  "nodeVersionByRepo": {
    "api": "20.10.0",
    "web": "22.12.0"
  }
}
```

## Estrutura de pastas

O script procura `package.json` em **subpastas diretas** do diretório que contém `scripts/repo-workspace.mjs` e `repos.config.json` (a **raiz** do repositório Git de trabalho).

Exemplo: raiz = pasta onde corres `yarn` desta ferramenta.

```text
pasta-de-trabalho/       ← `git` clone deste projeto + clones dos teus serviços
  package.json           ← deste hub (concurrently, prompts)
  yarn.lock
  repos.config.json
  scripts/
    repo-workspace.mjs
  api/                   ← outro repositório (tem o seu `package.json`)
  web/                   ← outro repositório
```

Ajusta `ignore` e `nodeVersionByRepo` aos **nomes reais** das pastas.
