import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ControlledClient,
  SandboxProvider,
  validateReceipt,
  identity,
  mandate,
  seal,
  hash,
} from "../src/sandbox.js";
import { sha256, type Verification } from "../src/verify.js";
const config = {
  contractAddress: "0x7e4b6EdbEC697a28Fce4F1D6a7e30Ed47B8164E6",
  operatorAddress: "0x0898cA82CDA5C0008383706230A7b6fF0b0c2618",
  sourceSha256: "a".repeat(64),
  transactionHash: "0x" + "b".repeat(64),
};
for (const decision of ["ACCEPT", "REWORK", "ESCALATE"] as const)
  test(
    "real HTTP workflow, signed evidence and " + decision + " controller",
    async () => {
      const client = new ControlledClient(),
        provider = new SandboxProvider(client.keys.publicKey);
      try {
        const url = await provider.listen();
        await client.purchase(url, provider.keys.publicKey);
        assert.equal(provider.requests, 2);
        assert.equal(provider.deliveries, 1);
        assert.equal(client.state, "HOLD");
        await assert.rejects(
          client.purchase(url, provider.keys.publicKey),
          /HOLD/,
        );
        assert.equal(provider.requests, 2);
        const effect =
          decision === "ACCEPT"
            ? "ALLOW"
            : decision === "REWORK"
              ? "PAUSE"
              : "HOLD";
        await client.review(
          config,
          async (i) =>
            ({
              verified: true,
              decision,
              effect,
              evidenceId: sha256(i.evidence),
            }) as Verification,
        );
        assert.equal(client.state, effect);
        if (effect === "ALLOW") {
          await client.purchase(url, provider.keys.publicKey);
          assert.equal(provider.requests, 4);
        } else {
          await assert.rejects(client.purchase(url, provider.keys.publicKey));
          assert.equal(provider.requests, 2);
        }
      } finally {
        await provider.close();
      }
    },
  );
