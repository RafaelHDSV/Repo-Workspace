import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverPackageRepos,
  discoverWorkspaceRepos,
  loadConfig,
} from "../scripts/lib/config.mjs";
import {
  classifyRepo,
  ensureDenoAvailable,
  resolveDevCommand,
  resolveDevCommands,
  reposNeedingYarnInstall,
} from "../scripts/lib/dev.mjs";

describe("descoberta e resolução Deno (dev)", () => {
  /** @type {string} */
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-workspace-deno-"));
    fs.writeFileSync(
      path.join(tmp, "repos.config.json"),
      JSON.stringify({ ignore: ["skip-me"] }),
    );

    for (const name of ["api", "nexus", "mixed", "plain", "skip-me", "deno-no-dev"]) {
      fs.mkdirSync(path.join(tmp, name));
    }

    fs.writeFileSync(
      path.join(tmp, "api", "package.json"),
      JSON.stringify({
        name: "api",
        scripts: { dev: "node ." },
      }),
    );

    fs.writeFileSync(
      path.join(tmp, "nexus", "deno.json"),
      JSON.stringify({
        tasks: { dev: "deno run -A server.ts" },
      }),
    );

    fs.writeFileSync(
      path.join(tmp, "mixed", "package.json"),
      JSON.stringify({
        name: "mixed",
        scripts: { dev: "vite" },
      }),
    );
    fs.writeFileSync(
      path.join(tmp, "mixed", "deno.json"),
      JSON.stringify({
        tasks: { dev: "deno task something" },
      }),
    );

    fs.writeFileSync(path.join(tmp, "plain", "readme.txt"), "no pkg");

    fs.writeFileSync(
      path.join(tmp, "skip-me", "deno.json"),
      JSON.stringify({ tasks: { dev: "deno run -A x.ts" } }),
    );

    fs.writeFileSync(
      path.join(tmp, "deno-no-dev", "deno.json"),
      JSON.stringify({ tasks: { start: "deno run -A x.ts" } }),
    );
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("discoverWorkspaceRepos une package.json e deno-dev; ignore e sem tasks.dev ficam de fora", () => {
    const config = loadConfig(tmp);
    assert.deepEqual(discoverWorkspaceRepos(config, tmp), [
      "api",
      "mixed",
      "nexus",
    ]);
  });

  it("discoverPackageRepos continua só com package.json (yarn test)", () => {
    const config = loadConfig(tmp);
    assert.deepEqual(discoverPackageRepos(config, tmp), ["api", "mixed"]);
  });

  it("classifyRepo distingue yarn, deno-dev e both", () => {
    assert.equal(classifyRepo("api", tmp), "yarn");
    assert.equal(classifyRepo("nexus", tmp), "deno-dev");
    assert.equal(classifyRepo("mixed", tmp), "both");
    assert.equal(classifyRepo("plain", tmp), "none");
    assert.equal(classifyRepo("deno-no-dev", tmp), "none");
  });

  it("resolveDevCommand prefere yarn dev quando ambos existem", () => {
    assert.equal(resolveDevCommand("api", tmp), "yarn dev");
    assert.equal(resolveDevCommand("nexus", tmp), "deno task dev");
    assert.equal(resolveDevCommand("mixed", tmp), "yarn dev");
    assert.equal(resolveDevCommand("plain", tmp), null);
    assert.equal(resolveDevCommand("deno-no-dev", tmp), null);
  });

  it("resolveDevCommands monta lista paralela e skipped", () => {
    const { commands, skipped } = resolveDevCommands(
      ["api", "nexus", "plain", "deno-no-dev"],
      tmp,
    );
    assert.deepEqual(commands, [
      { repo: "api", command: "yarn dev" },
      { repo: "nexus", command: "deno task dev" },
    ]);
    assert.deepEqual(skipped, ["plain", "deno-no-dev"]);
  });

  it("reposNeedingYarnInstall exclui só-Deno", () => {
    assert.deepEqual(
      reposNeedingYarnInstall(["api", "nexus", "mixed"], tmp),
      ["api", "mixed"],
    );
  });

  it("ensureDenoAvailable falha quando deno não está no PATH", () => {
    const prev = process.env.PATH;
    process.env.PATH = "";
    try {
      assert.throws(
        () => ensureDenoAvailable(),
        (err) =>
          err instanceof Error &&
          /deno não encontrado no PATH/i.test(err.message),
      );
    } finally {
      process.env.PATH = prev;
    }
  });
});
