/** Fresh reviewer-owned run. No dependency on the author's keys, controller or deployment. */
import { mkdir, readFile, writeFile, copyFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ControlledClient, SandboxProvider } from "./sandbox.js";
import { samples } from "./core.js";
import {
  sha256,
  STUDIO_RPC,
  studionetPort,
  verifyFinalDecision,
} from "./verify.js";
import { assertFreeStudio, waitFinalized, type Rpc } from "./studio-safety.js";
import { validateStudioConsensus } from "./studio-consensus.js";
const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
if (
  args.some(
    (a) =>
      ![
        "--authorized-studionet-only",
        "--scenario=bad",
        "--scenario=good",
      ].includes(a),
  )
)
  throw Error("Unknown option");
if (args.includes("--scenario=bad") && args.includes("--scenario=good"))
  throw Error("Choose one scenario");
const scenario = args.includes("--scenario=good") ? "good" : "bad";
if (!args.includes("--authorized-studionet-only")) {
  console.log(
    JSON.stringify(
      {
        mode: "PLAN ONLY — no signing or remote writes",
        scenario,
        steps: [
          "Check chain 61999 and zero gas price",
          "Create isolated disposable signer and deploy pinned source",
          "Perform fresh signed HTTP delivery",
          "Review this exact evidence on new contract",
          "Verify FINALIZED decision and attempt next request",
        ],
        execute:
          "npm run demo:fresh -- --authorized-studionet-only --scenario=" +
          scenario,
        scope:
          "Public hosted Studionet; synthetic evidence; custom non-monetary x402 scheme; no production keys or money",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const sdk = createClient({ chain: studionet, endpoint: STUDIO_RPC });
const rpc: Rpc = (method, params = []) =>
  sdk.request({ method, params } as any);
await assertFreeStudio(rpc);
const runId =
  new Date().toISOString().replace(/[:.]/g, "-") +
  "-" +
  randomUUID().slice(0, 8);
const run = new URL(".local/fresh-runs/" + runId + "/", root);
await mkdir(new URL("evidence/", run), { recursive: true, mode: 0o700 });
await mkdir(new URL("contracts/", run), { recursive: true, mode: 0o700 });
const save = async (name: string, value: unknown) =>
  writeFile(
    new URL("evidence/" + name, run),
    JSON.stringify(value, null, 2) + "\n",
  );
const read = async (name: string) =>
  JSON.parse(await readFile(new URL("evidence/" + name, run), "utf8"));
await copyFile(
  new URL("contracts/delivery_review.py", root),
  new URL("contracts/delivery_review.py", run),
);
await copyFile(
  new URL("evidence/live-release.json", root),
  new URL("evidence/live-release.json", run),
);
const source = await readFile(
  new URL("contracts/delivery_review.py", run),
  "utf8",
);
function submit(mode: "deploy" | "review") {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("src/studio-submit.ts", root)),
        mode,
        "--authorized-studionet-only",
      ],
      {
        cwd: fileURLToPath(root),
        env: { ...process.env, DELIVERY_DEMO_RUN_ROOT: fileURLToPath(run) },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error("Submission stopped; inspect retained run before any retry"),
          ),
    );
  });
}
const client = new ControlledClient(async (state) => {
  const temporary = new URL("controller.json.tmp", run);
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, new URL("controller.json", run));
});
const provider = new SandboxProvider(client.keys.publicKey, samples[scenario]);
try {
  console.log("Run directory: " + fileURLToPath(run));
  await submit("deploy");
  const deploymentRequest = await read("studio-deploy-submitted.json");
  console.log("Waiting for deployment FINALIZED…");
  const deployed = await waitFinalized(rpc, deploymentRequest.transactionHash);
  validateStudioConsensus(deployed);
  const contractAddress = getAddress(deployed.to_address),
    port = studionetPort();
  if (
    deployed.hash.toLowerCase() !==
      deploymentRequest.transactionHash.toLowerCase() ||
    deployed.from_address.toLowerCase() !==
      deploymentRequest.operator.toLowerCase()
  )
    throw Error("Deployment transaction identity mismatch");
  if (
    sha256(await port.source(contractAddress)) !== sha256(source) ||
    String(await port.view(contractAddress, "get_owner", [])).toLowerCase() !==
      deploymentRequest.operator.toLowerCase()
  )
    throw Error("Deployment source/owner mismatch");
  await save("studio-deployment-verified.json", {
    status: "FINALIZED",
    execution: "SUCCESS",
    contractAddress,
    owner: deploymentRequest.operator,
    sourceSha256: sha256(source),
    chainId: 61999,
    deploymentHash: deploymentRequest.transactionHash,
  });
  const url = await provider.listen();
  await client.purchase(url, provider.keys.publicKey);
  const receipt = client.receipt!,
    evidence = client.evidence!,
    evidenceId = sha256(evidence);
  await save("demo-output.json", { id: evidenceId, evidence, receipt });
  console.log(
    "Fresh 402 → signed authorization → signed delivery; HOLD until exact evidence review",
  );
  await submit("review");
  const reviewRequest = await read("studio-review-submitted.json");
  console.log("Waiting for review FINALIZED…");
  await waitFinalized(rpc, reviewRequest.transactionHash);
  const result = await client.review(
    {
      contractAddress,
      operatorAddress: deploymentRequest.operator,
      sourceSha256: sha256(source),
      transactionHash: reviewRequest.transactionHash,
    },
    (input) => verifyFinalDecision(input, undefined, 45000),
  );
  const before = provider.requests;
  let blocked = false;
  try {
    await client.purchase(url, provider.keys.publicKey);
  } catch (error) {
    if (!String(error).includes("Controller")) throw error;
    blocked = true;
  }
  const after = provider.requests;
  const outcome = {
    runId,
    scenario,
    network: 61999,
    deploymentHash: deploymentRequest.transactionHash,
    contractAddress,
    operator: deploymentRequest.operator,
    evidenceId,
    reviewTransactionHash: reviewRequest.transactionHash,
    verification: result,
    controllerState: client.state,
    requestCountBeforeAttempt: before,
    requestCountAfterAttempt: after,
    nextRequestBlockedBeforeFetch: blocked && before === after,
    nextDeliveryCompleted: after === before + 2,
    events: client.events,
    value: "0",
    gasPrice: "0",
    scope:
      "Fresh signed HTTP delivery; public hosted Studionet; local controller; no real payment, jury case or wallet-wide revocation",
  };
  await save("fresh-run-result.json", outcome);
  console.log(JSON.stringify(outcome, null, 2));
  if (!result.verified) process.exitCode = 2;
} catch (error) {
  await save("fresh-run-error.json", {
    error: error instanceof Error ? error.message : String(error),
    state: "HOLD",
    runId,
    nextStep:
      "Inspect persisted transaction hashes. This runner never retries a submitted transaction; use read-only verification if finality was late.",
  });
  throw error;
} finally {
  await provider.close();
}
