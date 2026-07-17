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

  it("reconhece tsc e setup", () => {
    assert.equal(
      parseArgs(["node", "x", "tsc", "api"]).mode,
      "tsc",
    );
    assert.equal(
      parseArgs(["node", "x", "setup"]).mode,
      "setup",
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
});
