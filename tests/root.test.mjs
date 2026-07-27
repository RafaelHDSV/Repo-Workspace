import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DEFAULT_ROOT, resolveRoot } from "../scripts/lib/root.mjs";

describe("resolveRoot", () => {
  it("usa DEFAULT_ROOT sem flag nem env", () => {
    assert.equal(resolveRoot({ envRoot: null }), DEFAULT_ROOT);
  });

  it("prioriza --root sobre REPOS_ROOT", () => {
    const root = resolveRoot({
      rootFlag: "/from-flag",
      envRoot: "/from-env",
    });
    assert.equal(root, path.resolve("/from-flag"));
  });

  it("usa REPOS_ROOT quando não há --root", () => {
    const root = resolveRoot({ rootFlag: null, envRoot: "/from-env" });
    assert.equal(root, path.resolve("/from-env"));
  });
});
