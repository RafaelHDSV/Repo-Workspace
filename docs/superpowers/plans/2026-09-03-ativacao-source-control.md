# Ativação de repositórios no Source Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a ativação de repositórios no Source Control — hoje feita abrindo arquivo com foco e fechando a aba por keystroke — por escrita de um marker em `<repo>/.git/` mais uma lista persistente em `git.scanRepositories`, e rodar essa ativação embutida em `install`, `dev`, `test`, `setup` e `switch`.

**Architecture:** `scripts/lib/workspace.mjs` deixa de automatizar interface. Passa a expor três funções puras ou quase puras (`resolveScanRepositories`, `persistScanRepositories`, `probeRepos`, `cleanStaleMarkers`) compostas por `activateRepos`. O marker dispara o watcher `**` da extensão Git (efeito imediato na janela aberta) e a lista em `.vscode/settings.json` reconstrói a seleção a cada abertura do editor (efeito persistente). Nenhuma espera, nenhum processo externo, nenhuma dependência de foco de janela.

**Tech Stack:** Node >= 18, ESM (`"type": "module"`), `node:test` + `node:assert/strict`, `node:fs`, `node:path`. Sem dependências novas.

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-09-03-ativacao-source-control-design.md`. Em qualquer divergência, a spec ganha.
- **Node >= 18**, ESM. Nenhuma dependência nova em `package.json`.
- **Todos os arquivos do repositório são UTF-8 com CRLF** (`core.autocrlf=true`). Depois de tocar qualquer arquivo, verifique com `file <arquivo>` — a saída deve dizer `CRLF line terminators`, nunca "mixed". Para reescrita integral de arquivo, escreva com LF em arquivo temporário e converta com `sed 's/$/\r/' tmp > destino`. **Nunca use `sed -i`** neste repositório: ele destrói o CRLF.
- **Texto voltado ao usuário em pt-BR acentuado** (mensagens de console, README, ajuda da CLI). Identificadores, paths e nomes de settings ficam como estão no projeto.
- **Nome do marker:** `.repo-workspace-activate`, sempre dentro de `<repo>/.git/`.
- **As três chaves gravadas** em `<root>/.vscode/settings.json` são exatamente `git.autoRepositoryDetection: true`, `git.repositoryScanMaxDepth: 0` e `git.scanRepositories: [...]`.
- **O marker nunca é criado e apagado na mesma execução.** Escrever quando ausente, reescrever quando presente, apagar só na execução seguinte e só fora do conjunto ativo. Essa é a correção central: o watcher coalesce pares create/delete imediatos e não emite evento.
- **Commits:** a § 1.3 do `CLAUDE.md` proíbe `git commit` sem pedido explícito do usuário. Os passos de commit deste plano trazem a mensagem pronta, mas **não devem ser executados** sem autorização explícita. Ao chegar num passo de commit sem autorização, pare, diga que o passo está pronto e pergunte. Nunca inclua atribuição de IA na mensagem.
- **Rodar a suíte:** `yarn test:self` na raiz de `.tools/repo-workspace`. Para um arquivo só: `node --test tests/<arquivo>.test.mjs`.
- **Verificação manual do mecanismo** (não automatizável): com o Cursor aberto na pasta dos clones, rodar a ativação e conferir o log da extensão:
  ```bash
  grep -o "Opened repository: c:.*" \
    "$(ls -t ~/AppData/Roaming/Cursor/logs/*/window*/exthost/vscode.git/Git.log | head -1)"
  ```

---

### Task 1: `resolveScanRepositories` — a lista, pura

**Files:**
- Modify: `scripts/lib/workspace.mjs`
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `MARKER_NAME: string` (constante exportada, valor `".repo-workspace-activate"`) e `resolveScanRepositories(current: unknown, add: string[], mode?: "merge" | "replace"): string[]`.

`tests/workspace.test.mjs` hoje testa `pickRepoFile` e `resolveEditorCommand`, que deixam de existir. Substitua o conteúdo do arquivo, não o adicione.

- [x] **Step 1: Write the failing test**

Substitua todo o conteúdo de `tests/workspace.test.mjs` por:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MARKER_NAME, resolveScanRepositories } from "../scripts/lib/workspace.mjs";

describe("MARKER_NAME", () => {
  it("é o nome acordado na spec", () => {
    assert.equal(MARKER_NAME, ".repo-workspace-activate");
  });
});

describe("resolveScanRepositories", () => {
  it("soma à lista existente, sem duplicar, em ordem", () => {
    assert.deepEqual(
      resolveScanRepositories(["web", "api"], ["core", "api"]),
      ["api", "core", "web"],
    );
  });

  it("modo replace descarta a lista atual", () => {
    assert.deepEqual(
      resolveScanRepositories(["web", "api"], ["core"], "replace"),
      ["core"],
    );
  });

  it("replace com lista vazia zera", () => {
    assert.deepEqual(resolveScanRepositories(["web"], [], "replace"), []);
  });

  it("tolera valor atual ausente ou de tipo errado", () => {
    assert.deepEqual(resolveScanRepositories(undefined, ["api"]), ["api"]);
    assert.deepEqual(resolveScanRepositories("api", ["web"]), ["web"]);
    assert.deepEqual(resolveScanRepositories([1, null, "api"], []), ["api"]);
  });

  it("normaliza espaço e barra final", () => {
    assert.deepEqual(resolveScanRepositories([], ["  api  ", "web/"]), ["api", "web"]);
  });

  it("descarta entradas vazias", () => {
    assert.deepEqual(resolveScanRepositories([], ["", "   ", "api"]), ["api"]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../scripts/lib/workspace.mjs' does not provide an export named 'MARKER_NAME'`.

