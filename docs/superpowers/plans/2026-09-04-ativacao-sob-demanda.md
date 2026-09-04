# Ativação sob demanda no Source Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `git.scanRepositories` refletir exatamente a última seleção de `yarn open`, em vez de acumular os 31 repositórios da raiz.

**Architecture:** Três mudanças que se sustentam: `activateRepos` passa a gravar em modo substituição sempre (o parâmetro `mode` some, junto com `resolveScanRepositories`, `resetActivation` e `REPOS_SKIP_ACTIVATE`); a ativação embutida sai de `install`, `dev`, `test`, `setup` e `switch`, deixando só `open` tocar no Source Control; e o multiselect de `open` abre pré-marcado com a lista ativa, lida por uma função nova `readScanRepositories`, com `min: 0` para permitir esvaziar.

**Tech Stack:** Node.js ESM puro (>= 18), `node:test` + `node:assert/strict`, `prompts` para o multiselect. Sem build, sem transpilação.

**Spec:** [`docs/superpowers/specs/2026-09-04-ativacao-sob-demanda-design.md`](../specs/2026-09-04-ativacao-sob-demanda-design.md)

## Global Constraints

- **Diretório de trabalho:** todas as rotas são relativas a `c:\Users\AGX\Desktop\repos\.tools\repo-workspace`.
- **Encoding:** todos os arquivos do repositório são **UTF-8 com CRLF**. Após criar ou reescrever um arquivo inteiro, rodar `sed -i 's/\r*$/\r/' <arquivo>` e confirmar com `file <arquivo>`. Edições pontuais preservam o CRLF existente.
- **Idioma:** comentários, JSDoc, mensagens de CLI e nomes de teste em **pt-BR acentuado**; identificadores de código em inglês, como no restante do projeto.
- **Suíte:** `node --test tests/<arquivo>.test.mjs` para um arquivo; `yarn test:self` para tudo. `yarn test` é o agregador de outros repositórios, **não** a suíte deste projeto.
- **Commits bloqueados por padrão:** o `CLAUDE.md` do workspace (§ 1.3) proíbe `git commit` sem pedido explícito do usuário. Os passos de commit deste plano só são executados se o usuário autorizar explicitamente; sem autorização, pular o passo de commit e seguir para a próxima tarefa com as mudanças no working tree.
- **Sem atribuição de IA** em qualquer mensagem de commit (§ 1.3): nada de `Co-authored-by`, "Generated with", nome de modelo ou ferramenta.
- **Ordem das tarefas importa:** a Task 1 precisa vir antes da Task 3. Enquanto `activateSilently` existir, transformar `persistScanRepositories` em substituição faria `yarn dev` apagar a lista do usuário.

---

## File Structure

| Arquivo | Responsabilidade depois da mudança |
|---|---|
| `scripts/lib/workspace.mjs` | Estado do Source Control: normaliza, lê e grava `git.scanRepositories`, escreve e limpa markers. Única fonte de verdade da ativação. |
| `scripts/lib/select.mjs` | Resolução de seleção e multiselect. Ganha pré-marcação e mínimo configurável. |
| `scripts/lib/args.mjs` | Parsing de CLI e texto de ajuda. Perde `--only`. |
| `scripts/repo-workspace.mjs` | Orquestração dos modos. Perde `activateSilently`; só `runOpen` chama `activateRepos`. |
| `tests/workspace.test.mjs` | Cobertura de `workspace.mjs`. |
| `tests/select.test.mjs` | **Novo.** Cobertura de `pickRepos`/`resolveSelection` com pré-marcação. |
| `tests/args.test.mjs` | Cobertura de parsing. |
| `tests/smoke.test.mjs` | Cobertura de ponta a ponta pelo binário. |
| `README.md` | Documentação da seção Source Control. |

---

### Task 1: Remover a ativação embutida dos comandos de trabalho

Esta é a mudança que interrompe o crescimento da lista, e por isso vem primeiro. Depois dela, `install`, `dev`, `test`, `setup` e `switch` não escrevem mais em `.vscode/settings.json`.

**Files:**
- Modify: `scripts/repo-workspace.mjs` (remove `activateSilently` e suas 5 chamadas; ajusta o `import`)
- Test: `tests/smoke.test.mjs`

