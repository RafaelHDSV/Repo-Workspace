# repo-workspace

Hub local em Yarn para **vários repositórios Git** organizados como **pastas irmãs** no mesmo diretório: um único lugar para rodar **`yarn`**, **`yarn dev`**, **`yarn test`**, **`yarn setup`** (instalar e depois subir o dev) e **`yarn switch`** (trocar de branch), com lista interativa ou nomes na linha de comando.

https://github.com/user-attachments/assets/46325e0e-664f-4812-bc0b-c12a655f60e6

---

## Para que serve

Se você mantém vários repositórios — por exemplo `api/`, `web/` e `worker/`, cada um com o próprio `package.json` — **no mesmo nível** de pasta, costuma enfrentar isto:

- vários terminais e repetir `cd`, `yarn`, `yarn dev` e testes em cada projeto;
- perder de vista em qual pasta faltam dependências instaladas;
- misturar versões do Node entre projetos;
- trocar a mesma branch em vários clones um a um.

Este repositório é a **pasta central** (*hub*): aqui ficam a ferramenta (`package.json`, `scripts/` e `repos.config.json`). Os outros produtos continuam sendo **repositórios comuns** em subpastas. O hub **não substitui** o Git de cada um — apenas orquestra os comandos a partir da raiz do hub.

A raiz operacional **padrão** é o diretório onde estes arquivos estão. Dá para apontar outra pasta com `--root` / `REPOS_ROOT` (útil em automação ou quando o script roda fora da pasta dos clones).

---

## Regra de ouro: onde colocar

1. **A raiz do hub** é o diretório em que estão `package.json` (deste projeto), `repos.config.json` e `scripts/repo-workspace.mjs` — ou o path passado em `--root` / `REPOS_ROOT`.
2. Cada outro projeto é uma **subpasta direta** dessa raiz operacional (irmã de `scripts/` no layout clássico).
3. Para `install` / `dev` / `test` / `setup`, só entram pastas que **tenham `package.json` na própria raiz** da subpasta.
4. Para `switch`, entram pastas que **tenham `.git`**.

