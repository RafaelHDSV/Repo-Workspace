# Testes agregados no repo-workspace

## Objetivo

Substituir o comando agregado `yarn tsc` por `yarn test`, capaz de selecionar N repositórios e executar, em paralelo, uma suíte canônica e não interativa para cada um.

## Escopo

- Alterar o repositório fonte `.tools/repo-workspace`.
- Sincronizar a cópia operacional na raiz de `repos`.
- Não alterar os `package.json` dos repositórios filhos.
- Remover os comandos públicos `tsc` e `repos:tsc`.
- Preservar `install`, `dev`, `setup` e `switch`.

## Descoberta das suítes

O hub descobre subpastas diretas com `package.json` e resolve um comando de teste por repositório nesta ordem:

1. Override `testCommandByRepo[repo]` em `repos.config.json`.
2. Análise de `scripts.test` do repositório.
3. Ausência de suíte executável.

Regras automáticas:

- `scripts.test` com Vitest sem modo `run`: `yarn test --run`.
- `scripts.test` com CRA, React Scripts ou Craco: `yarn test --watchAll=false`.
- Outros `scripts.test`: `yarn test`.

Todos os processos recebem `CI=1` e a versão de Node definida em `nodeVersionByRepo`.

O levantamento atual identificou:

- Vitest já não interativo: `optimus-auth`, `uxvision` e `PERSONAL-Vieira`.
- Vitest em watch por padrão: `auto-x-web` e `uxvision-web`.
- CRA/Craco em watch por padrão: `line-web`.
- Jest não interativo: `chat-web`, `core`, `indiky-server`, `indiky-shorten`, `line-server` e `mailer-server`.

Variantes de watch, UI, coverage, testes externos e E2E não serão executadas automaticamente, para evitar duplicidade, processos persistentes e dependências externas.

## Interface

- `yarn test`: abre multiselect com repositórios que possuem suíte resolvida.
- `yarn test -- repo1 repo2`: executa os repositórios informados.
- `yarn run test -- --all`: executa todas as suítes resolvidas.
- `yarn repos:test`: alias do agregador.
- `yarn test:self`: executa apenas os testes internos do `repo-workspace`.

O menu mostra o comando resolvido ao lado do nome do repositório.

Repositórios explícitos sem suíte são avisados e ignorados. Se nenhum selecionado possuir suíte, o comando termina com código `1`.

## Execução e falhas

Os comandos são executados em paralelo por `concurrently`, com prefixo por repositório. Uma falha não impede as demais suítes de concluírem, mas o resultado agregado termina com código diferente de zero.

O resolvedor fica isolado em `scripts/lib/test.mjs`. A infraestrutura de execução paralela passa a aceitar comandos específicos por repositório, preservando o PATH preparado pelo NVM.

## Configuração

`repos.config.json` passa a aceitar:

```json
{
  "testCommandByRepo": {
    "repo-especial": "yarn test:ci"
  }
}
```

O override pode habilitar um repositório sem `scripts.test` ou substituir a regra automática.

## Sincronização

Após a implementação, estes artefatos serão equivalentes entre o fonte e a cópia da raiz:

- `package.json`
- `scripts/repo-workspace.mjs`
- `scripts/lib/*.mjs`
- `tests/*.test.mjs`
- Estrutura de `repos.config.json`, preservando os valores específicos de cada local.

O README do repositório fonte será atualizado com comandos, regras de resolução, exemplos e limites.

## Testes

Os testes internos cobrirão:

- Parsing do modo `test` e rejeição do modo `tsc`.
- Resolução de Jest, Vitest, CRA/Craco, override e ausência de suíte.
- Injeção de `CI=1` e preservação da versão de Node.
- Filtragem e aviso de repositórios sem suíte.
- Construção de comandos paralelos específicos por repositório.
- Ajuda da CLI e aliases do `package.json`.
- Igualdade dos arquivos operacionais entre fonte e raiz.

