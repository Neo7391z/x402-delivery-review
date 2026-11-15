import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertFreeStudio,
  waitFinalized,
  type Rpc,
} from "../src/studio-safety.js";
const values: Record<string, unknown> = {
  eth_chainId: "0xf22f",
  net_version: "61999",
  eth_gasPrice: "0x0",
};
test("free Studio requires independent identifiers and zero gas", async () => {
  assert.deepEqual(await assertFreeStudio(async (m) => values[m]), {
    chain: "0xf22f",
    network: "61999",
    gasPrice: "0x0",
  });
});
for (const [method, value] of [
  ["eth_chainId", "0x1"],
  ["net_version", "1"],
  ["eth_gasPrice", "0x1"],
  ["eth_gasPrice", null],
] as const)
  test("refuse unsafe " + method + " " + value, async () => {
    await assert.rejects(
      assertFreeStudio(async (m) => (m === method ? value : values[m])),
      /STOP/,
    );
  });
test("RPC errors propagate before transaction work", async () => {
  await assert.rejects(
    assertFreeStudio(async () => {
      throw Error("offline");
    }),
    /offline/,
  );
});
test("finality waiter polls read only and returns actual receipt", async () => {
  let n = 0;
  const methods: string[] = [];
  const rpc: Rpc = async (m) => {
    methods.push(m);
    return { status: ++n === 2 ? "FINALIZED" : "PENDING" };
  };
  assert.equal(
    (await waitFinalized(rpc, "0x" + "a".repeat(64), 100, 1)).status,
    "FINALIZED",
  );
  assert.deepEqual(methods, [
    "eth_getTransactionByHash",
    "eth_getTransactionByHash",
  ]);
});
test("terminal state and timeout never submit again", async () => {
  await assert.rejects(
    waitFinalized(
      async () => ({ status: "REJECTED" }),
      "0x" + "a".repeat(64),
      100,
      1,
    ),
    /Terminal/,
  );
  await assert.rejects(
    waitFinalized(
      async () => ({ status: "PENDING" }),
      "0x" + "a".repeat(64),
      3,
      1,
    ),
    /do not resubmit/,
  );
});
test("invalid hash is rejected without an RPC", async () => {
  await assert.rejects(
    waitFinalized(async () => {
      throw Error("should not call");
    }, "bad"),
    /Invalid transaction/,
  );
});
