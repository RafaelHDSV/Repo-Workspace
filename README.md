# repo-workspace

Hub local em Yarn para **vários repositórios Git** organizados como **pastas irmãs** no mesmo diretório: um único lugar para rodar **`yarn`** (instalar dependências) e **`yarn dev`** (desenvolvimento em paralelo), com lista interativa ou nomes na linha de comando.

https://github.com/user-attachments/assets/46325e0e-664f-4812-bc0b-c12a655f60e6

---

## Para que serve

Se você mantém vários repositórios — por exemplo `api/`, `web/` e `worker/`, cada um com o próprio `package.json` — **no mesmo nível** de pasta, costuma enfrentar isto:

- vários terminais e repetir `cd`, `yarn` e `yarn dev` em cada projeto;
- perder de vista em qual pasta faltam dependências instaladas;
- misturar versões do Node entre projetos.

Este repositório é a **pasta central** (*hub*): aqui ficam só a ferramenta (`package.json` deste projeto, `scripts/` e `repos.config.json`). Os outros produtos continuam sendo **repositórios comuns** em subpastas. O hub **não substitui** o Git de cada um — apenas orquestra `yarn` e `yarn dev` quando você dispara os comandos a partir da raiz do hub.

---

## Regra de ouro: onde colocar

1. **A raiz do hub** é o diretório em que estão `package.json` (deste projeto), `repos.config.json` e `scripts/repo-workspace.mjs`.
2. Cada outro projeto é uma **subpasta direta** dessa raiz (irmã de `scripts/`, não dentro de `scripts/`).
3. Só entram na lista pastas que **tenham `package.json` na própria raiz** da subpasta.

Se você clonou este repositório só como **modelo**, copie esses arquivos para a pasta onde já estão os outros clones (por exemplo `C:\Users\...\meus-repos\` ou `~/repos/`), mantendo a mesma hierarquia: um `package.json` na raiz do hub e pastas como `meu-servico-a/` e `meu-app-b/` ao lado.

---

## Início rápido

1. Organize seus repositórios como subpastas diretas da raiz do hub (cada uma com `package.json`).
2. Na **raiz do hub**, instale as dependências do próprio hub com `yarn`. Na primeira vez, use um terminal **interativo** para o fluxo de `install` nos sub-repositórios (detalhes na seção [Uso no dia a dia](#uso-no-dia-a-dia)).
3. Opcional: crie ou edite `repos.config.json` para ignorar pastas ou fixar a versão do Node por pasta ([Configuração](#configuração-reposconfigjson)).
4. No dia a dia: na raiz do hub, rode `yarn install` ou `yarn dev` e escolha os projetos no menu — ou passe os nomes na CLI.

---

## Uso no dia a dia

Todos os comandos abaixo são executados na **raiz do hub** (a pasta do `package.json` deste projeto).

| Objetivo | Comando |
|----------|---------|
| Instalar dependências (`yarn`) nos sub-repositórios **com menu** (multiselect) | `yarn install` — terminal **interativo** (TTY) |
| Instalar em **todos** os sub-repositórios detectados, **sem** menu | `yarn run install -- --all` |
| Subir `yarn dev` em paralelo **com menu** | `yarn dev` |
| `install` ou `dev` com nomes explícitos | `yarn run install -- -- api web` ou `yarn dev -- api web` |

Equivalentes úteis em CI ou na documentação: `yarn repos:install` e `yarn repos:dev`.

### Comportamento dos menus

- **`yarn install`**: o multiselect abre com **todos** os repositórios **pré-selecionados** — você pode desmarcar os que não quiser. Espaço alterna a seleção; Enter confirma.
- **`yarn dev`**: começa com **nada** selecionado — você marca só o que vai subir em paralelo. Repositórios **sem** script `dev` no `package.json` são ignorados, com aviso no terminal.

### Sem prompt (CI, automação ou terminal sem TTY)

- **Todos os repositórios**: `yarn run install -- --all`, ou na shell Unix: `REPOS_SKIP_PROMPT=1 yarn install` (Git Bash / macOS / Linux). No **PowerShell**: `$env:REPOS_SKIP_PROMPT='1'; yarn install`.
- **Lista fixa**: `yarn run install -- -- nome-do-repo outro-repo` (o `--` separa flags do script dos nomes das pastas).

Sem TTY e **sem** `--all`, **sem** nomes após `--` e **sem** `REPOS_SKIP_PROMPT=1`, o `install` nos sub-repositórios **não roda** — evita travar builds em ambiente sem usuário para responder ao menu.

### Atenção: `yarn add` nesta raiz

Depois de `yarn add` **no hub**, o ciclo de instalação pode rodar **sem TTY** e o script **pula** a instalação nos sub-repositórios (comportamento intencional). Para instalar mesmo assim em todos: `yarn run install -- --all`.

---

## Configuração: `repos.config.json`

Arquivo **opcional** na raiz do hub. Se estiver ausente ou com JSON inválido, entram **valores padrão** (`ignore` extra vazio; `nodeVersionByRepo` vazio).

| Campo | Função |
|--------|--------|
| `ignore` | Nomes de pastas na **raiz do hub** que **não** entram na lista. `node_modules` e `.git` são sempre ignorados pelo script, mesmo que você não liste aqui. |
| `nodeVersionByRepo` | Objeto **nome da pasta** → **versão do Node** (ex.: `"20.18.3"`). Só altera o `PATH` daquele processo quando `NVM_HOME` ou `NVM_SYMLINK` (NVM for Windows) apontam para a instalação do NVM e a versão está instalada. Pastas omitidas usam o Node que já estiver no `PATH`. |

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

O arquivo precisa ser **JSON estrito** (sem comentários `//`). Ajuste as chaves aos **nomes reais das pastas** no disco.

---

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior na máquina em que você roda o hub
- [Yarn Classic](https://classic.yarnpkg.com/) (v1) nos repositórios filhos
- Opcional: [NVM for Windows](https://github.com/coreybutler/nvm-windows) se você usar `nodeVersionByRepo`

---

## Estrutura de pastas

```text
pasta-do-hub/              ← clone deste projeto + seus outros clones ao lado
  package.json             ← dependências do hub (concurrently, prompts)
  yarn.lock
  repos.config.json        ← opcional
  scripts/
    repo-workspace.mjs
  api/                     ← outro repositório (package.json na raiz de api/)
  web/                     ← outro repositório
```

O script **não** busca `package.json` de forma recursiva dentro de `api/src` — só considera **subpastas diretas** do hub que tenham `package.json` na raiz da subpasta.

---

## Resumo

| Situação | O que fazer |
|----------|-------------|
| Primeira vez, instalar tudo | `yarn` ou `yarn install` no hub (interativo) ou `yarn run install -- --all` |
| Desenvolvimento | `yarn dev` e escolher no menu |
| Automatizar / CI | `yarn run install -- --all` ou `yarn run install -- -- repo1 repo2` |
| Pasta não aparece no menu | Confira `package.json` na raiz da subpasta e o campo `ignore` em `repos.config.json` |
| Node incorreto em um repositório | Defina a entrada em `nodeVersionByRepo` e use o NVM no Windows com a versão instalada |