Se você clonou este repositório só como **modelo**, copie esses arquivos para a pasta onde já estão os outros clones (por exemplo `C:\Users\...\meus-repos\` ou `~/repos/`), mantendo a mesma hierarquia.

---

## Início rápido

1. Organize seus repositórios como subpastas diretas da raiz do hub.
2. Na **raiz do hub**, instale as dependências do próprio hub com `yarn`. Na primeira vez, use um terminal **interativo** para o fluxo de `install` nos sub-repositórios.
3. Opcional: edite `repos.config.json` para ignorar pastas ou fixar a versão do Node por pasta.
4. No dia a dia: `yarn install`, `yarn dev`, `yarn test`, `yarn setup` ou `yarn switch <branch>`.

---

## Uso no dia a dia

Todos os comandos abaixo são executados na **raiz do hub**.

| Objetivo | Comando |
|----------|---------|
| Instalar dependências (`yarn`) **com menu** | `yarn install` — terminal **interativo** (TTY) |
| Instalar em **todos**, sem menu | `yarn run install -- --all` |
| Subir `yarn dev` em paralelo **com menu** | `yarn dev` |
| Rodar as suítes canônicas em paralelo **com menu** | `yarn test` |
| Instalar e depois subir `dev` (mesma seleção) | `yarn setup` |
| Trocar de branch nos clones git | `yarn switch <branch>` |
| Nomes explícitos (qualquer modo yarn) | `yarn run install -- -- api web` ou `yarn test -- api web` |
| Switch sem menu | `yarn switch main -- core api` ou `yarn switch production -- --all` |

Equivalentes: `yarn repos:install`, `yarn repos:dev`, `yarn repos:test`, `yarn repos:setup`.

### Raiz e config externos (automação)

```bash
node scripts/repo-workspace.mjs setup --root /caminho/dos/clones --config /caminho/repos.config.json
# ou
REPOS_ROOT=/caminho/dos/clones yarn setup
```

- `--root` / `REPOS_ROOT`: pasta que contém as subpastas dos repositórios (não precisa ser a pasta deste tool).
- `--config`: JSON no formato de `repos.config.json` (já resolvido). Se omitido, lê `repos.config.json` na raiz operacional.

### Comportamento dos menus

- O multiselect abre com **nada** selecionado — marque com Espaço; Enter confirma.
- **`yarn dev`** e **`yarn setup`** (etapa de dev): repositórios **sem** script `dev` são ignorados, com aviso.
- **`yarn test`**: mostra somente repositórios com suíte detectada e o comando não interativo que será executado.
- **`yarn setup`**: seleciona **uma vez**, roda `yarn` sequencialmente em todos os selecionados e, só após sucesso, inicia `yarn dev` em paralelo nos que tiverem script `dev`.
- **`yarn switch`**: o menu mostra a branch atual de cada clone ao lado do nome.

### Como `yarn test` resolve cada suíte

O agregador analisa `scripts.test` de cada `package.json`:

- Vitest sem `run`: executa `yarn test --run`;
- CRA, React Scripts ou Craco: executa `yarn test --watchAll=false`;
- demais suítes canônicas, como Jest ou Vitest já configurado com `run`: executa `yarn test`.

Todos os processos recebem `CI=1`, usam a versão definida em `nodeVersionByRepo` e rodam em paralelo com prefixo por repositório. Watch, UI, coverage, integrações externas e E2E não são adicionados automaticamente, evitando processos persistentes e execuções duplicadas.

Para uma exceção, configure `testCommandByRepo`. O override tem prioridade sobre a análise automática.

### Sem prompt (CI, automação ou terminal sem TTY)

- **Todos**: `yarn run install -- --all`, ou `REPOS_SKIP_PROMPT=1 yarn install` (Unix/Git Bash). No **PowerShell**: `$env:REPOS_SKIP_PROMPT='1'; yarn install`.
- **Lista fixa**: `yarn run install -- -- nome-do-repo outro-repo`.

Sem TTY e **sem** `--all`, **sem** nomes e **sem** `REPOS_SKIP_PROMPT=1`, o `install` nos sub-repositórios **não roda** — evita travar builds após `yarn add` no hub.

### `yarn switch` — detalhes

Para cada repositório:

1. Valida pasta e `.git`
2. Working tree sujo → **pula** e segue nos demais
3. Branch local → `git switch <branch>`
4. Só `origin/<branch>` → `git switch --track origin/<branch>`
5. Caso contrário → erro nesse item

**Não** faz `fetch`, `pull`, stash nem force checkout.

Códigos de saída:

- `0` se todos tiveram sucesso
- `1` se houve erro **ou** pulo (working tree sujo conta como falha parcial)

---

## Configuração: `repos.config.json`

Arquivo **opcional** na raiz do hub. Se estiver ausente ou inválido, entram valores padrão.

| Campo | Função |
|--------|--------|
| `ignore` | Nomes de pastas na raiz do hub que **não** entram na lista. `node_modules`, `.git`, `scripts` e `tests` são sempre ignorados. |
| `nodeVersionByRepo` | Objeto **nome da pasta** → **versão do Node**. Só altera o `PATH` quando `NVM_HOME` ou `NVM_SYMLINK` apontam para o NVM e a versão está instalada. |
| `testCommandByRepo` | Objeto **nome da pasta** → **comando canônico de teste** para sobrescrever ou habilitar a detecção automática. |

Exemplo:

```json
{
  "ignore": ["arquivos-locais", "legacy"],
  "nodeVersionByRepo": {
    "api": "20.10.0",
    "web": "22.12.0"
  },
  "testCommandByRepo": {
    "legacy": "yarn test:ci"
  }
}
```

JSON estrito (sem comentários `//`).

---

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- [Yarn Classic](https://classic.yarnpkg.com/) (v1) nos repositórios filhos
- Opcional: [NVM for Windows](https://github.com/coreybutler/nvm-windows) se usar `nodeVersionByRepo`

---

## Estrutura de pastas

```text
pasta-do-hub/              ← clone deste projeto ou cópia dos essenciais
  package.json
  yarn.lock
  repos.config.json        ← opcional
  scripts/
    repo-workspace.mjs
    lib/
  tests/
  api/                     ← outro repositório
  web/                     ← outro repositório
```

O script **não** busca `package.json` de forma recursiva — só **subpastas diretas** do hub.

---

## Testes

Executar suítes dos repositórios:

```bash
yarn test
yarn test -- api web
yarn run test -- --all
```

Executar somente os testes internos do hub:

```bash
yarn test:self
```

---

## Resumo

| Situação | O que fazer |
|----------|-------------|
| Primeira vez, instalar tudo | `yarn install` (interativo) ou `yarn run install -- --all` |
| Desenvolvimento | `yarn dev` ou `yarn setup` |
| Testar vários repositórios | `yarn test` |
| Trocar branch em vários clones | `yarn switch main` |
| Automatizar / CI | `--all`, nomes após `--` ou `REPOS_SKIP_PROMPT=1` |
| Pasta não aparece no menu | Confira `package.json` / `.git` e o campo `ignore` |
| Node incorreto em um repositório | Defina `nodeVersionByRepo` e use NVM com a versão instalada |

## Apoie

<a href="https://www.buymeacoffee.com/vieira" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="32" width="117" style="height: 32px !important; width: 117px !important;" ></a>