- [x] **Step 3: Write minimal implementation**

Em `scripts/lib/workspace.mjs`, adicione no topo (depois dos imports existentes, antes de `EDITOR_CANDIDATES`):

```js
/** Nome do arquivo escrito em <repo>/.git/ para disparar o watcher da extensão Git. */
export const MARKER_NAME = ".repo-workspace-activate";

/**
 * União ordenada e sem duplicatas da lista de git.scanRepositories.
 *
 * @param {unknown} current valor atual lido do settings.json
 * @param {string[]} add repositórios a incluir
 * @param {"merge" | "replace"} [mode]
 * @returns {string[]}
 */
export function resolveScanRepositories(current, add, mode = "merge") {
  const base = mode === "replace" || !Array.isArray(current) ? [] : current;
  /** @type {Set<string>} */
  const out = new Set();

  for (const value of [...base, ...add]) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/[\\/]+$/, "");
    if (name) out.add(name);
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace.test.mjs`
Expected: PASS, 7 testes.

- [x] **Step 5: Verificar CRLF**

Run: `file scripts/lib/workspace.mjs tests/workspace.test.mjs`
Expected: ambos `CRLF line terminators`, sem menção a "mixed". Se houver LF misturado, reescreva o arquivo via temporário + `sed 's/$/\r/'`.

- [ ] **Step 6: Commit** — só com autorização explícita (Global Constraints)

```bash
git add scripts/lib/workspace.mjs tests/workspace.test.mjs
git commit -m "feat: resolve a lista de git.scanRepositories com merge e replace"
```

---

### Task 2: `persistScanRepositories` — gravar os settings sem destruir o arquivo

**Files:**
- Modify: `scripts/lib/workspace.mjs`
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: `resolveScanRepositories`, `MARKER_NAME` (Task 1).
- Produces: `persistScanRepositories(root: string, repos: string[], mode?: "merge" | "replace"): { path: string, list: string[] | null, error: string | null }`. Em sucesso, `error` é `null` e `list` é a lista gravada. Em falha de leitura, `list` é `null`, `error` traz o motivo em pt-BR e **nenhuma escrita acontece**.

O comportamento atual de `ensureOpenEditorsGitDetection` — `catch { settings = {} }`, que apaga os settings do usuário quando o JSON é inválido — é justamente o que esta task elimina.

- [x] **Step 1: Write the failing test**

Acrescente ao final de `tests/workspace.test.mjs`. **Consolide os `import` no bloco do topo do arquivo** em vez de deixar dois blocos de import do mesmo módulo — é legal em ESM, mas suja o arquivo, e as tasks seguintes acrescentam mais imports.

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { persistScanRepositories } from "../scripts/lib/workspace.mjs";

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readSettings(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, ".vscode", "settings.json"), "utf8"),
  );
}

