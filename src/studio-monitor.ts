/** Read-only observation of the explicitly authorized hosted Studio run. */
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  verifyFinalDecision,
  sha256,
  checkNetwork,
  studionetPort,
} from "./verify.js";
const mode = process.argv[2] ?? "review";
if (!["deploy", "review"].includes(mode))
  throw Error("Expected deploy or review");
const root = new URL("../", import.meta.url),
  req = JSON.parse(
    await readFile(
      new URL(`evidence/studio-${mode}-submitted.json`, root),
      "utf8",
    ),
  );
await checkNetwork(studionetPort());
const c = createClient({ chain: studionet });
const tx = (await c.request({
  method: "eth_getTransactionByHash",
  params: [req.transactionHash],
})) as any;
function clean(v: any): any {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(
          ([k]) =>
            !/(api.?key|secret|password|authorization|private.?key|access.?token)/i.test(
              k,
            ),
        )
        .map(([k, x]) => [k, clean(x)]),
    );
  return v;
}
await writeFile(
  new URL(`evidence/studio-${mode}-receipt.json`, root),
  JSON.stringify(clean(tx), null, 2),
);
console.log(
  JSON.stringify({
    mode,
    status: tx?.status,
    result: tx?.result_name,
    hash: tx?.hash,
  }),
);
if (mode === "review" && tx?.status === "FINALIZED") {
  const deployment = JSON.parse(
    await readFile(
      new URL("evidence/studio-deployment-verified.json", root),
      "utf8",
    ),
  );
  const packet = JSON.parse(
    await readFile(new URL("evidence/demo-output.json", root), "utf8"),
  );
  const code = await readFile(
    new URL("contracts/delivery_review.py", root),
    "utf8",
  );
  const result = await verifyFinalDecision(
    {
      contractAddress: deployment.contractAddress,
      operatorAddress: req.operator,
      transactionHash: req.transactionHash,
      evidence: packet.evidence,
      sourceSha256: sha256(code),
    },
    undefined,
    45000,
  );
  await writeFile(
    new URL("evidence/studio-live-verification.json", root),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  const balance = await c.request({
    method: "eth_getBalance",
    params: [req.operator, "latest"],
  });
  const receipt = await c.request({
    method: "eth_getTransactionReceipt",
    params: [req.transactionHash],
  });
  await writeFile(
    new URL("evidence/studio-cost-observation.json", root),
    JSON.stringify(
      {
        balanceAfter: balance,
        submittedValue: "0",
        submittedGasPrice: "0",
        receipt: clean(receipt),
        scope:
          "Hosted Studionet simulator only; no user wallet or real funds used",
      },
      null,
      2,
    ),
  );
  if (!result.verified) process.exitCode = 1;
}
