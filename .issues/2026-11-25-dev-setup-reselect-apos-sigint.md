# Proposta: ao cancelar dev/setup, reexecutar com mesma seleção pré-marcada

> **Card:** https://github.com/RafaelHDSV/Repo-Workspace/issues/2  
> **Worktree:** `.worktrees/Repo-Workspace-2-repo-workspace-ao-cancelar-dev-setup-ofe`  
> **Branch:** `feat/2-repo-workspace-ao-cancelar-dev-setup-ofe`

## 1. Resumo executivo

Após o primeiro Ctrl+C durante a fase `yarn dev` paralela (`yarn dev` ou fase dev do `yarn setup`), o CLI pergunta se o usuário quer escolher repositórios de novo. Em caso afirmativo, reabre o multiselect com a última seleção confirmada já marcada, e sobe de novo só o `dev` (sem repetir o `yarn` sequencial do setup). Sem persistência em disco; modos com `--all` / `REPOS_SKIP_PROMPT` / nomes na CLI ficam fora do loop.

## 2. Contexto e referências

- Issue: https://github.com/RafaelHDSV/Repo-Workspace/issues/2
- Código: `scripts/repo-workspace.mjs`, `scripts/lib/run.mjs`, `scripts/lib/select.mjs`
- Docs donos: `docs/especificacao.md`, `docs/regras-de-negocio.md`, `docs/ambiente-e-operacao.md`, `docs/api.md`, `README.md`
- `yarn open` já usa `preselected` via `readScanRepositories` — **não alterar**
- Dependência relevante: `concurrently` (KillOnSignal remapeia exit code de SIGINT para `0` e marca comandos como `killed`)

## 3. Regras de negócio

1. Escopo só `dev` e fase `dev` do `setup`. `install`, `test`, `open`, `switch` inalterados.
2. Gatilho: interrupção (SIGINT / Ctrl+C) enquanto `runYarnParallel` / `concurrently` está ativo — não durante multiselect nem durante `yarn` sequencial do setup.
3. Prompt pós-interrupção no stderr: oferecer reescolher com a mesma seleção marcada.
4. **Sim** → multiselect com `preselected` = última lista **confirmada** no multiselect (decisão 1A; pode incluir repo sem `dev`, ignorado de novo com aviso).
5. **Não** (ou Ctrl+C no prompt sim/não) → sair com código 0.
6. `yarn dev`: após nova seleção, só `yarn dev` nos repos com script `dev` (`filterWithScript`).
7. `yarn setup`: se o `yarn` sequencial já concluiu e a interrupção foi na fase dev, **não** repetir install; só nova fase dev. Ctrl+C antes do fim do install sequencial = abortar como hoje (fora do escopo).
8. Loop ilimitado até **Não** ou segunda interrupção no prompt sim/não.
9. Sem persistência em disco; próxima invocação "fria" não pré-marca (exceto `open`).
10. Com `REPOS_SKIP_PROMPT=1`, `--all` ou nomes após `--`: sem loop (comportamento atual).
11. Pré-marcação só dentro da mesma sessão de processo.

## 4. Critérios de aceitação

- [x] Ctrl+C durante `yarn dev` paralelo pergunta reexecutar; **Sim** abre multiselect com repos da rodada anterior marcados.
- [x] É possível desmarcar um repo e confirmar; só os marcados sobem no próximo `dev`.
- [x] É possível marcar um repo adicional e confirmar; o novo entra no próximo `dev`.
- [x] Não encerra sem prompt imediato após o primeiro Ctrl+C na fase paralela.
- [x] No `yarn setup`, após `yarn` completo, Ctrl+C na fase dev **não** roda `yarn` de novo ao aceitar reexecutar.
- [x] Nova execução de `yarn dev`/`setup` sem Ctrl+C anterior **não** pré-marca repos (exceto `open`).
- [x] `REPOS_SKIP_PROMPT=1` e lista explícita na CLI não entram no loop.
- [x] README (e guia operacional) descreve o fluxo.
- [x] Testes com `promptFn` injetável cobrem pré-marcação após interrupção simulada e ramo "só dev" no setup.

## 5. Análise do código existente

