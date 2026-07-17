import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
    assert.match(r.stdout, /yarn switch/);
    assert.match(r.stdout, /yarn tsc/);
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
