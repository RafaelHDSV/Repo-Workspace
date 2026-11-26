import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildParallelCommands,
  wasInterruptedBySignal,
} from "../scripts/lib/run.mjs";

describe("descritores de execução paralela", () => {
  it("aceita um comando específico por repositório e injeta CI", () => {
    const baseEnv = {
      PATH: "C:\\Windows",
      NVM_HOME: "C:\\nvm",
    };
    const commands = buildParallelCommands(
      [
        { repo: "api", command: "yarn test" },
        { repo: "web", command: "yarn test --run" },
      ],
      {
        nodeVersionByRepo: {
          api: "20.18.3",
          web: "22.12.0",
        },
      },
      "C:\\repos",
      baseEnv,
      { CI: "1" },
    );

    assert.equal(commands[0].name, "api");
    assert.equal(commands[0].command, "yarn test");
    assert.equal(commands[0].cwd, path.join("C:\\repos", "api"));
    assert.equal(commands[0].env.CI, "1");
    assert.match(commands[0].env.PATH, /v20\.18\.3/);

    assert.equal(commands[1].name, "web");
    assert.equal(commands[1].command, "yarn test --run");
    assert.equal(commands[1].env.CI, "1");
    assert.match(commands[1].env.PATH, /v22\.12\.0/);
  });
});

describe("wasInterruptedBySignal", () => {
  it("é true quando algum close event veio de kill (Ctrl+C)", () => {
    assert.equal(
      wasInterruptedBySignal([
        { killed: false, exitCode: 0 },
        { killed: true, exitCode: 0 },
      ]),
      true,
    );
  });

  it("é false quando ninguém foi morto por sinal", () => {
    assert.equal(
      wasInterruptedBySignal([
        { killed: false, exitCode: 0 },
        { killed: false, exitCode: 1 },
      ]),
      false,
    );
  });

  it("é false para lista vazia ou valor inválido", () => {
    assert.equal(wasInterruptedBySignal([]), false);
    assert.equal(wasInterruptedBySignal(null), false);
    assert.equal(wasInterruptedBySignal(undefined), false);
  });
});