describe("persistScanRepositories", () => {
  it("cria .vscode/settings.json com as três chaves", () => {
    const root = tmpRoot("repo-persist-");
    try {
      const result = persistScanRepositories(root, ["api", "core"]);
      assert.equal(result.error, null);
      assert.deepEqual(result.list, ["api", "core"]);

      const settings = readSettings(root);
      assert.equal(settings["git.autoRepositoryDetection"], true);
      assert.equal(settings["git.repositoryScanMaxDepth"], 0);
      assert.deepEqual(settings["git.scanRepositories"], ["api", "core"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserva chaves de terceiros e soma à lista existente", () => {
    const root = tmpRoot("repo-persist2-");
    try {
      fs.mkdirSync(path.join(root, ".vscode"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vscode", "settings.json"),
        JSON.stringify(
          {
            "editor.tabSize": 4,
            "git.scanRepositories": ["web"],
          },
          null,
          2,
        ),
        "utf8",
      );

      persistScanRepositories(root, ["api"]);

      const settings = readSettings(root);
      assert.equal(settings["editor.tabSize"], 4);
      assert.deepEqual(settings["git.scanRepositories"], ["api", "web"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("modo replace substitui a lista", () => {
    const root = tmpRoot("repo-persist3-");
    try {
      persistScanRepositories(root, ["web", "api"]);
      const result = persistScanRepositories(root, ["core"], "replace");
      assert.deepEqual(result.list, ["core"]);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["core"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("JSON inválido: avisa e não escreve nada", () => {
    const root = tmpRoot("repo-persist4-");
    const settingsPath = path.join(root, ".vscode", "settings.json");
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, '{ "editor.tabSize": 4, // comentário\n', "utf8");
      const before = fs.readFileSync(settingsPath, "utf8");

      const result = persistScanRepositories(root, ["api"]);

      assert.equal(result.list, null);
      assert.match(result.error, /JSON/);
      assert.equal(fs.readFileSync(settingsPath, "utf8"), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("conteúdo que não é objeto também não é sobrescrito", () => {
    const root = tmpRoot("repo-persist5-");
    const settingsPath = path.join(root, ".vscode", "settings.json");
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, "[1,2,3]", "utf8");

      const result = persistScanRepositories(root, ["api"]);

      assert.equal(result.list, null);
      assert.equal(fs.readFileSync(settingsPath, "utf8"), "[1,2,3]");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL — `does not provide an export named 'persistScanRepositories'`.

- [x] **Step 3: Write minimal implementation**

Adicione em `scripts/lib/workspace.mjs`:

```js
/**
 * Grava a seleção em <root>/.vscode/settings.json.
 *
 * As três chaves juntas fazem a extensão Git registrar exatamente os
 * repositórios da lista em toda abertura da janela: maxDepth 0 faz o
 * traverse retornar vazio, e scanRepositories só é lido quando
 * autoRepositoryDetection é true ou "subFolders".
 *
 * @param {string} root
 * @param {string[]} repos
 * @param {"merge" | "replace"} [mode]
 * @returns {{ path: string, list: string[] | null, error: string | null }}
 */
export function persistScanRepositories(root, repos, mode = "merge") {
  const settingsPath = path.join(root, ".vscode", "settings.json");

  /** @type {Record<string, unknown>} */
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      return {
        path: settingsPath,
        list: null,
        error: "JSON inválido (comentários não são suportados aqui)",
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        path: settingsPath,
        list: null,
        error: "o conteúdo não é um objeto JSON",
      };
    }
    settings = parsed;
  }

  const list = resolveScanRepositories(
    settings["git.scanRepositories"],
    repos,
    mode,
  );

  settings["git.autoRepositoryDetection"] = true;
  settings["git.repositoryScanMaxDepth"] = 0;
  settings["git.scanRepositories"] = list;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );

  return { path: settingsPath, list, error: null };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace.test.mjs`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit** — só com autorização explícita

```bash
git add scripts/lib/workspace.mjs tests/workspace.test.mjs
git commit -m "feat: grava a selecao em git.scanRepositories sem destruir settings alheios"
```

---

### Task 3: `probeRepos` e `cleanStaleMarkers` — o efeito imediato

**Files:**
- Modify: `scripts/lib/workspace.mjs`
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: `MARKER_NAME` (Task 1).
- Produces: `probeRepos(repos: string[], root: string): { probed: string[], failed: string[] }` e `cleanStaleMarkers(root: string, keep?: string[]): number`.

`probeRepos` escreve, nunca apaga. `cleanStaleMarkers` apaga apenas markers de pastas **fora** de `keep`, o que garante que nenhum marker seja apagado e reescrito no mesmo ciclo.

- [x] **Step 1: Write the failing test**

Acrescente ao final de `tests/workspace.test.mjs`, consolidando o import no bloco do topo. `tmpRoot` já existe no arquivo (Task 2) e é reaproveitado.

```js
import { cleanStaleMarkers, probeRepos } from "../scripts/lib/workspace.mjs";

function fakeRepo(root, name) {
  fs.mkdirSync(path.join(root, name, ".git"), { recursive: true });
}

function markerPath(root, name) {
  return path.join(root, name, ".git", MARKER_NAME);
}

describe("probeRepos", () => {
  it("escreve o marker dentro de .git", () => {
    const root = tmpRoot("repo-probe-");
    try {
      fakeRepo(root, "api");
      const result = probeRepos(["api"], root);
      assert.deepEqual(result.probed, ["api"]);
      assert.deepEqual(result.failed, []);
      assert.ok(fs.existsSync(markerPath(root, "api")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reescreve marker existente em vez de apagar", () => {
    const root = tmpRoot("repo-probe2-");
    try {
      fakeRepo(root, "api");
      fs.writeFileSync(markerPath(root, "api"), "antigo\n", "utf8");

      probeRepos(["api"], root);

      assert.ok(fs.existsSync(markerPath(root, "api")));
      assert.notEqual(fs.readFileSync(markerPath(root, "api"), "utf8"), "antigo\n");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("pasta sem .git entra em failed", () => {
    const root = tmpRoot("repo-probe3-");
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      const result = probeRepos(["docs"], root);
      assert.deepEqual(result.probed, []);
      assert.deepEqual(result.failed, ["docs"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("cleanStaleMarkers", () => {
  it("remove marker fora de keep e preserva o que está dentro", () => {
    const root = tmpRoot("repo-clean-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");
      fs.writeFileSync(markerPath(root, "api"), "x\n", "utf8");
      fs.writeFileSync(markerPath(root, "web"), "x\n", "utf8");

      const removed = cleanStaleMarkers(root, ["api"]);

      assert.equal(removed, 1);
      assert.ok(fs.existsSync(markerPath(root, "api")));
      assert.ok(!fs.existsSync(markerPath(root, "web")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keep vazio remove todos", () => {
    const root = tmpRoot("repo-clean2-");
    try {
      fakeRepo(root, "api");
      fs.writeFileSync(markerPath(root, "api"), "x\n", "utf8");
      assert.equal(cleanStaleMarkers(root, []), 1);
      assert.ok(!fs.existsSync(markerPath(root, "api")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("não toca em outros arquivos do .git", () => {
    const root = tmpRoot("repo-clean3-");
    try {
      fakeRepo(root, "api");
      const head = path.join(root, "api", ".git", "HEAD");
      fs.writeFileSync(head, "ref: refs/heads/main\n", "utf8");

      cleanStaleMarkers(root, []);

      assert.ok(fs.existsSync(head));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("raiz inexistente devolve 0 sem lançar", () => {
    assert.equal(cleanStaleMarkers(path.join(os.tmpdir(), "__nao_existe__"), []), 0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL — `does not provide an export named 'probeRepos'`.

- [x] **Step 3: Write minimal implementation**

Adicione em `scripts/lib/workspace.mjs`:

```js
/**
 * Escreve o marker em <repo>/.git/ para cada repositório.
 *
 * O watcher "**" da extensão Git filtra eventos cujo path contém "/.git" e
 * chama openRepository na raiz correspondente. Escrever basta: apagar na
 * mesma execução faz o watcher coalescer o par create/delete e nada é
 * emitido. A limpeza fica para cleanStaleMarkers, na execução seguinte.
 *
 * @param {string[]} repos
 * @param {string} root
 * @returns {{ probed: string[], failed: string[] }}
 */
export function probeRepos(repos, root) {
  /** @type {string[]} */
  const probed = [];
  /** @type {string[]} */
  const failed = [];

  for (const name of repos) {
    const gitDir = path.join(path.resolve(root, name), ".git");
    let isDir = false;
    try {
      isDir = fs.statSync(gitDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      failed.push(name);
      continue;
    }

    try {
      fs.writeFileSync(
        path.join(gitDir, MARKER_NAME),
        `${new Date().toISOString()}\n`,
        "utf8",
      );
      probed.push(name);
    } catch {
      failed.push(name);
    }
  }

  return { probed, failed };
}

/**
 * Remove markers de repositórios que não estão em `keep`.
 *
 * @param {string} root
 * @param {string[]} [keep]
 * @returns {number} quantidade removida
 */
export function cleanStaleMarkers(root, keep = []) {
  const keepSet = new Set(keep);
  let removed = 0;

  /** @type {import("node:fs").Dirent[]} */
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || keepSet.has(entry.name)) continue;
    const marker = path.join(root, entry.name, ".git", MARKER_NAME);
    try {
      if (fs.existsSync(marker)) {
        fs.rmSync(marker);
        removed++;
      }
    } catch {
      // marker travado ou sem permissão: irrelevante, segue
    }
  }

  return removed;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace.test.mjs`
Expected: PASS, 19 testes.

- [ ] **Step 5: Commit** — só com autorização explícita

```bash
git add scripts/lib/workspace.mjs tests/workspace.test.mjs
git commit -m "feat: ativa repo no Source Control escrevendo marker em .git"
```

---

### Task 4: `activateRepos` e `resetActivation` — compor e apagar o código morto

**Files:**
- Modify: `scripts/lib/workspace.mjs`
- Test: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: `persistScanRepositories` (Task 2), `probeRepos` e `cleanStaleMarkers` (Task 3), `isGitRepo` de `./git.mjs` (já importado).
- Produces:
  - `activateRepos(repos: string[], root: string, opts?: { mode?: "merge" | "replace", verbose?: boolean }): { ok: boolean, activated: string[], skipped: string[], failed: string[] }`
  - `resetActivation(root: string): { removed: number, list: string[] | null, error: string | null }`

Nesta task sai todo o código de automação de interface. Remova de `scripts/lib/workspace.mjs`: `EDITOR_CANDIDATES`, `PREFERRED_FILES`, `settleMs`, `sleepMs`, `resolveEditorCommand`, `pickRepoFile`, `ensureOpenEditorsGitDetection`, `closeActiveEditor`, `closeRecentEditors`, o corpo antigo de `activateRepos` e o import de `node:child_process` (`spawnSync`), que deixa de ser usado.

- [x] **Step 1: Write the failing test**

Acrescente ao final de `tests/workspace.test.mjs`, consolidando o import no topo. Os helpers `tmpRoot`, `readSettings` (Task 2), `fakeRepo` e `markerPath` (Task 3) já existem no arquivo e são reaproveitados.

```js
import { activateRepos, resetActivation } from "../scripts/lib/workspace.mjs";

describe("activateRepos", () => {
  it("respeita REPOS_SKIP_ACTIVATE", () => {
    const root = tmpRoot("repo-act-skip-");
    const prev = process.env.REPOS_SKIP_ACTIVATE;
    process.env.REPOS_SKIP_ACTIVATE = "1";
    try {
      fakeRepo(root, "api");
      const result = activateRepos(["api"], root);
      assert.equal(result.ok, true);
      assert.deepEqual(result.activated, []);
      assert.deepEqual(result.skipped, ["api"]);
      assert.ok(!fs.existsSync(markerPath(root, "api")));
      assert.ok(!fs.existsSync(path.join(root, ".vscode", "settings.json")));
    } finally {
      if (prev === undefined) delete process.env.REPOS_SKIP_ACTIVATE;
      else process.env.REPOS_SKIP_ACTIVATE = prev;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("grava settings e marker para os repos git", () => {
    const root = tmpRoot("repo-act-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");

      const result = activateRepos(["api", "web"], root);

      assert.equal(result.ok, true);
      assert.deepEqual(result.activated, ["api", "web"]);
      assert.ok(fs.existsSync(markerPath(root, "api")));
      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["api", "web"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("pasta que não é repo git vai para skipped, sem falhar", () => {
    const root = tmpRoot("repo-act2-");
    try {
      fakeRepo(root, "api");
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });

      const result = activateRepos(["api", "docs"], root);

      assert.deepEqual(result.activated, ["api"]);
      assert.deepEqual(result.skipped, ["docs"]);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["api"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("acumula entre chamadas em modo merge", () => {
    const root = tmpRoot("repo-act3-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");
      activateRepos(["api"], root);
      activateRepos(["web"], root);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["api", "web"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("modo replace troca a lista e limpa o marker do repo que saiu", () => {
    const root = tmpRoot("repo-act4-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");
      activateRepos(["api"], root);
      activateRepos(["web"], root, { mode: "replace" });

      assert.deepEqual(readSettings(root)["git.scanRepositories"], ["web"]);
      assert.ok(!fs.existsSync(markerPath(root, "api")));
      assert.ok(fs.existsSync(markerPath(root, "web")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("nenhum repo git: ok falso, sem escrever settings", () => {
    const root = tmpRoot("repo-act5-");
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      const result = activateRepos(["docs"], root);
      assert.equal(result.ok, false);
      assert.ok(!fs.existsSync(path.join(root, ".vscode", "settings.json")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resetActivation", () => {
  it("zera a lista e remove todos os markers", () => {
    const root = tmpRoot("repo-reset-");
    try {
      fakeRepo(root, "api");
      fakeRepo(root, "web");
      activateRepos(["api", "web"], root);

      const result = resetActivation(root);

      assert.equal(result.removed, 2);
      assert.deepEqual(result.list, []);
      assert.deepEqual(readSettings(root)["git.scanRepositories"], []);
      assert.ok(!fs.existsSync(markerPath(root, "api")));
      assert.ok(!fs.existsSync(markerPath(root, "web")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL — `does not provide an export named 'resetActivation'`, e os testes de `activateRepos` falham por o comportamento antigo tentar resolver editor.

- [x] **Step 3: Write minimal implementation**

Apague o código morto listado no cabeçalho da task e substitua o corpo antigo de `activateRepos`. As funções escritas nas tasks 1 a 3 já estão no arquivo e ficam exatamente como estão. Depois da limpeza, o topo do arquivo deve ser precisamente:

```js
import fs from "node:fs";
import path from "node:path";
import { isGitRepo } from "./git.mjs";

/** Nome do arquivo escrito em <repo>/.git/ para disparar o watcher da extensão Git. */
export const MARKER_NAME = ".repo-workspace-activate";
```

E o novo final do arquivo:

```js
/**
 * Ativa repositórios no Source Control do Cursor/VS Code.
 *
 * Dois efeitos complementares: a lista em .vscode/settings.json reconstrói a
 * seleção a cada abertura da janela, e o marker em .git/ registra na janela
 * que já está aberta, sem esperar reload.
 *
 * @param {string[]} repos
 * @param {string} root
 * @param {{ mode?: "merge" | "replace", verbose?: boolean }} [opts]
 * @returns {{ ok: boolean, activated: string[], skipped: string[], failed: string[] }}
 */
export function activateRepos(repos, root, opts = {}) {
  const { mode = "merge", verbose = false } = opts;

  if (process.env.REPOS_SKIP_ACTIVATE === "1") {
    return { ok: true, activated: [], skipped: [...repos], failed: [] };
  }

  /** @type {string[]} */
  const gitRepos = [];
  /** @type {string[]} */
  const skipped = [];

  for (const name of repos) {
    if (isGitRepo(path.resolve(root, name))) gitRepos.push(name);
    else skipped.push(name);
  }

  if (verbose && skipped.length > 0) {
    console.error(
      `Ignorados (não são repositórios git): ${skipped.join(", ")}`,
    );
  }

  if (gitRepos.length === 0) {
    if (verbose) {
      console.error("Nenhum repositório git para ativar no Source Control.");
    }
    return { ok: false, activated: [], skipped, failed: [] };
  }

  const persisted = persistScanRepositories(root, gitRepos, mode);
  if (persisted.error) {
    console.error(
      `[repos] ${persisted.path} não foi atualizado: ${persisted.error}. ` +
        "Corrija o arquivo à mão para a ativação sobreviver ao reload.",
    );
  }

  // Invariante: existe marker exatamente para quem está em git.scanRepositories.
  // Limpar antes de escrever, e só fora da lista, garante que nenhum marker
  // seja apagado e recriado no mesmo ciclo.
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

/**
 * Esvazia git.scanRepositories e remove todos os markers.
 *
 * @param {string} root
 * @returns {{ removed: number, list: string[] | null, error: string | null }}
 */
export function resetActivation(root) {
  const removed = cleanStaleMarkers(root, []);
  const persisted = persistScanRepositories(root, [], "replace");
  return { removed, list: persisted.list, error: persisted.error };
}
```

O `keep` da limpeza é a **lista persistida**, não a seleção da chamada. Em `merge` a lista cresce, então markers de repositórios ativados em execuções anteriores continuam existindo; em `replace` a lista encolhe e os markers que saíram são removidos. A mesma linha serve aos dois modos, e é por isso que a limpeza vem depois de `persistScanRepositories`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace.test.mjs`
Expected: PASS, 26 testes.

- [x] **Step 5: Confirmar que o código morto saiu**

Run: `grep -n "spawnSync\|SendKeys\|osascript\|xdotool\|resolveEditorCommand\|pickRepoFile\|REPOS_EDITOR\|SETTLE" scripts/lib/workspace.mjs`
Expected: nenhuma saída.

- [x] **Step 6: Rodar a suíte inteira**

Run: `yarn test:self`
Expected: PASS. Se `tests/args.test.mjs` ou outro arquivo importar algo removido, corrija naquele arquivo antes de seguir.

- [ ] **Step 7: Commit** — só com autorização explícita

```bash
git add scripts/lib/workspace.mjs tests/workspace.test.mjs
git commit -m "refactor: remove automacao de editor da ativacao no Source Control"
```

---

### Task 5: `--only` e `--reset` no parser

**Files:**
- Modify: `scripts/lib/args.mjs`
- Test: `tests/args.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `parseArgs` passa a devolver `only: boolean` e `reset: boolean` para o modo `open`. Nos outros modos yarn as duas flags são erro.

`parseYarnModeArgs` hoje lança `Flag desconhecida` para qualquer argumento iniciado por `-` que não seja `--all`, então as duas flags precisam ser reconhecidas explicitamente. Como `--only` é só um modificador booleano, os repositórios continuam vindo por posição: `open --only api web` funciona no laço existente.

- [x] **Step 1: Write the failing test**

Acrescente a `tests/args.test.mjs`:

```js
describe("flags de open", () => {
  it("open aceita --only com repos posicionais", () => {
    const parsed = parseArgs(["node", "x", "open", "--only", "api", "web"]);
    assert.equal(parsed.mode, "open");
    assert.equal(parsed.only, true);
    assert.equal(parsed.reset, false);
    assert.deepEqual(parsed.cliRepos, ["api", "web"]);
  });

  it("open aceita --reset", () => {
    const parsed = parseArgs(["node", "x", "open", "--reset"]);
    assert.equal(parsed.reset, true);
    assert.deepEqual(parsed.cliRepos, []);
  });

  it("open sem flags tem only e reset falsos", () => {
    const parsed = parseArgs(["node", "x", "open"]);
    assert.equal(parsed.only, false);
    assert.equal(parsed.reset, false);
  });

  it("--only fora de open é erro", () => {
    assert.throws(
      () => parseArgs(["node", "x", "dev", "--only", "api"]),
      /só é válida em open/,
    );
  });

  it("--reset fora de open é erro", () => {
    assert.throws(
      () => parseArgs(["node", "x", "install", "--reset"]),
      /só é válida em open/,
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/args.test.mjs`
Expected: FAIL — `Flag desconhecida: --only`.

- [x] **Step 3: Write minimal implementation**

Em `scripts/lib/args.mjs`, dentro de `parseYarnModeArgs`, substitua o laço por:

```js
function parseYarnModeArgs(mode, rest) {
  let all = false;
  let only = false;
  let reset = false;
  const repos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--help" || rest[i] === "-h") {
      return { help: true, mode };
    }
    if (rest[i] === "--all") all = true;
    else if (rest[i] === "--only" || rest[i] === "--reset") {
      if (mode !== "open") {
        throw new Error(`${rest[i]} só é válida em open.`);
      }
      if (rest[i] === "--only") only = true;
      else reset = true;
    } else if (rest[i] === "--") {
      repos.push(...rest.slice(i + 1));
      break;
    } else if (!rest[i].startsWith("-")) repos.push(rest[i]);
    else throw new Error(`Flag desconhecida: ${rest[i]}`);
  }
  return { mode, all, cliRepos: repos, only, reset };
}
```

Atualize também o JSDoc de `parseArgs`, trocando a união do modo yarn por:

```js
 *   | { mode: 'install'|'dev'|'test'|'setup'|'open', all: boolean, cliRepos: string[], only: boolean, reset: boolean, root: string | null, config: string | null }
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/args.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit** — só com autorização explícita

```bash
git add scripts/lib/args.mjs tests/args.test.mjs
git commit -m "feat: flags --only e --reset no comando open"
```

---

### Task 6: ligar no CLI e embutir nos outros comandos

**Files:**
- Modify: `scripts/repo-workspace.mjs`
- Test: `tests/smoke.test.mjs`

**Interfaces:**
- Consumes: `activateRepos` e `resetActivation` (Task 4), `parsed.only` / `parsed.reset` (Task 5).
- Produces: nenhum export novo. `runOpen` ganha o caminho de reset; `install`, `dev`, `test`, `setup` e `switch` chamam a ativação silenciosa após a seleção.

- [x] **Step 1: Write the failing test**

Acrescente a `tests/smoke.test.mjs`:

Acrescente os imports `fs`, `os` no topo de `tests/smoke.test.mjs` (`path` já está importado) e então:

```js
it("open --reset zera a lista sem abrir seleção", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-smoke-reset-"));
  try {
    const r = run(["open", "--reset", "--root", tmp]);
    assert.equal(r.status, 0);
    assert.match(r.stderr + r.stdout, /scanRepositories/);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".vscode", "settings.json"), "utf8"),
    );
    assert.deepEqual(settings["git.scanRepositories"], []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("--only fora de open falha com mensagem clara", () => {
  const r = run(["dev", "--only", "api"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /só é válida em open/);
});

it("ajuda cita --only, --reset e não cita REPOS_EDITOR", () => {
  const r = run([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--only/);
  assert.match(r.stdout, /--reset/);
  assert.doesNotMatch(r.stdout, /REPOS_EDITOR/);
  assert.doesNotMatch(r.stdout, /REPOS_ACTIVATE_SETTLE_MS/);
});
```

**Importante:** o `--root` temporário não é decoração. Sem ele, `open --reset` roda com a raiz padrão (`.tools/repo-workspace`) e cria um `.vscode/settings.json` dentro do próprio repositório do tool — efeito colateral de teste que suja o working tree. O caminho de reset também não deve depender de existir repositório algum na raiz: com a pasta temporária vazia, ele grava a lista vazia e sai com status 0.

Ao final da task, confirme que nada sujou o repositório: `git status --porcelain` deve listar só os arquivos que a task alterou de propósito.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/smoke.test.mjs`
Expected: FAIL — o reset ainda não existe e a ajuda ainda cita `REPOS_EDITOR`.

- [x] **Step 3: Write minimal implementation**

Em `scripts/repo-workspace.mjs`, troque o import:

```js
import { activateRepos, resetActivation } from "./lib/workspace.mjs";
```

Adicione o helper de ativação embutida, logo antes de `runInstall`:

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

Chame-o imediatamente após cada seleção resolvida:

- em `runInstall`, depois de `if (selected === null) return;`
- em `runParallelScript`, depois de `if (selected === null) return;`
- em `runTests`, depois de `if (selected === null) return;`
- em `runSetup`, depois de `if (selected === null) return;`
- em `runSwitch`, depois de `if (selected === null) return;`

Exemplo em `runInstall`:

```js
async function runInstall(parsed, config, root) {
  const selected = await selectPackageRepos(parsed, config, "install", root);
  if (selected === null) return;
  activateSilently(selected, root);
  runYarnInstallSequential(selected, config, root);
}
```

Reescreva `runOpen`:

```js
async function runOpen(parsed, config, root) {
  if (parsed.reset) {
    const { removed, list, error } = resetActivation(root);
    if (error) {
      console.error(`erro: settings não atualizado (${error})`);
      process.exit(1);
    }
    console.error(
      `→ git.scanRepositories zerado; ${removed} marker(s) removido(s).`,
    );
    console.error(`  lista atual: ${list?.join(", ") || "(vazia)"}`);
    return;
  }

  const discovered = discoverGitRepos(root, config.ignore);

  if (discovered.length === 0) {
    console.error("Nenhum repositório git encontrado na raiz.");
    process.exit(1);
  }

  const selected = await resolveSelection({
    discovered,
    all: parsed.all,
    cliRepos: parsed.cliRepos,
    mode: "open",
    message: "Quais repositórios mostrar no Source Control?",
    titleFor: (name) => {
      const current = currentBranchName(path.join(root, name));
      return `${name}  (${current})`;
    },
  });

  if (selected === null) return;

  const { ok, activated } = activateRepos(selected, root, {
    mode: parsed.only ? "replace" : "merge",
    verbose: true,
  });

  if (!ok && activated.length === 0) {
    process.exit(1);
  }
}
```

Atualize o cabeçalho de uso no topo do arquivo, trocando a linha do `open`:

```js
 *   yarn open [-- api]      → ativa repos no Source Control (marker + scanRepositories)
 *   yarn run open -- --only api web   → substitui a lista persistida
 *   yarn run open -- --reset          → zera a lista e remove os markers
```

Em `scripts/lib/args.mjs`, `printHelp`, troque a linha do `open` e o bloco de variáveis:

```
  yarn open                 → ativa repos no Source Control (marker + scanRepositories)
  yarn run open -- --only api web
  yarn run open -- --reset
```

```
Flags comuns: --all, nomes após --, REPOS_SKIP_PROMPT=1
  REPOS_SKIP_ACTIVATE=1     → não ativa nada no Source Control
  --only                    → (open) substitui a lista em git.scanRepositories
  --reset                   → (open) zera a lista e remove os markers
  --root <path>             → raiz dos clones (default: pasta deste hub)
  --config <file>           → repos.config.json já resolvido
  REPOS_ROOT=<path>         → alternativa a --root
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/smoke.test.mjs`
Expected: PASS.

- [x] **Step 5: Rodar a suíte inteira**

Run: `yarn test:self`
Expected: PASS, todos os arquivos.

- [x] **Step 6: Verificação manual do mecanismo**

Com o Cursor aberto na pasta dos clones, escolha um repositório que **não** esteja no Source Control e rode:

```bash
node scripts/repo-workspace.mjs open --root /c/Users/AGX/Desktop/repos -- <repo>
```

Confirme no log da extensão:

```bash
grep -o "Opened repository: c:.*" \
  "$(ls -t ~/AppData/Roaming/Cursor/logs/*/window*/exthost/vscode.git/Git.log | head -1)"
```

Expected: o repositório aparece na saída, e `.vscode/settings.json` da raiz tem as três chaves com ele em `git.scanRepositories`. Se não aparecer, **não prossiga**: use superpowers:systematic-debugging.

- [ ] **Step 7: Commit** — só com autorização explícita

```bash
git add scripts/repo-workspace.mjs scripts/lib/args.mjs tests/smoke.test.mjs
git commit -m "feat: ativa Source Control em open e embutido nos demais comandos"
```

---

### Task 7: README e versão

**Files:**
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: comportamento final das Tasks 1 a 6.
- Produces: documentação. Nenhum contrato de código.

A remoção de `REPOS_EDITOR` e `REPOS_ACTIVATE_SETTLE_MS` é quebra de interface pública do tool, então a versão vai de `1.4.8` para `1.5.0`.

- [x] **Step 1: Ler a seção atual**

Run: `grep -n -i "source control\|REPOS_EDITOR\|SETTLE\|openEditors" README.md`
Expected: localiza a linha 55 (tabela de comandos) e a linha 62 (parágrafo de Source Control).

- [x] **Step 2: Reescrever a seção de Source Control**

Substitua o parágrafo da linha 62 por:

````markdown
**Source Control (Cursor/VS Code):** a ativação roda em `yarn open` e também embutida em `install`, `dev`, `test`, `setup` e `switch` — nesses, silenciosa e não fatal. São dois efeitos: um marker em `<repo>/.git/.repo-workspace-activate` registra o repositório na janela já aberta, e `git.scanRepositories` em `.vscode/settings.json` da raiz reconstrói a seleção a cada abertura do editor. O tool grava também `git.autoRepositoryDetection: true` e `git.repositoryScanMaxDepth: 0`, que juntas fazem o editor registrar exatamente a lista, sem varrer todas as subpastas.

A lista acumula. `yarn run open -- --only api web` substitui a lista pelos repos informados; `yarn run open -- --reset` zera a lista e remove os markers. `REPOS_SKIP_ACTIVATE=1` desliga a ativação, inclusive a embutida.

O marker é um arquivo desconhecido na raiz do `.git`: o git o ignora e ele não aparece em `git status`. Ele sobrevive ao fim do comando de propósito — apagar na mesma execução faz o watcher do editor coalescer o par create/delete e nada é registrado. A limpeza acontece na execução seguinte, só para repos fora da lista.

Para conferir o que o editor registrou:

```bash
grep -o "Opened repository: c:.*" \
  "$(ls -t ~/AppData/Roaming/Cursor/logs/*/window*/exthost/vscode.git/Git.log | head -1)"
```
````

- [x] **Step 3: Atualizar a tabela de comandos**

Na linha 55, troque o texto da ação para `Ativar repos no Source Control (Cursor/VS Code)` mantendo `` `yarn open` `` na coluna do comando.

- [x] **Step 4: Remover as variáveis extintas do README**

Run: `grep -n "REPOS_EDITOR\|REPOS_ACTIVATE_SETTLE_MS" README.md`
Expected: nenhuma saída. Se houver, remova as linhas.

- [x] **Step 5: Bump de versão**

Em `package.json`, troque `"version": "1.4.8"` por `"version": "1.5.0"`.

- [x] **Step 6: Verificar CRLF e suíte**

Run: `file README.md && yarn test:self`
Expected: `README.md` com `CRLF line terminators`; suíte PASS.

- [ ] **Step 7: Commit** — só com autorização explícita

```bash
git add README.md package.json
git commit -m "docs: documenta a nova ativacao no Source Control e bump 1.5.0"
```
