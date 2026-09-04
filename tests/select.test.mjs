import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChoices, pickRepos } from "../scripts/lib/select.mjs";

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

describe("pickRepos: o que chega no prompts", () => {
  function capture(opts) {
    let recebido = null;
    const fake = async (config) => {
      recebido = config;
      return { repos: [] };
    };
    return { fake, get: () => recebido };
  }

  it("open repassa min 0 e os choices pre-marcados", async () => {
    const { fake, get } = capture();
    await pickRepos(["api", "web"], "m", (n) => n, {
      preselected: new Set(["web"]),
      min: 0,
    }, fake);

    const config = get();
    assert.equal(config.min, 0, "min 0 e o que permite desmarcar tudo e confirmar");
    assert.deepEqual(
      config.choices.map((c) => [c.value, c.selected]),
      [["api", false], ["web", true]],
    );
  });

  it("sem opts, o default e min 1 e nada marcado", async () => {
    const { fake, get } = capture();
    await pickRepos(["api", "web"], "m", undefined, undefined, fake);

    const config = get();
    assert.equal(config.min, 1);
    assert.deepEqual(config.choices.map((c) => c.selected), [false, false]);
  });
});