| Peça | Papel hoje | Reuso |
|---|---|---|
| `select.mjs` → `buildChoices` / `pickRepos` / `resolveSelection` | Multiselect com `preselected` e `promptFn` injetável | Reusar `preselected` no loop; não reinventar |
| `run.mjs` → `runYarnParallel` / `runCommandsParallel` | `await concurrently(...).result` sem distinguir SIGINT | Alterar para reportar interrupção |
| `repo-workspace.mjs` → `runParallelScript` / `runSetup` | Uma seleção → um run; setup = install + dev | Envolver fase dev em loop de reselect |
| `selectPackageRepos` | Descobre + resolveSelection sem preselected | Primeira rodada inalterada; loop usa `pickRepos` direto com preselected |
| `filterWithScript` | Filtra quem tem script `dev` | Continuar após cada nova seleção |
| `tests/select.test.mjs` | Já testa `preselected` | Estender / espelhar padrão de fake prompt |

**Não recriar:** mecanismo de pré-marcação do `open` (Source Control); descoberta de repos; filtro de script.

## 6. Arquitetura proposta

### Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| A | Loop duplicado em `runParallelScript` e `runSetup` | Simples de ler localmente | Duplicação e risco de divergência setup vs dev |
| **B (recomendada)** | Helper compartilhado `runDevReselectLoop` + `runYarnParallel` retornando `{ interrupted }` | Um contrato; setup só pula install | Extrai um pouco de orquestração |
| C | Handler global de SIGINT no `main` | Detecta sinal cedo | Acopla todos os modos; conflita com concurrently |

**Recomendação: B.**

### Fluxo

```text
[seleção inicial interativa?]
        │
        ▼
(setup only) yarn sequencial ──Ctrl+C──► aborta (hoje; fora do escopo)
        │
        ▼
┌──► filterWithScript("dev") → runYarnParallel
│              │
│         interrupted?
│          não → fim (exit natural / falha)
│          sim → confirm "reescolher?"
│                    │
│              Não / cancel → exit 0
│              Sim → pickRepos(candidates, preselected=última confirmada)
│                    │
│              (atualiza lastConfirmed)
└────────────────────┘
```

### Detecção de interrupção

`concurrently` (KillOnSignal) em SIGINT: aborta filhos, remapeia `exitCode` para `0`, e os close events carregam `killed: true`. Portanto `await result` **resolve** (não rejeita) após Ctrl+C — não basta “deu certo”.

Plano: `runCommandsParallel` / `runYarnParallel` passam a retornar um resultado estruturado, p.ex. `{ interrupted: boolean }`, inspecionando close events (`killed`) e/ou um flag local de SIGINT. Falhas reais (reject) continuam propagando.

Gate do loop: só entra se a seleção inicial veio do multiselect interativo (não CLI / `--all` / skip prompt).

## 7. Mudanças por arquivo

| Arquivo | Tipo | Descrição da mudança |
|---|---|---|
| `scripts/lib/run.mjs` | alterar | `runCommandsParallel` / `runYarnParallel` retornam `{ interrupted }`; capturam close events / sinal |
| `scripts/lib/select.mjs` | alterar (mínimo) | Helper `confirmReselect` (confirm via `prompts`, `promptFn` injetável); Ctrl+C / cancel → `false` |
| `scripts/repo-workspace.mjs` | alterar | Extrair `runDevReselectLoop`; usar em `runParallelScript` (dev) e `runSetup` (após install) |
| `tests/run.test.mjs` | alterar | Cobrir classificação interrupted vs sucesso/falha (fake concurrently ou API testável) |
| `tests/select.test.mjs` ou novo `tests/dev-reselect.test.mjs` | alterar/criar | Pré-marcação após “interrupção”; setup não chama install de novo; skip loop sem interativo |
| `README.md` | alterar | Mencionar o fluxo Ctrl+C → reescolher (pitch curto + link) |
| `docs/ambiente-e-operacao.md` | alterar | Documentar comportamento dos menus / fluxo do dia |
| `docs/especificacao.md` | alterar | Comportamento de `dev`/`setup` pós-SIGINT |
| `docs/regras-de-negocio.md` | alterar | Regras do loop e exclusões |
| `docs/api.md` | alterar | Contrato CLI: prompt pós-SIGINT, exit 0 |
| `docs/historico-de-mudancas.md` | alterar | Entrada datada se considerado mudança notável |
| `CHANGELOG.md` | alterar | Entrada Keep a Changelog (Unreleased) |

Tamanho estimado: médio (orquestração + testes + docs), ~4–6 arquivos de código + docs.

## 8. Contratos e tipos

