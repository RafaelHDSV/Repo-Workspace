import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateRepos,
  resolveEditorCommand,
  syncWorkspaceFile,
  WORKSPACE_FILENAME,
} from "../scripts/lib/workspace.mjs";

describe("resolveEditorCommand", () => {
  it("prefere REPOS_EDITOR quando definido", () => {
    const prev = process.env.REPOS_EDITOR;
    process.env.REPOS_EDITOR = "fake-editor";
    try {
      assert.equal(resolveEditorCommand(), "fake-editor");
    } finally {
      if (prev === undefined) delete process.env.REPOS_EDITOR;
      else process.env.REPOS_EDITOR = prev;
    }
  });
});

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

describe("syncWorkspaceFile", () => {
  it("cria repos.code-workspace com paths relativos", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-file-"));
    try {
      const filePath = syncWorkspaceFile(["api", "web"], tmp);
      assert.equal(path.basename(filePath), WORKSPACE_FILENAME);
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
      assert.deepEqual(doc.folders, [
        { path: "api", name: "api" },
        { path: "web", name: "web" },
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("mescla sem duplicar pastas existentes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-merge-"));
    try {
      syncWorkspaceFile(["api"], tmp);
      syncWorkspaceFile(["api", "web"], tmp);
      const doc = JSON.parse(
        fs.readFileSync(path.join(tmp, WORKSPACE_FILENAME), "utf8"),
      );
      assert.equal(doc.folders.length, 2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
