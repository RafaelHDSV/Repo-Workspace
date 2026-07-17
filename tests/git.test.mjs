import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkoutRepos,
  discoverGitRepos,
  currentBranchName,
} from "../scripts/lib/git.mjs";

function git(cwd, args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} falhou: ${r.stderr || r.stdout}`);
  }
}

describe("git switch", () => {
  /** @type {string} */
  let tmp;
  /** @type {string} */
  let cleanRepo;
  /** @type {string} */
  let dirtyRepo;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-workspace-git-"));
    cleanRepo = path.join(tmp, "clean");
    dirtyRepo = path.join(tmp, "dirty");

    for (const dir of [cleanRepo, dirtyRepo]) {
      fs.mkdirSync(dir);
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "test@example.com"]);
      git(dir, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(dir, "a.txt"), "a");
      git(dir, ["add", "a.txt"]);
      git(dir, ["commit", "-m", "init"]);
      git(dir, ["branch", "-M", "main"]);
      git(dir, ["branch", "feature"]);
    }

    fs.writeFileSync(path.join(dirtyRepo, "dirty.txt"), "x");
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("discoverGitRepos encontra clones com .git", () => {
    const names = discoverGitRepos(tmp);
    assert.deepEqual(names, ["clean", "dirty"]);
  });

  it("checkoutRepos troca branch limpa e pula working tree sujo", () => {
    const result = checkoutRepos({
      branch: "feature",
      repos: ["clean", "dirty"],
      reposRoot: tmp,
    });

    assert.equal(currentBranchName(cleanRepo), "feature");
    assert.equal(result.okCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.exitCode, 1);
  });

  it("checkoutRepos marca ok quando já está na branch", () => {
    const result = checkoutRepos({
      branch: "feature",
      repos: ["clean"],
      reposRoot: tmp,
    });
    assert.equal(result.okCount, 1);
    assert.equal(result.exitCode, 0);
  });
});
