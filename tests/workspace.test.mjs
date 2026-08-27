import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateRepos,
  pickRepoFile,
  resolveEditorCommand,
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

describe("pickRepoFile", () => {
  it("prefere package.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-pick-"));
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# hi\n");
      fs.writeFileSync(path.join(tmp, "package.json"), "{}\n");
      assert.equal(pickRepoFile(tmp), path.join(tmp, "package.json"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("cai para qualquer arquivo se não houver preferidos", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-pick2-"));
    try {
      fs.writeFileSync(path.join(tmp, "index.ts"), "export {}\n");
      assert.equal(pickRepoFile(tmp), path.join(tmp, "index.ts"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("activateRepos", () => {
  it("respeita REPOS_SKIP_ACTIVATE", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-ws-skip-"));
    fs.mkdirSync(path.join(tmp, "api", ".git"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "api", "package.json"), "{}\n");

    const prevSkip = process.env.REPOS_SKIP_ACTIVATE;
    process.env.REPOS_SKIP_ACTIVATE = "1";
    try {
      const result = activateRepos(["api"], tmp);
      assert.equal(result.ok, true);
      assert.deepEqual(result.activated, []);
      assert.deepEqual(result.skipped, ["api"]);
    } finally {
      if (prevSkip === undefined) delete process.env.REPOS_SKIP_ACTIVATE;
      else process.env.REPOS_SKIP_ACTIVATE = prevSkip;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
