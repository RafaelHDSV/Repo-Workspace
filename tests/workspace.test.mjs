import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateRepos,
  scmSettingsPath,
  syncScmSettings,
} from "../scripts/lib/workspace.mjs";

describe("activateRepos", () => {
  it("ignora pastas sem .git", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-open-"));
    const repo = path.join(tmp, "plain");
    fs.mkdirSync(repo);

    const prevSkip = process.env.REPOS_SKIP_ACTIVATE;
    process.env.REPOS_SKIP_ACTIVATE = "1";
    try {
      const result = activateRepos(["plain"], tmp);
      assert.deepEqual(result.activated, []);
      assert.deepEqual(result.skipped, ["plain"]);
    } finally {
      if (prevSkip === undefined) delete process.env.REPOS_SKIP_ACTIVATE;
      else process.env.REPOS_SKIP_ACTIVATE = prevSkip;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("respeita REPOS_SKIP_ACTIVATE", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-skip-"));
    const repo = path.join(tmp, "api");
    fs.mkdirSync(repo);
    fs.mkdirSync(path.join(repo, ".git"));

    const prevSkip = process.env.REPOS_SKIP_ACTIVATE;
    process.env.REPOS_SKIP_ACTIVATE = "1";
    try {
      const result = activateRepos(["api"], tmp);
      assert.equal(result.ok, true);
      assert.deepEqual(result.activated, []);
      assert.deepEqual(result.skipped, ["api"]);
      assert.deepEqual(result.failed, []);
    } finally {
      if (prevSkip === undefined) delete process.env.REPOS_SKIP_ACTIVATE;
      else process.env.REPOS_SKIP_ACTIVATE = prevSkip;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("syncScmSettings", () => {
  it("grava git.ignoredRepositories para repos não selecionados", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-scm-"));
    try {
      for (const name of ["api", "web", "legacy"]) {
        fs.mkdirSync(path.join(tmp, name, ".git"), { recursive: true });
      }

      syncScmSettings(["api", "web"], tmp);
      const settings = JSON.parse(fs.readFileSync(scmSettingsPath(tmp), "utf8"));

      assert.equal(settings["git.autoRepositoryDetection"], "subfolders");
      assert.equal(settings["git.repositoryScanMaxDepth"], 1);
      assert.equal(settings["git.ignoredRepositories"].length, 1);
      assert.ok(
        settings["git.ignoredRepositories"][0].replace(/\\/g, "/").endsWith("/legacy"),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("preserva outras chaves do settings.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-merge-"));
    try {
      fs.mkdirSync(path.join(tmp, "api", ".git"), { recursive: true });
      fs.mkdirSync(path.join(tmp, ".vscode"), { recursive: true });
      fs.writeFileSync(
        scmSettingsPath(tmp),
        JSON.stringify({ "editor.tabSize": 4 }),
      );

      syncScmSettings(["api"], tmp);
      const settings = JSON.parse(fs.readFileSync(scmSettingsPath(tmp), "utf8"));

      assert.equal(settings["editor.tabSize"], 4);
      assert.deepEqual(settings["git.ignoredRepositories"], []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
