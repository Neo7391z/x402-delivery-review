import { studionet } from "genlayer-js/chains";
import { STUDIO_RPC, STUDIO_CHAIN_ID } from "./verify.js";
export type Rpc = (method: string, params?: unknown[]) => Promise<any>;
/** Both network identifiers and the gas quote must independently match the free demo. */
export async function assertFreeStudio(rpc: Rpc) {
  const [chain, network, gasPrice] = await Promise.all([
    rpc("eth_chainId"),
    rpc("net_version"),
    rpc("eth_gasPrice"),
  ]);
  if (
    chain !== "0xf22f" ||
    network !== "61999" ||
    gasPrice !== "0x0" ||
    studionet.id !== Number(STUDIO_CHAIN_ID) ||
    studionet.rpcUrls.default.http[0] !== STUDIO_RPC
  ) {
    throw Error("STOP: wrong network or nonzero/unknown gas price");
  }
  return { chain, network, gasPrice };
}
export async function waitFinalized(
  rpc: Rpc,
  hash: string,
  timeoutMs = 180000,
  intervalMs = 2000,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Invalid transaction hash");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    if (tx?.status === "FINALIZED") return tx;
    if (["UNDETERMINED", "CANCELED", "REJECTED"].includes(tx?.status))
      throw Error("Terminal transaction state: " + tx.status);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw Error(
    "Finality timeout: preserve run directory and transaction hash; do not resubmit blindly",
  );
}
