import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts", "repo-workspace.mjs");

function run(args) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, REPOS_SKIP_PROMPT: "0" },
  });
}

describe("smoke CLI", () => {
  it("imprime ajuda sem modo", () => {
    const r = run([]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /yarn setup/);
    assert.match(r.stdout, /yarn open/);
    assert.match(r.stdout, /yarn switch/);
    assert.match(r.stdout, /yarn test/);
    assert.doesNotMatch(r.stdout, /yarn tsc/);
  });

  it("falha com modo inválido e mostra ajuda", () => {
    const r = run(["build"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Modo desconhecido/);
  });

  it("switch sem branch falha", () => {
    const r = run(["switch"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Informe a branch/);
  });

  it("repo inexistente em install falha sem instalar", () => {
    const r = run(["install", "--", "__nao_existe__"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Pastas desconhecidas|Nenhum repositório/);
  });
});

describe("ativação no Source Control", () => {
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
});
