# Testes agregados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `yarn tsc` por um agregador `yarn test` que resolve e executa em paralelo uma suíte canônica não interativa para N repositórios.

**Architecture:** Um resolvedor puro interpreta `scripts.test` e overrides de configuração. O dispatcher seleciona apenas suítes executáveis e entrega descritores de comandos ao executor paralelo, que injeta `CI=1` e o PATH da versão Node de cada repositório.

**Tech Stack:** Node.js 18+, ECMAScript modules, Yarn Classic, concurrently, prompts, node:test.

## Global Constraints

- Preservar os comandos `install`, `dev`, `setup` e `switch`.
- Remover `tsc` e `repos:tsc`.
- Não editar `package.json` dos repositórios filhos.
- Sincronizar os arquivos operacionais entre `.tools/repo-workspace` e a raiz de `repos`.
- Não criar commit sem solicitação explícita.

---

### Task 1: Resolver comandos de teste

**Files:**
- Create: `scripts/lib/test.mjs`
- Modify: `scripts/lib/config.mjs`
- Test: `tests/test-command.test.mjs`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Consumes: `package.json`, `config.testCommandByRepo`.
- Produces: `resolveTestCommand(repo, config, root)`, `resolveTestCommands(repos, config, root)`.

- [ ] Escrever testes que esperam:
  - override configurado;
  - `yarn test --run` para Vitest em watch;
  - `yarn test --watchAll=false` para CRA/Craco;
  - `yarn test` para Jest e Vitest já com `run`;
  - `null` sem suíte.
- [ ] Executar `node --test tests/test-command.test.mjs tests/config.test.mjs` e confirmar falha por módulo/funções ausentes.
- [ ] Implementar leitura segura de `scripts.test`, regras automáticas e suporte a `testCommandByRepo` em `loadConfig`.
- [ ] Reexecutar os dois testes e confirmar aprovação.

### Task 2: Integrar o modo test à CLI e execução paralela

**Files:**
- Modify: `scripts/lib/args.mjs`
- Modify: `scripts/lib/run.mjs`
- Modify: `scripts/repo-workspace.mjs`
- Modify: `tests/args.test.mjs`
- Create: `tests/run.test.mjs`
- Modify: `tests/smoke.test.mjs`

**Interfaces:**
- Consumes: `resolveTestCommands`.
- Produces: modo público `test`, descritores `{ name, command, cwd, env }` e execução agregada.

- [ ] Alterar os testes para aceitar `test`, rejeitar `tsc`, verificar ajuda e validar descritores com `CI=1`.
- [ ] Executar `node --test tests/args.test.mjs tests/run.test.mjs tests/smoke.test.mjs` e confirmar falhas esperadas.
- [ ] Generalizar o executor paralelo para aceitar um comando específico por repositório.
- [ ] Implementar seleção de suítes, títulos com comando resolvido, avisos de repositórios sem teste e falha quando nenhuma suíte puder ser executada.
- [ ] Reexecutar os testes da tarefa e confirmar aprovação.

### Task 3: Atualizar interface pública e documentação

**Files:**
- Modify: `package.json`
- Modify: `repos.config.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `yarn test`, `yarn repos:test`, `yarn test:self`.

- [ ] Trocar os scripts `tsc`/`repos:tsc` pelo agregador e mover a suíte interna atual para `test:self`.
- [ ] Documentar descoberta, comandos resolvidos, overrides, paralelismo e exclusão de watch/UI/coverage/E2E.
- [ ] Validar JSON com `node -e "JSON.parse(require('fs').readFileSync('package.json'))"` e executar `yarn test:self`.

### Task 4: Sincronizar a cópia da raiz e verificar

**Files:**
- Modify: `C:/Users/AGX/Desktop/repos/package.json`
- Modify: `C:/Users/AGX/Desktop/repos/repos.config.json`
- Modify: `C:/Users/AGX/Desktop/repos/scripts/repo-workspace.mjs`
- Modify/Create: `C:/Users/AGX/Desktop/repos/scripts/lib/*.mjs`
- Modify/Create: `C:/Users/AGX/Desktop/repos/tests/*.test.mjs`

**Interfaces:**
- Produces: cópia operacional equivalente na raiz.

- [ ] Copiar os arquivos operacionais e testes do fonte para a raiz, preservando valores locais de `ignore` e `nodeVersionByRepo`.
- [ ] Adicionar `testCommandByRepo` vazio ou overrides locais sem apagar configuração existente.
- [ ] Executar `yarn test:self` na raiz.
- [ ] Executar smoke tests do agregador com repositórios explícitos sem iniciar suítes longas.
- [ ] Comparar arquivos sincronizados e confirmar que apenas `repos.config.json` difere nos valores locais.
- [ ] Rodar diagnósticos dos arquivos alterados e revisar `git diff` do repositório fonte.

