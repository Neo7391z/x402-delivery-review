import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../src/server.js";
import { sampleHeader } from "../src/core.js";
test("HTTP packet builder, validation and read-only boundary", async () => {
  try {
    const base = "http://127.0.0.1:4173";
    const recorded = await fetch(base + "/api/live/recorded").then((r) =>
      r.json(),
    );
    assert.equal(recorded.recorded, true);
    assert.equal(recorded.verified, true);
    assert.equal(recorded.chainId, 61999);
    const demo = await fetch(base + "/api/demo").then((r) => r.json());
    assert.equal(demo.decision, "REWORK");
    const p = await fetch(base + "/api/prepare", {
      method: "POST",
      body: JSON.stringify({
        header: sampleHeader,
        body: "Real pasted response",
      }),
    }).then((r) => r.json());
    assert.equal(p.submitted, false);
    assert.equal(p.functionName, "review");
    assert.equal(
      (await fetch(base + "/api/prepare", { method: "POST", body: "bad json" }))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/prepare", {
          method: "POST",
          body: "x".repeat(51000),
        })
      ).status,
      413,
    );
    assert.equal(
      (await fetch(base + "/api/demo", { method: "POST" })).status,
      405,
    );
    const unavailable = await fetch(base + "/api/live/verify", {
      method: "POST",
      body: "{}",
    });
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).effect, "HOLD");
    process.env.DELIVERY_CONTRACT_ADDRESS = "0x" + "a".repeat(40);
    process.env.DELIVERY_OPERATOR_ADDRESS = "0x" + "b".repeat(40);
    const invalidLive = await fetch(base + "/api/live/verify", {
      method: "POST",
      body: JSON.stringify({
        header: sampleHeader,
        body: "Delivered answer",
        transactionHash: "invalid",
      }),
    }).then((r) => r.json());
    assert.equal(invalidLive.verified, false);
    assert.equal(invalidLive.effect, "HOLD");
    delete process.env.DELIVERY_CONTRACT_ADDRESS;
    delete process.env.DELIVERY_OPERATOR_ADDRESS;
    assert.equal((await fetch(base + "/../../package.json")).status, 404);
  } finally {
    server.close();
  }
});
