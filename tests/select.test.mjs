import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChoices } from "../scripts/lib/select.mjs";

describe("buildChoices", () => {
  it("sem pré-marcação, nada vem selecionado", () => {
    const choices = buildChoices(["api", "web"], (n) => n, new Set());
    assert.deepEqual(
      choices.map((c) => c.selected),
      [false, false],
    );
  });

  it("marca só quem está no conjunto pré-selecionado", () => {
    const choices = buildChoices(["api", "web"], (n) => n, new Set(["web"]));
    assert.deepEqual(
      choices.map((c) => [c.value, c.selected]),
      [
        ["api", false],
        ["web", true],
      ],
    );
  });

  it("aplica titleFor no título e preserva o value cru", () => {
    const choices = buildChoices(["api"], (n) => `${n}  (main)`, new Set());
    assert.equal(choices[0].title, "api  (main)");
    assert.equal(choices[0].value, "api");
  });

  it("nome pré-selecionado que não é candidato é ignorado", () => {
    const choices = buildChoices(["api"], (n) => n, new Set(["sumiu"]));
    assert.equal(choices.length, 1);
    assert.equal(choices[0].selected, false);
  });
});
