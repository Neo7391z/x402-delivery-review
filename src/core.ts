import { createHash } from "node:crypto";
import {
  decodePaymentRequiredHeader,
  encodePaymentRequiredHeader,
} from "@x402/core/http";
import { PaymentRequiredSchema } from "@x402/core/schemas";
export const terms =
  "Explain how optimistic consensus handles disagreement. Include validator independence, challenge escalation, and uncertainty; do not promise guaranteed correctness.";
export const offer = {
  x402Version: 2,
  resource: {
    url: "https://demo.invalid/consensus-explainer",
    description: terms,
    mimeType: "text/plain",
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532" as const,
      amount: "1000",
      asset: "0x0000000000000000000000000000000000000001",
      payTo: "0x0000000000000000000000000000000000000002",
      maxTimeoutSeconds: 60,
      extra: {},
    },
  ],
};
export function parseOffer(header: string) {
  if (typeof header !== "string" || !header || header.length > 16384)
    throw new Error("Invalid payment header size");
  const parsed = PaymentRequiredSchema.parse(
    decodePaymentRequiredHeader(header),
  );
  if (parsed.x402Version !== 2 || parsed.accepts.length !== 1)
    throw new Error("Only unambiguous x402 v2 offers supported");
  if (!parsed.resource.description?.trim())
    throw new Error("Agreed terms required");
  const url = new URL(parsed.resource.url);
  if (url.protocol !== "https:") throw new Error("HTTPS resource required");
  return parsed;
}
export function packet(header: string, body: string) {
  const o = parseOffer(header);
  if (typeof body !== "string" || !body.trim() || body.length > 12000)
    throw new Error("Response must contain 1–12000 characters");
  const evidence = JSON.stringify({
    version: 1,
    resource: o.resource.url,
    terms: o.resource.description,
    network: o.accepts[0].network,
    amount: o.accepts[0].amount,
    asset: o.accepts[0].asset,
    payTo: o.accepts[0].payTo,
    body,
  });
  return { id: createHash("sha256").update(evidence).digest("hex"), evidence };
}
export const sampleHeader = encodePaymentRequiredHeader(offer);
export type Decision = "ACCEPT" | "REWORK" | "ESCALATE";
export function policy(
  decision: Decision,
  finalized: boolean,
  success: boolean,
  expected: string,
  actual: string,
) {
  if (!finalized || !success || expected !== actual) return "HOLD";
  return decision === "ACCEPT"
    ? "ALLOW"
    : decision === "REWORK"
      ? "PAUSE"
      : "HOLD";
}
export const samples = {
  bad: "Optimistic consensus is always correct because the first AI validator decides everything. Challenges are unnecessary.",
  good: "A leader proposes an outcome; validators independently evaluate the same evidence. Disagreement can trigger challenges and escalation to a larger validator set. This reduces reliance on one model but cannot guarantee correctness.",
};
