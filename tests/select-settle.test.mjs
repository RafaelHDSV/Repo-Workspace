import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmReselect,
  settleAfterInterrupt,
} from "../scripts/lib/select.mjs";

describe("settleAfterInterrupt", () => {
  it("espera o delay pedido", async () => {
    const start = Date.now();
    await settleAfterInterrupt(40);
    assert.ok(Date.now() - start >= 35);
  });
});

describe("confirmReselect com settle", () => {
  it("chama settle antes do prompt quando settleMs > 0", async () => {
    const order = [];
    const fake = async () => {
      order.push("prompt");
      return { again: true };
    };
    const settle = async () => {
      order.push("settle");
    };
    assert.equal(
      await confirmReselect("msg", fake, { settleMs: 1, settleFn: settle }),
      true,
    );
    assert.deepEqual(order, ["settle", "prompt"]);
  });
});
