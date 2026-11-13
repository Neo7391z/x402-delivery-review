import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";
import { validateStudioConsensus } from "./studio-consensus.js";
import { policy, type Decision } from "./core.js";

export const STUDIO_RPC = "https://studio.genlayer.com/api";
export const STUDIO_CHAIN_ID = 61999n;
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Obj = Record<string, unknown>;
function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid " + label);
  return value as Obj;
}
function address(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(value) ||
    /^0x0{40}$/.test(value)
  )
    throw Error("Invalid address");
  return value.toLowerCase();
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw Error("Invalid SHA-256");
  return value;
}
export interface ReadOnlyPort {
  chainId(): Promise<unknown>;
  networkVersion(): Promise<unknown>;
  transaction(hash: string): Promise<unknown>;
  source(address: string): Promise<string>;
  view(address: string, method: string, args: string[]): Promise<unknown>;
}
// No account, provider, wallet, signing method, deployment or write method is exposed.
export function studionetPort(): ReadOnlyPort {
  if (
    studionet.id !== Number(STUDIO_CHAIN_ID) ||
    studionet.rpcUrls.default.http[0] !== STUDIO_RPC
  )
    throw Error("SDK network configuration drift");
  return readOnlyPortFromClient(
    createClient({ chain: studionet, endpoint: STUDIO_RPC }),
  );
}
export function readOnlyPortFromClient(
  client: Pick<
    ReturnType<typeof createClient>,
    "request" | "getContractCode" | "readContract"
  >,
): ReadOnlyPort {
  return {
    chainId: () => client.request({ method: "eth_chainId" }),
    networkVersion: () => client.request({ method: "net_version" }),
    transaction: (hash) =>
      client.request({
        method: "eth_getTransactionByHash",
        params: [hash as `0x${string}`],
      }),
    source: (a) => client.getContractCode(a as `0x${string}`),
    view: (a, method, args) =>
      client.readContract({
        address: a as `0x${string}`,
        functionName: method,
        args,
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
      }),
  };
}
export async function checkNetwork(port: ReadOnlyPort) {
  const [hex, decimal] = await Promise.all([
    port.chainId(),
    port.networkVersion(),
  ]);
  if (
    typeof hex !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(hex) ||
    BigInt(hex) !== STUDIO_CHAIN_ID
  )
    throw Error("Wrong or malformed eth_chainId");
  if (
    typeof decimal !== "string" ||
    !/^[0-9]+$/.test(decimal) ||
    BigInt(decimal) !== STUDIO_CHAIN_ID
  )
    throw Error("Wrong or malformed net_version");
  return { chainId: 61999, rpc: STUDIO_RPC };
}
export type VerifyInput = {
  contractAddress: string;
  operatorAddress: string;
  sourceSha256: string;
  transactionHash: string;
  evidence: string;
};
export type Verification =
  | { verified: false; effect: "HOLD"; error: string }
  | {
      verified: true;
      effect: "ALLOW" | "PAUSE" | "HOLD";
      decision: Decision;
      reason: string;
      evidenceId: string;
      transactionHash: string;
      contractAddress: string;
      sourceSha256: string;
      chainId: 61999;
      rpc: string;
      trust: "trusted-studionet-rpc";
      consensus: ReturnType<typeof validateStudioConsensus>;
      checkedAt: string;
    };

async function verify(
  port: ReadOnlyPort,
  input: VerifyInput,
): Promise<Verification> {
  const target = address(input.contractAddress),
    operator = address(input.operatorAddress),
    codeHash = digest(input.sourceSha256);
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash))
    throw Error("Invalid transaction hash");
  if (
    typeof input.evidence !== "string" ||
    !input.evidence.length ||
    input.evidence.length > 16000
  )
    throw Error("Invalid evidence size");
  const envelope = object(JSON.parse(input.evidence), "evidence");
  if (envelope.version !== 1) throw Error("Invalid evidence version");
  for (const field of [
    "resource",
    "terms",
    "network",
    "amount",
    "asset",
    "payTo",
    "body",
  ])
    if (
      typeof envelope[field] !== "string" ||
      !(envelope[field] as string).trim()
    )
      throw Error("Missing evidence field");
  const rpcTarget = getAddress(input.contractAddress);
  const evidenceId = sha256(input.evidence),
    hash = input.transactionHash.toLowerCase();
  await checkNetwork(port);
  const tx = object(await port.transaction(hash), "transaction");
  if (typeof tx.hash !== "string" || tx.hash.toLowerCase() !== hash)
    throw Error("Transaction hash mismatch");
  if (tx.status !== "FINALIZED") throw Error("Transaction is not FINALIZED");
  if (
    address(tx.to_address) !== target ||
    address(tx.from_address) !== operator
  )
    throw Error("Wrong transaction target or operator");
  const data = object(tx.data, "transaction data");
  if (
    typeof data.calldata !== "string" ||
    data.calldata.length > 65536 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data.calldata,
    )
  )
    throw Error("Missing or malformed calldata");
  const decoded = abi.calldata.decode(
    Uint8Array.from(Buffer.from(data.calldata, "base64")),
  );
  if (!(decoded instanceof Map) || decoded.get("method") !== "review")
    throw Error("Wrong contract method");
  const args = decoded.get("args");
  if (
    !Array.isArray(args) ||
    args.length !== 1 ||
    args[0] !== input.evidence ||
    decoded.has("kwargs")
  )
    throw Error("Evidence calldata mismatch");
  const consensus = validateStudioConsensus(tx);
  const remoteCode = await port.source(rpcTarget);
  if (typeof remoteCode !== "string" || sha256(remoteCode) !== codeHash)
    throw Error("Deployed source hash mismatch");
  if (address(await port.view(rpcTarget, "get_owner", [])) !== operator)
    throw Error("Contract owner mismatch");
  const raw = await port.view(rpcTarget, "get_decision", [evidenceId]);
  if (typeof raw !== "string" || raw.length > 4096)
    throw Error("Malformed decision");
  const result = object(JSON.parse(raw), "decision");
  if (
    !["ACCEPT", "REWORK", "ESCALATE"].includes(result.decision as string) ||
    typeof result.reason !== "string" ||
    !result.reason.trim() ||
    result.reason.length > 500
  )
    throw Error("Invalid decision schema");
  if (Object.keys(result).some((k) => !["decision", "reason"].includes(k)))
    throw Error("Unexpected decision fields");
  if (result.reason === "Not reviewed")
    throw Error("Evidence has no stored review");
  // Verify endpoint identity again after reading state; never infer network from SDK config alone.
  await checkNetwork(port);
  const decision = result.decision as Decision;
  return {
    verified: true,
    effect: policy(decision, true, true, evidenceId, evidenceId),
    decision,
    reason: result.reason,
    evidenceId,
    transactionHash: hash,
    contractAddress: rpcTarget,
    sourceSha256: codeHash,
    chainId: 61999,
    rpc: STUDIO_RPC,
    trust: "trusted-studionet-rpc",
    consensus,
    checkedAt: new Date().toISOString(),
  };
}
export async function verifyFinalDecision(
  input: VerifyInput,
  port?: ReadOnlyPort,
  timeoutMs = 15000,
): Promise<Verification> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      verify(port ?? studionetPort(), input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Read-only verification timed out")),
          timeoutMs,
        );
      }),
    ]);
  } catch (e) {
    return {
      verified: false,
      effect: "HOLD",
      error: e instanceof Error ? e.message : "Verification unavailable",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
