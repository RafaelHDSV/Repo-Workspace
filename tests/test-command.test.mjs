import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveTestCommand,
  resolveTestCommands,
} from "../scripts/lib/test.mjs";

describe("resolução de comandos de teste", () => {
  /** @type {string} */
  let root;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-tests-"));

    const repos = {
      jest: { test: "jest --runInBand" },
      "vitest-watch": { test: "vitest" },
      "vitest-run": { test: "vitest run" },
      craco: { test: "craco test" },
      "react-scripts": { test: "react-scripts test" },
      "react-app-rewired": { test: "react-app-rewired test" },
      override: {},
      empty: {},
    };

    for (const [repo, scripts] of Object.entries(repos)) {
      fs.mkdirSync(path.join(root, repo));
      fs.writeFileSync(
        path.join(root, repo, "package.json"),
        JSON.stringify({ name: repo, scripts }),
      );
    }
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("usa override antes da análise do package.json", () => {
    const config = {
      testCommandByRepo: { override: "yarn test:ci" },
    };
    assert.equal(
      resolveTestCommand("override", config, root),
      "yarn test:ci",
    );
  });

  it("resolve Jest e Vitest já não interativo como yarn test", () => {
    const config = { testCommandByRepo: {} };
    assert.equal(resolveTestCommand("jest", config, root), "yarn test");
    assert.equal(resolveTestCommand("vitest-run", config, root), "yarn test");
  });

  it("adiciona --run ao Vitest em watch", () => {
    assert.equal(
      resolveTestCommand("vitest-watch", { testCommandByRepo: {} }, root),
      "yarn test --run",
    );
  });

  it("desativa watch em Craco e React Scripts", () => {
    const config = { testCommandByRepo: {} };
    assert.equal(
      resolveTestCommand("craco", config, root),
      "yarn test --watchAll=false",
    );
    assert.equal(
      resolveTestCommand("react-scripts", config, root),
      "yarn test --watchAll=false",
    );
    assert.equal(
      resolveTestCommand("react-app-rewired", config, root),
      "yarn test --watchAll=false",
    );
  });

  it("retorna null quando não há suíte", () => {
    assert.equal(
      resolveTestCommand("empty", { testCommandByRepo: {} }, root),
      null,
    );
  });

  it("resolve listas e separa repositórios ignorados", () => {
    const result = resolveTestCommands(
      ["jest", "vitest-watch", "empty"],
      { testCommandByRepo: {} },
      root,
    );
    assert.deepEqual(result.commands, [
      { repo: "jest", command: "yarn test" },
      { repo: "vitest-watch", command: "yarn test --run" },
    ]);
    assert.deepEqual(result.skipped, ["empty"]);
  });
});
