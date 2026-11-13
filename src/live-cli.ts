import { readFile } from "node:fs/promises";
import { sha256, verifyFinalDecision } from "./verify.js";
const [contractAddress, operatorAddress, transactionHash, evidencePath] =
  process.argv.slice(2);
if (!contractAddress || !operatorAddress || !transactionHash || !evidencePath) {
  console.error(
    "Usage: npm run verify:live -- CONTRACT OPERATOR TX_HASH PACKET_JSON",
  );
  process.exitCode = 2;
} else {
  const packet = JSON.parse(await readFile(evidencePath, "utf8"));
  const code = await readFile(
    new URL("../contracts/delivery_review.py", import.meta.url),
    "utf8",
  );
  const result = await verifyFinalDecision({
    contractAddress,
    operatorAddress,
    transactionHash,
    evidence: packet.evidence,
    sourceSha256: sha256(code),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) process.exitCode = 1;
}
