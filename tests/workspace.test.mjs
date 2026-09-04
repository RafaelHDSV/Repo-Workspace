import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateRepos,
  cleanStaleMarkers,
  MARKER_NAME,
  persistScanRepositories,
  probeRepos,
  readScanRepositories,
  resetActivation,
  resolveScanRepositories,
} from "../scripts/lib/workspace.mjs";

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readSettings(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, ".vscode", "settings.json"), "utf8"),
  );
}

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
      assert.ok(fs.existsSync(markerPath(root, "api")));
      assert.ok(fs.existsSync(markerPath(root, "web")));
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
