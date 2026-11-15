/** Explicitly authorized disposable Studionet demo. Never imports user wallet keys. */
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { assertFreeStudio } from "./studio-safety.js";
import { abi, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData, zeroAddress, keccak256 } from "viem";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sha256, STUDIO_RPC, STUDIO_CHAIN_ID } from "./verify.js";
const mode = process.argv[2];
if (
  !["deploy", "review"].includes(mode) ||
  process.argv[3] !== "--authorized-studionet-only"
)
  throw Error("Explicit authorized Studionet mode required");
const caseName = process.argv[4];
if (caseName && !/^[a-z0-9-]{1,40}$/.test(caseName))
  throw Error("Invalid case name");
const run = caseName ? `${mode}-${caseName}` : mode;
const projectRoot = new URL("../", import.meta.url);
const requestedRoot = process.env.DELIVERY_DEMO_RUN_ROOT;
const allowedRoot =
  resolve(new URL(".local/fresh-runs/", projectRoot).pathname) + sep;
if (requestedRoot && !resolve(requestedRoot).startsWith(allowedRoot))
  throw Error("Run root must be an isolated local fresh-run directory");
const root = requestedRoot
  ? pathToFileURL(resolve(requestedRoot) + sep)
  : projectRoot;
const local = new URL(".local/", root);
await mkdir(local, { recursive: true, mode: 0o700 });
let id = 1;
async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const requestId = id++;
  const r = await fetch(STUDIO_RPC, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("RPC HTTP " + r.status);
  const o = await r.json();
  if (o.id !== requestId || o.jsonrpc !== "2.0")
    throw Error("Malformed RPC envelope");
  if (o.error) throw Error("RPC " + method + ": " + String(o.error.message));
  if (!("result" in o)) throw Error("Missing RPC result");
  return o.result;
}
const zeroCostNetwork = () => assertFreeStudio(rpc);
await zeroCostNetwork();
const keyPath = new URL("studionet-demo-signer.json", local);
let signer: {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  purpose: string;
};
try {
  signer = JSON.parse(await readFile(keyPath, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  const privateKey = generatePrivateKey(),
    account = createAccount(privateKey);
  signer = {
    privateKey,
    address: account.address,
    purpose:
      "Disposable Internet Court Studionet 61999 demo ONLY; never fund with real assets",
  };
  await writeFile(keyPath, JSON.stringify(signer), { mode: 0o600, flag: "wx" });
}
const account = createAccount(signer.privateKey);
if (account.address !== signer.address)
  throw Error("Local signer integrity failure");
const statePath = new URL(`studio-${run}-submission.json`, local);
try {
  await readFile(statePath);
  throw Error(
    "Submission state already exists; inspect outcome, never auto-resubmit",
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const code = await readFile(
  new URL("contracts/delivery_review.py", root),
  "utf8",
);
const reviewedHash = JSON.parse(
  await readFile(new URL("evidence/live-release.json", root), "utf8"),
).sourceSha256;
if (sha256(code) !== reviewedHash) throw Error("Reviewed source changed");
let recipient: `0x${string}` = zeroAddress,
  payload: `0x${string}`;
if (mode === "deploy")
  payload = abi.transactions.serialize([
    code,
    abi.calldata.encode(
      abi.calldata.makeCalldataObject(undefined, [], undefined),
    ),
    false,
  ]);
else {
  const deployment = JSON.parse(
    await readFile(
      new URL("evidence/studio-deployment-verified.json", root),
      "utf8",
    ),
  );
  if (
    deployment.status !== "FINALIZED" ||
    deployment.execution !== "SUCCESS" ||
    deployment.owner.toLowerCase() !== account.address.toLowerCase() ||
    deployment.sourceSha256 !== reviewedHash ||
    deployment.chainId !== 61999
  )
    throw Error("Deployment is not verified");
  if (!/^0x[0-9a-fA-F]{40}$/.test(deployment.contractAddress))
    throw Error("Invalid deployed address");
  recipient = deployment.contractAddress;
  const packet = JSON.parse(
    await readFile(
      new URL(
        caseName
          ? `evidence/${caseName}-packet.json`
          : "evidence/demo-output.json",
        root,
      ),
      "utf8",
    ),
  );
  payload = abi.transactions.serialize([
    abi.calldata.encode(
      abi.calldata.makeCalldataObject("review", [packet.evidence], undefined),
    ),
    false,
  ]);
}
const target = studionet.consensusMainContract!.address;
const data = encodeFunctionData({
  abi: studionet.consensusMainContract!.abi,
  functionName: "addTransaction",
  args: [account.address, recipient, 5n, 3n, payload],
});
const balance = await rpc("eth_getBalance", [account.address, "latest"]);
const nonceHex = await rpc("eth_getTransactionCount", [
  account.address,
  "latest",
]);
if (typeof nonceHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(nonceHex))
  throw Error("Malformed nonce");
const estimate = await rpc("eth_estimateGas", [
  { from: account.address, to: target, data, value: "0x0", gasPrice: "0x0" },
]);
if (
  typeof estimate !== "string" ||
  !/^0x[0-9a-fA-F]+$/.test(estimate) ||
  BigInt(estimate) <= 0n ||
  BigInt(estimate) > 5000000n
)
  throw Error("Unknown or excessive gas estimate");
const safety = await zeroCostNetwork();
const request = {
  to: target,
  data,
  value: 0n,
  gasPrice: 0n,
  gas: BigInt(estimate),
  nonce: Number(BigInt(nonceHex)),
  chainId: 61999,
  type: "legacy" as const,
};
const metadata = {
  mode,
  rpc: STUDIO_RPC,
  ...safety,
  operator: account.address,
  recipient,
  consensusTarget: target,
  value: "0",
  gasPrice: "0",
  gasLimit: estimate,
  nonce: nonceHex,
  balanceBefore: balance,
  sourceSha256: reviewedHash,
  leaderOnly: false,
  validators: 5,
  rotations: 3,
  status: "PREPARED",
  createdAt: new Date().toISOString(),
};
await writeFile(
  new URL(`evidence/studio-${run}-request.json`, root),
  JSON.stringify(metadata, null, 2),
);
const signed = await account.signTransaction(request);
const localState = {
  ...metadata,
  status: "SUBMITTING",
  signedRawHash: keccak256(signed),
  signedRawTransaction: signed,
};
await writeFile(statePath, JSON.stringify(localState, null, 2), {
  mode: 0o600,
  flag: "wx",
});
try {
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Unexpected submission result; outcome uncertain");
  await writeFile(
    statePath,
    JSON.stringify(
      { ...localState, status: "SUBMITTED", transactionHash: hash },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await writeFile(
    new URL(`evidence/studio-${run}-submitted.json`, root),
    JSON.stringify(
      { ...metadata, status: "SUBMITTED", transactionHash: hash },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: "SUBMITTED",
      mode,
      operator: account.address,
      transactionHash: hash,
      value: "0",
      gasPrice: "0",
      chainId: 61999,
    }),
  );
} catch (e) {
  await writeFile(
    new URL(`evidence/studio-${run}-submission-error.json`, root),
    JSON.stringify(
      {
        mode,
        error: e instanceof Error ? e.message : "Unknown submission failure",
        outcome: "Check RPC and local state before any retry",
      },
      null,
      2,
    ),
  );
  throw e;
}