test("tampered body, missing signature and wrong supplier fail", async () => {
  const client = new ControlledClient(),
    provider = new SandboxProvider(client.keys.publicKey);
  try {
    await client.purchase(await provider.listen(), provider.keys.publicKey);
    const receipt = client.receipt!;
    for (const bad of [
      { ...receipt, signature: "" },
      { ...receipt, data: { ...receipt.data, body: "tamper" } },
    ])
      assert.throws(() =>
        validateReceipt(bad, provider.keys.publicKey, client.keys.publicKey),
      );
    assert.throws(() =>
      validateReceipt(receipt, identity().publicKey, client.keys.publicKey),
    );
  } finally {
    await provider.close();
  }
});
test("untrusted offer and concurrency fail closed", async () => {
  const client = new ControlledClient(),
    provider = new SandboxProvider(client.keys.publicKey);
  try {
    const url = await provider.listen();
    const a = client.purchase(url, identity().publicKey);
    await assert.rejects(client.purchase(url, provider.keys.publicKey), /HOLD/);
    await assert.rejects(a, /Untrusted/);
    assert.equal(provider.deliveries, 0);
    assert.equal(client.state, "HOLD");
  } finally {
    await provider.close();
  }
});
test("missing evidence and bad relay cannot authorize", async () => {
  const client = new ControlledClient();
  await assert.rejects(client.review(config), /Missing evidence/);
  const provider = new SandboxProvider(client.keys.publicKey);
  try {
    client.state = "ALLOW";
    await client.purchase(await provider.listen(), provider.keys.publicKey);
    await client.review(config, async () => ({
      verified: false,
      effect: "HOLD",
      error: "Wrong operator",
    }));
    assert.equal(client.state, "HOLD");
    await client.review(
      config,
      async () =>
        ({
          verified: true,
          effect: "ALLOW",
          decision: "ACCEPT",
          evidenceId: "wrong",
        }) as Verification,
    );
    assert.equal(client.state, "HOLD");
  } finally {
    await provider.close();
  }
});
test("persistence failure blocks all fetches", async () => {
  const c = new ControlledClient(async () => {
    throw Error("disk full");
  });
  await assert.rejects(c.purchase("http://127.0.0.1:1", "key"), /disk full/);
  assert.equal(c.state, "HOLD");
});
test("replayed authorization is rejected by provider", async () => {
  const { encodePaymentSignatureHeader } = await import("@x402/core/http");
  const c = new ControlledClient(),
    p = new SandboxProvider(c.keys.publicKey);
  try {
    const url = await p.listen();
    await c.purchase(url, p.keys.publicKey);
    const r = c.receipt!;
    const payload = {
      x402Version: 2,
      accepted: {
        scheme: "demo-authorization",
        network: "sandbox:court" as const,
        amount: "1",
        asset: "NO-MONEY",
        payTo: hash(p.keys.publicKey),
        maxTimeoutSeconds: 60,
        extra: { challenge: r.data.challenge },
      },
      payload: r.data.authorization as unknown as Record<string, unknown>,
    };
    const response = await fetch(url, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    });
    assert.equal(response.status, 403);
    assert.equal(p.deliveries, 1);
  } finally {
    await p.close();
  }
});
test("restart preserves PAUSE and performs no network request", async () => {
  const c = new ControlledClient(undefined, {
    state: "PAUSE",
    events: ["Restored durable state"],
  });
  await assert.rejects(c.purchase("http://127.0.0.1:1", "provider"), /PAUSE/);
});
test("wrong client signature is rejected", async () => {
  const c = new ControlledClient(),
    p = new SandboxProvider(c.keys.publicKey);
  try {
    await c.purchase(await p.listen(), p.keys.publicKey);
    const r = c.receipt!;
    const fake = identity();
    const bad = seal(
      {
        ...r.data,
        authorization: seal(r.data.authorization.data, fake.privateKey),
      },
      p.keys.privateKey,
    );
    assert.throws(() =>
      validateReceipt(bad, p.keys.publicKey, c.keys.publicKey),
    );
  } finally {
    await p.close();
  }
});
test("RPC outage and contradictory effect fail closed", async () => {
  const c = new ControlledClient(),
    p = new SandboxProvider(c.keys.publicKey);
  try {
    await c.purchase(await p.listen(), p.keys.publicKey);
    await assert.rejects(
      c.review(config, async () => {
        throw Error("offline");
      }),
      /HOLD/,
    );
    await c.review(
      config,
      async (i) =>
        ({
          verified: true,
          effect: "ALLOW",
          decision: "REWORK",
          evidenceId: sha256(i.evidence),
        }) as Verification,
    );
    assert.equal(c.state, "HOLD");
  } finally {
    await p.close();
  }
});
for (const attack of ["expired", "over-budget"] as const)
  test("provider rejects " + attack + " authorization", async () => {
    const { decodePaymentRequiredHeader, encodePaymentSignatureHeader } =
      await import("@x402/core/http");
    const c = new ControlledClient(),
      p = new SandboxProvider(c.keys.publicKey);
    try {
      const url = await p.listen();
      const initial = await fetch(url);
      const offer = decodePaymentRequiredHeader(
        initial.headers.get("payment-required")!,
      );
      let challenge = (offer.accepts[0].extra as any).challenge;
      if (attack === "expired") {
        challenge = seal(
          { ...challenge.data, expires: Date.now() - 1 },
          p.keys.privateKey,
        );
        p.challenges.set(challenge.data.nonce, challenge);
      }
      const auth = seal(
        {
          challengeHash: hash(challenge),
          nonce: challenge.data.nonce,
          mandateHash: hash(mandate),
        },
        c.keys.privateKey,
      );
      const payload = {
        x402Version: 2,
        accepted: {
          ...offer.accepts[0],
          amount: attack === "over-budget" ? "2" : "1",
        },
        payload: auth as unknown as Record<string, unknown>,
      };
      const response = await fetch(url, {
        headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
      });
      assert.equal(response.status, 403);
      assert.equal(p.deliveries, 0);
    } finally {
      await p.close();
    }
  });
test("persisting an ALLOW decision fails closed", async () => {
  let fail = false;
  const c = new ControlledClient(async (s) => {
      if (fail && (s as any).state === "ALLOW") throw Error("disk failure");
    }),
    p = new SandboxProvider(c.keys.publicKey);
  try {
    await c.purchase(await p.listen(), p.keys.publicKey);
    fail = true;
    await assert.rejects(
      c.review(
        config,
        async (i) =>
          ({
            verified: true,
            effect: "ALLOW",
            decision: "ACCEPT",
            evidenceId: sha256(i.evidence),
          }) as Verification,
      ),
      /HOLD/,
    );
    assert.equal(c.state, "HOLD");
  } finally {
    await p.close();
  }
});
