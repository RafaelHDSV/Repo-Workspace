import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../scripts/lib/args.mjs";

describe("parseArgs", () => {
  it("reconhece install, --all e nomes de repo", () => {
    const parsed = parseArgs([
      "node",
      "repo-workspace.mjs",
      "install",
      "--all",
      "api",
      "web",
    ]);
    assert.equal(parsed.mode, "install");
    assert.equal(parsed.all, true);
    assert.deepEqual(parsed.cliRepos, ["api", "web"]);
  });

  it("reconhece nomes após --", () => {
    const parsed = parseArgs([
      "node",
      "repo-workspace.mjs",
      "dev",
      "--",
      "core",
    ]);
    assert.equal(parsed.mode, "dev");
    assert.deepEqual(parsed.cliRepos, ["core"]);
  });

  it("reconhece test, setup e open", () => {
    assert.equal(
      parseArgs(["node", "x", "test", "api"]).mode,
      "test",
    );
    assert.equal(
      parseArgs(["node", "x", "setup"]).mode,
      "setup",
    );
    assert.equal(
      parseArgs(["node", "x", "open"]).mode,
      "open",
    );
  });

  it("exige branch em switch", () => {
    assert.throws(
      () => parseArgs(["node", "x", "switch"]),
      /Informe a branch/,
    );
  });

  it("parseia switch com branch, --all e repos", () => {
    const parsed = parseArgs([
      "node",
      "x",
      "switch",
      "main",
      "--",
      "core",
      "api",
    ]);
    assert.equal(parsed.mode, "switch");
    assert.equal(parsed.branch, "main");
    assert.deepEqual(parsed.cliRepos, ["core", "api"]);
  });

  it("parseia switch com -b e -r", () => {
    const parsed = parseArgs([
      "node",
      "x",
      "switch",
      "-b",
      "production",
      "-r",
      "a,b",
    ]);
    assert.equal(parsed.branch, "production");
    assert.deepEqual(parsed.cliRepos, ["a", "b"]);
  });

  it("retorna help sem modo ou com -h", () => {
    assert.deepEqual(parseArgs(["node", "x"]), { help: true });
    assert.deepEqual(parseArgs(["node", "x", "--help"]), { help: true });
  });

  it("rejeita modo desconhecido", () => {
    assert.throws(
      () => parseArgs(["node", "x", "build"]),
      /Modo desconhecido/,
    );
  });

  it("rejeita o modo tsc removido", () => {
    assert.throws(
      () => parseArgs(["node", "x", "tsc"]),
      /Modo desconhecido/,
    );
  });

  it("parseia --root e --config em modos yarn", () => {
    const parsed = parseArgs([
      "node",
      "x",
      "setup",
      "--root",
      "C:/repos",
      "--config",
      "C:/merged.json",
      "--all",
    ]);
    assert.equal(parsed.mode, "setup");
    assert.equal(parsed.root, "C:/repos");
    assert.equal(parsed.config, "C:/merged.json");
    assert.equal(parsed.all, true);
  });

  it("parseia --root= e --config= em switch", () => {
    const parsed = parseArgs([
      "node",
      "x",
      "switch",
      "main",
      "--root=/hub",
      "--config=/cfg.json",
      "--",
      "api",
    ]);
    assert.equal(parsed.branch, "main");
    assert.equal(parsed.root, "/hub");
    assert.equal(parsed.config, "/cfg.json");
    assert.deepEqual(parsed.cliRepos, ["api"]);
  });

  it("exige valor de --root", () => {
    assert.throws(
      () => parseArgs(["node", "x", "dev", "--root"]),
      /Informe o valor de --root/,
    );
  });
});
