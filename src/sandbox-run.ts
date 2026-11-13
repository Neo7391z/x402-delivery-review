import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createPrivateKey } from "node:crypto";
import { ControlledClient, SandboxProvider, identity } from "./sandbox.js";
import { sha256 } from "./verify.js";
import { samples } from "./core.js";
const root = new URL("../", import.meta.url);
await mkdir(new URL(".local/", root), { recursive: true, mode: 0o700 });
const mode = process.argv[2],
  name = process.argv[3] ?? "signed-sandbox";
if (!/^[a-z0-9-]{1,40}$/.test(name)) throw Error("Invalid case");
const statePath = new URL(`.local/${name}-controller.json`, root);
async function persist(s: unknown) {
  const tmp = new URL(statePath + ".tmp");
  await writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
  await rename(tmp, statePath);
}
if (mode === "prepare") {
  try {
    await readFile(statePath);
    throw Error("Case exists; never reset controller implicitly");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const keys = identity();
  await writeFile(
    new URL(`.local/${name}-client.json`, root),
    JSON.stringify({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
    }),
    { mode: 0o600, flag: "wx" },
  );
  const client = new ControlledClient(persist, undefined, keys),
    provider = new SandboxProvider(
      keys.publicKey,
      name === "signed-accept" ? samples.good : undefined,
    );
  try {
    await client.purchase(await provider.listen(), provider.keys.publicKey);
    await writeFile(
      new URL(`evidence/${name}-packet.json`, root),
      JSON.stringify(
        {
          id: sha256(client.evidence!),
          evidence: client.evidence,
          receipt: client.receipt,
          mode: "Actual localhost HTTP; custom non-monetary x402 scheme; no settlement",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        state: client.state,
        requests: provider.requests,
        deliveries: provider.deliveries,
        events: client.events,
        evidenceId: sha256(client.evidence!),
      }),
    );
  } finally {
    await provider.close();
  }
} else if (mode === "verify") {
  const keys = JSON.parse(
    await readFile(new URL(`.local/${name}-client.json`, root), "utf8"),
  );
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const client = new ControlledClient(persist, state, {
    publicKey: keys.publicKey,
    privateKey: createPrivateKey(keys.privateKey),
  });
  const deployed = JSON.parse(
      await readFile(
        new URL("evidence/studio-deployment-verified.json", root),
        "utf8",
      ),
    ),
    submission = JSON.parse(
      await readFile(
        new URL(`evidence/studio-review-${name}-submitted.json`, root),
        "utf8",
      ),
    );
  const result = await client.review({
    contractAddress: deployed.contractAddress,
    operatorAddress: submission.operator,
    transactionHash: submission.transactionHash,
    sourceSha256: sha256(
      await readFile(new URL("contracts/delivery_review.py", root), "utf8"),
    ),
  });
  let blocked = false,
    nextAuthorized = false;
  if (result.verified && result.effect === "ALLOW") {
    const nextProvider = new SandboxProvider(keys.publicKey, samples.good);
    try {
      await client.purchase(
        await nextProvider.listen(),
        nextProvider.keys.publicKey,
      );
      nextAuthorized = nextProvider.deliveries === 1;
    } finally {
      await nextProvider.close();
    }
  } else {
    try {
      await client.purchase(
        "http://127.0.0.1:1/resource",
        client.receipt!.data.provider,
      );
    } catch (e) {
      blocked = /Controller (PAUSE|HOLD)/.test(String(e));
    }
  }
  const proof = {
    ...result,
    controllerState: client.state,
    nextRequestBlockedBeforeFetch: blocked,
    nextAuthorizedDelivery: nextAuthorized,
    events: client.events,
    scope:
      "Actual signed localhost delivery; public hosted Studionet decision; local controller only",
  };
  await writeFile(
    new URL(`evidence/${name}-verified.json`, root),
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
} else throw Error("Use prepare or verify");