**Interfaces:**
- Consumes: `activateRepos`, `resetActivation` de `scripts/lib/workspace.mjs` (assinaturas atuais, inalteradas nesta tarefa).
- Produces: `runOpen` passa a ser o **único** chamador de `activateRepos` no projeto. As tarefas seguintes contam com isso.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe("ativação no Source Control", ...)` em `tests/smoke.test.mjs`:

```js
  it("dev não escreve em .vscode/settings.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-smoke-embutida-"));
    try {
      // Repositório git com package.json, mas sem script dev: o comando
      // chega até a filtragem e aborta, depois do ponto onde a ativação
      // embutida rodava.
      fs.mkdirSync(path.join(tmp, "api", ".git"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "api", "package.json"),
        JSON.stringify({ name: "api", scripts: { build: "echo" } }, null, 2),
        "utf8",
      );

      const r = run(["dev", "--all", "--root", tmp]);

      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /script dev/);
      assert.ok(
        !fs.existsSync(path.join(tmp, ".vscode", "settings.json")),
        "dev não deve tocar no Source Control",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test tests/smoke.test.mjs`
Expected: FAIL no novo teste, com `dev não deve tocar no Source Control` — hoje `activateSilently` grava o arquivo antes do aborto.

- [ ] **Step 3: Remover `activateSilently`**

Em `scripts/repo-workspace.mjs`, apagar o bloco inteiro (linhas 84-95, incluindo o JSDoc):

```js
/**
 * Ativação embutida nos comandos de trabalho: silenciosa e não fatal.
 * Falha de ativação nunca aborta o comando principal.
 *
 * @param {string[]} selected
 * @param {string} root
 */
function activateSilently(selected, root) {
  try {
    activateRepos(selected, root, { mode: "merge", verbose: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[repos] ativação no Source Control falhou: ${message}`);
  }
}
```

- [ ] **Step 4: Remover as 5 chamadas**

Apagar a linha `  activateSilently(selected, root);` em cada um dos cinco pontos — hoje nas linhas 101 (`runInstall`), 113 (`runDev`), 166 (`runTest`), 183 (`runSetup`) e 265 (`runSwitch`). Nenhuma outra linha muda; a chamada é sempre isolada, logo após a resolução da seleção.

Confirmar que sobrou zero ocorrência:

```bash
grep -n "activateSilently" scripts/repo-workspace.mjs
```

Expected: nenhuma saída.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `node --test tests/smoke.test.mjs tests/args.test.mjs tests/workspace.test.mjs`
Expected: PASS. O `import { activateRepos, resetActivation }` continua válido — `runOpen` ainda usa os dois.

- [ ] **Step 6: Commit** *(só com autorização explícita — ver Global Constraints)*

```bash
git add scripts/repo-workspace.mjs tests/smoke.test.mjs
git commit -m "fix: nao ativar repositorios no Source Control em install, dev, test, setup e switch

A ativacao embutida somava a lista de git.scanRepositories a cada execucao,
levando a raiz a exibir os 31 repositorios. Só yarn open passa a alterar o
Source Control."
```

---

### Task 2: `readScanRepositories`

Função nova e puramente aditiva: lê a lista ativa para a interface poder pré-marcar o menu. Nada existente muda.

**Files:**
- Modify: `scripts/lib/workspace.mjs` (nova export)
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: nada além de `node:fs` e `node:path`.
- Produces: `readScanRepositories(root: string): string[]` — nunca lança. Consumida pela Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar `readScanRepositories` ao `import` no topo de `tests/workspace.test.mjs` (manter a lista de imports em ordem alfabética, entre `probeRepos` e `resetActivation`) e inserir este bloco logo após o `describe("resolveScanRepositories", ...)`:

```js
describe("readScanRepositories", () => {
  it("devolve a lista gravada", () => {
    const root = tmpRoot("repo-read-");
    try {
      fs.mkdirSync(path.join(root, ".vscode"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vscode", "settings.json"),
        JSON.stringify({ "git.scanRepositories": ["web", "api"] }),
        "utf8",
      );
      assert.deepEqual(readScanRepositories(root), ["web", "api"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("devolve [] quando o arquivo não existe", () => {
    const root = tmpRoot("repo-read-none-");
    try {
      assert.deepEqual(readScanRepositories(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("devolve [] com JSON inválido, sem lançar", () => {
    const root = tmpRoot("repo-read-bad-");
    try {
      fs.mkdirSync(path.join(root, ".vscode"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vscode", "settings.json"),
        "{ // comentário\n }",
        "utf8",
      );
      assert.deepEqual(readScanRepositories(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("devolve [] quando o conteúdo não é objeto ou a chave falta", () => {
    const root = tmpRoot("repo-read-shape-");
    try {
      const file = path.join(root, ".vscode", "settings.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });

      fs.writeFileSync(file, '["api"]', "utf8");
      assert.deepEqual(readScanRepositories(root), []);

      fs.writeFileSync(file, '{ "editor.tabSize": 2 }', "utf8");
      assert.deepEqual(readScanRepositories(root), []);

      fs.writeFileSync(file, '{ "git.scanRepositories": "api" }', "utf8");
      assert.deepEqual(readScanRepositories(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("descarta entradas que não são string", () => {
    const root = tmpRoot("repo-read-mixed-");
    try {
      const file = path.join(root, ".vscode", "settings.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({ "git.scanRepositories": ["api", 3, null, "web"] }),
        "utf8",
      );
      assert.deepEqual(readScanRepositories(root), ["api", "web"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL com `readScanRepositories is not a function` ou erro de import.

- [ ] **Step 3: Implementar**

Em `scripts/lib/workspace.mjs`, inserir logo **antes** de `persistScanRepositories`:

```js
/**
 * Lê git.scanRepositories de <root>/.vscode/settings.json.
 *
 * Nunca lança: arquivo ausente, JSON inválido, conteúdo que não é objeto ou
 * chave ausente devolvem lista vazia. É insumo de interface — um settings
 * corrompido degrada o menu para "nada pré-marcado" em vez de derrubar o
 * comando. O aviso de arquivo inválido é responsabilidade de
 * persistScanRepositories.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function readScanRepositories(root) {
  const settingsPath = path.join(root, ".vscode", "settings.json");

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const list = parsed["git.scanRepositories"];
  if (!Array.isArray(list)) return [];

  return list.filter((value) => typeof value === "string");
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/workspace.test.mjs`
Expected: PASS, incluindo os cinco testes novos.

- [ ] **Step 5: Commit** *(só com autorização explícita)*

```bash
git add scripts/lib/workspace.mjs tests/workspace.test.mjs
git commit -m "feat: ler git.scanRepositories para pre-marcar o menu de open"
```

---

### Task 3: Substituição como único modo

O coração da mudança. `resolveScanRepositories` vira `normalizeRepoList`, `persistScanRepositories` e `activateRepos` perdem `mode`, `activateRepos` aceita lista vazia e absorve `resetActivation`, e `REPOS_SKIP_ACTIVATE` some.

**Files:**
- Modify: `scripts/lib/workspace.mjs`
- Modify: `scripts/repo-workspace.mjs` (`runOpen` e o `import`)
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: `probeRepos(repos, root)` e `cleanStaleMarkers(root, keep)` — inalteradas.
- Produces:
  - `normalizeRepoList(list: unknown): string[]`
  - `persistScanRepositories(root: string, repos: string[]): { path: string, list: string[] | null, error: string | null }`
  - `activateRepos(repos: string[], root: string, opts?: { verbose?: boolean }): { ok: boolean, activated: string[], skipped: string[], failed: string[] }`
  - `resolveScanRepositories` e `resetActivation` **deixam de existir**.

- [ ] **Step 1: Reescrever os testes de lista**

Em `tests/workspace.test.mjs`: no `import`, trocar `resolveScanRepositories` por `normalizeRepoList` e **remover** `resetActivation`. Substituir o bloco `describe("resolveScanRepositories", ...)` inteiro por:

```js
describe("normalizeRepoList", () => {
  it("deduplica e ordena", () => {
    assert.deepEqual(normalizeRepoList(["web", "api", "api"]), [
      "api",
      "web",
    ]);
  });

  it("lista vazia continua vazia", () => {
    assert.deepEqual(normalizeRepoList([]), []);
  });

  it("descarta valores que não são string e strings vazias", () => {
    assert.deepEqual(normalizeRepoList([1, null, "api", "", "   "]), ["api"]);
  });

  it("normaliza espaço e barra final", () => {
    assert.deepEqual(normalizeRepoList(["  api  ", "web/", "core\\"]), [
      "api",
      "core",
      "web",
    ]);
  });

  it("tolera entrada que não é array", () => {
    assert.deepEqual(normalizeRepoList(undefined), []);
    assert.deepEqual(normalizeRepoList("api"), []);
  });
});
```

- [ ] **Step 2: Reescrever os testes de `activateRepos` e `persistScanRepositories`**

Remover o `describe("resetActivation", ...)` inteiro (final do arquivo) e o teste `it("respeita REPOS_SKIP_ACTIVATE", ...)`. Adicionar ao `describe("activateRepos", ...)`:

```js
  it("substitui a lista anterior em vez de somar", () => {
    const root = tmpRoot("repo-act-replace-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");

      activateRepos(["api", "web"], root);
      const result = activateRepos(["api"], root);

      assert.equal(result.ok, true);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["api"]);
      assert.ok(fs.existsSync(markerPath(root, "api")));
      assert.ok(
        !fs.existsSync(markerPath(root, "web")),
        "marker do repo removido da lista deve sair",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("lista vazia zera a lista e remove todos os markers", () => {
    const root = tmpRoot("repo-act-empty-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");
      activateRepos(["api", "web"], root);

      const result = activateRepos([], root);

      assert.equal(result.ok, true);
      assert.deepEqual(result.activated, []);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], []);
      assert.ok(!fs.existsSync(markerPath(root, "api")));
      assert.ok(!fs.existsSync(markerPath(root, "web")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserva chaves de terceiros no settings.json", () => {
    const root = tmpRoot("repo-act-keys-");
    try {
      fakeRepo(root, "api");
      fs.mkdirSync(path.join(root, ".vscode"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vscode", "settings.json"),
        JSON.stringify({ "editor.tabSize": 2 }),
        "utf8",
      );

      activateRepos(["api"], root);

      const settings = readSettings(root);
      assert.equal(settings["editor.tabSize"], 2);
      assert.equal(settings["git.autoRepositoryDetection"], true);
      assert.equal(settings["git.repositoryScanMaxDepth"], 0);
      assert.deepEqual(settings["git.scanRepositories"], ["api"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Rodar para confirmar que falha**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL — `normalizeRepoList` não existe e `substitui a lista anterior` encontra `["api", "web"]` no lugar de `["api"]`.

- [ ] **Step 4: Trocar `resolveScanRepositories` por `normalizeRepoList`**

Em `scripts/lib/workspace.mjs`, substituir a função inteira e seu JSDoc por:

```js
/**
 * Normaliza uma lista de nomes de repositório: descarta o que não é string,
 * apara espaço e barra final, deduplica e ordena.
 *
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeRepoList(list) {
  if (!Array.isArray(list)) return [];

  /** @type {Set<string>} */
  const out = new Set();

  for (const value of list) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/[\\/]+$/, "");
    if (name) out.add(name);
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 5: Tirar `mode` de `persistScanRepositories`**

Trocar a assinatura, o JSDoc e o cálculo da lista. O `@param {"merge" | "replace"} [mode]` sai do JSDoc, e a linha de doc ganha a nota de substituição:

```js
/**
 * Grava a seleção em <root>/.vscode/settings.json.
 *
 * A lista é substituída, não somada: o Source Control reflete exatamente a
 * última seleção. O merge acontece no JSON — chaves de terceiros sobrevivem.
 *
 * As três chaves juntas fazem a extensão Git registrar exatamente os
 * repositórios da lista em toda abertura da janela: maxDepth 0 faz o
 * traverse retornar vazio, e scanRepositories só é lido quando
 * autoRepositoryDetection é true ou "subFolders".
 *
 * @param {string} root
 * @param {string[]} repos
 * @returns {{ path: string, list: string[] | null, error: string | null }}
 */
export function persistScanRepositories(root, repos) {
```

E, no corpo, trocar a chamada:

```js
  const list = normalizeRepoList(repos);
```

no lugar de:

```js
  const list = resolveScanRepositories(
    settings["git.scanRepositories"],
    repos,
    mode,
  );
```

O resto do corpo (leitura, validação, escrita) fica intacto.

- [ ] **Step 6: Reescrever `activateRepos` e remover `resetActivation`**

Substituir `activateRepos` e a `resetActivation` que vem depois dela por:

```js
/**
 * Ativa repositórios no Source Control do Cursor/VS Code.
 *
 * Dois efeitos complementares: a lista em .vscode/settings.json reconstrói a
 * seleção a cada abertura da janela, e o marker em .git/ registra na janela
 * que já está aberta, sem esperar reload.
 *
 * A lista é substituída. Chamar com [] é a forma de esvaziar o Source
 * Control: zera a lista e remove todos os markers.
 *
 * @param {string[]} repos
 * @param {string} root
 * @param {{ verbose?: boolean }} [opts]
 * @returns {{ ok: boolean, activated: string[], skipped: string[], failed: string[] }}
 */
export function activateRepos(repos, root, opts = {}) {
  const { verbose = false } = opts;

  /** @type {string[]} */
  const gitRepos = [];
  /** @type {string[]} */
  const skipped = [];

  for (const name of repos) {
    if (isGitRepo(path.resolve(root, name))) gitRepos.push(name);
    else skipped.push(name);
  }

  if (verbose && skipped.length > 0) {
    console.error(`Ignorados (não são repositórios git): ${skipped.join(", ")}`);
  }

  if (verbose && repos.length > 0 && gitRepos.length === 0) {
    console.error("Nenhum repositório git para ativar no Source Control.");
  }

  const persisted = persistScanRepositories(root, gitRepos);
  if (persisted.error) {
    console.error(
      `[repos] ${persisted.path} não foi atualizado: ${persisted.error}. ` +
        "Corrija o arquivo à mão para a ativação sobreviver ao reload.",
    );
  }

  // Invariante: existe marker exatamente para quem está em
  // git.scanRepositories. Limpar antes de escrever, e só fora da lista,
  // garante que nenhum marker seja apagado e recriado no mesmo ciclo.
  if (persisted.list) cleanStaleMarkers(root, persisted.list);

  const { probed, failed } = probeRepos(gitRepos, root);

  if (verbose) {
    console.error(
      `\n→ Source Control: ${probed.length} repositório(s) ativado(s).`,
    );
    if (persisted.list) {
      console.error(
        `  git.scanRepositories: ${persisted.list.join(", ") || "(vazio)"}`,
      );
    }
    if (failed.length > 0) {
      console.error(`  falharam: ${failed.join(", ")}`);
    }
  }

  return {
    ok: failed.length === 0 && !persisted.error,
    activated: probed,
    skipped,
    failed,
  };
}
```

Diferenças em relação ao original, para conferência: sai o bloco `REPOS_SKIP_ACTIVATE`, sai o `return { ok: false, ... }` antecipado quando `gitRepos.length === 0`, sai o argumento `mode` de `persistScanRepositories`, e o aviso "Nenhum repositório git para ativar" passa a ser condicionado a `repos.length > 0`.

- [ ] **Step 7: Ajustar `runOpen`**

Em `scripts/repo-workspace.mjs`, trocar o `import` (linha 38):

```js
import { activateRepos } from "./lib/workspace.mjs";
```

Substituir o bloco de `--reset` no início de `runOpen` por:

```js
  if (parsed.reset) {
    const { ok } = activateRepos([], root, { verbose: true });
    if (!ok) process.exit(1);
    return;
  }
```

E a chamada final de `runOpen` por:

```js
  const { ok, activated } = activateRepos(selected, root, { verbose: true });
  if (!ok && activated.length === 0) {
    process.exit(1);
  }
```

- [ ] **Step 8: Rodar a suíte inteira**

Run: `yarn test:self`
Expected: PASS. O smoke `open --reset zera a lista sem abrir seleção` continua verde — a saída verbosa de `activateRepos` também cita `scanRepositories`.

- [ ] **Step 9: Commit** *(só com autorização explícita)*

```bash
git add scripts/lib/workspace.mjs scripts/repo-workspace.mjs tests/workspace.test.mjs
git commit -m "feat: yarn open substitui a lista do Source Control em vez de somar

git.scanRepositories passa a refletir exatamente a ultima selecao.
resolveScanRepositories vira normalizeRepoList, resetActivation e
REPOS_SKIP_ACTIVATE saem: activateRepos([]) ja esvazia a lista."
```

---

### Task 4: Multiselect pré-marcado

**Files:**
- Modify: `scripts/lib/select.mjs`
- Modify: `scripts/repo-workspace.mjs` (`runOpen`)
- Create: `tests/select.test.mjs`
- Modify: `package.json` (incluir o novo teste em `test:self`)

**Interfaces:**
- Consumes: `readScanRepositories(root)` da Task 2; `activateRepos(repos, root, { verbose })` da Task 3.
- Produces: `pickRepos(candidates, message, titleFor?, opts?)` e `resolveSelection({ ..., preselected?, min? })`, ambos com `opts = { preselected?: Set<string>, min?: number }`.

- [ ] **Step 1: Escrever o teste que falha**

O `prompts` permite injetar respostas, mas o que interessa aqui é a **forma dos choices**, não a interação. Extrair essa decisão para uma função pura testável. Criar `tests/select.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChoices } from "../scripts/lib/select.mjs";

describe("buildChoices", () => {
  it("sem pré-marcação, nada vem selecionado", () => {
    const choices = buildChoices(["api", "web"], (n) => n, new Set());
    assert.deepEqual(
      choices.map((c) => c.selected),
      [false, false],
    );
  });

  it("marca só quem está no conjunto pré-selecionado", () => {
    const choices = buildChoices(["api", "web"], (n) => n, new Set(["web"]));
    assert.deepEqual(
      choices.map((c) => [c.value, c.selected]),
      [
        ["api", false],
        ["web", true],
      ],
    );
  });

  it("aplica titleFor no título e preserva o value cru", () => {
    const choices = buildChoices(["api"], (n) => `${n}  (main)`, new Set());
    assert.equal(choices[0].title, "api  (main)");
    assert.equal(choices[0].value, "api");
  });

  it("nome pré-selecionado que não é candidato é ignorado", () => {
    const choices = buildChoices(["api"], (n) => n, new Set(["sumiu"]));
    assert.equal(choices.length, 1);
    assert.equal(choices[0].selected, false);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/select.test.mjs`
Expected: FAIL com `buildChoices is not a function`.

- [ ] **Step 3: Implementar em `select.mjs`**

Substituir a função `pickRepos` inteira por:

```js
/**
 * Monta os choices do multiselect, marcando os que já estão ativos.
 *
 * @param {string[]} candidates
 * @param {(name: string) => string} titleFor
 * @param {Set<string>} preselected
 * @returns {{ title: string, value: string, selected: boolean }[]}
 */
export function buildChoices(candidates, titleFor, preselected) {
  return candidates.map((name) => ({
    title: titleFor(name),
    value: name,
    selected: preselected.has(name),
  }));
}

/**
 * @param {string[]} candidates
 * @param {string} message
 * @param {(name: string) => string} [titleFor]
 * @param {{ preselected?: Set<string>, min?: number }} [opts]
 * @returns {Promise<string[]>}
 */
export async function pickRepos(
  candidates,
  message,
  titleFor = (name) => name,
  opts = {},
) {
  const { preselected = new Set(), min = 1 } = opts;

  const response = await prompts({
    type: "multiselect",
    name: "repos",
    message,
    choices: buildChoices(candidates, titleFor, preselected),
    hint: "- Barra de espaço alterna. Enter confirma.",
    instructions: false,
    min,
  });

  if (response.repos === undefined) {
    console.error("Cancelado.");
    process.exit(0);
  }
  return response.repos;
}
```

- [ ] **Step 4: Repassar as opções em `resolveSelection`**

Adicionar `preselected` e `min` ao destructuring de `resolveSelection` e ao seu JSDoc, e repassar na última linha:

```js
  preselected = new Set(),
  min = 1,
}) {
```

```js
  return pickRepos(discovered, message, titleFor, { preselected, min });
```

No JSDoc do parâmetro-objeto, acrescentar as duas linhas:

```js
 *   preselected?: Set<string>,
 *   min?: number,
```

- [ ] **Step 5: Ligar em `runOpen`**

Em `scripts/repo-workspace.mjs`, acrescentar `readScanRepositories` ao import de `./lib/workspace.mjs`:

```js
import { activateRepos, readScanRepositories } from "./lib/workspace.mjs";
```

E na chamada de `resolveSelection` dentro de `runOpen`, acrescentar as duas opções depois de `titleFor`:

```js
    preselected: new Set(readScanRepositories(root)),
    min: 0,
```

- [ ] **Step 6: Registrar o teste novo**

Em `package.json`, no script `test:self`, inserir `tests/select.test.mjs` entre `tests/run.test.mjs` e `tests/smoke.test.mjs`:

```json
    "test:self": "node --test tests/args.test.mjs tests/config.test.mjs tests/git.test.mjs tests/root.test.mjs tests/run.test.mjs tests/select.test.mjs tests/smoke.test.mjs tests/test-command.test.mjs tests/workspace.test.mjs",
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `yarn test:self`
Expected: PASS, incluindo os quatro testes de `buildChoices`.

- [ ] **Step 8: Verificação manual**

Run: `yarn open`
Expected: o menu abre com os repositórios de `git.scanRepositories` já marcados, e é possível desmarcar tudo e confirmar com Enter sem que o `prompts` recuse. Cancelar com Ctrl+C não altera nada.

- [ ] **Step 9: Commit** *(só com autorização explícita)*

```bash
git add scripts/lib/select.mjs scripts/repo-workspace.mjs tests/select.test.mjs package.json
git commit -m "feat: menu de open abre pre-marcado com os repos ja ativos

Substituir a lista deixa de exigir remontar a selecao de memoria.
min 0 no open permite desmarcar tudo para esvaziar o Source Control."
```

---

### Task 5: Remover `--only`

**Files:**
- Modify: `scripts/lib/args.mjs`
- Test: `tests/args.test.mjs`, `tests/smoke.test.mjs`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `parseArgs` deixa de devolver a propriedade `only`. `reset` continua.

- [ ] **Step 1: Ajustar os testes**

Em `tests/args.test.mjs`:

Remover `it("open aceita --only com repos posicionais", ...)` e `it("--only fora de open é erro", ...)`. Em `it("open sem flags tem only e reset falsos", ...)`, renomear e tirar a asserção de `only`:

```js
  it("open sem flags tem reset falso", () => {
    const parsed = parseArgs(["node", "x", "open"]);
    assert.equal(parsed.reset, false);
  });
```

E acrescentar:

```js
  it("--only deixou de existir e é flag desconhecida", () => {
    assert.throws(
      () => parseArgs(["node", "x", "open", "--only", "api"]),
      /Flag desconhecida/,
    );
  });
```

Em `tests/smoke.test.mjs`, substituir os dois testes que citam `--only`:

```js
  it("--only deixou de existir", () => {
    const r = run(["open", "--only", "api"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Flag desconhecida/);
  });

  it("ajuda cita --reset e não cita flags nem envs removidas", () => {
    const r = run([]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /--reset/);
    assert.doesNotMatch(r.stdout, /--only/);
    assert.doesNotMatch(r.stdout, /REPOS_SKIP_ACTIVATE/);
    assert.doesNotMatch(r.stdout, /REPOS_EDITOR/);
    assert.doesNotMatch(r.stdout, /REPOS_ACTIVATE_SETTLE_MS/);
  });
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/args.test.mjs tests/smoke.test.mjs`
Expected: FAIL — hoje `--only` é aceito em `open` e a ajuda ainda cita `--only` e `REPOS_SKIP_ACTIVATE`.

- [ ] **Step 3: Remover `--only` do parsing**

Em `scripts/lib/args.mjs`, dentro de `parseYarnModeArgs`, remover a variável `only` e simplificar o ramo:

```js
function parseYarnModeArgs(mode, rest) {
  let all = false;
  let reset = false;
  const repos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--help" || rest[i] === "-h") {
      return { help: true, mode };
    }
    if (rest[i] === "--all") all = true;
    else if (rest[i] === "--reset") {
      if (mode !== "open") {
        throw new Error("--reset só é válida em open.");
      }
      reset = true;
    } else if (rest[i] === "--") {
      repos.push(...rest.slice(i + 1));
      break;
    } else if (!rest[i].startsWith("-")) repos.push(rest[i]);
    else throw new Error(`Flag desconhecida: ${rest[i]}`);
  }
  return { mode, all, cliRepos: repos, reset };
}
```

No JSDoc de `parseArgs`, tirar `only: boolean, ` da união de tipos do modo yarn.

- [ ] **Step 4: Atualizar `printHelp`**

Trocar as três linhas afetadas do template:

```
  yarn open                 → ativa repos no Source Control (substitui a lista)
  yarn run open -- --reset
```

(remover a linha `yarn run open -- --only api web`), e no rodapé:

```
Flags comuns: --all, nomes após --, REPOS_SKIP_PROMPT=1
  --reset                   → (open) zera a lista e remove os markers
  --root <path>             → raiz dos clones (default: pasta deste hub)
```

(remover as linhas de `REPOS_SKIP_ACTIVATE` e `--only`).

- [ ] **Step 5: Limpar o cabeçalho de `repo-workspace.mjs`**

O comentário de topo (linhas 10-11) ainda documenta `--only`. Remover a linha:

```
 *   yarn run open -- --only api web   → substitui a lista persistida
```

e ajustar a de `--reset` se necessário para ficar coerente.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `yarn test:self`
Expected: PASS.

- [ ] **Step 7: Commit** *(só com autorização explícita)*

```bash
git add scripts/lib/args.mjs scripts/repo-workspace.mjs tests/args.test.mjs tests/smoke.test.mjs
git commit -m "refactor: remover --only, que virou o comportamento padrao de open"
```

---

### Task 6: Documentação e versão

**Files:**
- Modify: `README.md`
- Modify: `package.json` (`version`)

**Interfaces:**
- Consumes: comportamento final das Tasks 1-5.
- Produces: nada consumido por código.

- [ ] **Step 1: Reescrever a seção de Source Control**

Em `README.md`, substituir os parágrafos das linhas 62-68 por:

```markdown
**Source Control (Cursor/VS Code):** a ativação roda **só** em `yarn open` — `install`, `dev`, `test`, `setup` e `switch` não tocam no painel. São dois efeitos: um marker em `<repo>/.git/.repo-workspace-activate` registra o repositório na janela já aberta, e `git.scanRepositories` em `.vscode/settings.json` da raiz reconstrói a seleção a cada abertura do editor. O tool grava também `git.autoRepositoryDetection: true` e `git.repositoryScanMaxDepth: 0`, que juntas fazem o editor registrar exatamente a lista, sem varrer todas as subpastas.

A lista é **substituída** a cada `yarn open`: o Source Control mostra exatamente a última seleção. O multiselect abre com os repositórios ativos já marcados, então adicionar um é marcar mais um e confirmar. Desmarcar tudo e confirmar esvazia o painel; `yarn run open -- --reset` faz o mesmo sem abrir o menu, para uso não interativo.

O marker é um arquivo desconhecido na raiz do `.git`: o git o ignora e ele não aparece em `git status`. Ele sobrevive ao fim do comando de propósito — apagar na mesma execução faz o watcher do editor coalescer o par create/delete e nada é registrado. A limpeza acontece no `yarn open` seguinte, para os repositórios que saíram da seleção.

Repositórios em pastas ignoradas (`.tools/`, por exemplo) não entram na lista, porque `yarn open` não os descobre. Eles continuam aparecendo quando você abre um arquivo deles, já que `git.autoRepositoryDetection: true` preserva esse comportamento.
```

- [ ] **Step 2: Conferir que nada mais cita o que saiu**

```bash
grep -n "REPOS_SKIP_ACTIVATE\|--only\|a lista acumula\|embutida" README.md
```

Expected: nenhuma saída. Se aparecer alguma linha na tabela de comandos ou de variáveis de ambiente, remover.

- [ ] **Step 3: Bump de versão**

Em `package.json`, `"version": "1.5.0"` → `"version": "1.6.0"`. Mudança de comportamento padrão sem quebra de API pública (é um tool privado), seguindo o padrão dos bumps anteriores.

- [ ] **Step 4: Verificação final de ponta a ponta**

```bash
yarn test:self
node scripts/repo-workspace.mjs --help
```

Expected: suíte verde; a ajuda cita `--reset` e não cita `--only` nem `REPOS_SKIP_ACTIVATE`.

Depois, na raiz do workspace, rodar `yarn open`, deixar marcados só os repositórios desejados e confirmar. Conferir:

```bash
cat ../../.vscode/settings.json
ls ../../*/.git/.repo-workspace-activate 2>/dev/null | wc -l
```

Expected: `git.scanRepositories` com exatamente a seleção, e a contagem de markers igual ao tamanho da lista.

- [ ] **Step 5: Commit** *(só com autorização explícita)*

```bash
git add README.md package.json
git commit -m "docs: documentar ativacao sob demanda e subir para 1.6.0"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Tarefa |
|---|---|
| `replace` como único modo | Task 3 |
| Ativação embutida removida | Task 1 |
| Multiselect pré-marcado | Task 4 |
| `resolveScanRepositories` → `normalizeRepoList` | Task 3 |
| `persistScanRepositories` sem `mode` | Task 3 |
| `resetActivation` absorvida | Task 3 |
| Guard de lista vazia removido | Task 3 |
| `readScanRepositories` | Task 2 |
| `pickRepos` com `preselected` e `min` | Task 4 |
| `--only` removida | Task 5 |
| `REPOS_SKIP_ACTIVATE` removida | Task 3 (código) + Task 5 (ajuda) |
| `--reset` mantida | Task 3 (implementação) + Task 5 (parsing preservado) |
| Testes de `workspace.mjs` | Tasks 2 e 3 |
| Testes de `args.mjs` | Task 5 |
| Cobertura de `select.mjs` | Task 4 |
| `tests/smoke.test.mjs` | Tasks 1 e 5 |
| README | Task 6 |
| Migração sem passo manual | Task 6, Step 4 |

**Consistência de nomes:** `normalizeRepoList`, `readScanRepositories`, `persistScanRepositories(root, repos)`, `activateRepos(repos, root, { verbose })`, `buildChoices(candidates, titleFor, preselected)`, `pickRepos(candidates, message, titleFor, { preselected, min })` — usados com a mesma assinatura em todas as tarefas que os citam.

**Ordem:** Task 1 antes da Task 3 (evita `yarn dev` apagando a lista no meio da implementação). Task 2 antes da Task 4 (`readScanRepositories` é consumida lá). Task 3 antes da Task 4 (`runOpen` já sem `parsed.only`). Task 5 depois da Task 3 (o campo `only` fica órfão por uma tarefa, sem efeito).
