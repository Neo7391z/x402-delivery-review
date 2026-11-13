import {
  ControlledClient,
  SandboxProvider,
  validateReceipt,
  reviewEvidence,
} from "./sandbox.js";
import { readFile } from "node:fs/promises";
import { createPublicKey } from "node:crypto";
import { sha256 } from "./verify.js";
let current:
  | { client: ControlledClient; provider: SandboxProvider; url: string }
  | undefined;
let busy = false;
export async function sandboxAction(action: string) {
  if (busy) throw Error("Action already running");
  busy = true;
  try {
    if (action === "start") {
      if (current)
        throw Error(
          "Existing mandate cannot be reset; restart server explicitly for a new demo mandate",
        );
      const client = new ControlledClient(),
        provider = new SandboxProvider(client.keys.publicKey),
        url = await provider.listen();
      current = { client, provider, url };
      await client.purchase(url, provider.keys.publicKey);
    } else if (action === "recorded") {
      if (current) throw Error("Existing mandate cannot be replaced");
      const root = new URL("../", import.meta.url),
        name = "signed-rework";
      const packet = JSON.parse(
        await readFile(new URL(`evidence/${name}-packet.json`, root), "utf8"),
      );
      const publicKey = packet.receipt.data.challenge.data.client;
      const keys = { publicKey, privateKey: createPublicKey(publicKey) };
      const state = {
        state: "HOLD" as const,
        receipt: packet.receipt,
        evidence: packet.evidence,
        events: ["Recorded: GET → 402 → authorization → signed delivery"],
      };
      const client = new ControlledClient(undefined, state, keys),
        provider = new SandboxProvider(publicKey),
        url = await provider.listen();
      current = { client, provider, url };
      validateReceipt(
        client.receipt!,
        client.receipt!.data.provider,
        keys.publicKey,
      );
      if (reviewEvidence(client.receipt!) !== client.evidence)
        throw Error("Stored evidence mismatch");
      const deployment = JSON.parse(
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
      await client.review({
        contractAddress: deployment.contractAddress,
        operatorAddress: submission.operator,
        transactionHash: submission.transactionHash,
        sourceSha256: sha256(
          await readFile(new URL("contracts/delivery_review.py", root), "utf8"),
        ),
      });
    } else if (action === "retry") {
      if (!current) throw Error("Start a mandate first");
      try {
        await current.client.purchase(
          current.url,
          current.provider.keys.publicKey,
        );
      } catch (e) {
        if (!String(e).includes("Controller")) throw e;
      }
    } else throw Error("Unknown action");
    const { client, provider } = current!;
    return {
      mode:
        action === "recorded"
          ? "Historical signed HTTP delivery; fresh Studionet verification"
          : "Real localhost HTTP; sandbox authorization; no payment",
      state: client.state,
      events: client.events,
      providerRequestsThisSession: provider.requests,
      deliveriesThisSession: provider.deliveries,
      evidenceId: client.evidence ? sha256(client.evidence) : null,
      receipt: client.receipt,
    };
  } finally {
    busy = false;
  }
}
export async function closeSandbox() {
  if (current) await current.provider.close();
}