```js
// run.mjs
async function runCommandsParallel(...): Promise<{ interrupted: boolean }>
async function runYarnParallel(...): Promise<{ interrupted: boolean }>

// select.mjs
async function confirmReselect(
  message?: string,
  promptFn?: typeof prompts,
): Promise<boolean> // false = Não ou cancel/SIGINT no prompt

// repo-workspace.mjs (interno)
async function runDevReselectLoop({
  initialSelected: string[],
  discovered: string[],          // candidatos do multiselect
  interactiveLoop: boolean,      // false se CLI/--all/skip
  config, root,
  promptFn?,                     // testes
}): Promise<void>
```

Mensagem sugerida (stderr / prompts):  
`Parou os servidores dev. Quer escolher repositórios de novo com a mesma seleção marcada?`

## 9. Impactos colaterais e dependências

- `yarn test` paralelo **não** entra no loop (mesmo usando `runCommandsParallel`) — o loop vive só no helper de dev.
- Windows: Ctrl+C + TTY + `prompts` após SIGINT pode precisar garantir stdin resumido; risco a validar manualmente.
- Nenhuma mudança de schema, auth ou rede.
- Dependências npm: nenhuma nova.

## 10. Plano de execução em etapas

1. Ajustar `run.mjs` para retornar `{ interrupted }` (TDD: teste primeiro se possível).
2. Adicionar `confirmReselect` em `select.mjs` + testes de fake prompt.
3. Implementar `runDevReselectLoop` e plugar em `runParallelScript` / `runSetup`.
4. Testes de integração do loop (interrupção simulada, setup sem reinstall, skip não-interativo).
5. Atualizar README + living docs (`ambiente-e-operacao`, `especificacao`, `regras-de-negocio`, `api`, histórico/CHANGELOG).
6. Rodar `yarn test:self` no worktree.

## 11. Riscos, trade-offs e alternativas consideradas

| Risco / alternativa | Tratamento |
|---|---|
| Persistir seleção em arquivo | Rejeitado pelo card |
| Pré-marcar via `git.scanRepositories` | Rejeitado — mistura com `open` |
| Repetir setup inteiro após Ctrl+C | Rejeitado — só fase dev |
| Estender a `yarn test` | Fora de escopo |
| `await result` resolve em SIGINT | Detectar via `killed` / flag, não via reject |
| Ctrl+C no multiselect de reselect | Manter `pickRepos` atual → "Cancelado." + exit 0 |
| Pré-marcar só `withScript` vs seleção confirmada | Decidido: lista **confirmada** no multiselect (dúvida 1 → A) |

## 12. Plano de testes

- Unit: `confirmReselect` Sim/Não/cancel.
- Unit: `runYarnParallel`/`runCommandsParallel` reporta `interrupted` quando close events têm `killed` (injeção ou harness).
- Loop: após interrupted + Sim, próximo `pickRepos` recebe `preselected` da lista confirmada anterior.
- Setup: após install mockado + interrupted + Sim, não chama `runYarnInstallSequential` de novo.
- Skip: `interactiveLoop=false` → interrupted não pergunta (ou helper nem é usado).
- Regressão: `open` preselected inalterado; `test`/`install`/`switch` sem loop.
- Manual: `yarn dev` com 2+ repos no hub real, Ctrl+C, Sim, desmarcar um, confirmar.

## 13. Observabilidade e rollback

- Logs: mensagens stderr existentes + prompt novo; sem telemetria.
- Rollback: reverter o PR/commits da branch; comportamento volta ao “Ctrl+C encerra”.
- Sem feature flag.

## 14. Dúvidas em aberto

1. **Pré-marcação no reselect** — **Decidido (1A):** lista **confirmada** no multiselect (repos sem `dev` podem vir marcados e serão ignorados de novo com aviso).
2. **Docs** — **Decidido (2A):** atualizar **README** (curto) **e** `docs/ambiente-e-operacao.md` (detalhe), além dos donos living (`especificacao`, `regras-de-negocio`, `api`, histórico/CHANGELOG conforme plano).
3. **Texto do confirm** — **Decidido (3A):** frase do card: `Parou os servidores dev. Quer escolher repositórios de novo com a mesma seleção marcada?`

## 15. Aprovação

**Status: implementado** (2026-11-25)

Decisões 1A/2A/3A aplicadas. Verificação: `yarn test:self` — 92 pass / 0 fail.
