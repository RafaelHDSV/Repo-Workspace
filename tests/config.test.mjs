import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverPackageRepos,
  filterWithScript,
  hasScript,
  loadConfig,
} from "../scripts/lib/config.mjs";

describe("config e descoberta", () => {
  /** @type {string} */
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-workspace-"));
    fs.writeFileSync(
      path.join(tmp, "repos.config.json"),
      JSON.stringify({
        ignore: ["skip-me"],
        nodeVersionByRepo: { api: "20.18.3" },
        testCommandByRepo: { api: "yarn test:ci" },
      }),
    );

    for (const name of ["api", "web", "skip-me", "plain"]) {
      fs.mkdirSync(path.join(tmp, name));
    }

    fs.writeFileSync(
      path.join(tmp, "api", "package.json"),
      JSON.stringify({
        name: "api",
        scripts: { dev: "node .", tsc: "tsc -b" },
      }),
    );
    fs.writeFileSync(
      path.join(tmp, "web", "package.json"),
      JSON.stringify({ name: "web", scripts: { dev: "vite" } }),
    );
    fs.writeFileSync(
      path.join(tmp, "skip-me", "package.json"),
      JSON.stringify({ name: "skip-me" }),
    );
    fs.writeFileSync(path.join(tmp, "plain", "readme.txt"), "no pkg");
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("loadConfig mescla ignore e nodeVersionByRepo", () => {
    const config = loadConfig(tmp);
    assert.ok(config.ignore.includes("skip-me"));
    assert.ok(config.ignore.includes("node_modules"));
    assert.equal(config.nodeVersionByRepo.api, "20.18.3");
    assert.equal(config.testCommandByRepo.api, "yarn test:ci");
  });

  it("discoverPackageRepos lista só pastas com package.json não ignoradas", () => {
    const config = loadConfig(tmp);
    const names = discoverPackageRepos(config, tmp);
    assert.deepEqual(names, ["api", "web"]);
  });

  it("hasScript e filterWithScript respeitam scripts ausentes", () => {
    assert.equal(hasScript("api", "tsc", tmp), true);
    assert.equal(hasScript("web", "tsc", tmp), false);

    const { withScript, skipped } = filterWithScript(
      ["api", "web"],
      "tsc",
      tmp,
    );
    assert.deepEqual(withScript, ["api"]);
    assert.deepEqual(skipped, ["web"]);
  });

  it("filterWithScript para setup/dev mantém quem tem script", () => {
    const { withScript, skipped } = filterWithScript(
      ["api", "web"],
      "dev",
      tmp,
    );
    assert.deepEqual(withScript, ["api", "web"]);
    assert.deepEqual(skipped, []);
  });
});
