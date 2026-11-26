# Proposta: suporte Deno (nexus) em yarn setup / yarn dev

> Card: [Repo-Workspace#3](https://github.com/RafaelHDSV/Repo-Workspace/issues/3) · origem [board#36](https://github.com/RafaelHDSV/board/issues/36)
> Worktree: `.worktrees/Repo-Workspace-3-adicionar-nexus-no-yarn-setup-do-repo-wo` · branch `feat/3-adicionar-nexus-no-yarn-setup-do-repo-wo`
> Gate: **completo** (15 seções) — altera regra de descoberta e comportamento de install/dev/setup.

## 1. Resumo executivo

Estender o hub para que pastas irmãs **só-Deno** (ex.: `nexus`, com `deno.json` e `tasks.dev`) entrem no multiselect de `yarn install`, `yarn dev` e `yarn setup`. Na install, repos Deno **pulam** `yarn` com aviso; na fase paralela de dev, rodam `deno task dev`. Repos Node/Yarn permanecem iguais. `yarn test` e overrides de runtime ficam fora de escopo.

## 2. Contexto e referências

- Issue produto: https://github.com/RafaelHDSV/Repo-Workspace/issues/3
- Board: https://github.com/RafaelHDSV/board/issues/36
- Card relacionado (mesmo produto): [Repo-Workspace#2](https://github.com/RafaelHDSV/Repo-Workspace/issues/2) (não bloqueante)
- Código atual: `scripts/lib/config.mjs` (`discoverPackageRepos`), `scripts/lib/run.mjs` (`runYarnParallel`, `runCommandsParallel`), `scripts/repo-workspace.mjs` (`runSetup`, `runParallelScript`, `runInstall`)
- Espelho de padrão: `scripts/lib/test.mjs` (`resolveTestCommand` / `resolveTestCommands`)
- Docs donos: `docs/especificacao.md`, `docs/regras-de-negocio.md`, `docs/ambiente-e-operacao.md`; menção no `README.md`

## 3. Regras de negócio

1. Descoberta para **install / dev / setup**: união de (a) pastas com `package.json` e (b) pastas **sem** `package.json` que tenham `deno.json` com `tasks.dev` string não vazia; dedupe por nome; `localeCompare`.
2. `deno.lock` **não** é exigido; só a task `dev` explícita.
3. Classificação:
   - **yarn:** tem `package.json` → install usa `yarn`.
   - **deno-dev:** `deno.json` + `tasks.dev` → fase dev usa `deno task dev`.
   - **ambos:** install = yarn; dev = `yarn dev` se existir `scripts.dev`, senão `deno task dev` (caso raro: log de aviso).
4. `yarn install` / fase sequencial do setup: só-Deno **não** chama `runYarnInstall`; mensagem `→ <repo>: (Deno) pulando yarn install`. Seleção só-Deno → exit 0 após avisos.
5. `yarn dev` / fase paralela do setup: elegíveis = yarn com `scripts.dev` **ou** deno-dev; comando resolvido por repo via `runCommandsParallel` (não fixar `yarn dev` para todos).
6. Se algum comando resolvido for Deno e `deno` não estiver no PATH → falhar **antes** do paralelo, mensagem clara.
7. `yarn test`, `yarn open`, `yarn switch`, `devCommandByRepo` / outros runtimes: **fora de escopo** (test continua só em `discoverPackageRepos`).
8. Pastas em `ignore` continuam fora da descoberta.

## 4. Critérios de aceitação

- [x] `nexus` (fixture ou clone com `deno.json` + `tasks.dev`) aparece no multiselect de `yarn dev` e `yarn setup`.
- [x] `yarn setup` com nexus selecionado: **não** roda `yarn` em nexus; roda `deno task dev` na fase paralela junto com os demais yarn.
- [x] `yarn install` com nexus selecionado: pula yarn com aviso; exit 0.
- [x] Repos só com `package.json` mantêm comportamento atual.
- [x] Avisos listam ignorados na fase dev por falta de `dev` (yarn ou deno), diferenciando skip Deno na install.
- [x] `yarn test:self` cobre descoberta unificada, resolução de comando, skip install e lista paralela.
- [x] Sem `deno` no PATH e seleção com Deno: falha antes do paralelo com mensagem clara.
- [x] README + living docs (`ambiente-e-operacao`, `especificacao`, `regras-de-negocio`) documentam suporte Deno e pré-requisito no PATH.
- [x] `yarn test` **não** passa a listar repos só-Deno.

## 5. Análise do código existente

| Peça | Papel hoje | Impacto |
|---|---|---|
| `scripts/lib/config.mjs` → `discoverPackageRepos` | Só `package.json` | Manter para **test**; adicionar descoberta Deno + união para install/dev/setup |
| `hasScript` / `filterWithScript` | Filtra script yarn | Insuficiente sozinho; complementar com resolução de comando Deno |
| `scripts/lib/run.mjs` → `runYarnInstallSequential` | Yarn em todos | Precisa skip Deno |
| `runYarnParallel` | Sempre `yarn <script>` | Dev/setup passam a montar entries e usar `runCommandsParallel` |
| `runCommandsParallel` / `buildParallelCommands` | Já aceitam comando por repo | **Reutilizar** (padrão de `runTests`) |
| `scripts/lib/test.mjs` | Resolução por repo | **Espelhar** em módulo de dev (não misturar com test) |
| `scripts/repo-workspace.mjs` | `selectPackageRepos`, `runInstall`, `runParallelScript`, `runSetup` | Trocar descoberta unificada; install com skip; dev com resolução |
| `tests/config.test.mjs`, `tests/run.test.mjs` | Cobertura atual | Estender / novo arquivo de testes Deno |

Não recriar concurrently nem o fluxo de seleção (`resolveSelection`).

## 6. Arquitetura proposta

```text
select (install|dev|setup)
  → discoverWorkspaceRepos = package ∪ deno-dev
  → resolveSelection (igual hoje)

install / fase sequencial setup
  → para cada repo: se yarn → runYarnInstall; se só-Deno → skip + aviso
  → se nenhum yarn restante: exit 0 (após avisos)

dev / fase paralela setup
  → resolveDevCommands(selected) → [{repo, command}] + skipped
  → se algum command é Deno: ensureDenoOnPath() ou exit 1
  → runCommandsParallel(commands)
```

Camadas: CLI (`repo-workspace.mjs`) → descoberta/classificação (`config.mjs` + novo `dev.mjs`) → execução (`run.mjs`). Sem persistência, sem HTTP.

**Abordagem recomendada:** módulo novo `scripts/lib/dev.mjs` (espelho de `test.mjs`) com `hasDenoDevTask`, `classifyRepo`, `resolveDevCommand`, `resolveDevCommands`, `ensureDenoAvailable`; em `config.mjs`, `discoverDenoDevRepos` + `discoverWorkspaceRepos` preservando `discoverPackageRepos` intacta para test.

## 7. Mudanças por arquivo

| Arquivo | Tipo | Descrição da mudança |
|---|---|---|
| `scripts/lib/dev.mjs` | criar | Classificação e resolução de comando `dev` (yarn vs deno); check PATH |
| `scripts/lib/config.mjs` | alterar | `discoverDenoDevRepos`, `discoverWorkspaceRepos`; JSDoc |
| `scripts/lib/run.mjs` | alterar | Install sequencial com skip Deno (ou helper que classifica antes de chamar yarn) |
| `scripts/repo-workspace.mjs` | alterar | Usar descoberta unificada em install/dev/setup; resolução de commands; mensagens |
| `tests/config.test.mjs` e/ou `tests/dev.test.mjs` | criar/alterar | Fixtures package / deno / misto; descoberta, skip, resolução |
| `docs/especificacao.md` | alterar | Comandos passam a incluir Deno elegível |
| `docs/regras-de-negocio.md` | alterar | Regra 3 (só package.json) → união package + deno-dev |
| `docs/ambiente-e-operacao.md` | alterar | Requisitos Deno; regra de ouro; menus; tabela |
| `docs/context.md` | alterar | Só se status/stack precisarem de uma linha |
| `README.md` | alterar | Menção Deno / nexus e link ao guia |
| `CHANGELOG.md` / `docs/historico-de-mudancas.md` | alterar | Entrada notável de feature (opcional no mesmo PR) |

Estimativa: média (1 módulo novo + 3 scripts + testes + docs).

## 8. Contratos e tipos

```js
/** @returns {string[]} pastas com package.json (inalterado; usado por yarn test) */
discoverPackageRepos(config, root)

/** @returns {string[]} pastas sem package.json com deno.json.tasks.dev */
discoverDenoDevRepos(config, root)

/** @returns {string[]} união ordenada */
discoverWorkspaceRepos(config, root)

/**
 * @returns {"yarn" | "deno-dev" | "both" | "none"}
 */
classifyRepo(repo, root)

/**
 * @returns {string | null} "yarn dev" | "deno task dev" | null
 */
resolveDevCommand(repo, root)

/**
 * @returns {{ commands: Array<{repo:string, command:string}>, skipped: string[] }}
 */
resolveDevCommands(repos, root)

/** @throws / process.exit se deno ausente quando necessário */
ensureDenoAvailable()
```

Sem mudança em schema de `repos.config.json` neste card.

## 9. Impactos colaterais e dependências

- Pré-requisito novo no ambiente do DEV: **Deno no PATH** quando nexus (ou outro deno-dev) for selecionado.
- `yarn test` inalterado (não lista só-Deno).
- `yarn open` / Source Control inalterados (descoberta por `.git`).
- Card #2 (reutilizar seleção) não conflita se touching points forem só mensagens/fluxo de prompt.
- Nenhum impacto HML/prod de produto web — ferramenta local.

## 10. Plano de execução em etapas

1. `dev.mjs` + descoberta em `config.mjs` + testes unitários de classificação/descoberta.
2. Install sequencial com skip Deno + testes de mensagem/exit.
3. `runParallelScript` (dev) e `runSetup` passando a `resolveDevCommands` + `ensureDenoAvailable` + `runCommandsParallel`.
4. Ajuste de mensagens de skip (install vs sem script/task).
5. Docs (ambiente, regras, especificação, README) + CHANGELOG/histórico se cabível.
6. `yarn test:self` verde no worktree.

## 11. Riscos, trade-offs e alternativas consideradas

| Alternativa | Veredito |
|---|---|
| **A. Módulo `dev.mjs` + união de descoberta** (recomendada) | Isola regra como `test.mjs`; test fica intocado |
| **B. Tudo em `config.mjs` / `repo-workspace.mjs`** | Menos arquivos, mas mistura descoberta com resolução de comando |
| **C. Só `devCommandByRepo` em config** | Rejeitado no card — exige JSON por clone |
| **D. `deno cache` na install** | Fora de escopo |
| **E. Esconder Deno do multiselect de install** | Rejeitado — mesma seleção, skip explícito |

Riscos: Deno ausente no PATH (mitigado por check pré-paralelo); pasta com `deno.json` inválido (tratar como não elegível, como `package.json` inválido hoje); confusão se alguém esperar `yarn test` em Deno (documentar fora de escopo).

## 12. Plano de testes

- Unit: fixture tmp com `api` (package+dev), `nexus` (só deno.json+tasks.dev), `mixed` (ambos), `plain` (nada), pasta em ignore.
- Assert `discoverWorkspaceRepos` inclui api+nexus; `discoverPackageRepos` só api (+ mixed se tiver package).
- Assert `resolveDevCommand("nexus") === "deno task dev"`; mixed com scripts.dev → `yarn dev`.
- Assert install path: só-Deno não chama yarn (mock/spy ou função pura de “repos a instalar”).
- Assert `ensureDenoAvailable` falha quando PATH sem deno (stub).
- Manual: no hub real com pasta `nexus` irmã, `yarn setup` selecionando nexus + um yarn.
- Regressão: `yarn test:self` completo; smoke de seleção só yarn.

## 13. Observabilidade e rollback

- Logs em stderr: skips Deno, sem script/task, falha de PATH.
- Sem métricas/toggles.
- Rollback: reverter o PR/commits da branch; comportamento volta a só `package.json`.

## 14. Dúvidas em aberto

1. Mensagem de skip — **decidido:** `→ <repo>: (Deno) pulando yarn install` (texto do card).
2. Docs — **decidido:** README curto + living docs (`ambiente-e-operacao`, `regras`, `especificacao`).
3. API — **decidido:** `discoverWorkspaceRepos` (união) + manter `discoverPackageRepos` para test.

## 15. Aprovação

- **Status:** implementado
- Aprovado em 2026-11-25 por Rafael (defaults / recomendações da proposta).
- Implementação no worktree; **sem** commit/push/PR até pedido separado.
