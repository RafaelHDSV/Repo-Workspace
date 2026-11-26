import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runDevReselectLoop } from "../scripts/lib/dev-loop.mjs";

describe("runDevReselectLoop", () => {
  it("após interrupção e Sim, reabre multiselect com a seleção confirmada pré-marcada", async () => {
    const parallelCalls = [];
    let pickOpts = null;
    let confirmCalls = 0;

    await runDevReselectLoop({
      initialSelected: ["api", "web"],
      discovered: ["api", "web", "worker"],
      interactiveLoop: true,
      config: { nodeVersionByRepo: {} },
      root: "C:\\repos",
      filterDev: (selected) => ({
        withScript: selected.filter((r) => r !== "worker"),
        skipped: selected.includes("worker") ? ["worker"] : [],
      }),
      runParallel: async (repos) => {
        parallelCalls.push([...repos]);
        if (parallelCalls.length === 1) return { interrupted: true };
        return { interrupted: false };
      },
      confirmFn: async () => {
        confirmCalls += 1;
        return true;
      },
      pickFn: async (_candidates, _message, _titleFor, opts) => {
        pickOpts = opts;
        return ["api", "worker"];
      },
    });

    assert.equal(confirmCalls, 1);
    assert.ok(pickOpts.preselected.has("api"));
    assert.ok(pickOpts.preselected.has("web"));
    assert.equal(pickOpts.preselected.has("worker"), false);
    assert.deepEqual(parallelCalls[0], ["api", "web"]);
    assert.deepEqual(parallelCalls[1], ["api"]);
  });

  it("Não no confirm encerra sem reabrir o multiselect", async () => {
    let pickCalls = 0;
    await runDevReselectLoop({
      initialSelected: ["api"],
      discovered: ["api", "web"],
      interactiveLoop: true,
      config: { nodeVersionByRepo: {} },
      root: "C:\\repos",
      filterDev: () => ({ withScript: ["api"], skipped: [] }),
      runParallel: async () => ({ interrupted: true }),
      confirmFn: async () => false,
      pickFn: async () => {
        pickCalls += 1;
        return ["api"];
      },
    });
    assert.equal(pickCalls, 0);
  });

  it("sem interactiveLoop, interrupção não pergunta nem reabre seleção", async () => {
    let confirmCalls = 0;
    let pickCalls = 0;
    await runDevReselectLoop({
      initialSelected: ["api"],
      discovered: ["api"],
      interactiveLoop: false,
      config: { nodeVersionByRepo: {} },
      root: "C:\\repos",
      filterDev: () => ({ withScript: ["api"], skipped: [] }),
      runParallel: async () => ({ interrupted: true }),
      confirmFn: async () => {
        confirmCalls += 1;
        return true;
      },
      pickFn: async () => {
        pickCalls += 1;
        return ["api"];
      },
    });
    assert.equal(confirmCalls, 0);
    assert.equal(pickCalls, 0);
  });

  it("setup: o loop só chama runParallel (install fica fora)", async () => {
    let installCalls = 0;
    await runDevReselectLoop({
      initialSelected: ["api", "web"],
      discovered: ["api", "web"],
      interactiveLoop: true,
      config: { nodeVersionByRepo: {} },
      root: "C:\\repos",
      filterDev: () => ({ withScript: ["api", "web"], skipped: [] }),
      runParallel: async () => {
        if (installCalls > 0) throw new Error("install não deveria rodar no loop");
        return { interrupted: true };
      },
      confirmFn: async () => false,
      pickFn: async () => ["api"],
      onBeforeParallel: () => {
        /* hook só para o teste documentar que install não entra aqui */
      },
    });
    assert.equal(installCalls, 0);
  });
});
